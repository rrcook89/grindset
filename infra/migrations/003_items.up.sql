CREATE TABLE item_definitions (
  id           text    PRIMARY KEY,
  display_name text    NOT NULL,
  base_stats   jsonb   NOT NULL DEFAULT '{}',
  max_durability int,
  stackable    bool    NOT NULL DEFAULT false,
  nft_eligible bool    NOT NULL DEFAULT false
);

CREATE TABLE items (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    uuid REFERENCES characters(id) ON DELETE SET NULL,
  item_def_id text NOT NULL REFERENCES item_definitions(id),
  quantity    int  NOT NULL DEFAULT 1,
  attributes  jsonb,
  durability  int,
  nft_mint    text,
  bound_state text NOT NULL DEFAULT 'in_game'
);

CREATE INDEX idx_items_owner_id ON items(owner_id);
CREATE INDEX idx_items_item_def_id ON items(item_def_id);

CREATE TABLE bank_slots (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slot       int  NOT NULL,
  item_id    uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, slot)
);
