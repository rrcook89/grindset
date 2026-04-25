// Package gateway handles WebSocket upgrade and per-connection lifecycle.
// Inbound: decode frame → route (currently only MoveIntent for Sprint 1) → queue to zone.
// Outbound: pull from player Outbox → write to socket.
package gateway

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/grindset/server/internal/auth"
	"github.com/grindset/server/internal/protocol"
	"github.com/grindset/server/internal/zone"
)

type Gateway struct {
	log *slog.Logger
	z   *zone.Zone
}

func New(log *slog.Logger, z *zone.Zone) *Gateway {
	return &Gateway{log: log, z: z}
}

func (g *Gateway) Handle(w http.ResponseWriter, r *http.Request) {
	ident, err := auth.FromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Sprint 1: permissive; tighten before mainnet (CSRF, origin allowlist).
		InsecureSkipVerify: true,
	})
	if err != nil {
		g.log.Error("ws accept failed", "err", err)
		return
	}
	defer c.CloseNow()

	ctx := r.Context()

	// Use email as the display name for now; AccountID is the durable key.
	displayName := ident.Email
	if displayName == "" {
		displayName = ident.AccountID
	}
	p, welcome := g.z.Join(displayName)
	g.log.Info("player joined", "account_id", ident.AccountID, "email", ident.Email, "id", p.ID)
	defer func() {
		g.z.Leave(p.ID)
		g.log.Info("player left", "id", p.ID)
	}()

	// Send Welcome first.
	if err := c.Write(ctx, websocket.MessageBinary, protocol.EncodeWelcome(welcome)); err != nil {
		g.log.Warn("ws write welcome failed", "err", err)
		return
	}

	// Initial state: empty inventory + zero wallet balance, so the UI
	// populates with real (if empty) data instead of waiting for the first
	// drop. Send via Outbox so the writeLoop serialises with later updates.
	select {
	case p.Outbox <- protocol.EncodeInventoryFull(nil):
	default:
	}
	select {
	case p.Outbox <- protocol.EncodeWalletBalance(protocol.WalletBalance{Balance: 0, Reserved: 0}):
	default:
	}

	readErr := make(chan error, 1)
	go func() { readErr <- g.readLoop(ctx, c, p) }()

	writeErr := make(chan error, 1)
	go func() { writeErr <- g.writeLoop(ctx, c, p) }()

	select {
	case err := <-readErr:
		if err != nil {
			g.log.Debug("read loop ended", "err", err)
		}
	case err := <-writeErr:
		if err != nil {
			g.log.Debug("write loop ended", "err", err)
		}
	case <-ctx.Done():
	}
}

func (g *Gateway) readLoop(ctx context.Context, c *websocket.Conn, p *zone.Player) error {
	for {
		ctxT, cancel := context.WithTimeout(ctx, 60*time.Second)
		typ, buf, err := c.Read(ctxT)
		cancel()
		if err != nil {
			return err
		}
		if typ != websocket.MessageBinary {
			continue
		}
		frame, err := protocol.Decode(buf)
		if err != nil {
			g.log.Debug("bad frame", "err", err, "pid", p.ID)
			continue
		}
		switch frame.Op {
		case protocol.OpMoveIntent:
			m, err := protocol.DecodeMoveIntent(frame.Payload)
			if err != nil {
				continue
			}
			g.z.QueueMove(p.ID, m.X, m.Y)
		case protocol.OpSkillStart:
			m, err := protocol.DecodeSkillStart(frame.Payload)
			if err != nil {
				continue
			}
			g.z.StartSkillAction(p.ID, m.NodeID)
		case protocol.OpSkillStop:
			g.z.StopSkillAction(p.ID)
		case protocol.OpCombatTarget:
			m, err := protocol.DecodeCombatTarget(frame.Payload)
			if err != nil {
				continue
			}
			g.z.SetCombatTarget(p.ID, m.EntityID)
		case protocol.OpAbilityUse:
			m, err := protocol.DecodeAbilityUse(frame.Payload)
			if err != nil {
				continue
			}
			g.z.UseAbility(p.ID, m.Slot)
		case protocol.OpInventoryUse:
			m, err := protocol.DecodeInventoryUse(frame.Payload)
			if err != nil {
				continue
			}
			// TargetKind=3 = vendor-sell. Anything else → use-on-self.
			if m.TargetKind == 3 {
				g.z.SellItem(p.ID, m.Slot)
			} else {
				g.z.UseItem(p.ID, m.Slot)
			}
		case protocol.OpChatSay:
			m, err := protocol.DecodeChatSay(frame.Payload)
			if err != nil || m.Body == "" {
				continue
			}
			body := m.Body
			if len(body) > 256 {
				body = body[:256]
			}
			out := protocol.EncodeChatRecv(protocol.ChatRecv{
				Channel: m.Channel,
				Sender:  p.Name,
				Body:    body,
			})
			g.z.BroadcastAll(out)
		case protocol.OpHello:
			// already authenticated via query param / JWT
		default:
			// unknown opcode: silently ignore for now
		}
	}
}

func (g *Gateway) writeLoop(ctx context.Context, c *websocket.Conn, p *zone.Player) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-p.Outbox:
			if !ok {
				return nil
			}
			ctxT, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := c.Write(ctxT, websocket.MessageBinary, msg)
			cancel()
			if err != nil {
				return err
			}
		}
	}
}
