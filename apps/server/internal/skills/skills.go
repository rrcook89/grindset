// Package skills implements XP curves, skill definitions, and action resolution
// for Mining, Fishing, and Woodcutting. Action timing is driven by zone ticks.
package skills

import "math"

// Name is the canonical skill identifier (matches the DB enum).
type Name string

const (
	Mining      Name = "mining"
	Fishing     Name = "fishing"
	Woodcutting Name = "woodcutting"
	CombatMelee Name = "combat_melee"
	CombatRanged Name = "combat_ranged"
	CombatMagic  Name = "combat_magic"
)

const MaxLevel = 20

// XPForLevel returns the total cumulative XP required to reach level n.
// Formula: floor(80 × (1.12^n − 1) / 0.12)  (from docs/06-skills.md)
// Level 1 requires 0 XP (starting level).
func XPForLevel(n int) int64 {
	if n <= 1 {
		return 0
	}
	return int64(math.Floor(80.0 * (math.Pow(1.12, float64(n)) - 1.0) / 0.12))
}

// LevelForXP returns the level a character is at given cumulative XP.
func LevelForXP(xp int64) int {
	level := 1
	for level < MaxLevel && XPForLevel(level+1) <= xp {
		level++
	}
	return level
}

// NodeDef describes a skilling node (rock, fishing spot, tree).
type NodeDef struct {
	ID             string
	Skill          Name
	TicksPerAction int    // how many ticks between successful actions
	OutputItemID   string // item_def_id produced
	XPPerAction    int64
	LevelRequired  int
}

// Registry is the global node table. Keyed by NodeDef.ID.
var Registry = map[string]NodeDef{
	// Mining nodes
	"rock_copper": {
		ID: "rock_copper", Skill: Mining,
		TicksPerAction: 6, OutputItemID: "ore_copper", XPPerAction: 5, LevelRequired: 1,
	},
	"rock_iron": {
		ID: "rock_iron", Skill: Mining,
		TicksPerAction: 7, OutputItemID: "ore_iron", XPPerAction: 8, LevelRequired: 5,
	},
	"rock_coal": {
		ID: "rock_coal", Skill: Mining,
		TicksPerAction: 8, OutputItemID: "ore_coal", XPPerAction: 12, LevelRequired: 10,
	},
	"rock_mithril": {
		ID: "rock_mithril", Skill: Mining,
		TicksPerAction: 10, OutputItemID: "ore_mithril", XPPerAction: 20, LevelRequired: 15,
	},

	// Fishing spots
	"spot_shrimp": {
		ID: "spot_shrimp", Skill: Fishing,
		TicksPerAction: 8, OutputItemID: "fish_raw_shrimp", XPPerAction: 6, LevelRequired: 1,
	},
	"spot_trout": {
		ID: "spot_trout", Skill: Fishing,
		TicksPerAction: 9, OutputItemID: "fish_raw_trout", XPPerAction: 10, LevelRequired: 5,
	},
	"spot_lobster": {
		ID: "spot_lobster", Skill: Fishing,
		TicksPerAction: 10, OutputItemID: "fish_raw_lobster", XPPerAction: 16, LevelRequired: 10,
	},
	"spot_swordfish": {
		ID: "spot_swordfish", Skill: Fishing,
		TicksPerAction: 12, OutputItemID: "fish_raw_swordfish", XPPerAction: 25, LevelRequired: 15,
	},

	// Woodcutting trees
	"tree_normal": {
		ID: "tree_normal", Skill: Woodcutting,
		TicksPerAction: 5, OutputItemID: "log_normal", XPPerAction: 4, LevelRequired: 1,
	},
	"tree_oak": {
		ID: "tree_oak", Skill: Woodcutting,
		TicksPerAction: 6, OutputItemID: "log_oak", XPPerAction: 6, LevelRequired: 5,
	},
	"tree_willow": {
		ID: "tree_willow", Skill: Woodcutting,
		TicksPerAction: 7, OutputItemID: "log_willow", XPPerAction: 10, LevelRequired: 10,
	},
	"tree_yew": {
		ID: "tree_yew", Skill: Woodcutting,
		TicksPerAction: 9, OutputItemID: "log_yew", XPPerAction: 18, LevelRequired: 15,
	},
}

// ActiveAction tracks in-progress skilling for one player.
type ActiveAction struct {
	NodeID      string
	TicksLeft   int // ticks remaining until next yield
	TotalTicks  int // reset value (= node TicksPerAction)
}

// Tick advances the action by one server tick. Returns (itemID, xpGained, leveledUp)
// when an action completes, or ("", 0, false) while still in progress.
// currentXP is the player's XP before this call; currentLevel is derived from it.
func Tick(a *ActiveAction, currentXP int64) (itemID string, xpGained int64, leveledUp bool) {
	node, ok := Registry[a.NodeID]
	if !ok {
		return "", 0, false
	}
	a.TicksLeft--
	if a.TicksLeft > 0 {
		return "", 0, false
	}
	// Action complete — reset counter.
	a.TicksLeft = node.TicksPerAction

	oldLevel := LevelForXP(currentXP)
	newXP := currentXP + node.XPPerAction
	newLevel := LevelForXP(newXP)

	return node.OutputItemID, node.XPPerAction, newLevel > oldLevel
}

// Start initialises a new action. Returns nil if the node is unknown or the
// player's level is below the requirement.
func Start(nodeID string, currentXP int64) *ActiveAction {
	node, ok := Registry[nodeID]
	if !ok {
		return nil
	}
	if LevelForXP(currentXP) < node.LevelRequired {
		return nil
	}
	return &ActiveAction{
		NodeID:     nodeID,
		TicksLeft:  node.TicksPerAction,
		TotalTicks: node.TicksPerAction,
	}
}
