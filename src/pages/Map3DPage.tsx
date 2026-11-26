import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  Compass,
  Cpu,
  Crosshair,
  ExternalLink,
  Hand,
  LayoutGrid,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  Rotate3d,
  ShieldAlert,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import type { SiteId } from '../engine';
import { useHqSync, useRoomName } from '../sync/useNeighborhoodSync';
import {
  GrenobleNeighborhood,
  type NavActionType,
  type NavMode,
} from '../scene3d/GrenobleNeighborhood';
import { siteStatus } from '../scene3d/BuildingMesh';

type CameraPreset = 'overview' | 'focus' | 'substation' | 'alpine' | 'top';
type VisualMode = 'realistic' | 'wireframe';

const PRESETS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'overview', label: 'Valley' },
  { id: 'alpine', label: 'Alps & Solar Farm' },
  { id: 'focus', label: 'Focus' },
  { id: 'substation', label: 'Relays' },
  { id: 'top', label: 'Top' },
];

function fmt(n: number | undefined): string {
  return n == null ? '—' : Math.round(n).toLocaleString('en-US');
}

export default function Map3DPage() {
  const room = useRoomName();
  const [params] = useSearchParams();
  const { data, mode, dispatch } = useHqSync(room);

  const [visualMode, setVisualMode] = useState<VisualMode>(
    params.get('mode') === 'wireframe' ? 'wireframe' : 'realistic',
  );
  const initialPreset = params.get('preset');
  const [selectedSiteId, setSelectedSiteId] = useState<SiteId | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>(
    initialPreset === 'alpine' ||
      initialPreset === 'focus' ||
      initialPreset === 'substation' ||
      initialPreset === 'top'
      ? initialPreset
      : 'overview',
  );
  const [cameraNonce, setCameraNonce] = useState(0);
  const [navMode, setNavMode] = useState<NavMode>('pan');
  const [navAction, setNavAction] = useState<{ type: NavActionType; nonce: number } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: 'agent' | 'audit'; text: string } | null>(null);

  const selectedSite = useMemo(
    () => data.sites.find((s) => s.id === selectedSiteId) ?? data.sites[0] ?? null,
    [data.sites, selectedSiteId],
  );
  const selectedStatus = selectedSite ? siteStatus(selectedSite) : null;

  const agentCount = data.agentFeed.length;
  const auditCount = data.auditLog.length;
  useEffect(() => {
    const agent = data.agentFeed[agentCount - 1];
    const audit = data.auditLog[auditCount - 1];
    const src = agent ?? audit;
    if (!src) return;
    setToast(
      agent
        ? {
            kind: 'agent',
            text: `${agent.agentName} · ${agent.siteId ?? 'Grid'}: ${agent.title}`,
          }
        : {
            kind: 'audit',
            text: `${audit.action} · ${audit.siteId ?? 'Grid'}: ${audit.message}`,
          },
    );
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [agentCount, auditCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const subPct = Math.min(
    100,
    (data.substation.currentKw / Math.max(1, data.substation.capKw)) * 100,
  );

  const triggerPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    setCameraNonce((n) => n + 1);
  };

  const triggerNavAction = (type: NavActionType) => {
    setNavAction((prev) => ({ type, nonce: (prev?.nonce ?? 0) + 1 }));
    if (type === 'reset-view') {
      setCameraPreset('overview');
    }
  };

  const selectSite = (id: SiteId) => {
    setSelectedSiteId(id);
    setDrawerOpen(true);
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f6f7f9]">
      {/* Full-viewport 3D Grenoble Valley */}
      <div className="absolute inset-0">
        <GrenobleNeighborhood
          data={data}
          selectedSiteId={selectedSiteId}
          onSelectSite={selectSite}
          cameraPreset={cameraPreset}
          cameraNonce={cameraNonce}
          navMode={navMode}
          navAction={navAction}
          visualMode={visualMode}
          room={room}
        />
      </div>

      {/* Airy Apple-Maps-style Floating Top HUD Pill */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-3">
        <div className="pointer-events-auto flex w-full max-w-[1380px] flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/[0.08] bg-white/95 px-3.5 py-2 text-[#111827] shadow-lg backdrop-blur-md xl:flex-nowrap">
          {/* Left: Brand + Substation Meter */}
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#111827] text-white">
                <Zap className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
              <span className="whitespace-nowrap text-[14px] font-bold tracking-[-0.02em] text-[#111827]">
                Grid-Sense
              </span>
            </div>

            <div className="hidden h-4 w-px bg-slate-200 sm:block" />

            <div className="flex items-center gap-2 rounded-full bg-slate-100/90 px-3 py-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: mode === 'ws' ? '#10b981' : '#f59e0b' }}
              />
              <span className="text-xs font-semibold text-[#111827] tabular-nums whitespace-nowrap">
                {fmt(data.substation.currentKw)} / {fmt(data.substation.capKw)} kW
              </span>
              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${subPct}%`,
                    backgroundColor: data.substation.breaching ? '#ef4444' : '#10b981',
                  }}
                />
              </div>
            </div>

            {!data.serverOnline ? (
              <span className="stamp stamp-solar text-[11px]">Standby</span>
            ) : null}
          </div>

          {/* Center: Mode + Routing + Clock + Weather */}
          <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
            <div className="inline-flex shrink-0 rounded-xl bg-slate-100 p-0.5">
              {(['realistic', 'wireframe'] as VisualMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium transition ${
                    visualMode === m
                      ? 'bg-white font-semibold text-[#111827] shadow-sm'
                      : 'text-[#6b7280] hover:text-[#111827]'
                  }`}
                  onClick={() => setVisualMode(m)}
                >
                  {m === 'realistic' ? 'Realistic' : 'Blueprint'}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-accent !min-h-0 shrink-0 whitespace-nowrap !rounded-xl !px-3 !py-1.5 text-xs"
              onClick={() => void dispatch({ type: 'RUN_AGENT_CYCLE' })}
            >
              <Cpu className="h-3.5 w-3.5" />
              Run Routing
            </button>

            <div className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-black/[0.06] bg-slate-50 px-1.5 py-0.5">
              <button
                type="button"
                aria-label={data.clock.playing ? 'Pause clock' : 'Play clock'}
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-[#111827] transition hover:bg-white"
                onClick={() =>
                  void dispatch({ type: 'SET_CLOCK', playing: !data.clock.playing })
                }
              >
                {data.clock.playing ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
              <span className="px-1.5 font-mono text-xs font-semibold text-[#111827] tabular-nums">
                {data.clock.time}
              </span>
              <button
                type="button"
                className="rounded-lg px-2 py-0.5 text-[11px] font-medium text-[#6b7280] transition hover:bg-white hover:text-[#111827]"
                onClick={() =>
                  void dispatch({ type: 'SET_CLOCK', slot: 13, playing: false })
                }
                title="Jump to 09:15 morning rush"
              >
                Morning
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium text-amber-700 transition hover:bg-amber-50"
                onClick={() =>
                  void dispatch({ type: 'SET_CLOCK', slot: 28, playing: false })
                }
                title="Jump to 13:00 solar peak"
              >
                <Sun className="h-3 w-3" />
                Midday
              </button>
            </div>

            <select
              className="select !w-auto shrink-0 !rounded-xl !py-1.5 text-xs"
              value={data.scenario}
              aria-label="Weather scenario"
              onChange={(e) =>
                void dispatch({
                  type: 'SET_SCENARIO',
                  scenario: e.target.value as typeof data.scenario,
                })
              }
            >
              {data.scenarios.map((meta) => (
                <option key={meta.key} value={meta.key}>
                  {meta.short}
                </option>
              ))}
            </select>
          </div>

          {/* Right: Building Drawer + Switchboard Link */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className={`btn !min-h-0 whitespace-nowrap !rounded-xl !px-3 !py-1.5 text-xs ${
                drawerOpen ? 'btn-accent' : 'btn-secondary'
              }`}
              onClick={() => setDrawerOpen((v) => !v)}
            >
              {drawerOpen ? (
                <PanelRightClose className="h-3.5 w-3.5" />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5" />
              )}
              Buildings
            </button>
            <Link
              to={`/?room=${encodeURIComponent(room)}`}
              className="btn btn-secondary !min-h-0 whitespace-nowrap !rounded-xl !px-3 !py-1.5 text-xs no-underline hover:no-underline"
            >
              <LayoutGrid className="h-3.5 w-3.5 text-[#6b7280]" />
              Switchboard
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom-left Floating Camera Views, Pan/Orbit Switch & Signal Legend */}
      <div className="absolute bottom-4 left-4 z-10 max-w-[calc(100vw-32px)] rounded-2xl border border-black/[0.08] bg-white/95 p-3 text-[#111827] shadow-lg backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  cameraPreset === p.id
                    ? 'bg-[#111827] text-white'
                    : 'bg-slate-100 text-[#4b5563] hover:bg-slate-200 hover:text-[#111827]'
                }`}
                onClick={() => triggerPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="hidden h-4 w-px bg-slate-200 sm:block" />

          <div
            className="inline-flex shrink-0 rounded-xl bg-slate-100 p-0.5"
            role="group"
            aria-label="Drag interaction mode"
          >
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                navMode === 'pan'
                  ? 'bg-white font-semibold text-[#111827] shadow-sm'
                  : 'text-[#6b7280] hover:text-[#111827]'
              }`}
              onClick={() => setNavMode('pan')}
            >
              <Hand className="h-3 w-3" />
              Pan
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                navMode === 'orbit'
                  ? 'bg-white font-semibold text-[#111827] shadow-sm'
                  : 'text-[#6b7280] hover:text-[#111827]'
              }`}
              onClick={() => setNavMode('orbit')}
            >
              <Rotate3d className="h-3 w-3" />
              Orbit
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-slate-100 pt-2 text-[11px] font-medium text-[#6b7280]">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-[#00ff88] ring-1 ring-emerald-500/40" />
            Power Supply
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-[#00f5d4] ring-1 ring-teal-500/40" />
            Selling to Grid
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-[#10b981]" />
            Optimized
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" />
            Over Limit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-[#9ca3af]" />
            Off
          </span>
        </div>

        <div className="mt-1.5 text-[10px] text-[#6b7280]">
          {navMode === 'pan'
            ? 'Drag to pan · Right-drag to orbit · WASD/Arrows to fly · Scroll to zoom'
            : 'Drag to orbit · Right-drag to pan · WASD/Arrows to fly · Scroll to zoom'}
        </div>
      </div>

      {/* Apple Maps-style bottom-right Zoom & Compass stack */}
      <div
        className={`fixed bottom-20 z-10 flex flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white/95 text-[#111827] shadow-lg backdrop-blur-md transition-[right] duration-200 ${
          drawerOpen ? 'right-[336px]' : 'right-4'
        }`}
      >
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in (+)"
          className="flex h-9 w-9 items-center justify-center transition hover:bg-slate-100"
          onClick={() => triggerNavAction('zoom-in')}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out (-)"
          className="flex h-9 w-9 items-center justify-center border-t border-slate-100 transition hover:bg-slate-100"
          onClick={() => triggerNavAction('zoom-out')}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Reset camera view"
          title="Reset Valley View"
          className="flex h-9 w-9 items-center justify-center border-t border-slate-100 text-[#2563eb] transition hover:bg-slate-100"
          onClick={() => triggerNavAction('reset-view')}
        >
          <Compass className="h-4 w-4" />
        </button>
      </div>

      {/* Right-side Building Inspector Drawer */}
      {drawerOpen && selectedSite && selectedStatus ? (
        <aside className="absolute inset-y-0 right-0 z-20 flex w-80 max-w-[90vw] flex-col overflow-y-auto border-l border-black/[0.08] bg-white px-5 pb-6 pt-[76px] text-[#111827] shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold text-[#111827]">
                {selectedSite.name}
              </div>
              <div className="mt-0.5 truncate text-xs text-[#6b7280]">
                {selectedSite.role}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={`tag ${
                  selectedStatus.label === 'Over Limit'
                    ? 'tag-danger'
                    : selectedStatus.label === 'Optimized'
                      ? 'tag-accent'
                      : selectedStatus.label === 'Review'
                        ? 'tag-solar'
                        : ''
                }`}
              >
                {selectedStatus.label}
              </span>
              <button
                type="button"
                aria-label="Close inspector"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#6b7280] hover:bg-slate-100 hover:text-[#111827]"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
              <dt className="text-[11px] text-[#6b7280]">Power Draw</dt>
              <dd
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  selectedSite.breaching || selectedSite.currentKw > selectedSite.capKw
                    ? 'text-[#ef4444]'
                    : 'text-[#10b981]'
                }`}
              >
                {fmt(selectedSite.currentKw)} / {selectedSite.capKw} kW
              </dd>
            </div>
            <div className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
              <dt className="text-[11px] text-[#6b7280]">Building Load</dt>
              <dd className="mt-0.5 text-sm font-semibold text-[#2563eb] tabular-nums">
                {fmt(selectedSite.currentBuildingKw)} kW
              </dd>
            </div>
            <div className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
              <dt className="text-[11px] text-[#6b7280]">EV Charging</dt>
              <dd className="mt-0.5 text-sm font-semibold text-[#10b981] tabular-nums">
                {fmt(selectedSite.currentEvKw)} kW
              </dd>
            </div>
            <div className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
              <dt className="text-[11px] text-[#6b7280]">Rooftop Solar</dt>
              <dd className="mt-0.5 text-sm font-semibold text-[#d97706] tabular-nums">
                {fmt(selectedSite.currentSolarKw)} kW
              </dd>
            </div>
            <div className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
              <dt className="text-[11px] text-[#6b7280]">EV Bays</dt>
              <dd className="mt-0.5 text-sm font-semibold text-[#111827] tabular-nums">
                {selectedSite.activeBays} / {selectedSite.totalBays}
              </dd>
            </div>
            <div className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
              <dt className="text-[11px] text-[#6b7280]">Peak Shaved</dt>
              <dd className="mt-0.5 text-sm font-semibold text-[#10b981] tabular-nums">
                −{Math.round(selectedSite.peakReductionPct)}%
              </dd>
            </div>
          </dl>

          <div className="mt-5 space-y-3 border-y border-slate-100 py-3.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#111827]">
                Building Supply
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={selectedSite.online}
                aria-label={`Power supply for ${selectedSite.name}`}
                disabled={!data.serverOnline}
                onClick={() =>
                  void dispatch({
                    type: 'SITE_SET_ONLINE',
                    siteId: selectedSite.id,
                    enabled: !selectedSite.online,
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  selectedSite.online ? 'bg-[#10b981]' : 'bg-[#d1d5db]'
                } ${!data.serverOnline ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    selectedSite.online ? 'translate-x-[22px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[#111827]">
                  Sell Power to Grid
                </div>
                <div className="text-[11px] text-[#6b7280] tabular-nums">
                  {selectedSite.sellToGrid
                    ? `+${fmt(selectedSite.currentExportKw)} kW · +€${fmt(selectedSite.dailyExportRevenueEur)}/d`
                    : 'Solar & V2G feed-in off'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={selectedSite.sellToGrid}
                aria-label={`Sell power to grid for ${selectedSite.name}`}
                disabled={!data.serverOnline || !selectedSite.online || selectedSite.failSafe}
                onClick={() =>
                  void dispatch({
                    type: 'SITE_SET_SELL_TO_GRID',
                    siteId: selectedSite.id,
                    enabled: !selectedSite.sellToGrid,
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  selectedSite.sellToGrid && selectedSite.online ? 'bg-[#0d9488]' : 'bg-[#d1d5db]'
                } ${!data.serverOnline || !selectedSite.online || selectedSite.failSafe ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    selectedSite.sellToGrid && selectedSite.online ? 'translate-x-[22px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-secondary !min-h-0 !rounded-xl !px-2.5 !py-2 text-xs"
              onClick={() =>
                void dispatch({ type: 'RUN_AGENT_CYCLE', siteId: selectedSite.id })
              }
            >
              <Cpu className="h-3.5 w-3.5 text-[#4f46e5]" />
              Run Agent
            </button>
            <button
              type="button"
              className="btn btn-secondary !min-h-0 !rounded-xl !px-2.5 !py-2 text-xs"
              onClick={() =>
                void dispatch({ type: 'SITE_APPROVE', siteId: selectedSite.id })
              }
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" />
              Approve
            </button>
            <button
              type="button"
              className="btn btn-solar !min-h-0 !rounded-xl !px-2.5 !py-2 text-xs"
              onClick={() =>
                void dispatch({
                  type: 'SITE_FAILSAFE',
                  siteId: selectedSite.id,
                  enabled: !selectedSite.failSafe,
                })
              }
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {selectedSite.failSafe ? 'Clear Safe' : 'Safe Mode'}
            </button>
            <button
              type="button"
              className="btn btn-secondary !min-h-0 !rounded-xl !px-2.5 !py-2 text-xs"
              onClick={() => triggerPreset('focus')}
            >
              <Crosshair className="h-3.5 w-3.5 text-[#2563eb]" />
              Zoom Here
            </button>
          </div>

          <a
            href={`/sites/${selectedSite.id}?room=${encodeURIComponent(room)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-accent mt-4 w-full no-underline hover:no-underline"
          >
            Open Building Dashboard
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </aside>
      ) : null}

      {/* Floating Activity Toast */}
      {toast ? (
        <div className="absolute bottom-4 right-4 z-20 flex max-w-sm items-center gap-2.5 rounded-2xl border border-black/[0.08] bg-white/95 px-4 py-3 text-xs font-medium text-[#111827] shadow-xl backdrop-blur-md">
          {toast.kind === 'agent' ? (
            <Cpu className="h-4 w-4 shrink-0 text-[#4f46e5]" />
          ) : (
            <Activity className="h-4 w-4 shrink-0 text-[#10b981]" />
          )}
          <span className="leading-snug">{toast.text}</span>
        </div>
      ) : null}
    </main>
  );
}
