// Package ratelimit provides a sliding-window rate limiter.
// Backed by Redis when available; falls back to in-memory with a warning log.
// Limits are loaded from infra/config/rate_limits.toml at construction time.
package ratelimit

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// Config holds one rate-limit rule.
type Config struct {
	// Key prefix used in Redis / in-memory store (e.g. "login", "ge_order").
	Name    string
	Limit   int
	Window  time.Duration
}

// Limiter enforces sliding-window rate limits. Construct via New().
type Limiter struct {
	log     *slog.Logger
	redis   RedisClient // nil → in-memory fallback
	configs map[string]Config

	mu      sync.Mutex
	mem     map[string][]time.Time // key → sorted timestamps
}

// RedisClient is the subset of redis commands we need. Injected for testability.
// Pass nil to use the in-memory fallback.
type RedisClient interface {
	// Incr atomically increments key and returns the new value.
	// Expire sets key TTL. Both are expected to succeed.
	ZAdd(ctx context.Context, key string, score float64, member string) error
	ZRemRangeByScore(ctx context.Context, key string, min, max float64) error
	ZCard(ctx context.Context, key string) (int64, error)
	Expire(ctx context.Context, key string, ttl time.Duration) error
}

// New constructs a Limiter. configs is the parsed rate_limits.toml content.
// redisClient may be nil.
func New(configs []Config, redisClient RedisClient, log *slog.Logger) *Limiter {
	m := make(map[string]Config, len(configs))
	for _, c := range configs {
		m[c.Name] = c
	}
	if redisClient == nil {
		log.Warn("ratelimit: Redis not available, using in-memory fallback")
	}
	return &Limiter{
		log:     log,
		redis:   redisClient,
		configs: m,
		mem:     make(map[string][]time.Time),
	}
}

// Allow checks whether the composite key (name + ":" + id) is within limits.
// Returns true if the request is permitted, false if rate-limited.
// name must match a Config.Name (e.g. "login"); id is per-IP or per-account.
func (l *Limiter) Allow(ctx context.Context, name, id string) bool {
	cfg, ok := l.configs[name]
	if !ok {
		l.log.Warn("ratelimit: unknown limit name", "name", name)
		return true // fail open for unknown limits
	}
	key := name + ":" + id
	if l.redis != nil {
		return l.allowRedis(ctx, key, cfg)
	}
	return l.allowMem(key, cfg)
}

// HTTPMiddleware returns an http.Handler that enforces the named limit using
// the request's remote IP as the id. Intended for /auth/* routes.
func (l *Limiter) HTTPMiddleware(name string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		if !l.Allow(r.Context(), name, ip) {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// --- Redis implementation ---

func (l *Limiter) allowRedis(ctx context.Context, key string, cfg Config) bool {
	now := time.Now()
	windowStart := now.Add(-cfg.Window)
	member := now.Format(time.RFC3339Nano)

	// Remove old entries outside the window
	if err := l.redis.ZRemRangeByScore(ctx, key, 0, float64(windowStart.UnixNano())); err != nil {
		l.log.Warn("ratelimit: ZRemRangeByScore failed", "key", key, "err", err)
	}
	count, err := l.redis.ZCard(ctx, key)
	if err != nil {
		l.log.Warn("ratelimit: ZCard failed", "key", key, "err", err)
		return true // fail open
	}
	if int(count) >= cfg.Limit {
		return false
	}
	if err := l.redis.ZAdd(ctx, key, float64(now.UnixNano()), member); err != nil {
		l.log.Warn("ratelimit: ZAdd failed", "key", key, "err", err)
	}
	_ = l.redis.Expire(ctx, key, cfg.Window+time.Second)
	return true
}

// --- In-memory fallback ---

func (l *Limiter) allowMem(key string, cfg Config) bool {
	now := time.Now()
	cutoff := now.Add(-cfg.Window)

	l.mu.Lock()
	defer l.mu.Unlock()

	ts := l.mem[key]
	// Evict timestamps outside the window
	valid := ts[:0]
	for _, t := range ts {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	if len(valid) >= cfg.Limit {
		l.mem[key] = valid
		return false
	}
	l.mem[key] = append(valid, now)
	return true
}
