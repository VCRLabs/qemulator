package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"qemulator/internal/api"
	"qemulator/internal/config"
	"qemulator/internal/images"
	"qemulator/internal/qemu"
	"qemulator/static"
)

func main() {
	dataDir := flag.String("data-dir", "", "Data directory (default ~/.qemulator)")
	bindAddr := flag.String("bind", "127.0.0.1", "Bind address")
	port := flag.Int("port", 8080, "HTTP port")
	qemuBin := flag.String("qemu-bin", "", "Path to qemu-system-* binary")
	flag.Parse()

	if *dataDir == "" {
		home, _ := os.UserHomeDir()
		*dataDir = filepath.Join(home, ".qemulator")
	}

	if err := os.MkdirAll(*dataDir, 0755); err != nil {
		log.Fatalf("failed to create data dir: %v", err)
	}
	os.MkdirAll(filepath.Join(*dataDir, "vms"), 0755)
	os.MkdirAll(filepath.Join(*dataDir, "images"), 0755)
	os.MkdirAll(filepath.Join(*dataDir, "logs"), 0755)

	store := config.NewVMStore(*dataDir)
	qemuManager := qemu.NewManager(*qemuBin, *dataDir)
	imgManager := images.NewManager(*dataDir)
	hub := api.NewSSEHub()

	staticFS := static.FS()

	router := api.NewRouter(store, qemuManager, imgManager, hub, staticFS)

	srv := &http.Server{
		Addr:         fmt.Sprintf("%s:%d", *bindAddr, *port),
		Handler:      corsMiddleware(router),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("qemulator starting on http://%s:%d", *bindAddr, *port)
		log.Printf("data directory: %s", *dataDir)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down...")
	qemuManager.StopAll()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
	log.Println("stopped")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
