package chain_test

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"testing"

	"github.com/grindset/server/internal/chain"
)

// TestVoucherMessageLayout verifies the exact byte layout expected by the
// on-chain program and matches the generate_voucher.ts reference script.
//
// Reference vector derived by running:
//
//	ts-node programs/scripts/generate_voucher.ts \
//	  --user  <all-zeros-32-byte-pubkey-as-base58> \
//	  --amount 1000 --nonce 42 --expiry 9999999999 \
//	  --signer-keypair /tmp/test-signer.json
//
// The expected message_hex below was captured from that run with a known
// all-zeros user key, amount=1000, nonce=42, expiry=9999999999.
func TestVoucherMessageLayout(t *testing.T) {
	var user [32]byte // all zeros
	amount := uint64(1000)
	nonce := uint64(42)
	expiry := int64(9999999999)

	msg := chain.VoucherMessage(user, amount, nonce, expiry)

	if len(msg) != 56 {
		t.Fatalf("message length %d, want 56", len(msg))
	}

	// user bytes: 32 zeros
	for i := 0; i < 32; i++ {
		if msg[i] != 0 {
			t.Fatalf("byte %d: got %02x, want 00", i, msg[i])
		}
	}

	// amount 1000 in LE: e8 03 00 00 00 00 00 00
	wantAmt := []byte{0xe8, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}
	for i, b := range wantAmt {
		if msg[32+i] != b {
			t.Fatalf("amount byte %d: got %02x, want %02x", i, msg[32+i], b)
		}
	}

	// nonce 42 in LE: 2a 00 00 00 00 00 00 00
	wantNonce := []byte{0x2a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}
	for i, b := range wantNonce {
		if msg[40+i] != b {
			t.Fatalf("nonce byte %d: got %02x, want %02x", i, msg[40+i], b)
		}
	}

	// expiry 9999999999 = 0x2540BE3FF in LE: ff e3 0b 54 02 00 00 00
	wantExpiry := []byte{0xff, 0xe3, 0x0b, 0x54, 0x02, 0x00, 0x00, 0x00}
	for i, b := range wantExpiry {
		if msg[48+i] != b {
			t.Fatalf("expiry byte %d: got %02x, want %02x", i, msg[48+i], b)
		}
	}

	// Full hex cross-check (matches generate_voucher.ts message_hex output)
	got := hex.EncodeToString(msg[:])
	want := "0000000000000000000000000000000000000000000000000000000000000000" +
		"e803000000000000" +
		"2a00000000000000" +
		"ffe30b5402000000"
	if got != want {
		t.Fatalf("message hex mismatch:\n got  %s\n want %s", got, want)
	}
}

// TestSignVerifyRoundTrip checks that Sign → Verify round-trips correctly and
// that a tampered message fails verification.
func TestSignVerifyRoundTrip(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}

	var user [32]byte
	if _, err := rand.Read(user[:]); err != nil {
		t.Fatal(err)
	}
	amount := uint64(500_000)
	nonce := uint64(7)
	expiry := int64(1_800_000_000)

	sig, err := chain.SignVoucher(priv, user, amount, nonce, expiry)
	if err != nil {
		t.Fatal(err)
	}

	if !chain.VerifyVoucher(pub, user, amount, nonce, expiry, sig) {
		t.Fatal("VerifyVoucher returned false for a valid signature")
	}

	// Tamper: change one byte of expiry
	tampered := sig
	tampered[0] ^= 0xff
	if chain.VerifyVoucher(pub, user, amount, nonce, expiry, tampered) {
		t.Fatal("VerifyVoucher returned true for a tampered signature")
	}

	// Tamper: change amount
	if chain.VerifyVoucher(pub, user, amount+1, nonce, expiry, sig) {
		t.Fatal("VerifyVoucher returned true for wrong amount")
	}
}

// TestWrongKeyFails ensures a signature by key A doesn't verify against key B.
func TestWrongKeyFails(t *testing.T) {
	_, privA, _ := ed25519.GenerateKey(rand.Reader)
	pubB, _, _ := ed25519.GenerateKey(rand.Reader)

	var user [32]byte
	sig, _ := chain.SignVoucher(privA, user, 1, 1, 1)
	if chain.VerifyVoucher(pubB, user, 1, 1, 1, sig) {
		t.Fatal("VerifyVoucher returned true for wrong public key")
	}
}
