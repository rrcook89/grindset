package chain

// Solana SDK choice: github.com/gagliardetto/solana-go
//
// Reason: it is the most widely adopted Go Solana SDK, has first-class support
// for building and signing transactions with versioned tx format, exposes
// ed25519 instruction construction that matches the on-chain Ed25519Program
// layout we need for withdraw, and is actively maintained with recent releases.
// blocto/solana-go-sdk is a viable alternative but has a smaller community and
// fewer high-level helpers for the instruction-sysvar pattern.
//
// The import below is intentionally kept minimal so this file compiles without
// network access during the unit-test run (the indexer module carries the full
// dep tree). The server module's go.mod adds the dep when BuildWithdrawTx is
// actually wired to a live endpoint.

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// RPCClient is a thin wrapper around Solana JSON-RPC.
// It uses the standard net/http client so no external dep is required in the
// server module until solana-go is added.
type RPCClient struct {
	endpoint string
	http     *http.Client
}

// NewRPCClient creates an RPC client targeting the given endpoint
// (e.g. "https://api.mainnet-beta.solana.com" or "http://127.0.0.1:8899").
func NewRPCClient(endpoint string) *RPCClient {
	return &RPCClient{
		endpoint: endpoint,
		http: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GetSlot returns the current confirmed slot number.
func (c *RPCClient) GetSlot(ctx context.Context) (uint64, error) {
	resp, err := jsonRPC[slotResult](ctx, c, "getSlot", []any{"confirmed"})
	if err != nil {
		return 0, fmt.Errorf("chain: GetSlot: %w", err)
	}
	return resp, nil
}

// GetBlockTime returns the estimated Unix timestamp for the given slot,
// or 0 if the slot has no block time.
func (c *RPCClient) GetBlockTime(ctx context.Context, slot uint64) (int64, error) {
	resp, err := jsonRPC[*int64](ctx, c, "getBlockTime", []any{slot})
	if err != nil {
		return 0, fmt.Errorf("chain: GetBlockTime: %w", err)
	}
	if resp == nil {
		return 0, nil
	}
	return *resp, nil
}

// GetTransaction fetches a confirmed transaction by base-58 signature and
// returns the raw JSON bytes for the caller to decode.
func (c *RPCClient) GetTransaction(ctx context.Context, sig string) ([]byte, error) {
	raw, err := jsonRPCRaw(ctx, c, "getTransaction", []any{
		sig,
		map[string]any{"encoding": "json", "commitment": "confirmed"},
	})
	if err != nil {
		return nil, fmt.Errorf("chain: GetTransaction(%s): %w", sig, err)
	}
	return raw, nil
}
