// Package skills implements XP curves, skill definitions, and action resolution
// for Mining, Fishing, and Woodcutting. Action timing is driven by zone ticks.
package skills

// Name is the canonical skill identifier (matches the DB enum).
type Name string

const (
	Mining       Name = "mining"
	Fishing      Name = "fishing"
	Woodcutting  Name = "woodcutting"
	CombatMelee  Name = "combat_melee"
	CombatRanged Name = "combat_ranged"
	CombatMagic  Name = "combat_magic"
	Smithing     Name = "smithing"
)

const MaxLevel = 20

// xpTable[n] = total cumulative XP required to reach level n+1 (so xpTable[0] = 0
// for level 1, xpTable[19] = 42_000 for level 20). Designed to hit the anchor
// values in docs/06-skills.md (L2=80, L5=1100, L10=5500, L15=16500, L20=42000).
var xpTable = [MaxLevel]int64{
	0,      // L1
	80,     // L2
	230,    // L3
	530,    // L4
	1100,   // L5
	1750,   // L6
	2540,   // L7
	3410,   // L8
	4400,   // L9
	5500,   // L10
	6900,   // L11
	8650,   // L12
	10750,  // L13
	13300,  // L14
	16500,  // L15
	20200,  // L16
	24600,  // L17
	29700,  // L18
	35500,  // L19
	42000,  // L20
}

// XPForLevel returns the cumulative XP required to reach level n.
// Levels above MaxLevel return XPForLevel(MaxLevel); levels below 1 return 0.
func XPForLevel(n int) int64 {
	if n <= 1 {
		return 0
	}
	if n > MaxLevel {
		n = MaxLevel
	}
	return xpTable[n-1]
}

// LevelForXP returns the level a character is at given cumulative XP.
func LevelForXP(xp int64) int {
	level := 1
	for level < MaxLevel && XPForLevel(level+1) <= xp {
		level++
	}
	return level
}

// NodeDef describes a skilling node (rock, fishing spot, tree, furnace).
// RequiredInputs is consumed from the player's inventory on each successful
// action — empty means a free-resource node (rocks, trees, fishing spots).
type NodeDef struct {
	ID             string
	Skill          Name
	TicksPerAction int    // how many ticks between successful actions
	OutputItemID   string // item_def_id produced
	XPPerAction    int64
	LevelRequired  int
	RequiredInputs []string // item_def_ids consumed per tick
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

	// Smithing furnaces — consume inputs from inventory per tick.
	"furnace_bronze": {
		ID: "furnace_bronze", Skill: Smithing,
		TicksPerAction: 6, OutputItemID: "bronze_bar", XPPerAction: 8, LevelRequired: 1,
		RequiredInputs: []string{"ore_copper", "ore_coal"},
	},
	"furnace_iron": {
		ID: "furnace_iron", Skill: Smithing,
		TicksPerAction: 8, OutputItemID: "iron_bar", XPPerAction: 14, LevelRequired: 5,
		RequiredInputs: []string{"ore_iron", "ore_coal"},
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
