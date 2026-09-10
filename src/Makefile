# KalaSetu developer tasks. See README.md for setup.
.DEFAULT_GOAL := help
.PHONY: help up down logs build migrate revision test test-fast mobile mobile-lan lan-ip shell

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  [36m%-12s[0m %s
", $$1, $$2}'

up:  ## Start api + redis (docker)
	docker compose up --build

down:  ## Stop the stack
	docker compose down

logs:  ## Tail api logs
	docker compose logs -f api

build:  ## Rebuild the api image
	docker compose build api

migrate:  ## Apply migrations to Neon
	cd apps/api && alembic upgrade head

revision:  ## New migration: make revision m="add x"
	cd apps/api && alembic revision --autogenerate -m "$(m)"

test:  ## Run the api test suite
	cd apps/api && pytest -q

test-fast:  ## Run only tests that need no database
	cd apps/api && pytest -q -m "not integration"

shell:  ## Shell into the running api container
	docker compose exec api bash

mobile:  ## Start the Expo dev server
	cd apps/mobile && npm start

lan-ip:  ## Point both .env files at this machine's LAN IP (Windows)
	powershell -ExecutionPolicy Bypass -File scripts/set-lan-ip.ps1

mobile-lan:  ## Set the LAN IP, then start Expo bound to it so the QR works on a phone (Windows)
	powershell -ExecutionPolicy Bypass -File scripts/set-lan-ip.ps1 -Start
