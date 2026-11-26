import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
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

/** Tactile iOS/Tesla pill toggle switch. */
function PillToggle({
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
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 ${
        on ? 'bg-[#10b981]' : 'bg-[#d1d5db]'
      } ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${
          on ? 'translate-x-[22px]' : 'translate-x-[2px]'
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
    <div className="min-w-[185px] rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-xs text-[#111827] shadow-lg">
      <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-[#111827]">{item.name}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            !item.online
              ? 'bg-slate-100 text-slate-500'
              : item.breaching
                ? 'bg-red-50 text-red-600'
                : 'bg-emerald-50 text-emerald-600'
          }`}
        >
          {!item.online ? 'Off' : item.breaching ? 'Over Limit' : `${item.pct}%`}
        </span>
      </div>
      <div className="space-y-1 text-[11.5px] tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#6b7280]">Current load</span>
          <span className={item.breaching ? 'font-semibold text-red-600' : 'font-semibold text-emerald-600'}>
            {fmt(item.currentKw)} kW
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#6b7280]">Site limit</span>
          <span className="font-medium text-[#111827]">{fmt(item.capKw)} kW</span>
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
      // Clipboard unavailable in restricted contexts.
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
      decision: `${a.title} — ${a.message}${a.requiresApproval ? ' · Ready for review' : ''}`,
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
      .slice(0, 20);
  }, [data.agentFeed, data.auditLog]);

  return (
    <AppShell
      room={room}
      hqData={data}
      syncMode={mode}
      onDispatch={dispatch}
      activeNav="launcher"
      title="Grid Switchboard"
      subtitle="Grenoble IT Campus · 5 buildings connected to one 1,650 kW neighborhood feeder"
      onOpenDemoGuide={() => setDemoOpen(true)}
      headerActions={
        <button
          type="button"
          className="btn btn-secondary"
          onClick={copyShareLink}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-[#10b981]" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-[#6b7280]" />
          )}
          {copied ? 'Link Copied' : 'Share Room'}
        </button>
      }
    >
      <div className="space-y-6">
        {/* Hero Grid Status & Master Controls */}
        <section className="card">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5">
              <div className="text-xs font-medium text-[#6b7280]">
                Neighborhood Grid Load
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`metric text-3xl ${
                    data.substation.breaching ? 'text-[#ef4444]' : 'text-[#111827]'
                  }`}
                >
                  {fmt(data.substation.currentKw)} kW
                </span>
                <span className="text-sm text-[#6b7280] tabular-nums">
                  of {fmt(data.substation.capKw)} kW limit
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${subPct}%`,
                    backgroundColor: data.substation.breaching ? '#ef4444' : '#10b981',
                  }}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-[#6b7280]">
                <span>
                  {onlineCount} of {data.sites.length} buildings energized ·{' '}
                  {data.serverOnline ? 'Streaming live telemetry' : 'Server paused in standby'}
                </span>
                {data.totals.totalExportKw > 0 ? (
                  <span className="rounded-full bg-teal-50 px-2.5 py-0.5 font-medium text-teal-700 tabular-nums">
                    Selling +{fmt(data.totals.totalExportKw)} kW to grid · +€
                    {fmt(data.totals.dailyExportRevenueEur)}/day
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
              <div className="flex items-center justify-between gap-4 rounded-xl bg-[#f8fafc] px-4 py-3.5">
                <div>
                  <div className="text-sm font-semibold text-[#111827]">
                    Data Server
                  </div>
                  <div className="mt-0.5 text-xs text-[#6b7280]">
                    {data.serverOnline ? 'Online · live simulation' : 'Paused in standby'}
                  </div>
                </div>
                <PillToggle
                  on={data.serverOnline}
                  label="Data server Online or Standby"
                  onClick={() =>
                    void dispatch({
                      type: 'SET_SERVER_ONLINE',
                      enabled: !data.serverOnline,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl bg-[#f8fafc] px-4 py-3.5">
                <div>
                  <div className="text-sm font-semibold text-[#111827]">
                    Auto Routing Agents
                  </div>
                  <div className="mt-0.5 text-xs text-[#6b7280]">
                    {data.agenticRouting ? 'Active across campuses' : 'Manual control'}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary !min-h-0 !rounded-lg !px-2.5 !py-1.5 text-xs"
                    onClick={() => void dispatch({ type: 'RUN_AGENT_CYCLE' })}
                  >
                    <Activity className="h-3.5 w-3.5 text-[#10b981]" />
                    Run Cycle
                  </button>
                  <PillToggle
                    on={data.agenticRouting}
                    label="Auto routing agents On or Off"
                    onClick={() =>
                      void dispatch({
                        type: 'SET_AGENTIC_ROUTING',
                        enabled: !data.agenticRouting,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Overview Row: Power by Building + 3D Map Card */}
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="card min-w-0 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Power by Building</h2>
              <div className="flex items-center gap-4 text-xs text-[#6b7280]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
                  Within Limit
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
                  Over Limit
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                  Capacity
                </span>
              </div>
            </div>

            <div className="mt-4 w-full" style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart
                  data={campusBars}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  barGap={6}
                  barCategoryGap="24%"
                >
                  <CartesianGrid
                    stroke="#f1f5f9"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="shortName"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 11.5 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(15, 23, 42, 0.03)' }}
                    content={<CampusLoadTooltip />}
                  />
                  <Bar
                    dataKey="capKw"
                    name="Capacity"
                    fill="#e2e8f0"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="currentKw"
                    name="Current Load"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  >
                    {campusBars.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={
                          !entry.online
                            ? '#cbd5e1'
                            : entry.breaching
                              ? '#ef4444'
                              : '#10b981'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card flex min-w-0 flex-col justify-between lg:col-span-4">
            <div>
              <h2 className="section-title">3D Grenoble Map</h2>
              <p className="mt-1 text-xs text-[#6b7280]">
                Explore buildings, rooftop solar, parked EVs, and live power relays.
              </p>

              <div className="mt-4">
                <div className="mb-1.5 text-xs font-medium text-[#6b7280]">View Style</div>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#f1f5f9] p-1">
                  {(['realistic', 'wireframe'] as MapMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        mapMode === m
                          ? 'bg-white font-semibold text-[#111827] shadow-sm'
                          : 'text-[#6b7280] hover:text-[#111827]'
                      }`}
                      onClick={() => setMapMode(m)}
                    >
                      {m === 'realistic' ? 'Realistic' : 'Blueprint'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[#f8fafc] p-3">
                <div>
                  <div className="text-[11px] text-[#6b7280]">Vehicles Ready</div>
                  <div className="metric mt-0.5 text-lg text-[#10b981]">
                    {Math.round(data.totals.readyPct)}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#6b7280]">Parked EVs</div>
                  <div className="metric mt-0.5 text-lg text-[#111827]">
                    {fmt(data.totals.evsConnected)}
                    <span className="ml-1 text-xs font-normal text-[#6b7280]">
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
                Open 3D Map
                <ExternalLink className="h-3.5 w-3.5 opacity-80" />
              </a>
              <Link
                to={`/hq?room=${encodeURIComponent(room)}`}
                className="flex items-center justify-center gap-1.5 py-1 text-xs font-medium text-[#6b7280] no-underline transition-colors hover:text-[#111827] hover:no-underline"
              >
                Open Portfolio Analytics
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Campus Switchboard Grid */}
        <section>
          <div className="mb-3.5 flex items-center justify-between gap-2">
            <h2 className="section-title">Buildings</h2>
            <span className="text-xs text-[#6b7280]">
              Toggle building power &amp; inspect individual dashboards
            </span>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.sites.map((site) => {
              const effectiveOn = site.online && data.serverOnline;
              const status = siteStatus(site);
              const isBreach =
                effectiveOn && (site.breaching || site.currentKw > site.capKw);
              const rawPct = site.capKw > 0 ? Math.round((site.currentKw / site.capKw) * 100) : 0;
              const gridPct = Math.min(100, rawPct);

              return (
                <article
                  key={site.id}
                  className={`card flex min-w-0 flex-col justify-between transition-opacity ${
                    effectiveOn ? '' : 'opacity-70'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: status.hex }}
                          />
                          <h3 className="truncate text-[16px] font-semibold text-[#111827]">
                            {site.name}
                          </h3>
                        </div>
                        <div className="mt-0.5 pl-[18px] text-xs text-[#6b7280]">
                          {site.role} · {status.label}
                        </div>
                      </div>
                      <PillToggle
                        on={site.online}
                        disabled={!data.serverOnline}
                        label={`Power supply for ${site.name}`}
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
                        <div className="mt-5 flex items-baseline justify-between gap-2">
                          <div className="flex items-baseline gap-1.5">
                            <span
                              className={`metric text-2xl ${
                                isBreach ? 'text-[#ef4444]' : 'text-[#111827]'
                              }`}
                            >
                              {fmt(site.currentKw)} kW
                            </span>
                            <span className="text-xs text-[#6b7280]">
                              of {site.capKw} kW
                            </span>
                          </div>
                          <span
                            className={`text-xs font-medium tabular-nums ${
                              isBreach ? 'font-semibold text-[#ef4444]' : 'text-[#6b7280]'
                            }`}
                          >
                            {rawPct}%
                          </span>
                        </div>

                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${gridPct}%`,
                              backgroundColor: isBreach ? '#ef4444' : '#10b981',
                            }}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6b7280] tabular-nums">
                          <span>
                            {fmt(site.solarKwh)} kWh rooftop solar · {site.activeBays}/{site.totalBays} bays charging
                          </span>
                          {site.sellToGrid && site.currentExportKw > 0 ? (
                            <span className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-700">
                              Selling +{fmt(site.currentExportKw)} kW
                            </span>
                          ) : null}
                        </div>

                        {site.unreadNotifications > 0 ? (
                          <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            <span>
                              Power shift ready to review ({site.unreadNotifications})
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="mt-5 rounded-xl bg-[#f8fafc] px-3 py-4 text-center text-xs font-medium text-[#6b7280]">
                        Power isolated · 0 kW
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                    {effectiveOn ? (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            className="btn btn-secondary !min-h-0 !rounded-lg !px-2.5 !py-1.5 text-xs"
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
                            <Cpu className="h-3.5 w-3.5 text-[#4f46e5]" />
                            {site.isControl
                              ? site.aiEnabled
                                ? 'Disable AI'
                                : 'Enable AI'
                              : 'Run Agent'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary !min-h-0 !rounded-lg !px-2.5 !py-1.5 text-xs"
                            onClick={() =>
                              void dispatch({ type: 'SITE_OPTIMIZE', siteId: site.id })
                            }
                          >
                            <Zap className="h-3.5 w-3.5 text-[#10b981]" />
                            Optimize
                          </button>
                          <button
                            type="button"
                            className={`btn !min-h-0 !rounded-lg !px-2.5 !py-1.5 text-xs ${
                              site.sellToGrid
                                ? '!border-teal-500/40 !bg-teal-50 font-semibold !text-teal-700 hover:!bg-teal-100'
                                : 'btn-secondary'
                            }`}
                            onClick={() =>
                              void dispatch({
                                type: 'SITE_SET_SELL_TO_GRID',
                                siteId: site.id,
                                enabled: !site.sellToGrid,
                              })
                            }
                          >
                            {site.sellToGrid
                              ? `Selling +${fmt(site.currentExportKw)} kW`
                              : 'Sell to Grid'}
                          </button>
                        </div>
                        <a
                          href={`/sites/${site.id}?room=${encodeURIComponent(room)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#111827] no-underline hover:text-[#2563eb] hover:no-underline"
                        >
                          Open Dashboard
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </>
                    ) : (
                      <span className="text-xs text-[#9ca3af]">
                        Turn power switch on to open dashboard
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Recent Activity */}
        <section className="card min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Recent Grid Activity</h2>
            <span className="text-xs text-[#6b7280]">{feed.length} events</span>
          </div>
          <div className="mt-3 max-h-72 overflow-x-auto overflow-y-auto rounded-xl border border-slate-100">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Building</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {feed.map((item) => (
                  <tr key={item.key}>
                    <td className="tnum whitespace-nowrap text-[#6b7280]">
                      {item.at.includes('T') ? item.at.slice(11, 16) : item.at}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={`tag ${item.isAgent ? 'tag-agent' : ''}`}>
                        {item.source}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-xs font-medium text-[#2563eb]">
                      {item.campus}
                    </td>
                    <td className="min-w-[260px] text-[#374151]">{item.decision}</td>
                  </tr>
                ))}
                {feed.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-[#6b7280]">
                      No recent grid events yet.
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
