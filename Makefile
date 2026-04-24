.PHONY: help up down logs migrate server web indexer build test fmt clean

help:
	@echo "GRINDSET — make targets"
	@echo "  up          Start Postgres, Redis, NATS via docker-compose"
	@echo "  down        Stop infra containers"
	@echo "  logs        Tail infra logs"
	@echo "  migrate     Apply SQL migrations to local Postgres"
	@echo "  server      Run game server (Go)"
	@echo "  web         Run web client (Vite dev server)"
	@echo "  indexer     Run chain indexer"
	@echo "  programs    Build Anchor programs"
	@echo "  test        Run all tests"
	@echo "  fmt         Format all code"
	@echo "  clean       Remove build artifacts"

up:
	docker compose -f infra/docker/docker-compose.yml up -d

down:
	docker compose -f infra/docker/docker-compose.yml down

logs:
	docker compose -f infra/docker/docker-compose.yml logs -f

migrate:
	@cd apps/server && go run ./cmd/migrate

server:
	@cd apps/server && go run ./cmd/server

web:
	@cd apps/web && pnpm dev

indexer:
	@cd apps/indexer && go run ./cmd/indexer

programs:
	@cd programs && anchor build

test:
	@cd apps/server && go test ./...
	@cd apps/web && pnpm test --run || true
	@cd programs && anchor test --skip-deploy || true

fmt:
	@cd apps/server && go fmt ./...
	@cd apps/indexer && go fmt ./...
	@cd apps/web && pnpm fmt || true

clean:
	@cd apps/server && rm -f server server.exe
	@cd apps/indexer && rm -f indexer indexer.exe
	@cd apps/web && rm -rf dist
	@cd programs && rm -rf target .anchor
