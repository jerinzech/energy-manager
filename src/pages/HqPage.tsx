import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HqSiteSummary, SiteId } from '../engine';
import { AppShell } from '../components/AppShell';
import { DemoGuideDrawer } from '../components/DemoGuideDrawer';
import { Pilot30DayChart } from '../components/Pilot30DayChart';
import { useHqSync, useRoomName } from '../sync/useNeighborhoodSync';
import { GrenobleNeighborhood } from '../scene3d/GrenobleNeighborhood';
import type { CameraPreset } from '../scene3d/GrenobleNeighborhood';
import { siteStatus } from '../scene3d/BuildingMesh';

type TabId = 1 | 2 | 3;

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 1, label: '01 Spatial Twin' },
  { id: 2, label: '02 Pilot vs Control' },
  { id: 3, label: '03 Governance & Scaling' },
];

const PRESETS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'focus', label: 'Focus Site' },
  { id: 'substation', label: 'Substation' },
  { id: 'top', label: 'Top' },
];

const LADDER = [
  { level: 0, name: 'Manual', detail: 'Human schedules every session by hand.' },
  { level: 1, name: 'Observe', detail: 'Forecast only; nothing is written to the site.' },
  { level: 2, name: 'Suggest', detail: 'AI plan visible; site stays on baseline.' },
  { level: 3, name: 'Approve', detail: 'AI proposes, manager approves. Current mode.' },
  { level: 4, name: 'Supervise', detail: 'Auto-apply inside guardrails; manager monitors exceptions.' },
  { level: 5, name: 'Autonomy', detail: 'Fleet-wide market participation. Out of scope.' },
];

const MODEL_ROWS: Array<[string, string, string, string, string]> = [
  ['TS Forecast + LP/MIP', 'Day-ahead schedule core', 'Deterministic', 'Solver log', 'ADOPTED'],
  ['Deep RL', 'Research / realtime trim', 'Stochastic', 'Partial', 'RESEARCH ONLY'],
  ['LLM-Only', 'Advisory copy, never control', 'Stochastic', 'None', 'NOT FOR CONTROL'],
];

const GUARDRAILS = [
  { name: 'EU AI Act', detail: 'Human oversight, transparency and logged decisions for a high-impact energy workflow.' },
  { name: 'GDPR', detail: 'HQ receives aggregates only — no names, sessions or trip destinations cross the tenant boundary.' },
  { name: 'CSE', detail: 'Works-council consultation before scaling; no individual attendance monitoring.' },
  { name: 'ISO 42001', detail: 'AI management system: owners, change control, monitoring, immutable audit trail.' },
];

function statusTag(site: HqSiteSummary): { label: string; cls: string } {
  const s = siteStatus(site);
  if (s.label === 'BREACH') return { label: s.label, cls: 'tag tag-danger' };
  if (s.label === 'OPTIMIZED') return { label: s.label, cls: 'tag tag-accent' };
  if (s.label === 'ALERT') return { label: s.label, cls: 'tag tag-solar' };
  return { label: s.label, cls: 'tag' };
}

function fmt(n: number | undefined): string {
  return n == null ? '—' : Math.round(n).toLocaleString('en-US');
}

function shortSiteName(name: string): string {
  return name.split(' ')[0];
}

interface CampusComparisonDatum {
  id: string;
  name: string;
  shortName: string;
  currentKw: number;
  peakKw: number;
  capKw: number;
  breaching: boolean;
  isControl: boolean;
}

function CampusCapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CampusComparisonDatum }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  const pct = item.capKw > 0 ? Math.round((item.currentKw / item.capKw) * 100) : 0;

  return (
    <div className="min-w-[195px] rounded-lg border border-[#d6d3cb] bg-white px-3.5 py-2.5 text-xs text-[#141413] shadow-lg">
      <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-[#e5e3dc] pb-1">
        <span className="font-semibold text-[#141413]">{item.name}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium ${
            item.breaching
              ? 'bg-[#fef2f2] text-[#dc2626]'
              : item.isControl
                ? 'bg-[#eff6ff] text-[#1d4ed8]'
                : 'bg-[#f0fdfa] text-[#0f766e]'
          }`}
        >
          {item.breaching ? 'Breach' : `${pct}% cap`}
        </span>
      </div>
      <div className="space-y-0.5 font-mono text-[11px] tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#57564f]">Live load</span>
          <span className={item.breaching ? 'font-semibold text-[#dc2626]' : 'font-semibold text-[#0f766e]'}>
            {fmt(item.currentKw)} kW
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#57564f]">Daily peak</span>
          <span className="font-medium text-[#b45309]">{fmt(item.peakKw)} kW</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#57564f]">Site cap</span>
          <span className="font-medium text-[#141413]">{fmt(item.capKw)} kW</span>
        </div>
      </div>
    </div>
  );
}

export default function HqPage() {
  const room = useRoomName();
  const { data, mode, dispatch } = useHqSync(room);

  const [tab, setTab] = useState<TabId>(1);
  const [selectedSiteId, setSelectedSiteId] = useState<SiteId | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('overview');
  const [visualMode, setVisualMode] = useState<'realistic' | 'wireframe'>('realistic');
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const [tcoSites, setTcoSites] = useState(5);
  const [tcoMode, setTcoMode] = useState<'assemble' | 'buy' | 'build'>('assemble');

  const selectedSite = useMemo(
    () => data.sites.find((s) => s.id === selectedSiteId) ?? data.sites[0] ?? null,
    [data.sites, selectedSiteId],
  );

  const breachingCount = data.sites.filter((s) => s.breaching || s.currentKw > s.capKw).length;
  const pilot = data.sites.find((s) => s.id === 'alptech-hq') ?? data.sites[0] ?? null;
  const control = data.sites.find((s) => s.isControl) ?? null;

  const campusChartData = useMemo<CampusComparisonDatum[]>(
    () =>
      data.sites.map((site) => ({
        id: site.id,
        name: site.name,
        shortName: shortSiteName(site.name),
        currentKw: site.online && data.serverOnline ? Math.round(site.currentKw) : 0,
        peakKw: Math.round(site.peakKw),
        capKw: site.capKw,
        breaching:
          site.online && data.serverOnline && (site.breaching || site.currentKw > site.capKw),
        isControl: site.isControl,
      })),
    [data.serverOnline, data.sites],
  );

  const selectSite = (id: SiteId) => {
    setSelectedSiteId(id);
    setCameraPreset('focus');
  };

  const copyRoomUrl = async () => {
    const url = `${window.location.origin}/?room=${encodeURIComponent(room)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable.
    }
  };

  // Aggregate HQ demo actions only (strict GDPR boundary).
  const runDemoStep = (step: number) => {
    setDemoStep(step);
    if (step === 1) {
      void dispatch({ type: 'RESET_ALL' });
      void dispatch({ type: 'SET_CLOCK', slot: 13, playing: false });
      setTab(1);
      setCameraPreset('overview');
      return;
    }
    if (step === 2) {
      void dispatch({ type: 'SITE_OPTIMIZE', siteId: 'alptech-hq' });
      setTab(1);
      setSelectedSiteId('alptech-hq');
      setCameraPreset('focus');
      return;
    }
    if (step === 3) {
      void dispatch({ type: 'RUN_AGENT_CYCLE', siteId: 'isere-rd' });
      setTab(1);
      setSelectedSiteId('isere-rd');
      setCameraPreset('focus');
      return;
    }
    if (step === 4) {
      void dispatch({ type: 'SET_SCENARIO', scenario: 'unexpected' });
      setTab(2);
      return;
    }
    if (step === 5) {
      setTab(3);
    }
  };

  const tco = useMemo(() => {
    const sites = Math.max(1, Math.min(15, tcoSites));
    const chargersPerSite = 30;
    const years = 5;
    const n = sites * chargersPerSite;
    const build = sites * 120_000 + n * 2_200 + years * (n * 45 + sites * 30_000);
    const buy = years * n * 39 * 12;
    const assemble = 60_000 + n * 1_320 + years * (n * 30 + 20_000);
    return { sites, build, buy, assemble, years };
  }, [tcoSites]);

  const feed = useMemo(() => data.auditLog.slice(-30).reverse(), [data.auditLog]);

  return (
    <AppShell
      room={room}
      hqData={data}
      syncMode={mode}
      onDispatch={dispatch}
      activeNav="hq"
      title="HQ Portfolio & Governance"
      subtitle={`Grenoble IT Sector · ${data.totals.sites} sites · MV substation ${fmt(data.substation.currentKw)} / ${fmt(data.substation.capKw)} kW · GDPR aggregated projection only`}
      onOpenDemoGuide={() => setDemoOpen(true)}
      headerActions={
        <>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void dispatch({ type: 'OPTIMIZE_ALL' })}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Optimize All AI Sites
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void dispatch({ type: 'RESET_ALL' })}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset All
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={copyRoomUrl}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[#0f766e]" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-[#57564f]" />
            )}
            {copied ? 'Copied' : 'Share Room'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Single hairline 6-column KPI strip */}
        <section className="card overflow-hidden !p-0">
          <div className="grid grid-cols-2 divide-x divide-y divide-[#e5e3dc] md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
            <div className="p-4">
              <div className="label">District Grid Load</div>
              <div
                className={`metric mt-1.5 text-2xl ${
                  data.substation.breaching ? 'text-[#dc2626]' : 'text-[#141413]'
                }`}
              >
                {fmt(data.totals.currentKw)}
                <span className="ml-1 text-xs font-normal text-[#86847b]">kW</span>
              </div>
              <div className="tnum mt-1 text-[11px] text-[#57564f]">
                vs {fmt(data.substation.capKw)} kW MV cap
              </div>
            </div>

            <div className="p-4">
              <div className="label">Sites Breaching Cap</div>
              <div
                className={`metric mt-1.5 text-2xl ${
                  breachingCount > 0 ? 'text-[#dc2626]' : 'text-[#0f766e]'
                }`}
              >
                {breachingCount} / {data.sites.length}
              </div>
              <div className="tnum mt-1 text-[11px] text-[#57564f]">Live slot</div>
            </div>

            <div className="p-4">
              <div className="label">EVs Connected</div>
              <div className="metric mt-1.5 text-2xl text-[#141413]">
                {fmt(data.totals.evsConnected)}
              </div>
              <div className="tnum mt-1 text-[11px] text-[#57564f]">
                of {fmt(data.totals.totalBays)} bays
              </div>
            </div>

            <div className="p-4">
              <div className="label">District Solar PV</div>
              <div className="metric mt-1.5 text-2xl text-[#b45309]">
                {fmt(data.totals.solarKwh)}
                <span className="ml-1 text-xs font-normal text-[#86847b]">kWh</span>
              </div>
              <div className="tnum mt-1 text-[11px] text-[#57564f]">
                {Math.round(data.totals.solarSelfPct)}% self-consumed
              </div>
            </div>

            <div className="p-4">
              <div className="label">Fleet Ready</div>
              <div
                className={`metric mt-1.5 text-2xl ${
                  data.totals.readyPct >= 100 ? 'text-[#0f766e]' : 'text-[#b45309]'
                }`}
              >
                {Math.round(data.totals.readyPct)}%
              </div>
              <div className="tnum mt-1 text-[11px] text-[#57564f]">
                {fmt(data.totals.readyCount)} aggregate count
              </div>
            </div>

            <div className="p-4">
              <div className="label">Est. Daily Saving</div>
              <div className="metric mt-1.5 text-2xl text-[#0f766e]">
                €{fmt(data.totals.dailySavingEur)}
              </div>
              <div className="tnum mt-1 text-[11px] text-[#57564f]">Simulated</div>
            </div>
          </div>
        </section>

        {/* Swiss Underline Tabs */}
        <nav
          className="flex flex-wrap gap-x-6 gap-y-1 border-b border-[#e5e3dc]"
          aria-label="HQ Command tabs"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 text-[13px] transition-colors ${
                  active
                    ? 'border-[#141413] font-semibold text-[#141413]'
                    : 'border-transparent font-medium text-[#57564f] hover:text-[#141413]'
                }`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* ══ TAB 1 · 01 Spatial Twin ══ */}
        {tab === 1 ? (
          <section className="grid items-start gap-5 lg:grid-cols-[13fr_7fr]">
            <div className="card overflow-hidden !p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e3dc] px-4 py-3">
                <h2 className="section-title">Grenoble IT Park · Live Spatial Twin</h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5 text-[#86847b]" />
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition ${
                        cameraPreset === p.id
                          ? 'bg-[#141413] text-white'
                          : 'bg-[#efeee9] text-[#57564f] hover:text-[#141413]'
                      }`}
                      onClick={() => setCameraPreset(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                  <div className="ml-1 inline-flex rounded-md bg-[#efeee9] p-0.5">
                    {(['realistic', 'wireframe'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
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
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-b border-[#e5e3dc] bg-[#faf9f6] px-4 py-2 text-[11px] font-medium text-[#57564f]">
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-full bg-[#dc2626]" /> Breach
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-full bg-[#0f766e]" /> Optimized
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-full bg-[#b45309]" /> Fail-safe / pending
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-full bg-[#1d4ed8]" /> Baseline
                </span>
                <span className="ml-auto font-mono text-[10.5px] text-[#86847b] tabular-nums">
                  {data.scenario.toUpperCase()} · Slot {data.clock.slot}/55 · {data.clock.time}
                </span>
              </div>
              <div className="h-[540px] min-h-[500px] w-full bg-[#efeee9]">
                <GrenobleNeighborhood
                  data={data}
                  selectedSiteId={selectedSiteId}
                  onSelectSite={selectSite}
                  cameraPreset={cameraPreset}
                  visualMode={visualMode}
                  room={room}
                />
              </div>
            </div>

            <div className="space-y-4">
              {/* Selected site inspector */}
              <div className="card">
                <h2 className="section-title">Selected Site Inspector</h2>
                {selectedSite ? (
                  <div className="mt-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-[15px] font-bold text-[#141413]">
                          {selectedSite.name}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-[#86847b]">
                          {selectedSite.role} · /sites/{selectedSite.id}
                        </div>
                      </div>
                      <span className={statusTag(selectedSite).cls}>
                        {statusTag(selectedSite).label}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span className={`tag ${selectedSite.aiEnabled ? 'tag-accent' : ''}`}>
                        AI {selectedSite.aiEnabled ? 'On' : 'Off'}
                      </span>
                      <span className={`tag ${selectedSite.failSafe ? 'tag-solar' : ''}`}>
                        Fail-Safe {selectedSite.failSafe ? 'On' : 'Off'}
                      </span>
                      <span className="tag">{selectedSite.planStatus}</span>
                      {selectedSite.isControl ? (
                        <span className="tag tag-building">Control</span>
                      ) : null}
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-1.5">
                        <dt className="label">Building</dt>
                        <dd className="tnum mt-0.5 font-semibold text-[#1d4ed8]">
                          {fmt(selectedSite.currentBuildingKw)} kW
                        </dd>
                      </div>
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-1.5">
                        <dt className="label">EV Charging</dt>
                        <dd className="tnum mt-0.5 font-semibold text-[#0f766e]">
                          {fmt(selectedSite.currentEvKw)} kW
                        </dd>
                      </div>
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-1.5">
                        <dt className="label">Solar</dt>
                        <dd className="tnum mt-0.5 font-semibold text-[#b45309]">
                          {fmt(selectedSite.currentSolarKw)} kW
                        </dd>
                      </div>
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-1.5">
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
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-1.5">
                        <dt className="label">Active Bays</dt>
                        <dd className="tnum mt-0.5 font-semibold text-[#141413]">
                          {selectedSite.activeBays} / {selectedSite.totalBays}
                        </dd>
                      </div>
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-1.5">
                        <dt className="label">Peak Cut</dt>
                        <dd className="tnum mt-0.5 font-semibold text-[#0f766e]">
                          −{Math.round(selectedSite.peakReductionPct)}%
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="btn btn-accent !min-h-0 !px-2.5 !py-1.5 !text-[11.5px]"
                        onClick={() =>
                          void dispatch({ type: 'SITE_OPTIMIZE', siteId: selectedSite.id })
                        }
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Optimize
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
                      {selectedSite.isControl ? (
                        <button
                          type="button"
                          className="btn btn-secondary !min-h-0 !px-2.5 !py-1.5 !text-[11.5px]"
                          onClick={() =>
                            void dispatch({
                              type: 'SITE_TOGGLE_AI',
                              siteId: selectedSite.id,
                              enabled: !selectedSite.aiEnabled,
                            })
                          }
                        >
                          <Cpu className="h-3.5 w-3.5 text-[#3730a3]" />
                          {selectedSite.aiEnabled ? 'Disable' : 'Enable'} AI
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary !min-h-0 !px-2.5 !py-1.5 !text-[11.5px]"
                          onClick={() =>
                            void dispatch({ type: 'SITE_RESET', siteId: selectedSite.id })
                          }
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reset
                        </button>
                      )}
                    </div>

                    <Link
                      to={`/sites/${selectedSite.id}?room=${encodeURIComponent(room)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary mt-2.5 w-full no-underline hover:no-underline"
                    >
                      Open Local Dashboard
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-[#86847b]">
                    Select a building or roster row to inspect aggregate telemetry.
                  </p>
                )}
              </div>

              {/* 5-site live roster */}
              <div className="card">
                <h2 className="section-title">5-Site Live Roster</h2>
                <div className="mt-3 space-y-1.5">
                  {data.sites.map((site) => {
                    const tag = statusTag(site);
                    return (
                      <div
                        key={site.id}
                        className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 transition ${
                          site.id === selectedSiteId
                            ? 'border-[#141413] bg-[#faf9f6]'
                            : 'border-[#e5e3dc] bg-white hover:bg-[#faf9f6]'
                        }`}
                        onClick={() => selectSite(site.id)}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-semibold text-[#141413]">
                            {site.name}
                          </div>
                          <div className="tnum text-[11px] text-[#57564f]">
                            {fmt(site.currentKw)}/{site.capKw} kW · {site.activeBays}/{site.totalBays} bays
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={tag.cls}>{tag.label}</span>
                          <Link
                            to={`/sites/${site.id}?room=${encodeURIComponent(room)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-[#1d4ed8] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live district event feed */}
              <div className="card">
                <h2 className="section-title">District Event Ledger</h2>
                <div className="mt-3 max-h-60 overflow-x-auto overflow-y-auto rounded-md border border-[#e5e3dc]">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Action</th>
                        <th>Site</th>
                        <th>Event</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feed.map((entry) => (
                        <tr key={entry.id}>
                          <td className="tnum whitespace-nowrap text-[#86847b]">
                            {entry.at.includes('T') ? entry.at.slice(11, 16) : entry.at}
                          </td>
                          <td className="whitespace-nowrap font-mono text-[11px] text-[#57564f]">
                            {entry.action}
                          </td>
                          <td className="whitespace-nowrap font-mono text-[11px] text-[#1d4ed8]">
                            {entry.siteId ?? 'HQ'}
                          </td>
                          <td>{entry.message}</td>
                        </tr>
                      ))}
                      {feed.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-[#86847b]">
                            No events yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* ══ TAB 2 · 02 Pilot vs Control ══ */}
        {tab === 2 ? (
          <section className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              {[pilot, control].map((site, i) => (
                <article key={site?.id ?? i} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-[15px] font-bold text-[#141413]">
                        {site?.name ?? '—'}
                      </h2>
                      <p className="mt-0.5 text-[11.5px] text-[#86847b]">
                        {i === 0 ? 'Pilot · AI On' : 'Matched Control · No AI'} · {site?.role ?? ''}
                      </p>
                    </div>
                    {site ? <span className={statusTag(site).cls}>{statusTag(site).label}</span> : null}
                  </div>
                  {site ? (
                    <dl className="mt-4 grid grid-cols-2 gap-2.5 text-xs md:grid-cols-3">
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
                        <dt className="label">Peak vs Cap</dt>
                        <dd
                          className={`tnum mt-0.5 font-semibold ${
                            site.breaching || site.currentKw > site.capKw
                              ? 'text-[#dc2626]'
                              : 'text-[#141413]'
                          }`}
                        >
                          {fmt(site.peakKw)} / {site.capKw} kW
                        </dd>
                      </div>
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
                        <dt className="label">Peak Cut</dt>
                        <dd className="tnum mt-0.5 font-semibold text-[#0f766e]">
                          −{Math.round(site.peakReductionPct)}%
                        </dd>
                      </div>
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
                        <dt className="label">Grid Now</dt>
                        <dd className="tnum mt-0.5 font-semibold text-[#141413]">
                          {fmt(site.currentKw)} kW
                        </dd>
                      </div>
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
                        <dt className="label">Solar Today</dt>
                        <dd className="tnum mt-0.5 font-semibold text-[#b45309]">
                          {fmt(site.solarKwh)} kWh · {Math.round(site.solarSelfPct)}%
                        </dd>
                      </div>
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
                        <dt className="label">Fleet Ready</dt>
                        <dd className="tnum mt-0.5 font-semibold text-[#141413]">
                          {Math.round(site.readyPct)}%
                        </dd>
                      </div>
                      <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-2.5 py-2">
                        <dt className="label">Saving</dt>
                        <dd className="tnum mt-0.5 font-semibold text-[#0f766e]">
                          €{fmt(site.dailySavingEur)}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                  {site ? (
                    <Link
                      to={`/sites/${site.id}?room=${encodeURIComponent(room)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#141413] no-underline hover:text-[#0f766e] hover:no-underline"
                    >
                      Open /sites/{site.id}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>

            {/* White-paper 5-Campus Load vs Cap BarChart + 30-Day Pilot Chart */}
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title">5-Campus Live Load vs Site Cap (kW)</h2>
                  <span className="tag tag-accent">Aggregate only</span>
                </div>
                <div className="mt-3 rounded-lg border border-[#e5e3dc] bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-[#57564f]">
                    <span className="font-mono text-[10.5px] text-[#86847b]">
                      Grenoble IT Sector · {data.clock.time}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-[2px] bg-[#0f766e]" /> Live ≤ cap
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-[2px] bg-[#dc2626]" /> Breach
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-[2px] bg-[#e5e3dc]" /> Cap kW
                      </span>
                    </div>
                  </div>
                  <div className="w-full" style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart
                        data={campusChartData}
                        margin={{ top: 10, right: 12, left: -10, bottom: 4 }}
                        barGap={4}
                        barCategoryGap="24%"
                      >
                        <CartesianGrid
                          stroke="#eceae4"
                          strokeDasharray="3 3"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="shortName"
                          tick={{
                            fill: '#86847b',
                            fontSize: 11,
                            fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
                          }}
                          axisLine={{ stroke: '#e5e3dc' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{
                            fill: '#86847b',
                            fontSize: 11,
                            fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
                          }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(20, 20, 19, 0.04)' }}
                          content={<CampusCapTooltip />}
                        />
                        <Bar
                          dataKey="capKw"
                          name="Site Cap kW"
                          fill="#e5e3dc"
                          radius={[3, 3, 0, 0]}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="currentKw"
                          name="Live Load kW"
                          radius={[3, 3, 0, 0]}
                          isAnimationActive={false}
                        >
                          {campusChartData.map((entry) => (
                            <Cell
                              key={entry.id}
                              fill={entry.breaching ? '#dc2626' : '#0f766e'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title">30-Day Rollup · Pilot vs Control Peak</h2>
                  <span className="stamp stamp-solar">Simulated</span>
                </div>
                <div className="mt-3">
                  <Pilot30DayChart days={data.pilot30Day} height={240} />
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-3.5 text-[12px] leading-relaxed text-[#57564f]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b45309]" />
              <p>
                <strong className="text-[#141413]">Feasibility Note:</strong> Pilot vs
                matched-control figures are simulated for classroom evaluation. Real feasibility
                depends on tariff, PV sizing, charger mix and arrival distributions; no per-session
                personal data is used or required at HQ.
              </p>
            </div>
          </section>
        ) : null}

        {/* ══ TAB 3 · 03 Governance & Scaling ══ */}
        {tab === 3 ? (
          <section className="grid items-start gap-5 lg:grid-cols-2">
            <div className="card">
              <h2 className="section-title">GDPR Multi-Site Tenant Isolation Proof</h2>
              <div className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-[#57564f]">
                <p>
                  The HQ view receives{' '}
                  <strong className="text-[#141413]">
                    only the aggregate <span className="mono text-[#0f766e]">HqSnapshot</span>
                  </strong>
                  : per-site kW, bay counts, caps, statuses and spatial layout. It never receives
                  individual charging sessions, employee identities, arrival/departure schedules or
                  trip destinations.
                </p>
                <p>
                  Each campus dashboard (<span className="mono text-[#1d4ed8]">/sites/:siteId</span>)
                  retains granular schedule data behind its own authorised boundary; only aggregates
                  cross to HQ. Financial figures are labelled <strong className="text-[#141413]">Simulated</strong>.
                </p>
                <p className="inline-flex items-center gap-1.5 rounded-md border border-[#ccfbf1] bg-[#f0fdfa] px-3 py-1.5 font-mono text-[11px] font-medium text-[#0f766e]">
                  <Lock className="h-3.5 w-3.5" />
                  Boundary enforced by engine projection — not UI convention.
                </p>
              </div>
            </div>

            <div className="card">
              <h2 className="section-title">Autonomy Ladder 0–5 · L3 Active</h2>
              <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6">
                {LADDER.map((lv) => (
                  <div
                    key={lv.level}
                    className={`rounded-md border px-2 py-2.5 text-center ${
                      lv.level === 3
                        ? 'border-[#141413] bg-[#141413] text-white'
                        : 'border-[#e5e3dc] bg-[#faf9f6] text-[#141413]'
                    }`}
                  >
                    <div className="tnum text-base font-bold">{lv.level}</div>
                    <div className="mt-0.5 text-[11px] font-semibold">{lv.name}</div>
                    <div
                      className={`mt-1 text-[10px] leading-snug ${
                        lv.level === 3 ? 'text-[#e5e3dc]' : 'text-[#57564f]'
                      }`}
                    >
                      {lv.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 className="section-title">GAS Model Choice Matrix</h2>
              <div className="mt-4 overflow-x-auto rounded-md border border-[#e5e3dc]">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Approach</th>
                      <th>Role</th>
                      <th>Deterministic</th>
                      <th>Auditable</th>
                      <th>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODEL_ROWS.map((row) => (
                      <tr key={row[0]}>
                        <td className="font-semibold text-[#141413]">{row[0]}</td>
                        <td className="text-[#57564f]">{row[1]}</td>
                        <td>{row[2]}</td>
                        <td>{row[3]}</td>
                        <td>
                          <span
                            className={`tag ${
                              row[4] === 'ADOPTED'
                                ? 'tag-accent'
                                : row[4] === 'NOT FOR CONTROL'
                                  ? 'tag-danger'
                                  : 'tag-solar'
                            }`}
                          >
                            {row[4]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h2 className="section-title">
                EU AI Act · GDPR · CSE · ISO 42001 Guardrails
              </h2>
              <ul className="mt-4 space-y-2.5">
                {GUARDRAILS.map((g) => (
                  <li
                    key={g.name}
                    className="flex items-start gap-2.5 border-b border-[#e5e3dc] pb-2.5 text-[12.5px] last:border-b-0 last:pb-0"
                  >
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0f766e]" />
                    <span>
                      <strong className="text-[#141413]">{g.name}</strong> —{' '}
                      <span className="text-[#57564f]">{g.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="section-title">5-Year Multi-Site Scaling TCO Simulator</h2>
                <span className="stamp stamp-solar">Simulated €</span>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-5">
                <div className="field">
                  <label className="label" htmlFor="tco-sites">
                    Campuses (1–15)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="tco-sites"
                      type="range"
                      min={1}
                      max={15}
                      step={1}
                      value={tcoSites}
                      className="w-44 cursor-pointer"
                      style={{ accentColor: '#0f766e' }}
                      onChange={(e) => setTcoSites(Number(e.target.value))}
                    />
                    <span className="tnum text-sm font-semibold text-[#0f766e]">
                      {tco.sites} sites
                    </span>
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="tco-mode">
                    Preferred Architecture
                  </label>
                  <select
                    id="tco-mode"
                    className="select !w-auto"
                    value={tcoMode}
                    onChange={(e) =>
                      setTcoMode(e.target.value as 'assemble' | 'buy' | 'build')
                    }
                  >
                    <option value="assemble">Assemble (APIs + modules)</option>
                    <option value="buy">Buy (SaaS)</option>
                    <option value="build">Build (in-house)</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {(
                  [
                    { key: 'build', label: 'Build (in-house)', value: tco.build, cls: 'text-[#1d4ed8]' },
                    { key: 'buy', label: 'Buy (SaaS €/charger/mo)', value: tco.buy, cls: 'text-[#141413]' },
                    { key: 'assemble', label: 'Assemble (modules)', value: tco.assemble, cls: 'text-[#0f766e]' },
                  ] as const
                ).map((opt) => {
                  const max = Math.max(tco.build, tco.buy, tco.assemble, 1);
                  const active = tcoMode === opt.key;
                  return (
                    <div
                      key={opt.key}
                      className={`rounded-lg border px-4 py-3.5 ${
                        active
                          ? 'border-[#141413] bg-[#faf9f6]'
                          : 'border-[#e5e3dc] bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="label">{opt.label}</span>
                        {active ? <span className="tag tag-accent">Selected</span> : null}
                      </div>
                      <div className={`metric mt-1.5 text-xl ${opt.cls}`}>
                        €{fmt(opt.value)}
                      </div>
                      <div className="tnum mt-1 text-[11px] text-[#57564f]">
                        {tco.years}y total · €{fmt(opt.value / tco.years)}/yr
                      </div>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#efeee9]">
                        <div
                          className="h-full rounded-full bg-[#0f766e] transition-all duration-300"
                          style={{ width: `${(opt.value / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 font-mono text-[10.5px] text-[#86847b]">
                Assumptions (simulated): 30 chargers/site, 5-year horizon · build €120k platform/site
                + €2.2k/charger CapEx, €45/charger/yr + €30k/site/yr OpEx · buy €39/charger/mo ·
                assemble €60k + €1.32k/charger CapEx, €30/charger/yr + €20k/yr OpEx.
              </p>
            </div>
          </section>
        ) : null}
      </div>

      <DemoGuideDrawer
        open={demoOpen}
        activeStep={demoStep}
        onRunStep={runDemoStep}
        onClose={() => setDemoOpen(false)}
      />
    </AppShell>
  );
}
