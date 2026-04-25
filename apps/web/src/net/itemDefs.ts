// Client-side item display lookup. Authoritative defs live on the server +
// in `infra/migrations/009_seed_item_definitions.up.sql`. This file just maps
// def_id → display name + placeholder color for the inventory UI.

export interface ItemDisplay {
  name: string;
  color: string; // hex
}

const TABLE: Record<string, ItemDisplay> = {
  // Ores
  ore_copper: { name: "Copper ore", color: "#b87333" },
  ore_iron: { name: "Iron ore", color: "#7d7e7d" },
  ore_coal: { name: "Coal", color: "#1a1a1a" },
  ore_mithril: { name: "Mithril ore", color: "#4a6c8c" },
  // Logs
  log_normal: { name: "Logs", color: "#8b5a2b" },
  log_oak: { name: "Oak logs", color: "#7a4d24" },
  log_willow: { name: "Willow logs", color: "#9a7c4d" },
  log_yew: { name: "Yew logs", color: "#3a5a3a" },
  // Fish (raw)
  fish_raw_shrimp: { name: "Raw shrimp", color: "#f5a08c" },
  fish_raw_trout: { name: "Raw trout", color: "#a3a37c" },
  fish_raw_lobster: { name: "Raw lobster", color: "#c43c3c" },
  fish_raw_swordfish: { name: "Raw swordfish", color: "#5a8cc4" },
  // Bars
  bronze_bar: { name: "Bronze bar", color: "#cd7f32" },
  iron_bar: { name: "Iron bar", color: "#666666" },
  // Weapons (placeholders)
  bronze_dagger: { name: "Bronze dagger", color: "#cd7f32" },
  iron_axe: { name: "Iron axe", color: "#888888" },
  steel_sword: { name: "Steel sword", color: "#b0b0b0" },
  // Mob loot
  rat_tail: { name: "Rat tail", color: "#7a4030" },
  goblin_ear: { name: "Goblin ear", color: "#4a6a30" },
  coin_pouch: { name: "Coin pouch", color: "#a37020" },
  dwarven_shard: { name: "Dwarven shard", color: "#7a7280" },
  bog_essence: { name: "Bog essence", color: "#3a8c5a" },
};

export function itemDisplay(defId: string): ItemDisplay {
  return TABLE[defId] ?? { name: defId, color: "#666666" };
}
