// Package chain provides Solana RPC and voucher helpers for the game server.
package chain

import (
	"crypto/ed25519"
	"encoding/binary"
	"fmt"
)

// VoucherMessage builds the canonical 56-byte message that the game server
// signs and the on-chain program verifies.
//
// Layout (all little-endian):
//
//	user   [32]byte  — ed25519 / Solana public key
//	amount [8]byte   — u64 LE
//	nonce  [8]byte   — u64 LE
//	expiry [8]byte   — i64 LE (Unix timestamp)
func VoucherMessage(user [32]byte, amount, nonce uint64, expiry int64) [56]byte {
	var msg [56]byte
	copy(msg[:32], user[:])
	binary.LittleEndian.PutUint64(msg[32:40], amount)
	binary.LittleEndian.PutUint64(msg[40:48], nonce)
	binary.LittleEndian.PutUint64(msg[48:56], uint64(expiry)) // i64 and u64 share the same LE layout
	return msg
}

// SignVoucher signs the canonical voucher message with the game-signer private key.
// privKey must be a 64-byte ed25519 private key (seed || pubkey, as returned by
// ed25519.GenerateKey or loaded from a Solana JSON keypair).
func SignVoucher(privKey ed25519.PrivateKey, user [32]byte, amount, nonce uint64, expiry int64) ([64]byte, error) {
	if len(privKey) != ed25519.PrivateKeySize {
		return [64]byte{}, fmt.Errorf("chain: privKey must be %d bytes, got %d", ed25519.PrivateKeySize, len(privKey))
	}
	msg := VoucherMessage(user, amount, nonce, expiry)
	sig := ed25519.Sign(privKey, msg[:])
	var out [64]byte
	copy(out[:], sig)
	return out, nil
}

// VerifyVoucher verifies the ed25519 signature against the canonical message.
// pubKey is the 32-byte game-signer public key stored in Config.game_signer.
func VerifyVoucher(pubKey ed25519.PublicKey, user [32]byte, amount, nonce uint64, expiry int64, sig [64]byte) bool {
	if len(pubKey) != ed25519.PublicKeySize {
		return false
	}
	msg := VoucherMessage(user, amount, nonce, expiry)
	return ed25519.Verify(pubKey, msg[:], sig[:])
}
