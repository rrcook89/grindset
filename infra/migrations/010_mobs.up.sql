CREATE TABLE mob_definitions (
  id                    text        PRIMARY KEY,
  name                  text        NOT NULL,
  tier                  smallint    NOT NULL,
  hp                    integer     NOT NULL,
  attack                smallint    NOT NULL,
  strength              smallint    NOT NULL,
  defense               smallint    NOT NULL,
  max_hit               smallint    NOT NULL,
  attack_interval_ticks smallint    NOT NULL,
  attack_style          text        NOT NULL,
  aggro_radius_tiles    smallint    NOT NULL DEFAULT 0,
  xp_reward             integer     NOT NULL,
  drop_table            jsonb       NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mob_definitions_tier ON mob_definitions(tier);

CREATE TABLE mob_spawns (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id       text        NOT NULL,
  mob_def_id    text        NOT NULL REFERENCES mob_definitions(id),
  x             integer     NOT NULL,
  y             integer     NOT NULL,
  respawn_secs  integer     NOT NULL DEFAULT 30,
  active        boolean     NOT NULL DEFAULT true
);

CREATE INDEX idx_mob_spawns_zone ON mob_spawns(zone_id);

INSERT INTO mob_definitions
  (id, name, tier, hp, attack, strength, defense, max_hit, attack_interval_ticks, attack_style, aggro_radius_tiles, xp_reward, drop_table)
VALUES
  ('marsh_rat',    'marsh rat',    1,  20,  1,  1,  1,  3, 4, 'melee', 0, 25,
   '{"grind": [3, 8], "items": [{"id":"rat_tail","chance":0.50}]}'::jsonb),
  ('bog_goblin',   'bog goblin',   1,  35,  2,  3,  2,  5, 4, 'melee', 4, 50,
   '{"grind": [5, 12], "items": [{"id":"goblin_mail","chance":0.05},{"id":"copper_ore","chance":0.10}]}'::jsonb),
  ('mire_bandit',  'mire bandit',  2,  60,  4,  5,  4,  8, 4, 'melee', 6, 90,
   '{"grind": [10, 25], "items": [{"id":"bronze_dagger","chance":0.08},{"id":"raw_shrimp","chance":0.20}]}'::jsonb),
  ('dwarf_thug',   'dwarf thug',   3, 110,  6,  8,  7, 12, 5, 'melee', 5, 160,
   '{"grind": [20, 40], "items": [{"id":"iron_axe","chance":0.05},{"id":"copper_ore","chance":0.30}]}'::jsonb),
  ('bog_horror',   'bog horror',   4, 240, 10, 13, 10, 22, 5, 'melee', 8, 380,
   '{"grind": [60, 120], "items": [{"id":"steel_sword","chance":0.04},{"id":"rune_shard","chance":0.01}]}'::jsonb);

INSERT INTO mob_spawns (zone_id, mob_def_id, x, y, respawn_secs)
VALUES
  ('mireholm-starter', 'marsh_rat',   12, 18, 30),
  ('mireholm-starter', 'marsh_rat',   16, 22, 30),
  ('mireholm-starter', 'marsh_rat',   28, 14, 30),
  ('mireholm-starter', 'bog_goblin',  35, 30, 45),
  ('mireholm-starter', 'bog_goblin',  40, 35, 45),
  ('mireholm-starter', 'mire_bandit', 42, 42, 60);
