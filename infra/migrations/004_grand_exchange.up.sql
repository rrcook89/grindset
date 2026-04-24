CREATE TABLE ge_orders (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id     uuid        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  item_def_id    text        NOT NULL REFERENCES item_definitions(id),
  side           text        NOT NULL CHECK (side IN ('buy', 'sell')),
  price_per_unit bigint      NOT NULL,
  qty_total      int         NOT NULL,
  qty_remaining  int         NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  status         text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled'))
);

-- Primary matching index: find open sell orders for an item cheapest-first, buy orders most-expensive-first
CREATE INDEX idx_ge_orders_match ON ge_orders(side, item_def_id, price_per_unit) WHERE status = 'open';
CREATE INDEX idx_ge_orders_account ON ge_orders(account_id);

CREATE TABLE ge_fills (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  buy_order_id  uuid        NOT NULL REFERENCES ge_orders(id),
  sell_order_id uuid        NOT NULL REFERENCES ge_orders(id),
  price         bigint      NOT NULL,
  qty           int         NOT NULL,
  fee_burned    bigint      NOT NULL,
  filled_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ge_fills_buy_order  ON ge_fills(buy_order_id);
CREATE INDEX idx_ge_fills_sell_order ON ge_fills(sell_order_id);
