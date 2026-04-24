package protocol

import (
	"bytes"
	"testing"
)

func TestHelloRoundTrip(t *testing.T) {
	raw := EncodeHello(Hello{DevUser: "gandalf"})
	f, err := Decode(raw)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if f.Op != OpHello {
		t.Fatalf("op: got %x want %x", f.Op, OpHello)
	}
	if got := DecodeHello(f.Payload); got.DevUser != "gandalf" {
		t.Fatalf("dev_user: got %q", got.DevUser)
	}
}

func TestWelcomeRoundTrip(t *testing.T) {
	w := Welcome{PlayerID: 42, SpawnX: 10, SpawnY: 20, ZoneW: 50, ZoneH: 50}
	raw := EncodeWelcome(w)
	f, err := Decode(raw)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	got, err := DecodeWelcome(f.Payload)
	if err != nil {
		t.Fatalf("decode welcome: %v", err)
	}
	if got != w {
		t.Fatalf("mismatch: got %+v want %+v", got, w)
	}
}

func TestMoveIntentRoundTrip(t *testing.T) {
	m := MoveIntent{X: 7, Y: 13}
	raw := EncodeMoveIntent(m)
	f, err := Decode(raw)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	got, err := DecodeMoveIntent(f.Payload)
	if err != nil {
		t.Fatalf("decode mi: %v", err)
	}
	if got != m {
		t.Fatalf("mismatch")
	}
}

func TestPositionDeltaRoundTrip(t *testing.T) {
	entries := []EntityPos{
		{ID: 1, X: 2, Y: 3},
		{ID: 4, X: 5, Y: 6},
		{ID: 7, X: 8, Y: 9},
	}
	raw := EncodePositionDelta(entries)
	f, err := Decode(raw)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	got, err := DecodePositionDelta(f.Payload)
	if err != nil {
		t.Fatalf("decode pd: %v", err)
	}
	if len(got) != len(entries) {
		t.Fatalf("count mismatch")
	}
	for i := range entries {
		if got[i] != entries[i] {
			t.Fatalf("entry %d mismatch", i)
		}
	}
}

func TestErrorRoundTrip(t *testing.T) {
	e := ProtoError{Code: 1, Message: "oops"}
	raw := EncodeError(e)
	f, err := Decode(raw)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	got, err := DecodeError(f.Payload)
	if err != nil {
		t.Fatalf("decode err: %v", err)
	}
	if got != e {
		t.Fatalf("mismatch")
	}
}

func TestDecodeShort(t *testing.T) {
	if _, err := Decode([]byte{0x00}); err == nil {
		t.Fatal("expected short error")
	}
}

func TestEncodeHeader(t *testing.T) {
	raw := Encode(OpMoveIntent, []byte{1, 2, 3, 4})
	if !bytes.Equal(raw[:4], []byte{0x10, 0x00, 0x04, 0x00}) {
		t.Fatalf("header: %x", raw[:4])
	}
}
