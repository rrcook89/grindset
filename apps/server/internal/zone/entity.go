package zone

// Entity ID ranges:
//   1       – 999_999   = player
//   1_000_000 – 1_999_999 = mob
//   2_000_000 – 2_999_999 = skill node

const (
	mobIDBase  uint32 = 1_000_000
	nodeIDBase uint32 = 2_000_000
)

// EntityKind returns a string tag for the entity id range.
func EntityKind(id uint32) string {
	switch {
	case id >= nodeIDBase:
		return "node"
	case id >= mobIDBase:
		return "mob"
	default:
		return "player"
	}
}

// Mob is a static (non-moving for now) monster in the zone.
type Mob struct {
	ID    uint32
	DefID string // mob_def_id e.g. "marsh_rat"
	X, Y  uint16
	HP    uint16
	MaxHP uint16
}
