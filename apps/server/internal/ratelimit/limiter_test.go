package ratelimit

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func newTestLimiter(name string, limit int, window time.Duration) *Limiter {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	return New([]Config{{Name: name, Limit: limit, Window: window}}, nil, log)
}

func TestAllowWithinLimit(t *testing.T) {
	l := newTestLimiter("login", 3, time.Hour)
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if !l.Allow(ctx, "login", "127.0.0.1") {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
}

func TestDenyWhenLimitExceeded(t *testing.T) {
	l := newTestLimiter("login", 3, time.Hour)
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		l.Allow(ctx, "login", "127.0.0.1")
	}
	if l.Allow(ctx, "login", "127.0.0.1") {
		t.Fatal("4th request should be denied")
	}
}

func TestDifferentIDsAreIndependent(t *testing.T) {
	l := newTestLimiter("login", 2, time.Hour)
	ctx := context.Background()

	l.Allow(ctx, "login", "a")
	l.Allow(ctx, "login", "a")
	if l.Allow(ctx, "login", "a") {
		t.Fatal("IP a should be rate-limited")
	}
	if !l.Allow(ctx, "login", "b") {
		t.Fatal("IP b should be allowed (separate bucket)")
	}
}

func TestWindowExpiry(t *testing.T) {
	l := newTestLimiter("test", 2, 50*time.Millisecond)
	ctx := context.Background()

	l.Allow(ctx, "test", "ip")
	l.Allow(ctx, "test", "ip")
	if l.Allow(ctx, "test", "ip") {
		t.Fatal("should be denied before window expires")
	}

	time.Sleep(60 * time.Millisecond)

	if !l.Allow(ctx, "test", "ip") {
		t.Fatal("should be allowed after window expires")
	}
}

func TestUnknownNameFailsOpen(t *testing.T) {
	l := newTestLimiter("login", 1, time.Hour)
	ctx := context.Background()
	if !l.Allow(ctx, "unknown", "x") {
		t.Fatal("unknown limit name should fail open")
	}
}

func TestHTTPMiddlewareBlocks(t *testing.T) {
	l := newTestLimiter("login", 2, time.Hour)
	handler := l.HTTPMiddleware("login", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for i := 0; i < 2; i++ {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest("POST", "/auth/login", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("request %d should be 200, got %d", i+1, rec.Code)
		}
	}

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest("POST", "/auth/login", nil))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("3rd request should be 429, got %d", rec.Code)
	}
}

func TestHTTPMiddlewareAllows(t *testing.T) {
	l := newTestLimiter("login", 10, time.Hour)
	handler := l.HTTPMiddleware("login", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest("POST", "/auth/login", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
}
