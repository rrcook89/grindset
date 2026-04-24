package quest

import (
	"fmt"
	"io/fs"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// TriggerType names the event kind that advances a quest step.
type TriggerType string

const (
	TriggerTalkedToNPC      TriggerType = "talked_to_npc"
	TriggerItemObtained     TriggerType = "item_obtained"
	TriggerMobKilled        TriggerType = "mob_killed"
	TriggerLocationReached  TriggerType = "location_reached"
	TriggerSkillLevelReached TriggerType = "skill_level_reached"
)

// Trigger describes what event causes a step to complete.
type Trigger struct {
	Type     TriggerType `yaml:"type"`
	// talked_to_npc
	NPCID    string `yaml:"npc_id"`
	// item_obtained
	ItemID   string `yaml:"item_id"`
	Quantity int    `yaml:"quantity"`
	// mob_killed
	MobID    string `yaml:"mob_id"`
	// location_reached
	ZoneID   string `yaml:"zone_id"`
	X        int    `yaml:"x"`
	Y        int    `yaml:"y"`
	Radius   int    `yaml:"radius"`
	// skill_level_reached
	Skill    string `yaml:"skill"`
	Level    int    `yaml:"level"`
}

// StepDef is a single stage within a quest.
type StepDef struct {
	ID          string  `yaml:"id"`
	Description string  `yaml:"description"`
	Trigger     Trigger `yaml:"trigger"`
}

// RewardItem is one item granted on quest completion.
type RewardItem struct {
	ItemID   string `yaml:"item_id"`
	Quantity int    `yaml:"quantity"`
}

// Rewards holds what a player earns on completion.
type Rewards struct {
	XP    int          `yaml:"xp"`
	Items []RewardItem `yaml:"items"`
}

// QuestDef is the full definition of a quest loaded from YAML.
type QuestDef struct {
	ID          string    `yaml:"id"`
	Title       string    `yaml:"title"`
	Description string    `yaml:"description"`
	Rewards     Rewards   `yaml:"rewards"`
	Steps       []StepDef `yaml:"steps"`
}

// Registry is an immutable map of quest definitions keyed by quest ID.
type Registry map[string]*QuestDef

// LoadDefs reads all *.yaml files from fsys and returns a Registry.
// fsys is typically os.DirFS("path/to/defs").
func LoadDefs(fsys fs.FS) (Registry, error) {
	reg := make(Registry)
	err := fs.WalkDir(fsys, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || filepath.Ext(path) != ".yaml" {
			return nil
		}
		f, err := fsys.Open(path)
		if err != nil {
			return fmt.Errorf("quest: open %s: %w", path, err)
		}
		defer f.Close()

		var def QuestDef
		if err := yaml.NewDecoder(f).Decode(&def); err != nil {
			return fmt.Errorf("quest: decode %s: %w", path, err)
		}
		if def.ID == "" {
			return fmt.Errorf("quest: %s has no id", path)
		}
		if len(def.Steps) == 0 {
			return fmt.Errorf("quest: %s has no steps", path)
		}
		reg[def.ID] = &def
		return nil
	})
	if err != nil {
		return nil, err
	}
	return reg, nil
}
