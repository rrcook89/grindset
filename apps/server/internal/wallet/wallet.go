// Package wallet implements the $GRIND ledger, daily faucet cap, and burn logic.
// All amounts are in base units (1 $GRIND = 1_000_000_000 units, 9 decimals).
// The ledger is append-only; wallet_balances is a cached aggregate.
package wallet

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// GrindPerUnit is 1 $GRIND expressed in base units.
	GrindPerUnit int64 = 1_000_000_000

	// DailyCap is the per-account hard cap before diminishing returns kick in.
	// docs/04-tokenomics.md: ~8,000 $GRIND/day.
	DailyCap int64 = 8_000 * GrindPerUnit

	// DiminishingScale is the fraction of a drop kept once the cap is exceeded (20%).
	DiminishingScale float64 = 0.20

	// BurnAccountID is the sentinel UUID for the burn sink.
	BurnAccountID = "00000000-0000-0000-0000-00000000B044"
)

var ErrInsufficientBalance = errors.New("wallet: insufficient balance")

// Reason labels a ledger entry's source.
type Reason string

const (
	ReasonMobDrop  Reason = "mob_drop"
	ReasonSkillDrop Reason = "skill_drop"
	ReasonGEBuy    Reason = "ge_buy"
	ReasonGESell   Reason = "ge_sell"
	ReasonGEBurn   Reason = "ge_burn"
	ReasonWithdraw Reason = "withdraw"
	ReasonDeposit  Reason = "deposit"
)

// Ledger writes wallet movements to Postgres.
type Ledger struct {
	db *pgxpool.Pool
}

func NewLedger(db *pgxpool.Pool) *Ledger { return &Ledger{db: db} }

// Credit adds delta to accountID and appends a ledger row.
// refID may be empty ("") for non-idempotent entries.
func (l *Ledger) Credit(ctx context.Context, accountID string, delta int64, reason Reason, refID string) error {
	return l.write(ctx, accountID, delta, reason, refID)
}

// Debit subtracts delta from accountID (delta must be positive).
func (l *Ledger) Debit(ctx context.Context, accountID string, delta int64, reason Reason, refID string) error {
	if delta <= 0 {
		return fmt.Errorf("wallet: debit delta must be positive")
	}
	return l.write(ctx, accountID, -delta, reason, refID)
}

func (l *Ledger) write(ctx context.Context, accountID string, delta int64, reason Reason, refID string) error {
	tx, err := l.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var refParam interface{}
	if refID != "" {
		refParam = refID
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO wallet_ledger (account_id, delta, reason, ref_id, created_at)
		 VALUES ($1, $2, $3, $4, now())`,
		accountID, delta, string(reason), refParam,
	)
	if err != nil {
		return fmt.Errorf("wallet: ledger insert: %w", err)
	}

	// Update cached balance. Use INSERT ... ON CONFLICT so the row always exists.
	_, err = tx.Exec(ctx,
		`INSERT INTO wallet_balances (account_id, grind_balance, reserved, updated_at)
		 VALUES ($1, $2, 0, now())
		 ON CONFLICT (account_id) DO UPDATE
		   SET grind_balance = wallet_balances.grind_balance + $2,
		       updated_at    = now()`,
		accountID, delta,
	)
	if err != nil {
		return fmt.Errorf("wallet: balance update: %w", err)
	}

	return tx.Commit(ctx)
}

// Balance returns the cached grind_balance for an account.
func (l *Ledger) Balance(ctx context.Context, accountID string) (int64, error) {
	var bal int64
	err := l.db.QueryRow(ctx,
		`SELECT COALESCE(grind_balance, 0) FROM wallet_balances WHERE account_id = $1`,
		accountID,
	).Scan(&bal)
	if err != nil {
		return 0, fmt.Errorf("wallet: balance query: %w", err)
	}
	return bal, nil
}

// EarnedToday returns how many base units an account has credited today
// from faucet sources (mob_drop, skill_drop).
func (l *Ledger) EarnedToday(ctx context.Context, accountID string) (int64, error) {
	midnight := time.Now().UTC().Truncate(24 * time.Hour)
	var total int64
	err := l.db.QueryRow(ctx,
		`SELECT COALESCE(SUM(delta), 0) FROM wallet_ledger
		 WHERE account_id = $1
		   AND reason IN ('mob_drop','skill_drop')
		   AND delta > 0
		   AND created_at >= $2`,
		accountID, midnight,
	).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("wallet: earned_today query: %w", err)
	}
	return total, nil
}

// ApplyCap applies the daily faucet cap to a raw drop amount.
// earnedToday is the amount already earned today (before this drop).
// Returns the adjusted amount to actually credit.
func ApplyCap(raw, earnedToday int64) int64 {
	if earnedToday >= DailyCap {
		// Fully in diminishing zone.
		return int64(float64(raw) * DiminishingScale)
	}
	remaining := DailyCap - earnedToday
	if raw <= remaining {
		return raw
	}
	// Partial: up to the cap at full rate, rest at 20%.
	over := raw - remaining
	return remaining + int64(float64(over)*DiminishingScale)
}

// FaucetDrop credits a mob/skill drop to accountID, applying the daily cap.
// It also writes the ledger entry.  earnedToday must be fetched by the caller.
func (l *Ledger) FaucetDrop(ctx context.Context, accountID string, rawAmount, earnedToday int64, reason Reason, refID string) (int64, error) {
	effective := ApplyCap(rawAmount, earnedToday)
	if effective <= 0 {
		return 0, nil
	}
	if err := l.Credit(ctx, accountID, effective, reason, refID); err != nil {
		return 0, err
	}
	return effective, nil
}

// Burn sends delta to the burn sentinel account and writes a ledger row.
func (l *Ledger) Burn(ctx context.Context, delta int64, reason Reason, refID string) error {
	return l.Credit(ctx, BurnAccountID, delta, reason, refID)
}
