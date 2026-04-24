CREATE TABLE behavior_signals (
  account_id    uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  window        timestamptz NOT NULL,
  action_count  int         NOT NULL DEFAULT 0,
  click_variance float      NOT NULL DEFAULT 0,
  path_entropy  float       NOT NULL DEFAULT 0,
  flag_score    int         NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, window)
);

CREATE INDEX idx_behavior_signals_flag_score ON behavior_signals(flag_score DESC);
