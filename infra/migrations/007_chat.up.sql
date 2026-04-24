-- Partitioned by day; TTL ~30 days managed by dropping old partitions.
CREATE TABLE chat_messages (
  id           bigserial,
  channel      text        NOT NULL,
  character_id uuid,
  body         text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Template partition for today; add new ones daily via cron / server startup.
CREATE TABLE chat_messages_default PARTITION OF chat_messages DEFAULT;

CREATE INDEX idx_chat_messages_channel_time ON chat_messages(channel, created_at DESC);
CREATE INDEX idx_chat_messages_character_id ON chat_messages(character_id);
