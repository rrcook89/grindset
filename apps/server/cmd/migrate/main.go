// Package main is a minimal SQL migration runner.
// Usage: migrate [up|down]
// Reads from ../../infra/migrations/ (relative to apps/server) by default;
// override with MIGRATIONS_DIR env var.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/grindset/server/internal/config"
	gslog "github.com/grindset/server/internal/log"
	"github.com/jackc/pgx/v5"
)

func main() {
	cmd := "up"
	flag.Parse()
	if flag.NArg() > 0 {
		cmd = flag.Arg(0)
	}

	cfg := config.Load()
	log := gslog.New()

	if cfg.DatabaseURL == "" {
		log.Error("DATABASE_URL not set")
		os.Exit(1)
	}

	dir := os.Getenv("MIGRATIONS_DIR")
	if dir == "" {
		dir = filepath.Join("..", "..", "infra", "migrations")
	}

	if err := run(context.Background(), cfg.DatabaseURL, dir, cmd, log); err != nil {
		log.Error("migrate failed", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, dsn, dir, cmd string, log *slog.Logger) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`); err != nil {
		return err
	}

	applied, err := loadApplied(ctx, conn)
	if err != nil {
		return err
	}

	files, err := listMigrations(dir, cmd)
	if err != nil {
		return err
	}

	switch cmd {
	case "up":
		for _, f := range files {
			if applied[f.version] {
				continue
			}
			if err := apply(ctx, conn, f); err != nil {
				return fmt.Errorf("apply %s: %w", f.name, err)
			}
			log.Info("applied", "version", f.version, "name", f.name)
		}
	case "down":
		// run most-recent applied down migration only
		var latest string
		for v := range applied {
			if v > latest {
				latest = v
			}
		}
		if latest == "" {
			log.Info("nothing to roll back")
			return nil
		}
		var target *migrationFile
		for i, f := range files {
			if f.version == latest {
				target = &files[i]
				break
			}
		}
		if target == nil {
			return fmt.Errorf("no down file for %s", latest)
		}
		if err := rollback(ctx, conn, *target); err != nil {
			return err
		}
		log.Info("rolled back", "version", target.version)
	default:
		return fmt.Errorf("unknown command: %s", cmd)
	}
	return nil
}

type migrationFile struct {
	version string
	name    string
	path    string
}

func listMigrations(dir, cmd string) ([]migrationFile, error) {
	suffix := ".up.sql"
	if cmd == "down" {
		suffix = ".down.sql"
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var out []migrationFile
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), suffix) {
			continue
		}
		base := strings.TrimSuffix(e.Name(), suffix)
		parts := strings.SplitN(base, "_", 2)
		if len(parts) < 2 {
			continue
		}
		out = append(out, migrationFile{
			version: parts[0],
			name:    base,
			path:    filepath.Join(dir, e.Name()),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].version < out[j].version })
	return out, nil
}

func loadApplied(ctx context.Context, conn *pgx.Conn) (map[string]bool, error) {
	rows, err := conn.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[string]bool{}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		m[v] = true
	}
	return m, rows.Err()
}

func apply(ctx context.Context, conn *pgx.Conn, f migrationFile) error {
	sqlBytes, err := os.ReadFile(f.path)
	if err != nil {
		return err
	}
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, string(sqlBytes)); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, f.version); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}

func rollback(ctx context.Context, conn *pgx.Conn, f migrationFile) error {
	sqlBytes, err := os.ReadFile(f.path)
	if err != nil {
		return err
	}
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, string(sqlBytes)); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM schema_migrations WHERE version = $1`, f.version); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}
