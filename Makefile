.PHONY: dev build run clean fmt lint test

GO := go
NPM := npm
WEB_DIR := web
STATIC_DIR := static
BINARY := qemulator

export PATH := $(HOME)/.asdf/installs/nodejs/lts/bin:$(HOME)/.asdf/installs/golang/1.26.3/go/bin:$(PATH)

dev:
	@echo "Starting dev servers..."
	@$(GO) run ./cmd/qemulator/ --port 8080 &
	@cd $(WEB_DIR) && $(NPM) run dev
	@kill %1 2>/dev/null

build: build-web build-go

build-web:
	cd $(WEB_DIR) && $(NPM) run build

build-go:
	$(GO) build -o $(BINARY) ./cmd/qemulator/

run: build
	./$(BINARY)

clean:
	rm -f $(BINARY)
	rm -rf $(WEB_DIR)/dist
	rm -rf $(STATIC_DIR)/dist

fmt:
	$(GO) fmt ./...
	cd $(WEB_DIR) && npx prettier --write "src/**/*.{ts,tsx}"

lint:
	$(GO) vet ./...
	cd $(WEB_DIR) && npx tsc --noEmit

test:
	$(GO) test ./...
