// Package antibot — wire.go
//
// Wire attaches the antibot Collector to the gateway so every inbound action
// is recorded for behavioral analysis.
//
// The server-team agent should call Wire() in cmd/server/main.go:
//
//	col := antibot.NewCollector()
//	flusher := antibot.NewFlusher(col, db, log)
//	go flusher.Run(ctx)
//	antibot.Wire(gw, col)
//
// When the gateway exposes a pre-dispatch hook, replace the TODO body with a
// call to col.Record(accountID, antibot.ActionRecord{...}) for every inbound
// WS frame that carries position or action data.
package antibot

import (
	"github.com/grindset/server/internal/gateway"
)

// Wire registers the Collector as an action observer on the gateway.
// Placeholder until the gateway exposes a hook registration API.
func Wire(_ *gateway.Gateway, _ *Collector) {
	// TODO(server-team): hook every inbound WS opcode dispatch to call
	// col.Record(accountID, ActionRecord{At: time.Now(), ActionType: opName, X: x, Y: y})
}
