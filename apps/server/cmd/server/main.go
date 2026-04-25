package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/grindset/server/internal/auth"
	"github.com/grindset/server/internal/config"
	"github.com/grindset/server/internal/db"
	"github.com/grindset/server/internal/gateway"
	gslog "github.com/grindset/server/internal/log"
	"github.com/grindset/server/internal/zone"
)

// pending tracks email→magic-token in memory. Sprint-1 demo only — replace
// with Redis or DB-backed store before any real deployment.
type pending struct {
	mu sync.Mutex
	m  map[string]pendingEntry
}

type pendingEntry struct {
	token  string
	expiry time.Time
}

func (p *pending) put(email, token string, ttl time.Duration) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.m[email] = pendingEntry{token: token, expiry: time.Now().Add(ttl)}
}

func (p *pending) consume(email, token string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	e, ok := p.m[email]
	if !ok || e.token != token || time.Now().After(e.expiry) {
		return false
	}
	delete(p.m, email)
	return true
}

func main() {
	cfg := config.Load()
	logger := gslog.New()

	pool, err := db.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		logger.Warn("database unavailable, continuing without persistence", "err", err)
		pool = nil
	} else {
		defer pool.Close()
		logger.Info("database connected")
	}

	z := zone.New("mireholm-starter", 50, 50, cfg.TickInterval, logger)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go z.Run(ctx)

	gw := gateway.New(logger, z)
	pen := &pending{m: map[string]pendingEntry{}}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", gw.Handle)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("ok")) })
	mux.HandleFunc("/auth/request", authRequestHandler(pen))
	mux.HandleFunc("/auth/verify", authVerifyHandler(pen, logger))

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           withCORS(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("game server listening", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http serve failed", "err", err)
			os.Exit(1)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	logger.Info("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
	cancel()
	_ = slog.Default()
}

// withCORS lets the Vite dev server (different port) call our HTTP API.
func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

type authRequest struct {
	Email string `json:"email"`
}

type authVerifyReq struct {
	Email string `json:"email"`
	Token string `json:"token"`
}

type authVerifyResp struct {
	JWT string `json:"jwt"`
}

func authRequestHandler(pen *pending) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req authRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		token, err := auth.SendMagicLink(req.Email)
		if err != nil {
			http.Error(w, "internal", http.StatusInternalServerError)
			return
		}
		pen.put(req.Email, token, 15*time.Minute)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}
}

func authVerifyHandler(pen *pending, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req authVerifyReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || req.Token == "" {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if !pen.consume(req.Email, req.Token) {
			http.Error(w, "invalid or expired token", http.StatusUnauthorized)
			return
		}
		// Sprint-1 demo: derive a stable account-id from email hash.
		// Real auth flow loads the account row from DB.
		sum := sha256.Sum256([]byte(req.Email))
		accountID := hex.EncodeToString(sum[:8]) // 16 hex chars, stable per email
		jwt, err := auth.IssueJWT(accountID, req.Email)
		if err != nil {
			http.Error(w, "internal", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(authVerifyResp{JWT: jwt})
		logger.Info("auth verified", "email", req.Email, "account_id", accountID)
	}
}
