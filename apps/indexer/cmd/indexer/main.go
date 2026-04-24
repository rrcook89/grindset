// Command indexer listens for Bridge program events and writes them to Postgres.
//
// Two modes:
//   - Helius webhook (default when HELIUS_API_KEY is set): binds :8081/webhook
//     and accepts Helius enhanced-transaction payloads.
//   - RPC polling fallback (when HELIUS_API_KEY is unset): polls
//     getSignaturesForAddress on BRIDGE_PROGRAM_ID at a fixed interval,
//     fetches new transactions, parses logs, and writes events.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/grindset/indexer/internal/parser"
	"github.com/grindset/indexer/internal/sink"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg := loadConfig()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	db, err := connectDB(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connect failed", "err", err)
		os.Exit(1)
	}
	defer db.Close()
	logger.Info("database connected")

	s := sink.New(db)

	if cfg.HeliusAPIKey != "" {
		logger.Info("starting Helius webhook listener", "addr", ":8081")
		runWebhook(ctx, logger, s)
	} else {
		logger.Info("HELIUS_API_KEY not set, falling back to RPC polling",
			"program", cfg.BridgeProgramID,
			"rpc", cfg.RPCURL,
		)
		runPoller(ctx, logger, s, cfg)
	}
}

// ── config ────────────────────────────────────────────────────────────────────

type config struct {
	DatabaseURL     string
	HeliusAPIKey    string
	BridgeProgramID string
	RPCURL          string
}

func loadConfig() config {
	rpcURL := os.Getenv("SOLANA_RPC_URL")
	if rpcURL == "" {
		rpcURL = "http://127.0.0.1:8899"
	}
	return config{
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		HeliusAPIKey:    os.Getenv("HELIUS_API_KEY"),
		BridgeProgramID: os.Getenv("BRIDGE_PROGRAM_ID"),
		RPCURL:          rpcURL,
	}
}

// ── database ──────────────────────────────────────────────────────────────────

func connectDB(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	if dsn == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

// ── Helius webhook mode ───────────────────────────────────────────────────────

// heliusTx is the minimal subset of the Helius enhanced transaction payload
// that the indexer needs.
type heliusTx struct {
	Signature string `json:"signature"`
	Meta      struct {
		LogMessages []string `json:"logMessages"`
	} `json:"meta"`
}

func runWebhook(ctx context.Context, logger *slog.Logger, s *sink.Sink) {
	mux := http.NewServeMux()
	mux.HandleFunc("/webhook", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
		if err != nil {
			http.Error(w, "read error", http.StatusBadRequest)
			return
		}

		// Helius sends either a single object or an array.
		var txns []heliusTx
		if err := json.Unmarshal(body, &txns); err != nil {
			// Try single object.
			var single heliusTx
			if err2 := json.Unmarshal(body, &single); err2 != nil {
				http.Error(w, "bad payload", http.StatusBadRequest)
				return
			}
			txns = []heliusTx{single}
		}

		for _, tx := range txns {
			if err := processTx(r.Context(), logger, s, tx.Signature, tx.Meta.LogMessages); err != nil {
				logger.Error("processTx failed", "sig", tx.Signature, "err", err)
			}
		}
		w.WriteHeader(http.StatusOK)
	})

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok")) //nolint:errcheck
	})

	srv := &http.Server{
		Addr:              ":8081",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutCtx)
	}()

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("webhook server error", "err", err)
		os.Exit(1)
	}
}

// ── RPC polling fallback ──────────────────────────────────────────────────────

func runPoller(ctx context.Context, logger *slog.Logger, s *sink.Sink, cfg config) {
	if cfg.BridgeProgramID == "" {
		logger.Error("BRIDGE_PROGRAM_ID required for polling mode")
		os.Exit(1)
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	// lastSig is read from the cursor table on startup.
	lastSig := loadCursor(ctx, s, cfg.BridgeProgramID)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sigs, err := fetchNewSignatures(ctx, cfg.RPCURL, cfg.BridgeProgramID, lastSig)
			if err != nil {
				logger.Warn("fetchNewSignatures error", "err", err)
				continue
			}
			for _, sig := range sigs {
				logs, slot, err := fetchTxLogs(ctx, cfg.RPCURL, sig)
				if err != nil {
					logger.Warn("fetchTxLogs error", "sig", sig, "err", err)
					continue
				}
				if err := processTx(ctx, logger, s, sig, logs); err != nil {
					logger.Error("processTx error", "sig", sig, "err", err)
					continue
				}
				saveCursor(ctx, s, cfg.BridgeProgramID, sig, slot)
				lastSig = sig
			}
		}
	}
}

// processTx parses logs and writes any events to the sink.
func processTx(ctx context.Context, logger *slog.Logger, s *sink.Sink, sig string, logs []string) error {
	events, err := parser.ParseLogs(logs)
	if err != nil {
		return fmt.Errorf("ParseLogs: %w", err)
	}
	for _, ev := range events {
		if err := s.Write(ctx, sig, ev); err != nil {
			return fmt.Errorf("sink.Write(%s): %w", sig, err)
		}
		logger.Info("event written", "sig", sig, "kind", ev.Kind, "amount", ev.Amount)
	}
	return nil
}

// ── cursor helpers (thin wrappers around indexer_cursor table) ────────────────

func loadCursor(ctx context.Context, s *sink.Sink, programID string) string {
	sig, _ := s.GetCursor(ctx, programID)
	return sig
}

func saveCursor(ctx context.Context, s *sink.Sink, programID, sig string, slot uint64) {
	_ = s.SaveCursor(ctx, programID, sig, slot)
}

// ── minimal RPC calls for polling mode ───────────────────────────────────────

// fetchNewSignatures returns confirmed signatures for programID that are newer
// than lastSig (oldest-first order so we process in chronological order).
func fetchNewSignatures(ctx context.Context, rpcURL, programID, lastSig string) ([]string, error) {
	params := []any{
		programID,
		map[string]any{
			"commitment": "confirmed",
			"limit":      100,
		},
	}
	if lastSig != "" {
		params[1].(map[string]any)["until"] = lastSig
	}

	body, err := rpcPost(ctx, rpcURL, "getSignaturesForAddress", params)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Result []struct {
			Signature string `json:"signature"`
		} `json:"result"`
		Error *struct{ Message string } `json:"error"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	if resp.Error != nil {
		return nil, fmt.Errorf("RPC error: %s", resp.Error.Message)
	}

	// Results are newest-first; reverse to get chronological order.
	sigs := make([]string, len(resp.Result))
	for i, r := range resp.Result {
		sigs[len(sigs)-1-i] = r.Signature
	}
	return sigs, nil
}

// fetchTxLogs returns the log messages and slot for a transaction.
func fetchTxLogs(ctx context.Context, rpcURL, sig string) (logs []string, slot uint64, err error) {
	body, err := rpcPost(ctx, rpcURL, "getTransaction", []any{
		sig,
		map[string]any{"encoding": "json", "commitment": "confirmed"},
	})
	if err != nil {
		return nil, 0, err
	}

	var resp struct {
		Result *struct {
			Slot uint64 `json:"slot"`
			Meta *struct {
				LogMessages []string `json:"logMessages"`
			} `json:"meta"`
		} `json:"result"`
		Error *struct{ Message string } `json:"error"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, 0, err
	}
	if resp.Error != nil {
		return nil, 0, fmt.Errorf("RPC error: %s", resp.Error.Message)
	}
	if resp.Result == nil || resp.Result.Meta == nil {
		return nil, 0, nil
	}
	return resp.Result.Meta.LogMessages, resp.Result.Slot, nil
}

func rpcPost(ctx context.Context, rpcURL, method string, params []any) ([]byte, error) {
	payload, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  method,
		"params":  params,
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rpcURL,
		bytesReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// bytesReader wraps a byte slice as an io.Reader without importing bytes.
type bytesReaderT struct {
	b   []byte
	pos int
}

func bytesReader(b []byte) io.Reader { return &bytesReaderT{b: b} }

func (r *bytesReaderT) Read(p []byte) (int, error) {
	if r.pos >= len(r.b) {
		return 0, io.EOF
	}
	n := copy(p, r.b[r.pos:])
	r.pos += n
	return n, nil
}
