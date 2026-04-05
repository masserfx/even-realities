# Even Realities G2 — Smart Glasses Platform

Monorepo pro aplikace, nástroje a platformu pro [Even Realities G2](https://www.evenrealities.com/) smart glasses.

## Projekty

| Projekt | Popis | Status |
|---------|-------|--------|
| [translator](./apps/translator/) | Real-time překladač, AI chat, komiks generátor | Active |
| [my-glasses-app](./apps/my-glasses-app/) | Even Hub SDK experimentální app | Active |
| [even-dev](./apps/even-dev/) | Dev tools a experimenty | Active |

## Quick Start

```bash
# Klonování
git clone https://github.com/masserfx/even-realities.git
cd even-realities

# Setup všech projektů
make setup

# Spuštění konkrétního projektu
make run APP=translator

# Testy
make test

# Lint + type check
make check
```

## Architektura

```
even-realities/
├── apps/                    # Jednotlivé aplikace
│   ├── translator/          # Překladač + chat + komiks
│   ├── my-glasses-app/      # Even Hub SDK app
│   └── even-dev/            # Dev tools
├── packages/                # Sdílené knihovny
│   ├── glasses-sdk/         # Wrapper nad Even Hub SDK
│   ├── glasses-ui/          # UI komponenty pro glasses display
│   └── shared/              # Společné typy, utility
├── infra/                   # Infrastruktura a deploy
│   ├── docker/              # Docker compose soubory
│   └── scripts/             # Deploy a maintenance skripty
├── docs/                    # Dokumentace
│   ├── architecture.md      # Architektura platformy
│   ├── app-ideas.md         # 30 app idejí s prioritami
│   └── adr/                 # Architecture Decision Records
├── .github/                 # GitHub Actions CI/CD
│   ├── workflows/
│   │   ├── ci.yml           # Build + test + lint
│   │   ├── security.yml     # Dependency audit + SAST
│   │   ├── release.yml      # Automated releases
│   │   └── nightly.yml      # Nightly health checks
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml
├── Makefile                 # Orchestrace příkazů
├── CLAUDE.md                # Instrukce pro Claude Code
└── CHANGELOG.md             # Verzování změn
```

## Procesy

### Development Flow

1. **Branch** — `feat/app-name/description` nebo `fix/app-name/description`
2. **Develop** — lokálně s `make dev APP=translator`
3. **Check** — `make check` (lint + types + tests)
4. **PR** — automatický CI běh, code review
5. **Merge** — squash merge do `main`
6. **Release** — automatický tag + changelog

### Kvalita

- **CI na každém PR**: TypeScript check, ESLint, testy
- **Security**: Dependabot weekly, `npm audit` v CI, CodeQL SAST
- **Monitoring**: Nightly smoke testy, health check endpointů
- **Versioning**: [Conventional Commits](https://www.conventionalcommits.org/) + automatický CHANGELOG

## Licence

MIT
