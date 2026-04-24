package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr     string
	DatabaseURL  string
	RedisURL     string
	NATSURL      string
	TickInterval time.Duration
}

func Load() Config {
	tickMs, _ := strconv.Atoi(getEnv("TICK_MS", "400"))
	return Config{
		HTTPAddr:     getEnv("HTTP_ADDR", ":8080"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		RedisURL:     os.Getenv("REDIS_URL"),
		NATSURL:      os.Getenv("NATS_URL"),
		TickInterval: time.Duration(tickMs) * time.Millisecond,
	}
}

func getEnv(key, def string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return def
}
