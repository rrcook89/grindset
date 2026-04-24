CREATE TABLE indexer_cursor (
  program_id     text        PRIMARY KEY,
  last_signature text        NOT NULL,
  last_slot      bigint      NOT NULL,
  updated_at     timestamptz DEFAULT now()
);
