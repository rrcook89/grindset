CREATE TABLE wallet_balances (
  account_id    uuid        PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  grind_balance bigint      NOT NULL DEFAULT 0,
  reserved      bigint      NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallet_ledger (
  id         bigserial   PRIMARY KEY,
  account_id uuid        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  delta      bigint      NOT NULL,
  reason     text        NOT NULL,
  ref_id     uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_ledger_account_id ON wallet_ledger(account_id);
CREATE UNIQUE INDEX idx_wallet_ledger_ref_id ON wallet_ledger(ref_id) WHERE ref_id IS NOT NULL;

CREATE TABLE chain_events (
  sig          text        PRIMARY KEY,
  kind         text        NOT NULL CHECK (kind IN ('deposit', 'withdraw', 'mint', 'stake')),
  account_id   uuid        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount       bigint      NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chain_events_account_id ON chain_events(account_id);
