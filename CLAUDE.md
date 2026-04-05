# Claude Code Instructions — Even Realities Monorepo

## Jazyk
- Odpovídej česky
- Kód a commity anglicky

## Struktura
- Monorepo: apps/ (projekty), packages/ (sdílené), infra/ (deploy), docs/
- Každá app má vlastní package.json, tsconfig.json
- Sdílené typy a utility v packages/shared

## Konvence
- TypeScript strict mode
- ESLint + Prettier
- Conventional Commits: `feat(translator): add live mode`, `fix(glasses-ui): image sizing`
- Jeden PR = jedna logická změna

## Ověření (povinné po implementaci)
- `npx tsc --noEmit` v příslušné app
- `npm test` pokud existují testy
- `npm run lint` pokud existuje

## G2 Glasses specifika
- Display: 576x288px, monochromatický zelený, 4 grey levels
- Image kontejner: MUSÍ být přesně 288x144px (SDK jinak odmítne)
- processForGlasses: 2-bit indexed PNG via sharp + UPNG
- Bez kamery — privacy-first přístup

## Nasazení
- Dev: localhost:3000 (frontend), localhost:3001 (backend)
- Prod: Hetzner servery (viz ~/.claude/CLAUDE.md pro SSH)
