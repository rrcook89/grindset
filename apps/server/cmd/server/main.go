package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/grindset/server/internal/config"
	"github.com/grindset/server/internal/db"
	"github.com/grindset/server/internal/gateway"
	gslog "github.com/grindset/server/internal/log"
	"github.com/grindset/server/internal/zone"
)

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

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", gw.Handle)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           mux,
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
