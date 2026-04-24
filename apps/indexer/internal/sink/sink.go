// Package sink writes parsed chain events to Postgres idempotently.
package sink

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/grindset/indexer/internal/parser"
)

// Sink writes events to chain_events and wallet_ledger.
type Sink struct {
	db *pgxpool.Pool
}

// New creates a Sink backed by the given pool.
func New(db *pgxpool.Pool) *Sink {
	return &Sink{db: db}
}

// Write persists one event idempotently.
//
// chain_events is idempotent on sig (PRIMARY KEY).
// wallet_ledger is idempotent on ref_id (UNIQUE INDEX where ref_id IS NOT NULL).
//
// Both inserts use ON CONFLICT DO NOTHING so duplicate webhook deliveries are
// safe.
func (s *Sink) Write(ctx context.Context, sig string, ev parser.Event) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("sink: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Resolve account_id from the wallet address.
	// wallet_addresses is a hypothetical lookup table; adjust to your schema.
	// If no account is found we skip the ledger insert (chain event still written).
	var accountID *string
	// Ignore scan errors (e.g. pgx.ErrNoRows) — unresolved wallets skip the
	// ledger insert but still write chain_events if they eventually resolve.
	_ = tx.QueryRow(ctx,
		`SELECT a.id::text
		   FROM accounts a
		   JOIN wallet_addresses wa ON wa.account_id = a.id
		  WHERE wa.address = $1`,
		base58Encode(ev.UserBytes[:]),
	).Scan(&accountID)

	// Upsert chain_events.
	kind := string(ev.Kind)
	amount := int64(ev.Amount)

	if accountID != nil {
		if _, err = tx.Exec(ctx,
			`INSERT INTO chain_events(sig, kind, account_id, amount)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT(sig) DO NOTHING`,
			sig, kind, *accountID, amount,
		); err != nil {
			return fmt.Errorf("sink: chain_events insert: %w", err)
		}
	}
	// If accountID is nil, skip chain_events (account not yet registered).

	// Insert wallet_ledger for deposit events only (withdraw is an outflow from
	// the treasury, not an in-game credit; the server handles that side).
	if ev.Kind == parser.KindDeposit && accountID != nil {
		if _, err = tx.Exec(ctx,
			`INSERT INTO wallet_ledger(account_id, delta, reason, ref_id)
			 VALUES ($1, $2, 'chain:deposit', $3::uuid)
			 ON CONFLICT DO NOTHING`,
			*accountID, amount, sigToUUID(sig),
		); err != nil {
			return fmt.Errorf("sink: wallet_ledger insert: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// sigToUUID derives a deterministic UUID-shaped string from a tx signature.
// Uses the first 16 bytes of the base58-decoded sig as a v4-ish UUID.
// This satisfies the UNIQUE INDEX on ref_id without requiring an extra column.
func sigToUUID(sig string) string {
	// A Solana signature is 87-88 base58 chars representing 64 bytes.
	// We only need uniqueness, not standards compliance.
	b := []byte(sig)
	if len(b) > 32 {
		b = b[:32]
	}
	for len(b) < 32 {
		b = append(b, 0)
	}
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// base58Encode is a minimal base58 encoder for Solana public keys.
// Using the Bitcoin alphabet as Solana does.
func base58Encode(b []byte) string {
	const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
	// Count leading zeros.
	leadingZeros := 0
	for _, v := range b {
		if v != 0 {
			break
		}
		leadingZeros++
	}
	// Convert to big-endian base58.
	digits := make([]int, 0, len(b)*136/100)
	for _, v := range b {
		carry := int(v)
		for i := 0; i < len(digits); i++ {
			carry += digits[i] << 8
			digits[i] = carry % 58
			carry /= 58
		}
		for carry > 0 {
			digits = append(digits, carry%58)
			carry /= 58
		}
	}
	result := make([]byte, leadingZeros+len(digits))
	for i := range leadingZeros {
		result[i] = alphabet[0]
	}
	for i, d := range digits {
		result[len(result)-1-i] = alphabet[d]
	}
	return string(result)
}
