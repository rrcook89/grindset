CREATE TABLE quest_progress (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_id     text NOT NULL,
  state        text NOT NULL DEFAULT 'not_started' CHECK (state IN ('not_started', 'in_progress', 'complete')),
  data         jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (character_id, quest_id)
);
