CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE accounts (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         text        UNIQUE NOT NULL,
  solana_wallet text        UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  display_name  text,
  flags         jsonb       NOT NULL DEFAULT '{}'
);

CREATE TABLE characters (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       text        UNIQUE NOT NULL,
  position   jsonb       NOT NULL DEFAULT '{}',
  hp         int         NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_characters_account_id ON characters(account_id);
