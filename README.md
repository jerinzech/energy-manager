# Grid-Sense — Grenoble IT Energy Manager

Multi-view workplace EV charging & campus electricity routing simulator set in a 5-campus Grenoble IT-sector neighborhood (`1,650 kW` MV substation feeder, `124` EVs, `157` bays), with real-time multi-tab and multi-device synchronization over Cloudflare Durable Objects.

> **Classroom Simulation Notice:** All building profiles, rooftop PV generation, EV charging sessions, and cost figures in Grid-Sense are deterministic synthetic data built for academic and demonstration use—no real building, charger, or employee data is used.

---

## Application Views & Routes

Every view shares state by room query parameter (e.g., `?room=gem-demo`) over WebSockets (`BroadcastChannel` + `localStorage` fallback when running offline).

- **`/` — Grid Switchboard (`src/pages/LauncherPage.tsx`)**
  - Master controls for the **Backend Data Server** (`Online` / `Standby`) and **Agentic Routing** (`Armed` / `Idle` + **Run Cycle**).
  - Live **Campus Power Allocation** chart comparing active kW draw against contract caps across all 5 campuses.
  - Per-campus **Supply & Routing** isolation toggles (`0 kW` when isolated), optimization triggers, unread agent alert notices, and **Open Dashboard ↗** links opening each building in a new tab.
  - **3D Spatial Twin** mode selector (**Real-Life** ↔ **Wireframe**) and **Launch 3D Map ↗** button.
- **`/map` — 3D Grenoble Spatial Map (`src/pages/Map3DPage.tsx`)**
  - Interactive Three.js / React Three Fiber 3D neighborhood framed by sculpted snow-capped Alps (Chartreuse, Belledonne, and Vercors ridges).
  - Tilted rooftop solar panel arrays on every building, Loi APER solar carports with parked EVs, MV substation feeder conduits, and dynamic kW load pillars.
  - Live **Real-Life ↔ Wireframe** visual mode switcher, camera presets (`Overview`, `Alpine`, `Focus`, `Substation`, `Top`), floating building pins with stats helper bubbles, direct dashboard links, and Inspector drawer.
- **`/sites/:siteId` — Per-Building Tenant Dashboards (`src/pages/SitePage.tsx`)**
  - Campus IDs: `alptech-hq`, `isere-rd`, `dauphine-cloud`, `vercors-control` (matched No-AI control campus), and `chartreuse-annex`.
  - Targeted L3 Human-in-the-Loop **Agent Notification** banners (`Approve Routing` / `Dismiss`) delivered only to affected buildings.
  - Day-ahead 15-minute load, EV, solar, and grid forecast charts (`ForecastChart`), Scenario switcher (`Sunny`, `Cloudy`, `Cold`, `80% Occ`, `Unexpected`), explainable per-vehicle charging schedule, and manager overrides.
- **`/hq` — HQ Portfolio & Governance (`src/pages/HqPage.tsx`)**
  - Embedded 3D spatial twin inspector, 30-day Pilot vs. Control peak-shaving rollup (`Pilot30DayChart`), 5-campus load comparison, Autonomy Ladder (`L0–L5` with `L3 Approve` active), EU AI Act / GDPR / CSE / ISO 42001 governance guardrails, and an interactive 5-year TCO calculator.

---

## Agentic Routing & Privacy Architecture

- **Three Coordinating Agents** (`src/engine/`):
  - **Grid Routing Agent**: Shifts flexible EV charging across campuses to keep individual sites and the `1,650 kW` MV feeder under cap.
  - **Solar Arbitrage Agent**: Moves flexible charging load into midday rooftop/carport solar PV windows.
  - **Guardian Agent (L3 HITL)**: Flags infeasible reroutes, urgent trip overrides, or edge fail-safe conditions and requests manager approval at the impacted building.
- **GDPR Tenant Isolation**: Per-vehicle charging allocations (`allocKw`), session logs, and `EV-XX` identifiers stay scoped inside each `/sites/:siteId` tenant view. HQ views (`/`, `/map`, `/hq`) and `/api/hq/*` endpoints strictly receive anonymized campus aggregates.

---

## Tech Stack & Project Layout

- **Frontend**: React 18, TypeScript, Vite 6, Tailwind CSS, Recharts (`^2.15.3`), Lucide React
- **3D Visualization**: Three.js, `@react-three/fiber`, `@react-three/drei`
- **Backend / Realtime**: Cloudflare Workers + SQLite Durable Objects (`NeighborhoodRoom` in `worker/`)

```text
├── index.html                  # App entry + typography (Plus Jakarta Sans, IBM Plex Mono)
├── wrangler.jsonc              # Cloudflare Worker + ASSETS + SQLite Durable Object config
├── standalone.html             # Zero-server single-file offline presentation backup
├── scripts/verify-engine.ts    # 18 deterministic engine & GDPR verification checks
├── worker/                     # Cloudflare Worker router & NeighborhoodRoom Durable Object
└── src/
    ├── engine/                 # Pure TypeScript simulation, profiles, optimizer & state machine
    ├── sync/                   # WebSocket + BroadcastChannel room synchronization hooks
    ├── scene3d/                # 3D Grenoble campuses, rooftop solar, Alps backdrop & carports
    ├── components/             # AppShell, Recharts ForecastChart & Pilot30DayChart, DemoGuideDrawer
    └── pages/                  # LauncherPage (/), Map3DPage (/map), SitePage (/sites/:id), HqPage (/hq)
```

---

## Local Development

```bash
npm install
npm run dev
```

Useful verification commands:

```bash
# Run the 18 deterministic engine & GDPR isolation checks
npm run test:engine

# Type-check and build both Cloudflare Worker SSR + client bundles
npm run build
```

---

## Deploying to Cloudflare Workers

Configured in `wrangler.jsonc` (`name: "grid-sense-grenoble"`) using SQLite-backed Durable Objects (`new_sqlite_classes: ["NeighborhoodRoom"]`), compatible with the **Cloudflare Workers Free plan**.

1. Authenticate with Cloudflare:
   ```bash
   npx wrangler login
   ```
   *(First-time Workers users: ensure a `*.workers.dev` subdomain is claimed once in the Cloudflare Dashboard → Workers & Pages.)*
2. Build and deploy:
   ```bash
   npm run deploy
   ```
3. Open your live deployment with a shared room name (e.g., `?room=gem-live`):
   - `https://grid-sense-grenoble.<your-subdomain>.workers.dev/?room=gem-live`
   - `https://grid-sense-grenoble.<your-subdomain>.workers.dev/map?room=gem-live&mode=realistic`
   - `https://grid-sense-grenoble.<your-subdomain>.workers.dev/sites/alptech-hq?room=gem-live`
   - `https://grid-sense-grenoble.<your-subdomain>.workers.dev/hq?room=gem-live`
4. Stream live Worker & Durable Object logs when needed:
   ```bash
   npx wrangler tail
   ```

If network access is unavailable during a presentation, open `standalone.html` directly in any browser for an offline self-contained fallback.
