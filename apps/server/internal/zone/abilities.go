package zone

import (
	"github.com/grindset/server/internal/protocol"
)

// Ability slot definitions. Slot 0 = Heavy Strike, slot 1 = Bandage.
// Cooldowns are in ticks (400 ms each by default).
const (
	abilityHeavyStrikeSlot     uint8 = 0
	abilityHeavyStrikeCooldown       = 15 // ~6s
	abilityHeavyStrikeMul      uint16 = 3 // next swing × 3

	abilityBandageSlot     uint8 = 1
	abilityBandageCooldown       = 30 // ~12s
	abilityBandageHeal     uint16 = 5
)

// UseAbility applies the ability identified by slot to the player. Public
// entrypoint called from the gateway dispatch.
func (z *Zone) UseAbility(pid uint32, slot uint8) {
	z.mu.Lock()
	defer z.mu.Unlock()
	p, ok := z.players[pid]
	if !ok || p.HP == 0 {
		return
	}
	if remaining, onCD := p.AbilityCooldowns[slot]; onCD && remaining > 0 {
		return
	}
	switch slot {
	case abilityHeavyStrikeSlot:
		p.NextSwingMul = abilityHeavyStrikeMul
		p.AbilityCooldowns[slot] = abilityHeavyStrikeCooldown
	case abilityBandageSlot:
		newHP := p.HP + abilityBandageHeal
		if newHP > p.MaxHP {
			newHP = p.MaxHP
		}
		// Surface the heal as a CombatHit so the client renders a green/heal float.
		// damage=0 + matching attacker/target = heal-style hit splat already.
		hit := protocol.EncodeCombatHit(protocol.CombatHit{
			AttackerID:  p.ID,
			TargetID:    p.ID,
			Damage:      0,
			MaxHit:      0,
			TargetHP:    newHP,
			TargetMaxHP: p.MaxHP,
		})
		select {
		case p.Outbox <- hit:
		default:
		}
		p.HP = newHP
		p.AbilityCooldowns[slot] = abilityBandageCooldown
	default:
		// Unknown slot — ignore.
		return
	}
}

// decayAbilityCooldownsLocked drops 1 tick from every player's cooldowns.
// Caller holds z.mu.
func (z *Zone) decayAbilityCooldownsLocked() {
	for _, p := range z.players {
		if len(p.AbilityCooldowns) == 0 {
			continue
		}
		for slot, ticks := range p.AbilityCooldowns {
			if ticks <= 1 {
				delete(p.AbilityCooldowns, slot)
			} else {
				p.AbilityCooldowns[slot] = ticks - 1
			}
		}
	}
}
