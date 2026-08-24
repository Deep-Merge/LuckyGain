# LuckyGain

Premium local-first personal finance for Windows (desktop-first). Phase 0 foundation is a Vite + React + TypeScript app with SQLite-in-WASM (`sql.js`), the full ledger schema, and a polished desktop shell. Electron wraps the UI for a native desktop window in development and ships a Windows installer for release.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

Desktop (Electron + Vite):

```bash
npm run dev:desktop
```

Optional DevTools: set `ELECTRON_OPEN_DEVTOOLS=1` before launching.

## Windows release

Build a Windows NSIS installer:

```bash
npm run dist
```

Installer output:

- `release/LuckyGain-Setup-0.1.0.exe` (copied into the project)
- `C:\lg-build\release\LuckyGain-Setup-0.1.0.exe` (build workspace)

Preview the production build in Electron without packaging:

```bash
npm run electron:preview
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local UI in the browser |
| `npm run dev:desktop` | Vite + Electron window |
| `npm run electron:dev` | Electron only (expects Vite on :5173) |
| `npm run electron:preview` | Production UI in Electron (no installer) |
| `npm run build` | Production web build (`dist/`) |
| `npm run dist` | Build + Windows NSIS installer (`release/`) |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest (money helpers) |

## What’s included now

- Charcoal / ivory / gold design system + desktop shell (sidebar, top bar, drawer)
- SQLite schema for accounts, transactions, transfers, people, categories, freelance, budgets, attachments, imports, audit
- Seeded accounts (Bank, Cash, JD Wallet, Keep, Freelancer Clearing) and people (Me, Jackie, Family)
- Working Dashboard, Transactions, Accounts, Settings
- Transfers post as linked pairs and never count as income/expense
- Electron desktop app (dev + Windows NSIS release)

Data still persists via IndexedDB / `localStorage` inside Electron’s userData profile.
