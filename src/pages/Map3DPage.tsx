import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  Camera,
  CheckCircle2,
  Cpu,
  Crosshair,
  ExternalLink,
  LayoutGrid,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  ShieldAlert,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import type { SiteId } from '../engine';
import { useHqSync, useRoomName } from '../sync/useNeighborhoodSync';
import { GrenobleNeighborhood } from '../scene3d/GrenobleNeighborhood';
import { siteStatus } from '../scene3d/BuildingMesh';

type CameraPreset = 'overview' | 'focus' | 'substation' | 'alpine' | 'top';
type VisualMode = 'realistic' | 'wireframe';

const PRESETS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'alpine', label: 'Alpine' },
  { id: 'focus', label: 'Focus' },
  { id: 'substation', label: 'Substation' },
  { id: 'top', label: 'Top' },
];

function fmt(n: number | undefined): string {
  return n == null ? '—' : Math.round(n).toLocaleString('en-US');
}

export default function Map3DPage() {
  const room = useRoomName();
  const [params] = useSearchParams();
  const { data, dispatch } = useHqSync(room);

  const [visualMode, setVisualMode] = useState<VisualMode>(
    params.get('mode') === 'wireframe' ? 'wireframe' : 'realistic',
  );
  const [selectedSiteId, setSelectedSiteId] = useState<SiteId | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('overview');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: 'agent' | 'audit'; text: string } | null>(null);

  const selectedSite = useMemo(
    () => data.sites.find((s) => s.id === selectedSiteId) ?? data.sites[0] ?? null,
    [data.sites, selectedSiteId],
  );

  // Flash a crisp white paper toast on new agent dispatch or audit entry.
  const agentCount = data.agentFeed.length;
  const auditCount = data.auditLog.length;
  useEffect(() => {
    const agent = data.agentFeed[agentCount - 1];
    const audit = data.auditLog[auditCount - 1];
    const src = agent ?? audit;
    if (!src) return;
    setToast(
      agent
        ? { kind: 'agent', text: `${agent.agentName} → ${agent.siteId ?? 'HQ'}: ${agent.title}` }
        : { kind: 'audit', text: `${audit.action} · ${audit.siteId ?? 'HQ'}: ${audit.message}` },
    );
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [agentCount, auditCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const subPct = Math.min(
    100,
    (data.substation.currentKw / Math.max(1, data.substation.capKw)) * 100,
  );

  const selectSite = (id: SiteId) => {
    setSelectedSiteId(id);
    setCameraPreset('focus');
    setDrawerOpen(true);
  };

  const selectedStatus = selectedSite ? siteStatus(selectedSite) : null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f5f4f0]">
      {/* Full-viewport 3D canvas */}
      <div className="absolute inset-0">
        <GrenobleNeighborhood
          data={data}
          selectedSiteId={selectedSiteId}
          onSelectSite={selectSite}
          cameraPreset={cameraPreset}
          visualMode={visualMode}
          room={room}
        />
      </div>

      {/* ══ Single-row Swiss Topo / Apple Maps light-paper HUD bar ══ */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-3">
        <div className="pointer-events-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d6d3cb] bg-white/95 px-3 py-1.5 text-[#141413] shadow-md backdrop-blur-sm xl:flex-nowrap">
          {/* Brand + MV Load */}
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-[#141413] text-white">
                <Zap className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
              <span className="whitespace-nowrap text-[13px] font-bold tracking-[-0.02em] text-[#141413]">
                Grid-Sense
              </span>
            </div>

            <div className="hidden h-4 w-px bg-[#e5e3dc] sm:block" />

            <div className="flex items-center gap-2 rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2 py-1">
              <span className="font-mono text-[11px] font-semibold text-[#141413] tabular-nums whitespace-nowrap">
                MV {fmt(data.substation.currentKw)}/{fmt(data.substation.capKw)} kW
              </span>
              <div className="h-1 w-12 overflow-hidden rounded-full bg-[#e5e3dc]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${subPct}%`,
                    backgroundColor: data.substation.breaching ? '#dc2626' : '#0f766e',
                  }}
                />
              </div>
            </div>

            {!data.serverOnline ? (
              <span className="stamp stamp-solar !py-0.5 text-[10px]">Standby</span>
            ) : null}
          </div>

          {/* Center controls: Real-Life|Wireframe + Run Agents + Clock + Scenario */}
          <div className="flex flex-wrap items-center gap-1.5 xl:flex-nowrap">
            <div className="inline-flex shrink-0 rounded-md bg-[#efeee9] p-0.5">
              {(['realistic', 'wireframe'] as VisualMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`whitespace-nowrap rounded px-2.5 py-1 text-[11.5px] font-medium transition ${
                    visualMode === m
                      ? 'bg-white font-semibold text-[#141413] shadow-sm'
                      : 'text-[#57564f] hover:text-[#141413]'
                  }`}
                  onClick={() => setVisualMode(m)}
                >
                  {m === 'realistic' ? 'Real-Life' : 'Wireframe'}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-accent !min-h-0 shrink-0 whitespace-nowrap !px-2.5 !py-1.5 !text-[11.5px]"
              onClick={() => void dispatch({ type: 'RUN_AGENT_CYCLE' })}
            >
              <Cpu className="h-3.5 w-3.5" />
              Run Agents
            </button>

            <div className="hidden h-4 w-px bg-[#e5e3dc] xl:block" />

            <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-1.5 py-0.5">
              <button
                type="button"
                aria-label={data.clock.playing ? 'Pause clock' : 'Play clock'}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[#141413] transition hover:bg-[#efeee9]"
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
              <span className="px-1 font-mono text-[11.5px] font-semibold text-[#141413] tabular-nums">
                {data.clock.time}
              </span>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[#57564f] transition hover:bg-[#efeee9] hover:text-[#141413]"
                onClick={() =>
                  void dispatch({ type: 'SET_CLOCK', slot: 13, playing: false })
                }
                title="Jump to 09:15 peak"
              >
                09:15
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[#b45309] transition hover:bg-[#fffbeb]"
                onClick={() =>
                  void dispatch({ type: 'SET_CLOCK', slot: 28, playing: false })
                }
                title="Jump to 13:00 solar peak"
              >
                <Sun className="h-3 w-3" />
                13:00
              </button>
            </div>

            <select
              className="select !w-auto shrink-0 !py-1 !text-[11.5px]"
              value={data.scenario}
              aria-label="Scenario"
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

          {/* Right actions: Inspector + Switchboard */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className={`btn !min-h-0 whitespace-nowrap !px-2.5 !py-1.5 !text-[11.5px] ${
                drawerOpen ? 'btn-accent' : 'btn-secondary'
              }`}
              onClick={() => setDrawerOpen((v) => !v)}
            >
              {drawerOpen ? (
                <PanelRightClose className="h-3.5 w-3.5" />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5" />
              )}
              Inspector
            </button>
            <Link
              to={`/?room=${encodeURIComponent(room)}`}
              className="btn btn-secondary !min-h-0 whitespace-nowrap !px-2.5 !py-1.5 !text-[11.5px] no-underline hover:no-underline"
            >
              <LayoutGrid className="h-3.5 w-3.5 text-[#57564f]" />
              Switchboard
            </Link>
          </div>
        </div>
      </div>

      {/* ══ Bottom-left compact white paper camera presets + dot legend ══ */}
      <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100vw-24px)] rounded-lg border border-[#d6d3cb] bg-white/95 p-2.5 text-[#141413] shadow-md backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center gap-1 px-1.5 font-mono text-[10px] font-medium uppercase tracking-wider text-[#86847b]">
            <Camera className="h-3 w-3" />
            View
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition ${
                cameraPreset === p.id
                  ? 'bg-[#141413] text-white'
                  : 'bg-[#f5f4f0] text-[#57564f] hover:bg-[#efeee9] hover:text-[#141413]'
              }`}
              onClick={() => setCameraPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#e5e3dc] pt-2 text-[11px] font-medium text-[#57564f]">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-[#dc2626]" />
            Breach
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-[#0f766e]" />
            Optimized
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-[#b45309]" />
            Solar / Alert
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-[#86847b]" />
            Off
          </span>
        </div>
      </div>

      {/* ══ Right-side white paper Inspector drawer ══ */}
      {drawerOpen && selectedSite && selectedStatus ? (
        <aside className="absolute inset-y-0 right-0 z-20 flex w-80 max-w-[90vw] flex-col overflow-y-auto border-l border-[#e5e3dc] bg-white px-4 pb-5 pt-[70px] text-[#141413] shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold tracking-[-0.015em] text-[#141413]">
                {selectedSite.name}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-[#86847b]">
                {selectedSite.role}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={`tag ${
                  selectedStatus.label === 'BREACH'
                    ? 'tag-danger'
                    : selectedStatus.label === 'OPTIMIZED'
                      ? 'tag-accent'
                      : selectedStatus.label === 'ALERT'
                        ? 'tag-solar'
                        : ''
                }`}
              >
                {selectedStatus.label}
              </span>
              <button
                type="button"
                aria-label="Close inspector"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#e5e3dc] text-[#57564f] hover:bg-[#efeee9] hover:text-[#141413]"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
              <dt className="label">Grid Draw</dt>
              <dd
                className={`tnum mt-0.5 font-semibold ${
                  selectedSite.breaching || selectedSite.currentKw > selectedSite.capKw
                    ? 'text-[#dc2626]'
                    : 'text-[#0f766e]'
                }`}
              >
                {fmt(selectedSite.currentKw)} / {selectedSite.capKw} kW
              </dd>
            </div>
            <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
              <dt className="label">Building</dt>
              <dd className="tnum mt-0.5 font-semibold text-[#1d4ed8]">
                {fmt(selectedSite.currentBuildingKw)} kW
              </dd>
            </div>
            <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
              <dt className="label">EV Charging</dt>
              <dd className="tnum mt-0.5 font-semibold text-[#0f766e]">
                {fmt(selectedSite.currentEvKw)} kW
              </dd>
            </div>
            <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
              <dt className="label">Solar PV</dt>
              <dd className="tnum mt-0.5 font-semibold text-[#b45309]">
                {fmt(selectedSite.currentSolarKw)} kW
              </dd>
            </div>
            <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
              <dt className="label">Active Bays</dt>
              <dd className="tnum mt-0.5 font-semibold text-[#141413]">
                {selectedSite.activeBays}/{selectedSite.totalBays}
              </dd>
            </div>
            <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
              <dt className="label">Peak Cut</dt>
              <dd className="tnum mt-0.5 font-semibold text-[#0f766e]">
                −{Math.round(selectedSite.peakReductionPct)}%
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center justify-between border-y border-[#e5e3dc] py-3">
            <span className="text-[12.5px] font-medium text-[#141413]">
              Campus Supply
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={selectedSite.online}
              aria-label={`Supply for ${selectedSite.name}`}
              disabled={!data.serverOnline}
              onClick={() =>
                void dispatch({
                  type: 'SITE_SET_ONLINE',
                  siteId: selectedSite.id,
                  enabled: !selectedSite.online,
                })
              }
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                selectedSite.online
                  ? 'border-[#0f766e] bg-[#0f766e]'
                  : 'border-[#cfccc3] bg-[#e5e3dc]'
              } ${!data.serverOnline ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  selectedSite.online ? 'translate-x-[22px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-secondary !min-h-0 !px-2.5 !py-1.5 !text-[11.5px]"
              onClick={() =>
                void dispatch({ type: 'RUN_AGENT_CYCLE', siteId: selectedSite.id })
              }
            >
              <Cpu className="h-3.5 w-3.5 text-[#3730a3]" />
              Run Agent
            </button>
            <button
              type="button"
              className="btn btn-secondary !min-h-0 !px-2.5 !py-1.5 !text-[11.5px]"
              onClick={() =>
                void dispatch({ type: 'SITE_APPROVE', siteId: selectedSite.id })
              }
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-[#0f766e]" />
              Approve
            </button>
            <button
              type="button"
              className="btn btn-solar !min-h-0 !px-2.5 !py-1.5 !text-[11.5px]"
              onClick={() =>
                void dispatch({
                  type: 'SITE_FAILSAFE',
                  siteId: selectedSite.id,
                  enabled: !selectedSite.failSafe,
                })
              }
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {selectedSite.failSafe ? 'Clear' : 'Fail-Safe'}
            </button>
            <button
              type="button"
              className="btn btn-secondary !min-h-0 !px-2.5 !py-1.5 !text-[11.5px]"
              onClick={() => setCameraPreset('focus')}
            >
              <Crosshair className="h-3.5 w-3.5 text-[#1d4ed8]" />
              Fly To
            </button>
          </div>

          <a
            href={`/sites/${selectedSite.id}?room=${encodeURIComponent(room)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-accent mt-3 w-full no-underline hover:no-underline"
          >
            Open Building Dashboard
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </aside>
      ) : null}

      {/* ══ White paper event toast ══ */}
      {toast ? (
        <div className="absolute bottom-3 right-3 z-20 flex max-w-sm items-center gap-2.5 rounded-lg border border-[#d6d3cb] bg-white px-3.5 py-2.5 text-[11.5px] font-medium text-[#141413] shadow-lg">
          {toast.kind === 'agent' ? (
            <Cpu className="h-4 w-4 shrink-0 text-[#3730a3]" />
          ) : (
            <Activity className="h-4 w-4 shrink-0 text-[#0f766e]" />
          )}
          <span className="leading-snug">{toast.text}</span>
        </div>
      ) : null}
    </main>
  );
}
