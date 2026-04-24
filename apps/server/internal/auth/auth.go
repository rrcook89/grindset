// Package auth is a Sprint 1 stub: any dev_user query param is accepted as a valid identity.
// SPRINT 2 replaces this with real auth (email/wallet).
package auth

import (
	"errors"
	"net/http"
	"strings"
)

type Identity struct {
	DevUser string
}

var ErrUnauthenticated = errors.New("auth: missing dev_user")

func FromRequest(r *http.Request) (Identity, error) {
	u := strings.TrimSpace(r.URL.Query().Get("dev_user"))
	if u == "" {
		return Identity{}, ErrUnauthenticated
	}
	if len(u) > 32 {
		u = u[:32]
	}
	return Identity{DevUser: u}, nil
}
