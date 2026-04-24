INSERT INTO item_definitions (id, display_name, base_stats, max_durability, stackable, nft_eligible) VALUES
  ('bronze_pickaxe', 'Bronze Pickaxe', '{"mining_bonus": 1}',  100, false, false),
  ('iron_pickaxe',   'Iron Pickaxe',   '{"mining_bonus": 3}',  150, false, false),
  ('steel_sword',    'Steel Sword',    '{"attack": 12, "str_bonus": 4}', 200, false, true),
  ('copper_ore',     'Copper Ore',     '{}',                   null, true,  false),
  ('oak_log',        'Oak Log',        '{}',                   null, true,  false),
  ('raw_shrimp',     'Raw Shrimp',     '{}',                   null, true,  false),
  ('cooked_shrimp',  'Cooked Shrimp',  '{"heal": 3}',          null, true,  false),
  ('bronze_bar',     'Bronze Bar',     '{}',                   null, true,  false);
