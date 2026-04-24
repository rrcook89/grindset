package chain

import (
	"crypto/ed25519"
	"encoding/binary"
	"fmt"
	"time"
)

// WithdrawTx is the serialised payload a client submits to the bridge program.
// It contains the voucher fields and the ed25519 signature; the caller must
// prepend an Ed25519Program instruction before sending to the network.
//
// For full on-chain submission use a Solana SDK (gagliardetto/solana-go) to
// wrap these bytes into a versioned transaction.  This struct is the source of
// truth for the voucher fields so the server and indexer share one definition.
type WithdrawTx struct {
	User      [32]byte
	Amount    uint64
	Nonce     uint64
	Expiry    int64
	Signature [64]byte
	// Message is pre-computed for callers that need to build the Ed25519
	// pre-instruction (they need the raw 56-byte payload).
	Message [56]byte
}

// BuildWithdrawTx signs a voucher with privKey and returns the WithdrawTx
// ready to be wrapped in a Solana transaction by the caller.
//
// privKey: 64-byte ed25519 private key of the game signer stored in Config.
// user:    32-byte Solana public key of the redeeming player.
// amount:  token amount in smallest units.
// nonce:   must be strictly greater than the player's on-chain PlayerVault.nonce.
// ttl:     how long from now the voucher is valid (e.g. 5*time.Minute).
func BuildWithdrawTx(
	privKey ed25519.PrivateKey,
	user [32]byte,
	amount, nonce uint64,
	ttl time.Duration,
) (*WithdrawTx, error) {
	if len(privKey) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("chain: BuildWithdrawTx: privKey must be %d bytes", ed25519.PrivateKeySize)
	}
	if amount == 0 {
		return nil, fmt.Errorf("chain: BuildWithdrawTx: amount must be > 0")
	}

	expiry := time.Now().Add(ttl).Unix()
	msg := VoucherMessage(user, amount, nonce, expiry)

	sig, err := SignVoucher(privKey, user, amount, nonce, expiry)
	if err != nil {
		return nil, err
	}

	return &WithdrawTx{
		User:      user,
		Amount:    amount,
		Nonce:     nonce,
		Expiry:    expiry,
		Signature: sig,
		Message:   msg,
	}, nil
}

// VoucherBytes serialises the WithdrawTx into the Anchor instruction data
// layout expected by Bridge.withdraw:
//
//	user     [32]byte
//	amount   u64 LE
//	nonce    u64 LE
//	expiry   i64 LE
//	signature [64]byte
//
// Total: 120 bytes.
func (w *WithdrawTx) VoucherBytes() []byte {
	out := make([]byte, 120)
	copy(out[0:32], w.User[:])
	binary.LittleEndian.PutUint64(out[32:40], w.Amount)
	binary.LittleEndian.PutUint64(out[40:48], w.Nonce)
	binary.LittleEndian.PutUint64(out[48:56], uint64(w.Expiry))
	copy(out[56:120], w.Signature[:])
	return out
}
