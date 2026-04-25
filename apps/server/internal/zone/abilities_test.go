package zone

import (
	"testing"
)

func TestUseAbilityHeavyStrikeQueuesMultiplier(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.UseAbility(p.ID, abilityHeavyStrikeSlot)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.NextSwingMul != abilityHeavyStrikeMul {
		t.Fatalf("NextSwingMul: got %d want %d", p.NextSwingMul, abilityHeavyStrikeMul)
	}
	if cd := p.AbilityCooldowns[abilityHeavyStrikeSlot]; cd != abilityHeavyStrikeCooldown {
		t.Fatalf("cooldown: got %d want %d", cd, abilityHeavyStrikeCooldown)
	}
}

func TestUseAbilityBandageHealsAndCaps(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	p.HP = 50
	p.MaxHP = 100
	z.mu.Unlock()

	z.UseAbility(p.ID, abilityBandageSlot)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.HP != 50+abilityBandageHeal {
		t.Fatalf("HP: got %d want %d", p.HP, 50+abilityBandageHeal)
	}

	// Bandaging at full HP should not overheal.
	p.HP = p.MaxHP
	delete(p.AbilityCooldowns, abilityBandageSlot)
	z.mu.Unlock()
	z.UseAbility(p.ID, abilityBandageSlot)
	z.mu.Lock()
	if p.HP != p.MaxHP {
		t.Fatalf("overheal: HP %d > MaxHP %d", p.HP, p.MaxHP)
	}
}

func TestUseAbilityRespectsCooldown(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.UseAbility(p.ID, abilityHeavyStrikeSlot)
	// First use queues mul; consume it so we can detect a re-trigger.
	z.mu.Lock()
	p.NextSwingMul = 1
	z.mu.Unlock()

	z.UseAbility(p.ID, abilityHeavyStrikeSlot)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.NextSwingMul != 1 {
		t.Fatalf("ability fired during cooldown: NextSwingMul=%d", p.NextSwingMul)
	}
}

func TestDecayAbilityCooldownsClearsAtZero(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	p.AbilityCooldowns[abilityBandageSlot] = 2
	z.mu.Unlock()

	z.mu.Lock()
	z.decayAbilityCooldownsLocked()
	z.mu.Unlock()
	if got := p.AbilityCooldowns[abilityBandageSlot]; got != 1 {
		t.Fatalf("after 1 tick: got %d want 1", got)
	}

	z.mu.Lock()
	z.decayAbilityCooldownsLocked()
	z.mu.Unlock()
	if _, present := p.AbilityCooldowns[abilityBandageSlot]; present {
		t.Fatalf("cooldown not cleared at zero")
	}
}

func TestUseAbilityIgnoresDeadPlayer(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	p.HP = 0
	z.mu.Unlock()

	z.UseAbility(p.ID, abilityHeavyStrikeSlot)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.NextSwingMul == abilityHeavyStrikeMul {
		t.Fatalf("dead player triggered Heavy Strike")
	}
	if _, present := p.AbilityCooldowns[abilityHeavyStrikeSlot]; present {
		t.Fatalf("dead player started cooldown")
	}
}
