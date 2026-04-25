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
  // Fish (cooked) — edible, restore HP via OpInventoryUse
  fish_cooked_shrimp: { name: "Cooked shrimp", color: "#ff7050" },
  fish_cooked_trout: { name: "Cooked trout", color: "#c8b870" },
  fish_cooked_lobster: { name: "Cooked lobster", color: "#ff5040" },
  fish_cooked_swordfish: { name: "Cooked swordfish", color: "#80a8d8" },
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

const WEAPONS = new Set(["bronze_dagger", "iron_axe", "steel_sword"]);

/** True if this defID is a weapon (client-side mirror of server weaponBonus). */
export function isWeapon(defId: string): boolean {
  return WEAPONS.has(defId);
}

/** Bonus maxHit added by equipping this weapon (server-authoritative copy). */
export function weaponBonus(defId: string | null): number {
  switch (defId) {
    case "bronze_dagger": return 2;
    case "iron_axe": return 4;
    case "steel_sword": return 6;
    default: return 0;
  }
}
