# Grid-Sense — Grenoble IT Energy Manager

Multi-view workplace EV charging & campus electricity routing simulator set in a 5-campus Grenoble IT-sector neighborhood (`1,650 kW` MV substation feeder, `124` EVs, `157` bays), built in a light **Apple / Tesla Energy minimalist UI** paired with an **Apple Maps Detailed City Experience (DCE)** 3D map and real-time synchronization over Cloudflare Durable Objects.

> **Classroom Simulation Notice:** All building profiles, rooftop PV generation, EV charging sessions, and cost figures in Grid-Sense are deterministic synthetic data built for academic and demonstration use—no real building, charger, or employee data is used.

---

## Application Views & Routes

Every view shares state by room query parameter (e.g., `?room=gem-demo`) over WebSockets (`BroadcastChannel` + `localStorage` fallback when running offline).

- **`/` — Grid Switchboard (`src/pages/LauncherPage.tsx`)**
  - Clean light minimalist interface featuring a sticky top bar (`AppShell.tsx`) with Buildings quick-jumper and Simulation / Clock / Weather scenario popover.
  - Master controls for the **Data Server** (`Online` / `Standby`) and **Auto Routing Agents** (`Active` / `Off` + **Run Cycle**), plus **Neighborhood Grid Load** and **Selling to Grid** (`+kW` exported and `€ / day` revenue) summary.
  - Live **Power by Building** chart comparing active kW draw against contract caps across all 5 campuses.
  - Per-building **Building Supply** isolation toggles (`0 kW` when off), **Sell to Grid** (solar + V2G feed-in) toggles, **Run Agent** / **Optimize** triggers, unread routing alert badges, and **Open Dashboard ↗** links.
  - **3D Grenoble Map** launcher with **Realistic ↔ Blueprint** mode selector.
- **`/map` — 3D Grenoble Spatial Map (`src/pages/Map3DPage.tsx`)**
  - **Apple Maps DCE Cartography**: Sculpted Chartreuse, Belledonne, and Vercors alpine massifs (`AlpineMountains.tsx`), 18 European district context buildings (`ContextBuildings.tsx`), and urban street-level detailing (`GrenobleUrbanDetails.tsx`: Isère River canal & bridges, roundabout, crosswalks, parks, animated Grenoble Tram B & transit shelters, and instanced botanical trees).
  - **2-Floor Parked EV Podiums & Rooftop Solar**: All 5 interactive campuses include open-bay bottom two parking floors populated with parked 3D EVs reflecting live charging states, plus tilted rooftop photovoltaic arrays (`BuildingMesh.tsx`).
  - **10-Terrace Chartreuse Mountain Solar Farm**: `~106` instanced solar array tables carved into the Chartreuse foothill amphitheater, animated glowing green hillside collector conduits, upgraded 4-inverter Collector Relay Station, and live generation landmark pill (`MountainSolarFarm.tsx`).
  - **Road-Following Bidirectional Grid Conduits**: Orthogonal road-aligned power lines linking the Mountain Solar Farm Collector Relay, Central MV Substation, West/East Sector Relays, and all 5 buildings—visualizing power supply with **glowing green neon blobs**, surplus grid feed-in with **cyan-emerald reverse blobs**, and cap breaches in coral-red (`SubstationConduits.tsx`).
  - **Free 3D Navigation & Non-Disruptive Inspector**:
    - **Realistic ↔ Blueprint** visual mode toggle and one-shot camera presets (**Valley**, **Alps & Solar Farm**, **Focus**, **Relays**, **Top**) that immediately release control on user interaction.
    - **Pan / Orbit** drag mode toggle (`screenSpacePanning={false}`, `zoomToCursor`, wide zoom bounds), `WASD` / Arrow-key flight (`Q`/`E` elevation, `Shift` speed boost, `+`/`-` zoom), and bottom-right **`+` / `−` / Compass** view controls.
    - Floating building pins with live draw, rooftop solar, bay counts, and `↗ +kW` export tags; clicking opens the Building Inspector drawer (Building Supply, **Sell Power to Grid**, Run Agent, Approve, Safe Mode, and **Zoom Here**).
- **`/sites/:siteId` — Per-Building Tenant Dashboards (`src/pages/SitePage.tsx`)**
  - Campus IDs: `alptech-hq`, `isere-rd`, `dauphine-cloud`, `vercors-control` (matched No-AI control campus), and `chartreuse-annex`.
  - Targeted L3 Human-in-the-Loop **Agent Notification** banners (**Approve Routing** / **Dismiss**) delivered only to affected buildings.
  - Per-building **Sell Power to Grid** switch with live export kW and daily feed-in revenue KPIs, day-ahead 15-minute `ForecastChart`, scenario switcher (`Sunny`, `Cloudy`, `Cold`, `80% Occ`, `Unexpected`), explainable per-vehicle charging schedule, and manager overrides.
- **`/hq` — HQ Portfolio & Governance (`src/pages/HqPage.tsx`)**
  - Embedded 3D spatial twin inspector, 30-day Pilot vs. Control peak-shaving chart (`Pilot30DayChart`), 5-campus load & grid-export comparison, Autonomy Ladder (`L0–L5` with `L3 Approve` active), EU AI Act / GDPR / CSE / ISO 42001 governance guardrails, and an interactive 5-year TCO calculator.

---

## Agentic Routing, Sell-to-Grid & Privacy Architecture

- **Three Coordinating Agents** (`src/engine/`):
  - **Grid Routing Agent**: Shifts flexible EV charging across campuses to keep individual sites and the `1,650 kW` MV feeder under cap.
  - **Solar Arbitrage Agent**: Moves flexible charging load into midday rooftop & mountain solar PV windows.
  - **Guardian Agent (L3 HITL)**: Flags infeasible reroutes, urgent trip overrides, or edge fail-safe conditions and requests manager approval at the impacted building.
- **Bidirectional Grid Export (Sell to Grid)**: Campuses can export surplus rooftop solar and V2G battery capacity back to the neighborhood feeder (`SITE_SET_SELL_TO_GRID` action / `POST /api/site/:siteId/sell-to-grid`), visualized as reverse cyan-emerald energy blobs along road conduits and aggregated into portfolio export kW and daily EUR revenue.
- **GDPR Tenant Isolation**: Per-vehicle charging allocations (`allocKw`), session logs, and `EV-XX` identifiers stay scoped inside each `/sites/:siteId` tenant view. HQ views (`/`, `/map`, `/hq`) and `/api/hq/*` endpoints strictly receive anonymized campus aggregates (including anonymized export totals).

---

## Tech Stack & Project Layout

- **Frontend**: React 18, TypeScript, Vite 6, Tailwind CSS, Recharts (`^2.15.4`), Lucide React
- **3D Visualization**: Three.js, `@react-three/fiber`, `@react-three/drei`
- **Backend / Realtime**: Cloudflare Workers + SQLite Durable Objects (`NeighborhoodRoom` in `worker/`)

```text
├── index.html                  # App entry + typography (Plus Jakarta Sans, IBM Plex Mono)
├── wrangler.jsonc              # Cloudflare Worker + ASSETS + SQLite Durable Object config
├── standalone.html             # Zero-server single-file offline presentation backup
├── scripts/verify-engine.ts    # 19 deterministic engine, sell-to-grid & GDPR checks
├── worker/                     # Cloudflare Worker router & NeighborhoodRoom Durable Object
└── src/
    ├── engine/                 # Pure TypeScript simulation, profiles, optimizer & state machine
    ├── sync/                   # WebSocket + BroadcastChannel room synchronization hooks
    ├── scene3d/                # GrenobleNeighborhood, BuildingMesh, MountainSolarFarm, AlpineMountains,
    │                           # SubstationConduits, GrenobleUrbanDetails, ContextBuildings, textures
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
# Run the 19 deterministic engine, sell-to-grid & GDPR isolation checks
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
