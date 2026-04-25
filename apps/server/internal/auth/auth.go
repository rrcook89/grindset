// Package auth implements email magic-link auth with JWT (HS256).
// Email send is stubbed: the token is logged to stdout.
// JWT_SECRET env var sets the signing secret; falls back to a dev secret with a WARNING.
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	devSecret      = "grindset-dev-secret-change-in-prod"
	tokenTTL       = 15 * time.Minute
	jwtTTL         = 24 * time.Hour
	magicLinkParam = "token"
)

var (
	ErrUnauthenticated = errors.New("auth: missing or invalid token")
	ErrExpired         = errors.New("auth: token expired")
)

// Identity is the verified caller attached to a WS connection.
type Identity struct {
	AccountID string // UUID string from JWT subject
	Email     string
}

// Claims are the JWT body fields we issue.
type Claims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

// jwtSecret returns the signing key, logging a warning if using the dev fallback.
func jwtSecret() []byte {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return []byte(s)
	}
	slog.Warn("JWT_SECRET not set — using insecure dev secret; DO NOT use in production")
	return []byte(devSecret)
}

// SendMagicLink generates a short-lived magic token and logs it (stub: no real email).
// In production, replace the slog.Info line with an SMTP/SES send.
func SendMagicLink(email string) (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("auth: rand: %w", err)
	}
	token := hex.EncodeToString(raw)

	// Stub: log the magic link instead of sending email.
	slog.Info("MAGIC LINK (stub — log only)",
		"email", email,
		"token", token,
		"expires_in", tokenTTL,
	)
	return token, nil
}

// IssueJWT signs a JWT for the given account/email pair.
func IssueJWT(accountID, email string) (string, error) {
	now := time.Now()
	claims := Claims{
		Email: email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   accountID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(jwtTTL)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString(jwtSecret())
}

// VerifyJWT parses and validates a signed JWT, returning the embedded identity.
func VerifyJWT(tokenStr string) (Identity, error) {
	tok, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("auth: unexpected signing method %v", t.Header["alg"])
		}
		return jwtSecret(), nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return Identity{}, ErrExpired
		}
		return Identity{}, ErrUnauthenticated
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok || !tok.Valid {
		return Identity{}, ErrUnauthenticated
	}
	return Identity{
		AccountID: claims.Subject,
		Email:     claims.Email,
	}, nil
}

// FromRequest extracts a Bearer JWT from the Authorization header or ?token= query param.
// WS upgrade requests typically carry auth in the query string since browsers can't
// set custom headers during WebSocket handshake.
//
// As a Sprint-1 dev convenience, ?dev_user=<name> is ALSO accepted unless
// AUTH_STRICT=1 is set in the environment. The dev path logs a warning every
// time it is used.
func FromRequest(r *http.Request) (Identity, error) {
	// 1. Authorization: Bearer <token>
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return VerifyJWT(strings.TrimPrefix(h, "Bearer "))
	}
	// 2. ?token=<jwt> (WebSocket connect path)
	if t := r.URL.Query().Get(magicLinkParam); t != "" {
		return VerifyJWT(t)
	}
	// 3. ?dev_user=<name> dev fallback (disabled by AUTH_STRICT=1).
	if os.Getenv("AUTH_STRICT") != "1" {
		if u := strings.TrimSpace(r.URL.Query().Get("dev_user")); u != "" {
			if len(u) > 32 {
				u = u[:32]
			}
			slog.Warn("AUTH dev fallback used — set AUTH_STRICT=1 for production", "dev_user", u)
			return Identity{
				AccountID: "dev-" + u,
				Email:     u + "@dev.grindset.local",
			}, nil
		}
	}
	return Identity{}, ErrUnauthenticated
}
