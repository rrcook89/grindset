package chain

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
}

type rpcResponse[T any] struct {
	Result T `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// slotResult is the JSON type returned by getSlot.
type slotResult = uint64

// jsonRPC sends a JSON-RPC call and decodes the result into T.
func jsonRPC[T any](ctx context.Context, c *RPCClient, method string, params []any) (T, error) {
	raw, err := jsonRPCRaw(ctx, c, method, params)
	var zero T
	if err != nil {
		return zero, err
	}
	var resp rpcResponse[T]
	if err := json.Unmarshal(raw, &resp); err != nil {
		return zero, fmt.Errorf("chain: decode %s response: %w", method, err)
	}
	if resp.Error != nil {
		return zero, fmt.Errorf("chain: %s RPC error %d: %s", method, resp.Error.Code, resp.Error.Message)
	}
	return resp.Result, nil
}

// jsonRPCRaw sends a JSON-RPC call and returns the raw response bytes.
func jsonRPCRaw(ctx context.Context, c *RPCClient, method string, params []any) ([]byte, error) {
	body, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("chain: http post %s: %w", method, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("chain: read %s body: %w", method, err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("chain: %s HTTP %d: %s", method, resp.StatusCode, raw)
	}
	return raw, nil
}
