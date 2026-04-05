.PHONY: setup dev run test check lint audit clean help

APP ?= translator

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: ## Install dependencies for all apps
	@for dir in apps/*/server apps/*/; do \
		if [ -f "$$dir/package.json" ]; then \
			echo "=== Installing $$dir ===" && (cd "$$dir" && npm install); \
		fi; \
	done

dev: ## Start dev server (APP=translator)
	@cd apps/$(APP)/server && npx tsx --watch src/index.ts

run: ## Start production server (APP=translator)
	@cd apps/$(APP)/server && node dist/index.js

test: ## Run tests (APP=translator or APP=all)
	@if [ "$(APP)" = "all" ]; then \
		for dir in apps/*/server; do \
			if [ -f "$$dir/package.json" ]; then \
				echo "=== Testing $$dir ===" && (cd "$$dir" && npm test) || true; \
			fi; \
		done; \
	else \
		cd apps/$(APP)/server && npm test; \
	fi

check: ## TypeScript + lint check (APP=translator or APP=all)
	@if [ "$(APP)" = "all" ]; then \
		for dir in apps/*/server; do \
			if [ -f "$$dir/tsconfig.json" ]; then \
				echo "=== Checking $$dir ===" && (cd "$$dir" && npx tsc --noEmit); \
			fi; \
		done; \
	else \
		cd apps/$(APP)/server && npx tsc --noEmit; \
	fi

lint: ## Run ESLint (APP=translator or APP=all)
	@if [ "$(APP)" = "all" ]; then \
		for dir in apps/*/server; do \
			if [ -f "$$dir/.eslintrc.json" ] || [ -f "$$dir/eslint.config.js" ]; then \
				echo "=== Linting $$dir ===" && (cd "$$dir" && npx eslint src/) || true; \
			fi; \
		done; \
	else \
		cd apps/$(APP)/server && npx eslint src/; \
	fi

audit: ## Security audit all apps
	@for dir in apps/*/server apps/*/; do \
		if [ -f "$$dir/package.json" ]; then \
			echo "=== Auditing $$dir ===" && (cd "$$dir" && npm audit --audit-level=high) || true; \
		fi; \
	done

clean: ## Remove node_modules and dist
	@find apps packages -name node_modules -type d -exec rm -rf {} + 2>/dev/null || true
	@find apps packages -name dist -type d -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleaned."
