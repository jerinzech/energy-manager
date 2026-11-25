import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Cpu,
  ExternalLink,
  Map as MapIcon,
  Zap,
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
import { AppShell } from '../components/AppShell';
import { DemoGuideDrawer } from '../components/DemoGuideDrawer';
import { useHqSync, useRoomName } from '../sync/useNeighborhoodSync';
import { siteStatus } from '../scene3d/BuildingMesh';

type MapMode = 'realistic' | 'wireframe';

function fmt(n: number | undefined): string {
  return n == null ? '—' : Math.round(n).toLocaleString('en-US');
}

function shortCampusName(name: string): string {
  return name.split(' ')[0];
}

/** Braun-inspired tactile pill toggle switch for Swiss daylight UI. */
function BraunToggle({
  on,
  onClick,
  disabled,
  label,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150 ${
        on
          ? 'border-[#0f766e] bg-[#0f766e]'
          : 'border-[#cfccc3] bg-[#e5e3dc]'
      } ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${
          on ? 'translate-x-[22px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

interface CampusBarDatum {
  id: string;
  name: string;
  shortName: string;
  currentKw: number;
  capKw: number;
  online: boolean;
  breaching: boolean;
  pct: number;
}

function CampusLoadTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CampusBarDatum }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="min-w-[180px] rounded-lg border border-[#d6d3cb] bg-white px-3 py-2 text-xs text-[#141413] shadow-lg">
      <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-[#e5e3dc] pb-1">
        <span className="font-semibold text-[#141413]">{item.name}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium ${
            !item.online
              ? 'bg-[#efeee9] text-[#57564f]'
              : item.breaching
                ? 'bg-[#fef2f2] text-[#dc2626]'
                : 'bg-[#f0fdfa] text-[#0f766e]'
          }`}
        >
          {!item.online ? 'Off' : item.breaching ? 'Breach' : `${item.pct}%`}
        </span>
      </div>
      <div className="space-y-0.5 font-mono text-[11px] tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#57564f]">Live draw</span>
          <span
            className={
              item.breaching
                ? 'font-semibold text-[#dc2626]'
                : 'font-semibold text-[#0f766e]'
            }
          >
            {fmt(item.currentKw)} kW
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#57564f]">Contract cap</span>
          <span className="font-medium text-[#141413]">{fmt(item.capKw)} kW</span>
        </div>
      </div>
    </div>
  );
}

export default function LauncherPage() {
  const room = useRoomName();
  const navigate = useNavigate();
  const { data, mode, dispatch } = useHqSync(room);

  const [copied, setCopied] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>('realistic');

  const onlineCount = data.sites.filter((s) => s.online).length;
  const subPct = Math.min(
    100,
    (data.substation.currentKw / Math.max(1, data.substation.capKw)) * 100,
  );

  const campusBars = useMemo<CampusBarDatum[]>(
    () =>
      data.sites.map((site) => {
        const effectiveOn = site.online && data.serverOnline;
        const liveKw = effectiveOn ? Math.round(site.currentKw) : 0;
        const pct = site.capKw > 0 ? Math.round((liveKw / site.capKw) * 100) : 0;
        return {
          id: site.id,
          name: site.name,
          shortName: shortCampusName(site.name),
          currentKw: liveKw,
          capKw: site.capKw,
          online: effectiveOn,
          breaching: effectiveOn && (site.breaching || site.currentKw > site.capKw),
          pct,
        };
      }),
    [data.serverOnline, data.sites],
  );

  const copyShareLink = async () => {
    const url = `${window.location.origin}/?room=${encodeURIComponent(room)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — room input in sidebar still shows the active room.
    }
  };

  const runDemoStep = (step: number) => {
    setDemoStep(step);
    if (step === 1) {
      void dispatch({ type: 'RESET_ALL' });
      void dispatch({ type: 'SET_CLOCK', slot: 13, playing: false });
      return;
    }
    if (step === 2) {
      void dispatch({ type: 'SET_SCENARIO', scenario: 'unexpected' });
      void dispatch({ type: 'OPTIMIZE_ALL' });
      return;
    }
    if (step === 3) {
      navigate(`/sites/alptech-hq?room=${encodeURIComponent(room)}`);
      return;
    }
    if (step === 4) {
      navigate(`/sites/vercors-control?room=${encodeURIComponent(room)}`);
      return;
    }
    if (step === 5) {
      navigate(`/hq?room=${encodeURIComponent(room)}`);
    }
  };

  const feed = useMemo(() => {
    const agentItems = data.agentFeed.map((a) => ({
      key: `agent-${a.id}`,
      at: a.at,
      source: a.agentName,
      isAgent: true,
      campus: a.siteId ?? 'HQ',
      decision: `${a.title} — ${a.message}${a.requiresApproval ? ' · Approval requested' : ''}`,
    }));
    const auditItems = data.auditLog.map((a) => ({
      key: `audit-${a.id}`,
      at: a.at,
      source: a.action,
      isAgent: false,
      campus: a.siteId ?? 'HQ',
      decision: a.message,
    }));
    return [...agentItems, ...auditItems]
      .sort((x, y) => String(y.at ?? '').localeCompare(String(x.at ?? '')))
      .slice(0, 25);
  }, [data.agentFeed, data.auditLog]);

  return (
    <AppShell
      room={room}
      hqData={data}
      syncMode={mode}
      onDispatch={dispatch}
      activeNav="launcher"
      title="Grid Switchboard"
      subtitle="Grenoble IT Sector · 5 campuses · 1,650 kW MV feeder"
      onOpenDemoGuide={() => setDemoOpen(true)}
      headerActions={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={copyShareLink}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[#0f766e]" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-[#57564f]" />
            )}
            {copied ? 'Link Copied' : 'Copy Share Link'}
          </button>
          <span className="stamp">Simulated</span>
        </>
      }
    >
      <div className="space-y-5">
        {/* (a) Unified Telemetry Strip */}
        <section className="card overflow-hidden !p-0">
          <div className="grid grid-cols-1 divide-y divide-[#e5e3dc] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {/* Substation Draw */}
            <div className="p-5 sm:border-b sm:border-r sm:border-[#e5e3dc] lg:border-b-0 lg:border-r-0">
              <div className="label">Substation Draw</div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span
                  className={`metric text-2xl ${
                    data.substation.breaching ? 'text-[#dc2626]' : 'text-[#141413]'
                  }`}
                >
                  {fmt(data.substation.currentKw)}
                </span>
                <span className="font-mono text-xs text-[#86847b]">
                  / {fmt(data.substation.capKw)} kW
                </span>
              </div>
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#efeee9]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${subPct}%`,
                    backgroundColor: data.substation.breaching ? '#dc2626' : '#0f766e',
                  }}
                />
              </div>
            </div>

            {/* Energized Campuses */}
            <div className="p-5 sm:border-b sm:border-[#e5e3dc] lg:border-b-0">
              <div className="label">Energized Campuses</div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="metric text-2xl text-[#141413]">
                  {onlineCount}
                </span>
                <span className="font-mono text-xs text-[#86847b]">
                  / {data.sites.length} online
                </span>
              </div>
              <div className="mt-2.5 text-[11.5px] text-[#57564f]">
                {data.serverOnline
                  ? 'MV feeder distributing normally'
                  : 'Feeder parked — standby mode'}
              </div>
            </div>

            {/* Backend Data Server */}
            <div className="flex flex-col justify-between p-5 sm:border-r sm:border-[#e5e3dc] lg:border-r-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="label">Backend Data Server</div>
                  <div
                    className={`mt-1.5 text-sm font-semibold ${
                      data.serverOnline ? 'text-[#0f766e]' : 'text-[#b45309]'
                    }`}
                  >
                    {data.serverOnline ? 'Online' : 'Standby'}
                  </div>
                </div>
                <BraunToggle
                  on={data.serverOnline}
                  label="Backend data server Online or Standby"
                  onClick={() =>
                    void dispatch({
                      type: 'SET_SERVER_ONLINE',
                      enabled: !data.serverOnline,
                    })
                  }
                />
              </div>
              <div className="mt-2 text-[11.5px] text-[#57564f]">
                {data.serverOnline
                  ? 'Telemetry & clock streaming'
                  : 'Live telemetry paused'}
              </div>
            </div>

            {/* Agentic Routing */}
            <div className="flex flex-col justify-between p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="label">Agentic Routing</div>
                  <div
                    className={`mt-1.5 text-sm font-semibold ${
                      data.agenticRouting ? 'text-[#0f766e]' : 'text-[#57564f]'
                    }`}
                  >
                    {data.agenticRouting ? 'Armed' : 'Paused'}
                  </div>
                </div>
                <BraunToggle
                  on={data.agenticRouting}
                  label="Agentic routing Armed or Paused"
                  onClick={() =>
                    void dispatch({
                      type: 'SET_AGENTIC_ROUTING',
                      enabled: !data.agenticRouting,
                    })
                  }
                />
              </div>
              <div className="mt-2.5">
                <button
                  type="button"
                  className="btn btn-secondary !min-h-0 !px-2.5 !py-1 !text-[11.5px]"
                  onClick={() => void dispatch({ type: 'RUN_AGENT_CYCLE' })}
                >
                  <Activity className="h-3.5 w-3.5 text-[#0f766e]" />
                  Run Cycle
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* (b) Asymmetric 2/3 + 1/3 row */}
        <section className="grid gap-5 lg:grid-cols-3">
          {/* Left 2/3: Campus Power Allocation */}
          <div className="card min-w-0 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Campus Power Allocation</h2>
              <div className="flex items-center gap-3 text-[11px] font-medium text-[#57564f]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-[#0f766e]" />
                  Live Draw
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-[#dc2626]" />
                  Breach
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-[#e5e3dc]" />
                  Contract Cap
                </span>
              </div>
            </div>

            <div className="mt-4 w-full" style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart
                  data={campusBars}
                  margin={{ top: 6, right: 8, left: -12, bottom: 0 }}
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
                    content={<CampusLoadTooltip />}
                  />
                  <Bar
                    dataKey="capKw"
                    name="Contract Cap"
                    fill="#e5e3dc"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="currentKw"
                    name="Live Draw"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  >
                    {campusBars.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={
                          !entry.online
                            ? '#cbd5e1'
                            : entry.breaching
                              ? '#dc2626'
                              : '#0f766e'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right 1/3: 3D Spatial Twin */}
          <div className="card flex min-w-0 flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="section-title">3D Spatial Twin</h2>
                <span className="font-mono text-[10.5px] text-[#86847b]">
                  WebGL
                </span>
              </div>

              <div className="mt-4">
                <div className="label mb-1.5">Render Mode</div>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-[#efeee9] p-1">
                  {(['realistic', 'wireframe'] as MapMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`rounded px-2.5 py-1.5 text-[12px] font-medium transition ${
                        mapMode === m
                          ? 'bg-white font-semibold text-[#141413] shadow-sm'
                          : 'text-[#57564f] hover:text-[#141413]'
                      }`}
                      onClick={() => setMapMode(m)}
                    >
                      {m === 'realistic' ? 'Real-Life' : 'Wireframe'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-[#e5e3dc] pt-4">
                <div>
                  <div className="label">Fleet Ready</div>
                  <div className="metric mt-1 text-lg text-[#0f766e]">
                    {Math.round(data.totals.readyPct)}%
                  </div>
                </div>
                <div>
                  <div className="label">Connected EVs</div>
                  <div className="metric mt-1 text-lg text-[#141413]">
                    {fmt(data.totals.evsConnected)}
                    <span className="ml-1 text-[11px] font-normal text-[#86847b]">
                      / {fmt(data.totals.totalBays)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              <a
                href={`/map?room=${encodeURIComponent(room)}&mode=${mapMode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-accent w-full !py-2.5 no-underline hover:no-underline"
              >
                <MapIcon className="h-4 w-4" />
                Launch 3D Map
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Link
                to={`/hq?room=${encodeURIComponent(room)}`}
                className="flex items-center justify-center gap-1.5 py-1 text-[12.5px] font-medium text-[#57564f] no-underline transition-colors hover:text-[#141413] hover:no-underline"
              >
                Open HQ Analytics &amp; Governance
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* (c) Campus Switchboard Grid */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="section-title">Campus Switchboard</h2>
            <span className="font-mono text-[11px] text-[#86847b]">
              {data.sites.length} sites · GDPR aggregate telemetry
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.sites.map((site) => {
              const effectiveOn = site.online && data.serverOnline;
              const status = siteStatus(site);
              const isBreach =
                effectiveOn && (site.breaching || site.currentKw > site.capKw);
              const gridPct = Math.min(
                100,
                (site.currentKw / Math.max(1, site.capKw)) * 100,
              );
              const dotHex = !effectiveOn
                ? '#86847b'
                : isBreach
                  ? '#dc2626'
                  : status.label === 'OPTIMIZED'
                    ? '#0f766e'
                    : status.label === 'ALERT'
                      ? '#b45309'
                      : '#1d4ed8';

              return (
                <article
                  key={site.id}
                  className={`card flex min-w-0 flex-col justify-between transition-opacity ${
                    effectiveOn ? '' : 'bg-[#faf9f6] opacity-80'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-bold tracking-[-0.015em] text-[#141413]">
                          {site.name}
                        </div>
                        <div className="mt-0.5 truncate text-[11.5px] text-[#86847b]">
                          {site.role}
                          {site.isControl ? ' · Matched control' : ''}
                        </div>
                      </div>
                      <BraunToggle
                        on={site.online}
                        disabled={!data.serverOnline}
                        label={`Supply and routing for ${site.name}`}
                        onClick={() =>
                          void dispatch({
                            type: 'SITE_SET_ONLINE',
                            siteId: site.id,
                            enabled: !site.online,
                          })
                        }
                      />
                    </div>

                    {effectiveOn ? (
                      <>
                        <div className="mt-4 flex items-baseline justify-between gap-2">
                          <div className="flex items-baseline gap-1.5">
                            <span
                              className={`metric text-2xl ${
                                isBreach ? 'text-[#dc2626]' : 'text-[#141413]'
                              }`}
                            >
                              {fmt(site.currentKw)}
                            </span>
                            <span className="font-mono text-xs text-[#86847b]">
                              / {site.capKw} kW
                            </span>
                          </div>
                          <span className="font-mono text-[11px] font-medium text-[#57564f] tabular-nums">
                            {Math.round(gridPct)}%
                          </span>
                        </div>

                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#efeee9]">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${gridPct}%`,
                              backgroundColor: isBreach ? '#dc2626' : '#0f766e',
                            }}
                          />
                        </div>

                        {/* One quiet telemetry line */}
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[#57564f] tabular-nums">
                          <span className="inline-flex items-center gap-1.5 font-medium text-[#141413]">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: dotHex }}
                            />
                            {status.label}
                          </span>
                          <span>Solar {fmt(site.solarKwh)} kWh</span>
                          <span>
                            Bays {site.activeBays}/{site.totalBays}
                          </span>
                        </div>

                        {/* Subtle warm-ochre notice if unread alerts exist */}
                        {site.unreadNotifications > 0 ? (
                          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1.5 text-[11.5px] font-medium text-[#b45309]">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              {site.unreadNotifications} pending agent routing{' '}
                              {site.unreadNotifications === 1 ? 'alert' : 'alerts'}
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="mt-5 rounded-md border border-[#e5e3dc] bg-[#efeee9] px-3 py-3 text-center font-mono text-xs font-medium text-[#57564f]">
                        Isolated · 0 kW
                      </div>
                    )}
                  </div>

                  {/* Card actions */}
                  <div className="mt-4 border-t border-[#e5e3dc] pt-3.5">
                    {effectiveOn ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="btn btn-secondary !min-h-0 !px-2.5 !py-1.5 !text-[11.5px]"
                            onClick={() =>
                              void dispatch(
                                site.isControl
                                  ? {
                                      type: 'SITE_TOGGLE_AI',
                                      siteId: site.id,
                                      enabled: !site.aiEnabled,
                                    }
                                  : { type: 'RUN_AGENT_CYCLE', siteId: site.id },
                              )
                            }
                          >
                            <Cpu className="h-3.5 w-3.5 text-[#3730a3]" />
                            {site.isControl
                              ? site.aiEnabled
                                ? 'Disable AI'
                                : 'Enable AI'
                              : 'Run Agent'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary !min-h-0 !px-2.5 !py-1.5 !text-[11.5px]"
                            onClick={() =>
                              void dispatch({ type: 'SITE_OPTIMIZE', siteId: site.id })
                            }
                          >
                            <Zap className="h-3.5 w-3.5 text-[#0f766e]" />
                            Optimize
                          </button>
                        </div>
                        <a
                          href={`/sites/${site.id}?room=${encodeURIComponent(room)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#141413] no-underline hover:text-[#0f766e] hover:no-underline"
                        >
                          Open Dashboard
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="btn btn-secondary w-full !min-h-0 !py-1.5 !text-[11.5px]"
                      >
                        Supply Off — Enable to Launch
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* (d) Dispatch & Audit Ledger */}
        <section className="card min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Dispatch &amp; Audit Ledger</h2>
            <span className="font-mono text-[11px] text-[#86847b]">
              {feed.length} recent entries
            </span>
          </div>
          <div className="mt-3 max-h-72 overflow-x-auto overflow-y-auto rounded-md border border-[#e5e3dc]">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Campus</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {feed.map((item) => (
                  <tr key={item.key}>
                    <td className="tnum whitespace-nowrap text-[#86847b]">
                      {item.at.includes('T') ? item.at.slice(11, 16) : item.at}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={`tag ${item.isAgent ? 'tag-agent' : ''}`}>
                        {item.source}
                      </span>
                    </td>
                    <td className="whitespace-nowrap font-mono text-[11.5px] text-[#1d4ed8]">
                      {item.campus}
                    </td>
                    <td className="min-w-[260px] text-[#141413]">{item.decision}</td>
                  </tr>
                ))}
                {feed.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-[#86847b]">
                      No agent dispatches or audit entries yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
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
