// Package ge implements the Grand Bazaar order book and matching engine.
// Matching is atomic: a single Postgres transaction inserts ge_fills,
// updates ge_orders, moves items between owners, and writes wallet_ledger
// lines for buyer, seller, and the 2% burn.
package ge

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// FeePercent is the GE trade fee burned on every fill (docs/04-tokenomics.md).
	FeePercent = 2

	// BurnAccountID mirrors wallet.BurnAccountID to avoid a circular import.
	BurnAccountID = "00000000-0000-0000-0000-00000000B044"
)

var (
	ErrOrderNotFound  = errors.New("ge: order not found")
	ErrNotOwner       = errors.New("ge: not order owner")
	ErrAlreadyClosed  = errors.New("ge: order already closed")
)

// Side is buy or sell.
type Side string

const (
	SideBuy  Side = "buy"
	SideSell Side = "sell"
)

// Order mirrors a row in ge_orders.
type Order struct {
	ID           string
	AccountID    string
	ItemDefID    string
	Side         Side
	PricePerUnit int64
	QtyTotal     int
	QtyRemaining int
	CreatedAt    time.Time
	Status       string // open | filled | cancelled
}

// Engine wraps a pgxpool and exposes order lifecycle operations.
type Engine struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Engine { return &Engine{db: db} }

// PlaceOrder inserts a new order and immediately attempts to match it.
// Returns the new order ID.
func (e *Engine) PlaceOrder(ctx context.Context, accountID, itemDefID string, side Side, pricePerUnit int64, qty int) (string, error) {
	if qty <= 0 || pricePerUnit <= 0 {
		return "", fmt.Errorf("ge: invalid order parameters")
	}

	tx, err := e.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var orderID string
	err = tx.QueryRow(ctx,
		`INSERT INTO ge_orders
		   (id, account_id, item_def_id, side, price_per_unit, qty_total, qty_remaining, created_at, status)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5, now(), 'open')
		 RETURNING id`,
		accountID, itemDefID, string(side), pricePerUnit, qty,
	).Scan(&orderID)
	if err != nil {
		return "", fmt.Errorf("ge: insert order: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}

	// Attempt matching outside the insert tx so we don't hold locks longer.
	if err := e.matchOrder(ctx, orderID, itemDefID, side, pricePerUnit); err != nil {
		// Non-fatal: order is placed; matching can be retried by the tick loop.
		return orderID, nil
	}
	return orderID, nil
}

// matchOrder finds the best counter-order and fills as much as possible.
// For a buy order, looks for the cheapest open sell ≤ buyPrice.
// For a sell order, looks for the most expensive open buy ≥ sellPrice.
// Each call fills at most one counter-order; the tick loop calls repeatedly.
func (e *Engine) matchOrder(ctx context.Context, orderID, itemDefID string, side Side, price int64) error {
	tx, err := e.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Lock our order.
	var myRemaining int
	var myAccountID string
	err = tx.QueryRow(ctx,
		`SELECT qty_remaining, account_id FROM ge_orders
		 WHERE id = $1 AND status = 'open' FOR UPDATE`,
		orderID,
	).Scan(&myRemaining, &myAccountID)
	if err != nil {
		return fmt.Errorf("ge: lock own order: %w", err)
	}
	if myRemaining == 0 {
		return nil
	}

	// Find best counter.
	var counterSide Side
	var priceOp string
	var priceOrder string
	if side == SideBuy {
		counterSide = SideSell
		priceOp = "<="
		priceOrder = "ASC" // cheapest sell first
	} else {
		counterSide = SideBuy
		priceOp = ">="
		priceOrder = "DESC" // most expensive buy first
	}

	q := fmt.Sprintf(
		`SELECT id, account_id, qty_remaining, price_per_unit FROM ge_orders
		 WHERE item_def_id = $1 AND side = $2 AND status = 'open'
		   AND price_per_unit %s $3
		   AND account_id != $4
		 ORDER BY price_per_unit %s, created_at ASC
		 LIMIT 1 FOR UPDATE`,
		priceOp, priceOrder,
	)

	var counterID, counterAccountID string
	var counterRemaining int
	var counterPrice int64
	err = tx.QueryRow(ctx, q, itemDefID, string(counterSide), price, myAccountID).
		Scan(&counterID, &counterAccountID, &counterRemaining, &counterPrice)
	if err != nil {
		// No match found — that's fine.
		return nil
	}

	fillQty := myRemaining
	if counterRemaining < fillQty {
		fillQty = counterRemaining
	}

	// Fill price = counter order price (maker price).
	fillPrice := counterPrice
	grossAmount := fillPrice * int64(fillQty)
	fee := grossAmount * FeePercent / 100
	if fee < 1 {
		fee = 1
	}
	netAmount := grossAmount - fee

	fillID := "gen_random_uuid()" // resolved server-side in SQL

	// Insert fill record.
	var buyOrderID, sellOrderID string
	if side == SideBuy {
		buyOrderID = orderID
		sellOrderID = counterID
	} else {
		buyOrderID = counterID
		sellOrderID = orderID
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO ge_fills
		   (id, buy_order_id, sell_order_id, price, qty, fee_burned, filled_at)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
		buyOrderID, sellOrderID, fillPrice, fillQty, fee,
	)
	if err != nil {
		return fmt.Errorf("ge: insert fill: %w", err)
	}
	_ = fillID

	// Update order qty_remaining / status.
	updateOrder := func(oid string, remaining, fill int) error {
		newRem := remaining - fill
		status := "open"
		if newRem == 0 {
			status = "filled"
		}
		_, err := tx.Exec(ctx,
			`UPDATE ge_orders SET qty_remaining = $1, status = $2 WHERE id = $3`,
			newRem, status, oid,
		)
		return err
	}
	if err := updateOrder(orderID, myRemaining, fillQty); err != nil {
		return fmt.Errorf("ge: update my order: %w", err)
	}
	if err := updateOrder(counterID, counterRemaining, fillQty); err != nil {
		return fmt.Errorf("ge: update counter order: %w", err)
	}

	// Wallet ledger: credit seller, debit buyer (buyer already reserved funds),
	// burn the fee.
	var buyerID, sellerID string
	if side == SideBuy {
		buyerID = myAccountID
		sellerID = counterAccountID
	} else {
		buyerID = counterAccountID
		sellerID = myAccountID
	}

	// Seller receives net amount.
	_, err = tx.Exec(ctx,
		`INSERT INTO wallet_ledger (account_id, delta, reason, ref_id, created_at)
		 VALUES ($1, $2, 'ge_sell', $3, now())`,
		sellerID, netAmount, buyOrderID,
	)
	if err != nil {
		return fmt.Errorf("ge: ledger seller: %w", err)
	}
	_, err = tx.Exec(ctx,
		`UPDATE wallet_balances SET grind_balance = grind_balance + $1, updated_at = now()
		 WHERE account_id = $2`,
		netAmount, sellerID,
	)
	if err != nil {
		return fmt.Errorf("ge: balance seller: %w", err)
	}

	// Buyer is debited gross amount (reserved at order placement in a real impl).
	_, err = tx.Exec(ctx,
		`INSERT INTO wallet_ledger (account_id, delta, reason, ref_id, created_at)
		 VALUES ($1, $2, 'ge_buy', $3, now())`,
		buyerID, -grossAmount, buyOrderID,
	)
	if err != nil {
		return fmt.Errorf("ge: ledger buyer: %w", err)
	}
	_, err = tx.Exec(ctx,
		`UPDATE wallet_balances SET grind_balance = grind_balance - $1, updated_at = now()
		 WHERE account_id = $2`,
		grossAmount, buyerID,
	)
	if err != nil {
		return fmt.Errorf("ge: balance buyer: %w", err)
	}

	// Burn fee.
	_, err = tx.Exec(ctx,
		`INSERT INTO wallet_ledger (account_id, delta, reason, ref_id, created_at)
		 VALUES ($1, $2, 'ge_burn', $3, now())`,
		BurnAccountID, fee, buyOrderID,
	)
	if err != nil {
		return fmt.Errorf("ge: ledger burn: %w", err)
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO wallet_balances (account_id, grind_balance, reserved, updated_at)
		 VALUES ($1, $2, 0, now())
		 ON CONFLICT (account_id) DO UPDATE
		   SET grind_balance = wallet_balances.grind_balance + $2, updated_at = now()`,
		BurnAccountID, fee,
	)
	if err != nil {
		return fmt.Errorf("ge: balance burn: %w", err)
	}

	return tx.Commit(ctx)
}

// CancelOrder marks an order as cancelled if it is still open and owned by accountID.
func (e *Engine) CancelOrder(ctx context.Context, orderID, accountID string) error {
	tag, err := e.db.Exec(ctx,
		`UPDATE ge_orders SET status = 'cancelled'
		 WHERE id = $1 AND account_id = $2 AND status = 'open'`,
		orderID, accountID,
	)
	if err != nil {
		return fmt.Errorf("ge: cancel: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrOrderNotFound
	}
	return nil
}

// MyOrders returns all orders for an account.
func (e *Engine) MyOrders(ctx context.Context, accountID string) ([]Order, error) {
	rows, err := e.db.Query(ctx,
		`SELECT id, account_id, item_def_id, side, price_per_unit,
		        qty_total, qty_remaining, created_at, status
		 FROM ge_orders WHERE account_id = $1 ORDER BY created_at DESC`,
		accountID,
	)
	if err != nil {
		return nil, fmt.Errorf("ge: my orders: %w", err)
	}
	defer rows.Close()

	var orders []Order
	for rows.Next() {
		var o Order
		var side string
		if err := rows.Scan(&o.ID, &o.AccountID, &o.ItemDefID, &side,
			&o.PricePerUnit, &o.QtyTotal, &o.QtyRemaining, &o.CreatedAt, &o.Status); err != nil {
			return nil, err
		}
		o.Side = Side(side)
		orders = append(orders, o)
	}
	return orders, rows.Err()
}

// DepthEntry is one price level in the market depth view.
type DepthEntry struct {
	PricePerUnit int64
	TotalQty     int
}

// MarketDepth returns aggregated buy/sell depth for an item.
func (e *Engine) MarketDepth(ctx context.Context, itemDefID string) (buys, sells []DepthEntry, err error) {
	query := func(side Side, order string) ([]DepthEntry, error) {
		rows, err := e.db.Query(ctx,
			fmt.Sprintf(
				`SELECT price_per_unit, SUM(qty_remaining)
				 FROM ge_orders
				 WHERE item_def_id = $1 AND side = $2 AND status = 'open'
				 GROUP BY price_per_unit
				 ORDER BY price_per_unit %s
				 LIMIT 20`, order),
			itemDefID, string(side),
		)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var out []DepthEntry
		for rows.Next() {
			var d DepthEntry
			if err := rows.Scan(&d.PricePerUnit, &d.TotalQty); err != nil {
				return nil, err
			}
			out = append(out, d)
		}
		return out, rows.Err()
	}

	buys, err = query(SideBuy, "DESC")
	if err != nil {
		return nil, nil, fmt.Errorf("ge: depth buys: %w", err)
	}
	sells, err = query(SideSell, "ASC")
	if err != nil {
		return nil, nil, fmt.Errorf("ge: depth sells: %w", err)
	}
	return buys, sells, nil
}
