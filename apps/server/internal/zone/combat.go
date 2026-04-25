package zone

import (
	"time"

	"github.com/grindset/server/internal/protocol"
	"github.com/grindset/server/internal/skills"
)

const (
	attackIntervalTicks    = 5  // ~2s at 400ms tick
	mobAttackIntervalTicks = 6  // mobs swing slightly slower than players
	playerMaxHit           = 8  // base; gear bonuses are a later sprint
	playerAttackXP         = 50 // melee XP per kill — see docs/06-skills.md
)

// mobMaxHit returns a per-tier damage ceiling. Cheap Sprint-1 table.
func mobMaxHit(defID string) uint16 {
	switch defID {
	case "marsh_rat":
		return 3
	case "bog_goblin":
		return 5
	case "mire_bandit":
		return 8
	case "dwarf_thug":
		return 12
	case "bog_horror":
		return 22
	}
	return 4
}

// SetCombatTarget points the player at mobID and sets up movement onto its tile.
// 0 mobID clears the target.
func (z *Zone) SetCombatTarget(pid, mobID uint32) {
	z.mu.Lock()
	defer z.mu.Unlock()
	p, ok := z.players[pid]
	if !ok {
		return
	}
	if mobID == 0 {
		p.CombatTarget = 0
		return
	}
	mob, ok := z.mobs[mobID]
	if !ok {
		return
	}
	// Cancel any active skilling — combat takes precedence.
	p.Action = nil
	p.ActionNodeID = 0
	p.CombatTarget = mobID
	p.AttackCooldown = 0
	// Walk onto the mob's tile (adjacency rules are a later sprint).
	p.TargetX = mob.X
	p.TargetY = mob.Y
}

// resolveCombatLocked runs each player's active combat target plus mob
// counter-attacks. Caller holds z.mu.
func (z *Zone) resolveCombatLocked() {
	// 1. Mobs swing back at any adjacent player who is targeting them.
	for _, mob := range z.mobs {
		if mob.HP == 0 {
			continue
		}
		// Pick a swing target: any live adjacent player.
		// Priority: someone who's targeting this mob (so reciprocal combat
		// feels deliberate), then any adjacent live player (aggro pursuit).
		var attacker *Player
		for _, pl := range z.players {
			if pl.HP == 0 || !adjacentOrSame(pl.X, pl.Y, mob.X, mob.Y) {
				continue
			}
			if pl.CombatTarget == mob.ID {
				attacker = pl
				break
			}
			if attacker == nil && mob.AggroRadius > 0 {
				attacker = pl // tentative — keep scanning for a reciprocal target
			}
		}
		if attacker == nil {
			mob.AttackCooldown = 0
			continue
		}
		if mob.AttackCooldown > 0 {
			mob.AttackCooldown--
			continue
		}
		mob.AttackCooldown = mobAttackIntervalTicks

		max := mobMaxHit(mob.DefID)
		var dmg uint16
		if randInRange(0, 99) < 15 {
			dmg = 0 // miss
		} else {
			dmg = uint16(randInRange(1, int(max)))
		}
		if dmg >= attacker.HP {
			attacker.HP = 0
		} else {
			attacker.HP -= dmg
		}
		hit := protocol.EncodeCombatHit(protocol.CombatHit{
			AttackerID:  mob.ID,
			TargetID:    attacker.ID,
			Damage:      dmg,
			MaxHit:      max,
			TargetHP:    attacker.HP,
			TargetMaxHP: attacker.MaxHP,
		})
		select {
		case attacker.Outbox <- hit:
		default:
		}
		if attacker.HP == 0 {
			z.killPlayerLocked(attacker, mob.ID)
		}
	}

	// 2. Players swing at their target.
	for _, p := range z.players {
		if p.HP == 0 || p.CombatTarget == 0 {
			continue
		}
		mob, ok := z.mobs[p.CombatTarget]
		if !ok {
			// target gone (respawn pending or dead) → clear
			p.CombatTarget = 0
			continue
		}
		// Player must be adjacent (Chebyshev ≤ 1) before swinging.
		if !adjacentOrSame(p.X, p.Y, mob.X, mob.Y) {
			// Keep walking toward target tile (move resolution updates each tick).
			p.TargetX = mob.X
			p.TargetY = mob.Y
			continue
		}
		// Cooldown gates the swing rate.
		if p.AttackCooldown > 0 {
			p.AttackCooldown--
			continue
		}
		p.AttackCooldown = attackIntervalTicks

		// Damage roll: uniform 1..maxHit. ~10% miss baseline.
		// Weapon bonus stacks into the player's effective maxHit.
		effectiveMax := uint16(playerMaxHit) + weaponBonus(p.EquippedWeapon)
		var damage uint16
		if randInRange(0, 99) < 10 {
			damage = 0
		} else {
			damage = uint16(randInRange(1, int(effectiveMax)))
			// Crit: 10% chance to double the swing. Damage will exceed maxHit
			// so the client treats it as a crit and renders it specially.
			if randInRange(0, 99) < 10 {
				damage *= 2
			}
			// Heavy Strike (ability): multiplies next swing, then resets.
			if p.NextSwingMul > 1 {
				damage *= p.NextSwingMul
				p.NextSwingMul = 1
			}
		}

		// Apply.
		if damage >= mob.HP {
			mob.HP = 0
		} else {
			mob.HP -= damage
		}

		// Broadcast CombatHit to the attacker (and ideally all viewers; for
		// Sprint-1 we just notify the attacker since they own the HUD).
		hitMsg := protocol.EncodeCombatHit(protocol.CombatHit{
			AttackerID:  p.ID,
			TargetID:    mob.ID,
			Damage:      damage,
			MaxHit:      effectiveMax,
			TargetHP:    mob.HP,
			TargetMaxHP: mob.MaxHP,
		})
		select {
		case p.Outbox <- hitMsg:
		default:
		}

		// Death.
		if mob.HP == 0 {
			z.killMobLocked(p, mob)
		}
	}
}

// killMobLocked removes the mob, awards XP + drops $GRIND, broadcasts the death.
// Caller holds z.mu.
func (z *Zone) killMobLocked(p *Player, mob *Mob) {
	deathMsg := protocol.EncodeCombatDeath(protocol.CombatDeath{
		EntityID: mob.ID,
		KillerID: p.ID,
	})
	for _, viewer := range z.players {
		select {
		case viewer.Outbox <- deathMsg:
		default:
		}
	}

	// Boss kill broadcast — every player in the zone gets a system chat
	// line so people know the bog horror went down. Currently the only
	// "boss" tier mob; extend the switch as more bosses join.
	if mob.DefID == "bog_horror" {
		bossMsg := protocol.EncodeChatRecv(protocol.ChatRecv{
			Channel: protocol.ChatChannelGlobal,
			Sender:  "system",
			Body:    "⚔ " + p.Name + " has slain the Bog Horror!",
		})
		for _, viewer := range z.players {
			select {
			case viewer.Outbox <- bossMsg:
			default:
			}
		}
	}
	// Queue respawn instead of dropping forever.
	z.pendingRespawn = append(z.pendingRespawn, pendingRespawn{
		id:          mob.ID,
		defID:       mob.DefID,
		x:           mob.OriginX,
		y:           mob.OriginY,
		maxHP:       mob.MaxHP,
		respawnSecs: mob.RespawnSecs,
		aggroRadius: mob.AggroRadius,
		at:          time.Now().Add(time.Duration(mob.RespawnSecs) * time.Second),
	})
	delete(z.mobs, mob.ID)

	// XP for the killer.
	oldXP := p.SkillXP[skills.CombatMelee]
	oldLevel := skills.LevelForXP(oldXP)
	newXP := oldXP + playerAttackXP
	p.SkillXP[skills.CombatMelee] = newXP
	newLevel := skills.LevelForXP(newXP)

	// Loot $GRIND drop — basic per-mob-tier scaling.
	dropLo, dropHi := mobDropRange(mob.DefID)
	dropped := uint64(randInRange(dropLo, dropHi)) * uint64(grindBaseUnit)
	p.GrindBalance += int64(dropped)

	// Item loot: per-mob chance for one specific drop.
	lootID, lootChance := mobLootRoll(mob.DefID)
	var lootSlot int = -1
	if lootID != "" && randInRange(0, 99) < lootChance {
		lootSlot = addInventoryItem(&p.Inventory, lootID, 1)
	}

	// Weapon drop: separate, rarer roll.
	weaponID, weaponChance := mobWeaponRoll(mob.DefID)
	weaponSlot := -1
	if weaponID != "" && randInRange(0, 99) < weaponChance {
		weaponSlot = addInventoryItem(&p.Inventory, weaponID, 1)
	}

	// Notify attacker: SkillTick for combat XP + (optional) loot item, wallet broadcasts.
	tickItem := ""
	if lootSlot >= 0 {
		tickItem = lootID
	}
	tick := protocol.EncodeSkillTick(protocol.SkillTick{
		Skill:        skillIndex(skills.CombatMelee),
		XPGained:     uint16(playerAttackXP),
		TotalXP:      uint32(newXP),
		GrindDropped: dropped,
		ItemDefID:    tickItem,
	})
	select {
	case p.Outbox <- tick:
	default:
	}
	if lootSlot >= 0 {
		invMsg := protocol.EncodeInventoryDelta([]protocol.InventorySlot{p.Inventory[lootSlot]})
		select {
		case p.Outbox <- invMsg:
		default:
		}
	}
	if weaponSlot >= 0 {
		invMsg := protocol.EncodeInventoryDelta([]protocol.InventorySlot{p.Inventory[weaponSlot]})
		select {
		case p.Outbox <- invMsg:
		default:
		}
	}
	if newLevel > oldLevel {
		lvl := protocol.EncodeSkillLevelUp(protocol.SkillLevelUp{
			Skill:    skillIndex(skills.CombatMelee),
			NewLevel: uint8(newLevel),
		})
		select {
		case p.Outbox <- lvl:
		default:
		}
	}
	if dropped > 0 {
		bal := protocol.EncodeWalletBalance(protocol.WalletBalance{
			Balance:  uint64(p.GrindBalance),
			Reserved: 0,
		})
		ledger := protocol.EncodeWalletLedgerEntry(protocol.WalletLedgerEntry{
			Delta:  int64(dropped),
			Reason: "mob_kill:" + mob.DefID,
			TS:     time.Now().Unix(),
		})
		select {
		case p.Outbox <- bal:
		default:
		}
		select {
		case p.Outbox <- ledger:
		default:
		}
	}

	// Clear the target so the player stops attacking nothing.
	p.CombatTarget = 0
}

// killPlayerLocked drops the player back at zone home with full HP.
// Caller holds z.mu. Sprint-1 PvE death is forgiving — no item drops.
func (z *Zone) killPlayerLocked(p *Player, killerID uint32) {
	deathMsg := protocol.EncodeCombatDeath(protocol.CombatDeath{
		EntityID: p.ID,
		KillerID: killerID,
	})
	for _, viewer := range z.players {
		select {
		case viewer.Outbox <- deathMsg:
		default:
		}
	}
	// Respawn at zone center with full HP, drop combat target/action.
	p.X = uint16(z.w / 2)
	p.Y = uint16(z.h / 2)
	p.TargetX = p.X
	p.TargetY = p.Y
	p.HP = p.MaxHP
	p.CombatTarget = 0
	p.AttackCooldown = 0
	p.Action = nil
	p.ActionNodeID = 0
}

// drainRespawnsLocked moves any pending respawn whose timer has fired back
// into the live mob map. Caller holds z.mu.
func (z *Zone) drainRespawnsLocked() {
	if len(z.pendingRespawn) == 0 {
		return
	}
	now := time.Now()
	keep := z.pendingRespawn[:0]
	for _, r := range z.pendingRespawn {
		if now.Before(r.at) {
			keep = append(keep, r)
			continue
		}
		// Reuse the same id so clients don't accumulate stale handles.
		z.mobs[r.id] = &Mob{
			ID:          r.id,
			DefID:       r.defID,
			X:           r.x,
			Y:           r.y,
			HP:          r.maxHP,
			MaxHP:       r.maxHP,
			OriginX:     r.x,
			OriginY:     r.y,
			RespawnSecs: r.respawnSecs,
			AggroRadius: r.aggroRadius,
		}
	}
	z.pendingRespawn = keep
}

// mobWeaponRoll returns the weapon def + percentage chance (0–100) of a
// rare weapon drop on kill. Independent of mobLootRoll so a single kill can
// drop both. Empty defID = no weapon table.
func mobWeaponRoll(defID string) (string, int) {
	switch defID {
	case "bog_goblin":
		return "bronze_dagger", 5
	case "mire_bandit":
		return "iron_axe", 4
	case "dwarf_thug":
		return "steel_sword", 3
	case "bog_horror":
		return "steel_sword", 6
	}
	return "", 0
}

// mobLootRoll returns the item def + percentage chance (0–100) of dropping
// it on kill. Empty defID = mob has no item table.
func mobLootRoll(defID string) (string, int) {
	switch defID {
	case "marsh_rat":
		return "rat_tail", 30
	case "bog_goblin":
		return "goblin_ear", 25
	case "mire_bandit":
		return "coin_pouch", 20
	case "dwarf_thug":
		return "dwarven_shard", 15
	case "bog_horror":
		return "bog_essence", 10
	}
	return "", 0
}

// mobDropRange returns the $GRIND drop range (whole units) for a mob def.
// Mirrors infra/migrations/010_mobs.up.sql `drop_table.grind` ranges.
func mobDropRange(defID string) (int, int) {
	switch defID {
	case "marsh_rat":
		return 3, 8
	case "bog_goblin":
		return 5, 12
	case "mire_bandit":
		return 10, 25
	case "dwarf_thug":
		return 20, 40
	case "bog_horror":
		return 60, 120
	}
	return 1, 5
}

func adjacentOrSame(ax, ay, bx, by uint16) bool {
	dx := int(ax) - int(bx)
	if dx < 0 {
		dx = -dx
	}
	dy := int(ay) - int(by)
	if dy < 0 {
		dy = -dy
	}
	return dx <= 1 && dy <= 1
}
