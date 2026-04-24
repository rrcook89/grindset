// Package parser decodes Bridge program events from Solana transaction logs.
//
// Anchor emits events by base64-encoding the borsh-serialised event struct and
// writing it to the program log as:
//
//	Program data: <base64>
//
// The discriminator is the first 8 bytes (sha256("event:<TypeName>")[:8]).
// We match on the known discriminators for DepositEvent and WithdrawEvent.
package parser

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"strings"
)

// EventKind identifies the on-chain event type.
type EventKind string

const (
	KindDeposit  EventKind = "deposit"
	KindWithdraw EventKind = "withdraw"
)

// Event is the decoded representation of a Bridge program event.
type Event struct {
	Kind EventKind
	// User is the 32-byte Solana public key (base-58 not decoded here — callers
	// map it to an account_id via the accounts table).
	UserBytes [32]byte
	Amount    uint64
	// Slot is populated only for DepositEvent.
	Slot uint64
	// Nonce is populated only for WithdrawEvent.
	Nonce uint64
}

// discriminator computes the Anchor event discriminator:
// sha256("event:<name>")[:8]
// Pre-computed constants below match the on-chain definitions in events.rs.

// These were computed with: sha256("event:DepositEvent")[:8]
var depositDisc = [8]byte{0x78, 0xf8, 0x3d, 0x53, 0x1f, 0x8e, 0x6b, 0x90}

// sha256("event:WithdrawEvent")[:8]
var withdrawDisc = [8]byte{0x16, 0x09, 0x85, 0x1a, 0xa0, 0x2c, 0x47, 0xc0}

// ParseLogs scans the log lines from one Solana transaction and returns any
// Bridge events found.  Unknown program data lines are silently skipped.
func ParseLogs(logs []string) ([]Event, error) {
	var events []Event
	for _, line := range logs {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "Program data: ") {
			continue
		}
		b64 := strings.TrimPrefix(line, "Program data: ")
		data, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			continue // not our data
		}
		if len(data) < 8 {
			continue
		}
		var disc [8]byte
		copy(disc[:], data[:8])
		payload := data[8:]

		switch disc {
		case depositDisc:
			ev, err := decodeDeposit(payload)
			if err != nil {
				return nil, fmt.Errorf("parser: decodeDeposit: %w", err)
			}
			events = append(events, ev)
		case withdrawDisc:
			ev, err := decodeWithdraw(payload)
			if err != nil {
				return nil, fmt.Errorf("parser: decodeWithdraw: %w", err)
			}
			events = append(events, ev)
		}
	}
	return events, nil
}

// decodeDeposit parses: user(32) || amount(u64 LE) || slot(u64 LE)
func decodeDeposit(b []byte) (Event, error) {
	if len(b) < 48 {
		return Event{}, fmt.Errorf("deposit payload too short: %d bytes", len(b))
	}
	var ev Event
	ev.Kind = KindDeposit
	copy(ev.UserBytes[:], b[:32])
	ev.Amount = binary.LittleEndian.Uint64(b[32:40])
	ev.Slot = binary.LittleEndian.Uint64(b[40:48])
	return ev, nil
}

// decodeWithdraw parses: user(32) || amount(u64 LE) || nonce(u64 LE)
func decodeWithdraw(b []byte) (Event, error) {
	if len(b) < 48 {
		return Event{}, fmt.Errorf("withdraw payload too short: %d bytes", len(b))
	}
	var ev Event
	ev.Kind = KindWithdraw
	copy(ev.UserBytes[:], b[:32])
	ev.Amount = binary.LittleEndian.Uint64(b[32:40])
	ev.Nonce = binary.LittleEndian.Uint64(b[40:48])
	return ev, nil
}
