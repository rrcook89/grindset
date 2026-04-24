// Package quest — wire.go
//
// Wire registers quest engine event hooks with the gateway.
// The server-team agent should call Wire() after constructing both the Gateway
// and the quest Engine in cmd/server/main.go:
//
//	questEngine := quest.New(reg, db, log)
//	quest.Wire(gw, questEngine)
//
// Currently registers no-op opcode handlers as placeholders; replace the
// no-op bodies with real dispatch once the combat/skills/interact packages
// expose their event buses.
package quest

import (
	"github.com/grindset/server/internal/gateway"
)

// Wire attaches the quest engine to the gateway.
// Placeholder: the gateway does not yet expose a hook registration API.
// When it does, register handlers for OpInteract, OpSkillUp, OpMobDeath here.
func Wire(_ *gateway.Gateway, _ *Engine) {
	// TODO(server-team): call engine.StartQuest on OpInteract(npc_id=*_questgiver)
	// TODO(server-team): call engine.Notify on OpMobDeath, OpItemPickup, OpSkillUp, OpMove
}
