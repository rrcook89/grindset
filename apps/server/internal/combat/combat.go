// Package combat implements hit resolution, max-hit formula, and mob definitions
// per docs/05-combat.md. All random rolls use a pluggable Roller interface so
// tests can inject a deterministic source.
package combat

import "math"

// WeaponTierScalar maps weapon tier names to their scalar value.
// Range: 40 (bronze) → 220 (runic), 10 tiers.
var WeaponTierScalar = map[string]float64{
	"bronze":  40,
	"iron":    58,
	"steel":   85,
	"black":   100,
	"mithril": 120,
	"adamant": 145,
	"rune":    175,
	"dragon":  195,
	"barrows": 210,
	"runic":   220,
}

// Style bonuses for the style triangle (+15% accuracy when favoured).
// Key: (attacker style, defender style) → accuracy multiplier.
func StyleMultiplier(attackStyle, defenseStyle string) float64 {
	beats := map[string]string{
		"melee":  "ranged",
		"ranged": "magic",
		"magic":  "melee",
	}
	if beats[attackStyle] == defenseStyle {
		return 1.15
	}
	return 1.0
}

// Roller provides random floats in [0,1). Injected so tests are deterministic.
type Roller interface {
	// Float64 returns a value in [0.0, 1.0).
	Float64() float64
}

// MaxHit computes the maximum melee hit.
// effectiveStr = strength + gearStrBonus + styleBonus + prayerBonus
// maxHit = floor(0.5 + effectiveStr × (weaponScalar / 64))
func MaxHit(effectiveStr int, weaponScalar float64) int {
	return int(math.Floor(0.5 + float64(effectiveStr)*(weaponScalar/64.0)))
}

// HitResult is the outcome of one attack tick.
type HitResult struct {
	Hit    bool
	Damage int
}

// Resolve performs one attack tick per docs/05-combat.md formulas.
// accuracy/defense are base stats. gearAccuracy/gearDefense are gear bonuses.
// styleBonus already incorporates the style triangle multiplier on accuracy.
func Resolve(
	r Roller,
	accuracy, styleBonus, gearAccuracy int,
	defense, gearDefenseVsStyle int,
	maxHit int,
) HitResult {
	// Rolls with ±10% noise.
	noise := func() float64 { return 1.0 + (r.Float64()*0.2 - 0.1) }

	attackerRoll := float64(accuracy+styleBonus+gearAccuracy) * noise()
	defenderRoll := float64(defense+gearDefenseVsStyle) * noise()

	var hitChance float64
	if attackerRoll > defenderRoll {
		hitChance = 1.0 - defenderRoll/(2.0*attackerRoll)
	} else {
		hitChance = attackerRoll / (2.0 * defenderRoll)
	}

	if r.Float64() >= hitChance {
		return HitResult{Hit: false, Damage: 0}
	}

	// damage = rand(1, maxHit) — map [0,1) → [1, maxHit]
	dmg := 1 + int(r.Float64()*float64(maxHit))
	if dmg > maxHit {
		dmg = maxHit
	}
	return HitResult{Hit: true, Damage: dmg}
}

// MobDef is a loaded mob definition (mirrors mob_definitions table).
type MobDef struct {
	ID                   string
	Name                 string
	HP                   int
	Attack               int
	Strength             int
	Defense              int
	MaxHit               int
	AttackIntervalTicks  int
	DropTable            []DropEntry
	XPReward             int
	WeaponScalar         float64
}

// DropEntry is one row in a mob's drop table.
type DropEntry struct {
	ItemDefID  string  `json:"item_def_id"`
	MinQty     int     `json:"min_qty"`
	MaxQty     int     `json:"max_qty"`
	Chance     float64 `json:"chance"` // 0..1
}

// MobRegistry holds the in-memory mob definitions loaded at startup.
// Populated by LoadMobs (called from main after DB connect).
var MobRegistry = map[string]MobDef{
	// Fallback hardcoded tier-1 mobs; production path loads from DB.
	"rat": {
		ID: "rat", Name: "Rat", HP: 5, Attack: 1, Strength: 1, Defense: 1,
		MaxHit: 1, AttackIntervalTicks: 3, XPReward: 5, WeaponScalar: 40,
		DropTable: []DropEntry{
			{ItemDefID: "rat_tail", MinQty: 1, MaxQty: 1, Chance: 0.5},
		},
	},
	"goblin": {
		ID: "goblin", Name: "Goblin", HP: 12, Attack: 3, Strength: 3, Defense: 2,
		MaxHit: 3, AttackIntervalTicks: 3, XPReward: 15, WeaponScalar: 58,
		DropTable: []DropEntry{
			{ItemDefID: "bronze_dagger", MinQty: 1, MaxQty: 1, Chance: 0.1},
			{ItemDefID: "coins", MinQty: 1, MaxQty: 5, Chance: 0.8},
		},
	},
	"bandit": {
		ID: "bandit", Name: "Bandit", HP: 25, Attack: 6, Strength: 6, Defense: 4,
		MaxHit: 6, AttackIntervalTicks: 3, XPReward: 35, WeaponScalar: 85,
		DropTable: []DropEntry{
			{ItemDefID: "iron_sword", MinQty: 1, MaxQty: 1, Chance: 0.05},
			{ItemDefID: "coins", MinQty: 5, MaxQty: 20, Chance: 0.9},
		},
	},
	"dwarf_thug": {
		ID: "dwarf_thug", Name: "Dwarf Thug", HP: 40, Attack: 10, Strength: 10, Defense: 8,
		MaxHit: 10, AttackIntervalTicks: 4, XPReward: 60, WeaponScalar: 120,
		DropTable: []DropEntry{
			{ItemDefID: "mithril_ore", MinQty: 1, MaxQty: 3, Chance: 0.2},
			{ItemDefID: "coins", MinQty: 10, MaxQty: 40, Chance: 0.9},
		},
	},
	"undead_marshfiend": {
		ID: "undead_marshfiend", Name: "Undead Marshfiend", HP: 70, Attack: 15, Strength: 14, Defense: 12,
		MaxHit: 14, AttackIntervalTicks: 4, XPReward: 100, WeaponScalar: 145,
		DropTable: []DropEntry{
			{ItemDefID: "rune_shard", MinQty: 1, MaxQty: 2, Chance: 0.15},
			{ItemDefID: "coins", MinQty: 20, MaxQty: 80, Chance: 0.95},
		},
	},
}

// RollDrops returns the list of (itemDefID, qty) pairs dropped by a mob.
func RollDrops(r Roller, mob MobDef) []ItemDrop {
	var drops []ItemDrop
	for _, entry := range mob.DropTable {
		if r.Float64() < entry.Chance {
			qty := entry.MinQty
			if entry.MaxQty > entry.MinQty {
				qty += int(r.Float64() * float64(entry.MaxQty-entry.MinQty+1))
				if qty > entry.MaxQty {
					qty = entry.MaxQty
				}
			}
			drops = append(drops, ItemDrop{ItemDefID: entry.ItemDefID, Qty: qty})
		}
	}
	return drops
}

// ItemDrop is a resolved (item, quantity) pair from a mob death.
type ItemDrop struct {
	ItemDefID string
	Qty       int
}
