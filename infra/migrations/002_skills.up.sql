CREATE TABLE skills (
  character_id uuid   NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  skill        text   NOT NULL,
  xp           bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, skill)
);
