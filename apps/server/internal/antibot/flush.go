package antibot

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Flusher runs a background goroutine that scores every known account once
// per hour and writes results to behavior_signals.
type Flusher struct {
	col *Collector
	db  *pgxpool.Pool
	log *slog.Logger
}

// NewFlusher constructs a Flusher. db may be nil (signals are computed but
// not persisted — useful in tests).
func NewFlusher(col *Collector, db *pgxpool.Pool, log *slog.Logger) *Flusher {
	return &Flusher{col: col, db: db, log: log}
}

// Run blocks until ctx is cancelled. It fires once at the top of each hour.
func (f *Flusher) Run(ctx context.Context) {
	for {
		now := time.Now().UTC()
		next := now.Truncate(time.Hour).Add(time.Hour)
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}
		window := time.Now().UTC().Truncate(time.Hour).Add(-time.Hour)
		f.flush(ctx, window)
	}
}

func (f *Flusher) flush(ctx context.Context, window time.Time) {
	f.col.mu.Lock()
	ids := make([]uuid.UUID, 0, len(f.col.rings))
	for id := range f.col.rings {
		ids = append(ids, id)
	}
	f.col.mu.Unlock()

	for _, id := range ids {
		s := f.col.Compute(id, window)
		s.FlagScore = flagScore(s)
		f.log.Debug("antibot flush", "account", id, "score", s.FlagScore,
			"action_count", s.ActionCount, "click_var", s.ClickVariance,
			"path_entropy", s.PathEntropy, "session_shape", s.SessionShape)
		if f.db == nil {
			continue
		}
		if err := f.write(ctx, s); err != nil {
			f.log.Warn("antibot: flush write failed", "account", id, "err", err)
		}
	}
}

func (f *Flusher) write(ctx context.Context, s Signals) error {
	_, err := f.db.Exec(ctx, `
		INSERT INTO behavior_signals
			(account_id, window, action_count, click_variance, path_entropy, flag_score)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (account_id, window)
		DO UPDATE SET
			action_count   = EXCLUDED.action_count,
			click_variance = EXCLUDED.click_variance,
			path_entropy   = EXCLUDED.path_entropy,
			flag_score     = EXCLUDED.flag_score`,
		s.AccountID, s.Window, s.ActionCount, s.ClickVariance, s.PathEntropy, s.FlagScore,
	)
	return err
}
