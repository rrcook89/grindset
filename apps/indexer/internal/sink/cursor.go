package sink

import (
	"context"
	"fmt"
)

// GetCursor returns the last processed signature for the given program, or ""
// if no cursor exists yet.
func (s *Sink) GetCursor(ctx context.Context, programID string) (string, error) {
	var sig string
	err := s.db.QueryRow(ctx,
		`SELECT last_signature FROM indexer_cursor WHERE program_id = $1`,
		programID,
	).Scan(&sig)
	if err != nil {
		return "", nil // not found is fine
	}
	return sig, nil
}

// SaveCursor upserts the cursor for the given program.
func (s *Sink) SaveCursor(ctx context.Context, programID, sig string, slot uint64) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO indexer_cursor(program_id, last_signature, last_slot)
		 VALUES ($1, $2, $3)
		 ON CONFLICT(program_id) DO UPDATE
		   SET last_signature = EXCLUDED.last_signature,
		       last_slot      = EXCLUDED.last_slot,
		       updated_at     = now()`,
		programID, sig, int64(slot),
	)
	if err != nil {
		return fmt.Errorf("sink: SaveCursor: %w", err)
	}
	return nil
}
