import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  ExternalLink,
  Map as MapIcon,
  Power,
  RotateCcw,
  ServerOff,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SITES, SITE_BY_ID } from '../engine';
import type {
  AgentSeverity,
  PlanStatus,
  PriorityLevel,
  PriorityMode,
  SiteId,
  VehicleSession,
} from '../engine';
import { AppShell } from '../components/AppShell';
import { DemoGuideDrawer } from '../components/DemoGuideDrawer';
import { ForecastChart } from '../components/ForecastChart';
import { Pilot30DayChart } from '../components/Pilot30DayChart';
import { useHqSync, useRoomName, useSiteSync } from '../sync/useNeighborhoodSync';

type TabId = 1 | 2 | 3 | 4 | 5;
type TableMode = 'rep' | 'all';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 1, label: '01 Day-Ahead Forecast' },
  { id: 2, label: '02 Before vs Optimized' },
  { id: 3, label: '03 Manager Control' },
  { id: 4, label: '04 30-Day Pilot & MLOps' },
  { id: 5, label: '05 Governance & Policy' },
];

const PRIORITY_MODES: Array<{ id: PriorityMode; label: string }> = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'high', label: 'High-priority first' },
  { id: 'fair', label: 'Fair share' },
];

const PRIORITIES: PriorityLevel[] = ['Urgent', 'High', 'Normal', 'Low'];

const LADDER = [
  { level: 1, name: 'Observe', detail: 'Forecast only. No schedule is written to the site.' },
  { level: 2, name: 'Suggest', detail: 'AI plan is visible; the site stays on its baseline.' },
  { level: 3, name: 'Approve', detail: 'AI proposes, the manager approves or modifies. Current mode.' },
  { level: 4, name: 'Supervise', detail: 'Auto-apply inside guardrails; manager monitors exceptions.' },
  { level: 5, name: 'Autonomy', detail: 'Fleet-wide market participation. Explicitly out of scope.' },
];

const GAS_ROWS = [
  ['Goal', 'Cut peak demand and energy cost while every vehicle reaches its departure target.'],
  ['Agent', 'Deterministic optimizer proposes; the human manager keeps the L3 approval pen.'],
  ['State', 'Forecast, site ceiling, min charge, priority policy, overrides, urgent flags and audit log.'],
  ['Guardrail', '22 kW per charger · site cap · 3.7 kW fail-safe · GDPR aggregate boundary.'],
];

const GUARDRAILS = [
  {
    name: 'EU AI Act',
    detail: 'Human oversight, transparency and logged decisions for a high-impact energy workflow.',
  },
  {
    name: 'GDPR',
    detail: 'HQ receives aggregates only. No names, attendance records or trip destinations cross the boundary.',
  },
  {
    name: 'CSE',
    detail: 'Works-council consultation before scaling. No individual performance monitoring.',
  },
  {
    name: 'ISO 42001',
    detail: 'AI management system with owners, change control, monitoring and an immutable audit trail.',
  },
];

const STAKEHOLDERS = [
  ['Facilities', 'Owns the site ceiling, fail-safe and escalation runbook.', '"Charged on time" not "Charged now"'],
  ['Employees', 'Opt in, see the reason for the window, keep an urgent override.', 'No surprise, no surveillance'],
  ['DSO / grid', 'Predictable site peaks and a measurable demand response.', 'Capacity released, not shifted blindly'],
  ['Works council', 'Aggregate telemetry, no individual attendance data.', 'Consultation before scale'],
  ['IT security', 'Room-scoped Durable Object, sanitized room names, audit log.', 'Local-first, reversible, no shadow SaaS'],
];

function KpiCell({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'accent' | 'solar' | 'danger' | 'building';
}) {
  const toneClass =
    tone === 'accent'
      ? 'text-[#0f766e]'
      : tone === 'solar'
        ? 'text-[#b45309]'
        : tone === 'danger'
          ? 'text-[#dc2626]'
          : tone === 'building'
            ? 'text-[#1d4ed8]'
            : 'text-[#141413]';

  return (
    <div className="p-4">
      <div className="label">{label}</div>
      <div className={`metric mt-1.5 text-xl ${toneClass}`}>{value}</div>
      {sub ? (
        <div className="mt-1 text-[11px] leading-snug text-[#57564f]">{sub}</div>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-3 py-2">
      <div className="label">{label}</div>
      <div className="tnum mt-1 text-xs font-semibold text-[#141413]">{value}</div>
    </div>
  );
}

function MiniChartTooltip({
  active,
  payload,
  unit,
  color,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { slot: string } }>;
  unit: string;
  color: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  if (!item?.payload) return null;

  return (
    <div className="rounded-md border border-[#d6d3cb] bg-white px-2.5 py-1 font-mono text-[10.5px] text-[#141413] shadow-lg">
      <span className="text-[#86847b]">{item.payload.slot}</span>
      <span className="mx-1.5 text-[#cfccc3]">·</span>
      <span className="font-semibold" style={{ color }}>
        {typeof item.value === 'number'
          ? item.value.toFixed(unit === 'kW' ? 1 : 0)
          : item.value}{' '}
        {unit}
      </span>
    </div>
  );
}

function MiniSolarChart({
  slots,
  values,
  height = 84,
}: {
  slots: string[];
  values: number[];
  height?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const data = useMemo(
    () => values.map((v, i) => ({ slot: slots[i] ?? `#${i}`, value: v })),
    [slots, values],
  );

  return (
    <div
      className="mt-1.5 w-full rounded-md border border-[#e5e3dc] bg-white px-1 pt-1"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height={height - 6}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={`${uid}-mini-solar`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d97706" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#d97706" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="slot" hide />
          <YAxis hide domain={[0, 'auto']} />
          <Tooltip content={<MiniChartTooltip unit="kW" color="#b45309" />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#d97706"
            strokeWidth={1.75}
            fill={`url(#${uid}-mini-solar)`}
            activeDot={{ r: 3, fill: '#d97706', stroke: '#ffffff', strokeWidth: 1.5 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function MiniChargersChart({
  slots,
  values,
  max,
  height = 84,
}: {
  slots: string[];
  values: number[];
  max: number;
  height?: number;
}) {
  const data = useMemo(
    () => values.map((v, i) => ({ slot: slots[i] ?? `#${i}`, value: v })),
    [slots, values],
  );

  return (
    <div
      className="mt-1.5 w-full rounded-md border border-[#e5e3dc] bg-white px-1 pt-1"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height={height - 6}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
          barCategoryGap="16%"
        >
          <XAxis dataKey="slot" hide />
          <YAxis hide domain={[0, Math.max(1, max)]} />
          <Tooltip
            cursor={{ fill: 'rgba(20, 20, 19, 0.04)' }}
            content={<MiniChartTooltip unit={`/ ${max} bays`} color="#0f766e" />}
          />
          <Bar
            dataKey="value"
            fill="#0f766e"
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function GanttBar({ vehicle }: { vehicle: VehicleSession }) {
  return (
    <div
      className="flex h-3.5 w-full min-w-[180px] gap-px overflow-hidden rounded border border-[#e5e3dc] bg-[#f5f4f0]"
      title={`${vehicle.arr}–${vehicle.dep} · ${vehicle.windowLabel}`}
    >
      {vehicle.allocKw.map((value, index) => {
        const inWindow = index >= vehicle.a && index < vehicle.d;
        return (
          <span
            key={index}
            className="flex-1"
            style={{
              backgroundColor:
                value > 0.01
                  ? '#0f766e'
                  : inWindow
                    ? '#dbeafe'
                    : 'transparent',
              opacity: value > 0.01 ? 0.45 + 0.55 * Math.min(1, value / 22) : 1,
            }}
          />
        );
      })}
    </div>
  );
}

function planTagClass(status: PlanStatus): string {
  if (status === 'APPROVED') return 'tag tag-accent';
  if (status === 'FAILSAFE' || status === 'REJECTED') return 'tag tag-danger';
  if (status === 'PENDING') return 'tag tag-solar';
  if (status === 'MODIFIED') return 'tag tag-building';
  return 'tag';
}

function agentSeverityTag(severity: AgentSeverity): string {
  switch (severity) {
    case 'guardian':
      return 'tag-danger';
    case 'approval':
      return 'tag-solar';
    case 'action':
      return 'tag-agent';
    default:
      return '';
  }
}

export default function SitePage() {
  const params = useParams<{ siteId?: string }>();
  const rawSiteId = params.siteId ?? '';
  const siteId: SiteId = Object.prototype.hasOwnProperty.call(SITE_BY_ID, rawSiteId)
    ? (rawSiteId as SiteId)
    : 'alptech-hq';
  const room = useRoomName();
  const navigate = useNavigate();

  // Aggregate HQ snapshot powers the AppShell sidebar; per-site snapshot stays strictly local.
  const hqSync = useHqSync(room);
  const { data, mode, dispatch } = useSiteSync(siteId, room);
  const { site, sim, state, clock } = data;

  const [tab, setTab] = useState<TabId>(1);
  const [tableMode, setTableMode] = useState<TableMode>('rep');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [showGhost, setShowGhost] = useState(true);
  const [showBands, setShowBands] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [modifyOpen, setModifyOpen] = useState(false);

  const [maxSiteKw, setMaxSiteKw] = useState(data.state.maxSiteKw);
  const [minCharge, setMinCharge] = useState(data.state.minCharge);
  const [priorityMode, setPriorityMode] = useState<PriorityMode>(data.state.priorityMode);

  const [overrideVehicleId, setOverrideVehicleId] = useState('');
  const [overrideWindow, setOverrideWindow] = useState('');
  const [overrideEnergy, setOverrideEnergy] = useState('');
  const [overridePriority, setOverridePriority] = useState<PriorityLevel>('High');
  const [overrideNote, setOverrideNote] = useState('');
  const [urgentVehicleId, setUrgentVehicleId] = useState('');

  const targetPeak = Math.min(site.capKw, state.maxSiteKw || site.capKw);
  const reps = sim.vehicles.filter((vehicle) => vehicle.rep);
  const visibleVehicles = tableMode === 'rep' ? reps : sim.vehicles;
  const selectedVehicle =
    sim.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ??
    sim.vehicles.find((vehicle) => vehicle.rep) ??
    sim.vehicles[0];
  const activeOverride = state.overrides[overrideVehicleId];
  const urgentSelected = state.urgentIds.includes(urgentVehicleId);
  const peakShaved = Math.max(0, sim.baselinePeakKw - sim.optimizedPeakKw);
  const dualYMax =
    Math.ceil(
      (Math.max(targetPeak, ...sim.baselineGrid, ...sim.optimizedGrid) * 1.12) / 50,
    ) * 50;

  const totalPilotSaved = data.pilot30Day.reduce((sum, day) => sum + day.savedEur, 0);
  const annualSaving = Math.round(
    (totalPilotSaved / Math.max(1, data.pilot30Day.length)) * 365,
  );
  const forecastMae = (4.6 + (sim.solarSelfPct % 5) * 0.3).toFixed(1);
  const overrideRate = (
    (Object.keys(state.overrides).length / Math.max(1, site.evsConnected)) *
    100
  ).toFixed(1);
  const chargerAvailability = Math.round(
    ((site.totalBays - sim.current.activeBays) / Math.max(1, site.totalBays)) * 100,
  );

  const tcoRows = useMemo(
    () =>
      SITES.map((entry) => ({
        ...entry,
        annual: Math.round(annualSaving * (entry.capKw / Math.max(1, site.capKw))),
      })),
    [annualSaving, site.capKw],
  );

  useEffect(() => {
    const first = site.fleet.find((vehicle) => vehicle.rep)?.id ?? site.fleet[0]?.id ?? '';
    setSelectedVehicleId(first);
    setOverrideVehicleId(first);
    setUrgentVehicleId(first);
    setTableMode('rep');
    setTab(1);
    setModifyOpen(false);
  }, [site.id]);

  useEffect(() => {
    setMaxSiteKw(data.state.maxSiteKw);
    setMinCharge(data.state.minCharge);
    setPriorityMode(data.state.priorityMode);
  }, [data.state.maxSiteKw, data.state.minCharge, data.state.priorityMode, data.site.id]);

  useEffect(() => {
    setOverrideWindow(activeOverride?.window ?? '');
    setOverrideEnergy(activeOverride?.energyKwh != null ? String(activeOverride.energyKwh) : '');
    setOverridePriority(activeOverride?.priority ?? 'High');
    setOverrideNote(activeOverride?.note ?? '');
  }, [
    overrideVehicleId,
    activeOverride?.window,
    activeOverride?.energyKwh,
    activeOverride?.priority,
    activeOverride?.note,
  ]);

  const applyConstraints = () => {
    void dispatch({
      type: 'SITE_CONSTRAINTS',
      siteId,
      minCharge,
      maxSiteKw,
      priorityMode,
    });
  };

  const saveOverride = () => {
    const energy = Number(overrideEnergy);
    void dispatch({
      type: 'SITE_OVERRIDES',
      siteId,
      vehicleId: overrideVehicleId,
      window: overrideWindow,
      energyKwh:
        overrideEnergy.trim() !== '' && Number.isFinite(energy) ? energy : undefined,
      priority: overridePriority,
      note: overrideNote,
    });
    setModifyOpen(false);
  };

  const toggleUrgent = (vehicleId: string) => {
    void dispatch({
      type: 'SITE_URGENT',
      siteId,
      vehicleId,
      urgent: !state.urgentIds.includes(vehicleId),
    });
  };

  const runStep = (step: number) => {
    setActiveStep(step);
    if (step === 1) {
      navigate(`/?room=${encodeURIComponent(room)}`);
      return;
    }
    if (step === 2) {
      setTab(2);
      void dispatch({ type: 'SET_SCENARIO', scenario: 'unexpected' });
      if (state.aiEnabled) void dispatch({ type: 'SITE_OPTIMIZE', siteId });
      return;
    }
    if (step === 3) {
      setTab(1);
      setSelectedVehicleId(
        site.fleet.find((vehicle) => vehicle.rep)?.id ?? site.fleet[0]?.id ?? '',
      );
      return;
    }
    if (step === 4) {
      setTab(3);
      return;
    }
    if (step === 5) setTab(4);
  };

  const showControlBanner = site.isControl && !state.aiEnabled;
  const unreadNotifications = data.notifications.filter((entry) => !entry.acknowledged);
  const latestUnread = unreadNotifications[unreadNotifications.length - 1];
  const ackNotification = (notificationId: string) => {
    void dispatch({ type: 'ACK_NOTIFICATION', siteId, notificationId });
  };

  return (
    <AppShell
      room={room}
      hqData={hqSync.data}
      syncMode={mode}
      onDispatch={dispatch}
      activeNav="site"
      activeSiteId={siteId}
      title={data.site.name}
      subtitle={`${data.site.role} · /sites/${data.site.id} · Local tenant view`}
      onOpenDemoGuide={() => setDemoOpen(true)}
      headerActions={
        <>
          <span className={planTagClass(state.planStatus)}>
            Plan {state.planStatus}
          </span>
          <button
            type="button"
            className="btn btn-accent"
            disabled={!state.aiEnabled || state.failSafe}
            title={
              !state.aiEnabled
                ? 'Enable Grid-Sense before optimizing'
                : state.failSafe
                  ? 'Clear the edge fail-safe first'
                  : 'Request a day-ahead optimized plan'
            }
            onClick={() => void dispatch({ type: 'SITE_OPTIMIZE', siteId })}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Optimize Tomorrow
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void dispatch({ type: 'SITE_RESET', siteId })}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <a
            href={`/map?room=${encodeURIComponent(room)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary no-underline hover:no-underline"
          >
            <MapIcon className="h-3.5 w-3.5 text-[#57564f]" />
            3D Map
            <ExternalLink className="h-3.5 w-3.5 text-[#86847b]" />
          </a>
        </>
      }
    >
      <div className="space-y-5">
        {/* Targeted Agent Notification Banner (L3 HITL) */}
        {latestUnread ? (
          <section className="rounded-lg border border-[#d97706]/35 bg-[#fffbeb] p-4 text-[#141413]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#b45309]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {latestUnread.requiresApproval
                      ? 'L3 Approval Required'
                      : 'Agent Routing Notice'}
                  </span>
                  <span className="tag tag-agent">{latestUnread.agentName}</span>
                  {unreadNotifications.length > 1 ? (
                    <span className="tag">{unreadNotifications.length} unread</span>
                  ) : null}
                  <span className="font-mono text-[10.5px] text-[#86847b]">
                    {latestUnread.at}
                  </span>
                </div>
                <div className="mt-1.5 text-[13.5px] font-semibold text-[#141413]">
                  {latestUnread.title}
                </div>
                <p className="mt-0.5 max-w-4xl text-[12.5px] leading-relaxed text-[#57564f]">
                  {latestUnread.message}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={() => {
                    if (latestUnread.requiresApproval) {
                      void dispatch({ type: 'SITE_APPROVE', siteId });
                    } else {
                      ackNotification(latestUnread.id);
                    }
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve Routing
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => ackNotification(latestUnread.id)}
                >
                  <X className="h-3.5 w-3.5" />
                  Dismiss
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {/* Standby / Isolated / Matched Control Notices */}
        {!data.serverOnline ? (
          <section className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-4 text-[#141413]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <ServerOff className="mt-0.5 h-4 w-4 shrink-0 text-[#dc2626]" />
                <div>
                  <div className="text-[13px] font-semibold text-[#dc2626]">
                    Backend data server in standby
                  </div>
                  <p className="mt-0.5 max-w-3xl text-[12px] leading-relaxed text-[#57564f]">
                    The simulation clock is parked and live telemetry is frozen. Re-enable the
                    backend data server from the Grid Switchboard to resume streaming.
                  </p>
                </div>
              </div>
              <span className="stamp stamp-danger">Standby</span>
            </div>
          </section>
        ) : null}

        {!data.state.online ? (
          <section className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-4 text-[#141413]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Power className="mt-0.5 h-4 w-4 shrink-0 text-[#dc2626]" />
                <div>
                  <div className="text-[13px] font-semibold text-[#dc2626]">
                    Building supply &amp; routing isolated (0 kW)
                  </div>
                  <p className="mt-0.5 max-w-3xl text-[12px] leading-relaxed text-[#57564f]">
                    {data.site.name} is isolated from the MV feeder. Planning curves remain
                    available below for preview.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() =>
                  void dispatch({
                    type: 'SITE_SET_ONLINE',
                    siteId: data.site.id,
                    enabled: true,
                  })
                }
              >
                <Power className="h-3.5 w-3.5" />
                Re-Energize Supply
              </button>
            </div>
          </section>
        ) : null}

        {showControlBanner ? (
          <section className="rounded-lg border border-[#fde68a] bg-[#fffbeb] p-4 text-[#141413]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-[#b45309]">
                  Matched control site (No AI) · 30-day pilot counterfactual
                </div>
                <p className="mt-0.5 max-w-3xl text-[12px] leading-relaxed text-[#57564f]">
                  Vercors runs the uncoordinated baseline on purpose so the 30-day pilot compares
                  AlpTech HQ against a matched reference campus.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-solar"
                onClick={() => void dispatch({ type: 'SITE_TOGGLE_AI', siteId, enabled: true })}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Enable Grid-Sense
              </button>
            </div>
          </section>
        ) : null}

        {/* Single Hairline KPI Strip (6 columns) */}
        <section className="card overflow-hidden !p-0">
          <div className="grid grid-cols-2 divide-x divide-y divide-[#e5e3dc] md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
            <KpiCell
              label="Predicted Peak"
              value={`${sim.peakKw} kW`}
              sub={`${sim.peakKw <= sim.baselinePeakKw ? '−' : '+'}${Math.abs(
                sim.peakKw - sim.baselinePeakKw,
              )} kW vs ${sim.baselinePeakKw} kW`}
              tone={sim.breaching ? 'danger' : 'default'}
            />
            <KpiCell
              label="Target Cap"
              value={`${targetPeak} kW`}
              sub={
                sim.peakKw > targetPeak
                  ? `Over by ${(sim.peakKw - targetPeak).toFixed(0)} kW`
                  : `${(targetPeak - sim.peakKw).toFixed(0)} kW headroom`
              }
              tone={sim.peakKw > targetPeak ? 'danger' : 'accent'}
            />
            <KpiCell
              label="EVs Connected"
              value={site.evsConnected}
              sub={`${sim.current.activeBays}/${site.totalBays} bays active`}
              tone="building"
            />
            <KpiCell
              label="Solar Available"
              value={`${sim.solarKwh} kWh`}
              sub={`${sim.solarSelfPct}% EV solar share`}
              tone="solar"
            />
            <KpiCell
              label="Vehicles Ready"
              value={`${sim.readyPct}%`}
              sub={`${sim.readyCount}/${site.evsConnected} at target SOC`}
              tone={sim.readyPct === 100 ? 'accent' : 'solar'}
            />
            <KpiCell
              label="Est. Daily Saving"
              value={`€${sim.dailySavingEur.toFixed(1)}`}
              sub="Simulated · peak + energy"
              tone="accent"
            />
          </div>
        </section>

        {/* Swiss Underline Tabs */}
        <nav
          className="flex flex-wrap gap-x-6 gap-y-1 border-b border-[#e5e3dc]"
          aria-label="Site dashboard tabs"
        >
          {TABS.map((entry) => {
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 text-[13px] transition-colors ${
                  active
                    ? 'border-[#141413] font-semibold text-[#141413]'
                    : 'border-transparent font-medium text-[#57564f] hover:text-[#141413]'
                }`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            );
          })}
        </nav>

        <div>
          {/* ══ TAB 1 · Day-Ahead Forecast ══ */}
          {tab === 1 ? (
            <div className="space-y-5">
              <section className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title">Day-Ahead Load &amp; Solar Forecast</h2>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className={`btn !min-h-0 !px-2.5 !py-1 !text-[11.5px] ${
                        showGhost ? 'btn-accent' : 'btn-secondary'
                      }`}
                      onClick={() => setShowGhost((value) => !value)}
                    >
                      Ghost Baseline
                    </button>
                    <button
                      type="button"
                      className={`btn !min-h-0 !px-2.5 !py-1 !text-[11.5px] ${
                        showBands ? 'btn-accent' : 'btn-secondary'
                      }`}
                      onClick={() => setShowBands((value) => !value)}
                    >
                      ±1σ Band
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  <ForecastChart
                    slots={sim.slots}
                    building={sim.building}
                    ev={sim.ev}
                    solar={sim.solar}
                    grid={sim.grid}
                    targetPeak={targetPeak}
                    clockSlot={clock.slot}
                    ghostGrid={showGhost && state.optimized ? sim.baselineGrid : null}
                    showBands={showBands}
                    height={300}
                    interactive
                    onSelectSlot={(slot) => void dispatch({ type: 'SET_CLOCK', slot })}
                  />
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                <section className="card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="section-title">Site Capacity &amp; L3 Approval Gate</h2>
                    <span className={planTagClass(state.planStatus)}>{state.planStatus}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                    <MiniStat label="Site Cap" value={`${site.capKw} kW`} />
                    <MiniStat label="Manager Ceiling" value={`${state.maxSiteKw} kW`} />
                    <MiniStat label="Predicted Peak" value={`${sim.peakKw} kW`} />
                    <MiniStat
                      label="Headroom"
                      value={`${Math.max(0, targetPeak - sim.peakKw).toFixed(0)} kW`}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary !min-h-0 !px-3 !py-1.5 !text-[12px]"
                      disabled={!state.aiEnabled || state.failSafe}
                      onClick={() => void dispatch({ type: 'SITE_OPTIMIZE', siteId })}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-[#0f766e]" />
                      Optimize
                    </button>
                    <button
                      type="button"
                      className="btn btn-accent !min-h-0 !px-3 !py-1.5 !text-[12px]"
                      disabled={!state.optimized || !state.aiEnabled}
                      onClick={() => void dispatch({ type: 'SITE_APPROVE', siteId })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary !min-h-0 !px-3 !py-1.5 !text-[12px]"
                      disabled={!state.optimized}
                      onClick={() => {
                        setTab(3);
                        setModifyOpen(true);
                      }}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Modify
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger !min-h-0 !px-3 !py-1.5 !text-[12px]"
                      disabled={!state.optimized}
                      onClick={() => void dispatch({ type: 'SITE_REJECT', siteId })}
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                  {sim.breaching ? (
                    <p className="mt-3 rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#dc2626]">
                      Active plan breaches the {site.capKw} kW site cap. Reduce the manager ceiling
                      or re-optimize.
                    </p>
                  ) : (
                    <p className="mt-3 text-[12px] text-[#57564f]">
                      {state.optimized
                        ? 'AI plan is loaded. Human approval is required before it becomes the active operating plan.'
                        : 'Site is running its uncoordinated baseline. Optimize to evaluate a coordinated plan.'}
                    </p>
                  )}
                </section>

                <section className="card">
                  <h2 className="section-title">Solar &amp; Charger Utilization</h2>
                  <div className="mt-4 grid gap-3.5">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="label inline-flex items-center gap-1.5">
                          <Sun className="h-3.5 w-3.5 text-[#b45309]" />
                          Solar kW · 06:00–20:00
                        </span>
                        <span className="tnum text-xs font-semibold text-[#b45309]">
                          {sim.solarKwh} kWh
                        </span>
                      </div>
                      <MiniSolarChart slots={sim.slots} values={sim.solar} height={84} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="label inline-flex items-center gap-1.5">
                          <BatteryCharging className="h-3.5 w-3.5 text-[#0f766e]" />
                          Active chargers
                        </span>
                        <span className="tnum text-xs font-semibold text-[#0f766e]">
                          {sim.current.activeBays}/{site.totalBays}
                        </span>
                      </div>
                      <MiniChargersChart
                        slots={sim.slots}
                        values={sim.activeChargers}
                        max={site.totalBays}
                        height={84}
                      />
                    </div>
                  </div>
                </section>
              </div>

              <section className="card" id="explainability">
                <h2 className="section-title">
                  &ldquo;Why am I charging now?&rdquo; · Explainability Inspector
                </h2>
                {selectedVehicle ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                    <div className="inset">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="metric text-lg text-[#141413]">
                          {selectedVehicle.id}
                        </span>
                        <span className="tag">{selectedVehicle.charger}</span>
                        <span className="tag tag-building">{selectedVehicle.prio}</span>
                        {state.urgentIds.includes(selectedVehicle.id) ? (
                          <span className="tag tag-danger">Urgent</span>
                        ) : null}
                        {selectedVehicle.ready ? (
                          <span className="tag tag-accent">Ready</span>
                        ) : (
                          <span className="tag tag-danger">Short</span>
                        )}
                        <select
                          className="select ml-auto !w-auto !py-1"
                          value={selectedVehicle.id}
                          aria-label="Select a session to explain"
                          onChange={(event) => setSelectedVehicleId(event.target.value)}
                        >
                          {sim.vehicles.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicle.id} · {vehicle.charger}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="mt-3 text-[13px] leading-relaxed text-[#141413]">
                        {selectedVehicle.explanation}
                      </p>
                      <div className="mt-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                        <MiniStat label="Window" value={selectedVehicle.windowLabel} />
                        <MiniStat
                          label="Solar Share"
                          value={`${selectedVehicle.solarSharePct}%`}
                        />
                        <MiniStat
                          label="SOC"
                          value={`${selectedVehicle.soc}% → ${selectedVehicle.finalSoc}%`}
                        />
                        <MiniStat
                          label="Energy"
                          value={`${selectedVehicle.deliveredKwh.toFixed(1)} / ${selectedVehicle.needKwh.toFixed(1)} kWh`}
                        />
                      </div>
                    </div>
                    <div className="inset">
                      <div className="label">Allocation kW · 06:00–20:00</div>
                      <div className="mt-2.5 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                        {selectedVehicle.allocKw.map((value, index) =>
                          value > 0.01 ? (
                            <div key={index} className="flex items-center gap-2">
                              <span className="tnum w-10 text-[10.5px] text-[#86847b]">
                                {sim.slots[index]}
                              </span>
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white">
                                <span
                                  className="block h-1.5 rounded-full bg-[#0f766e]"
                                  style={{ width: `${Math.min(100, (value / 22) * 100)}%` }}
                                />
                              </span>
                              <span className="tnum w-10 text-right text-[10.5px] text-[#141413]">
                                {value.toFixed(1)}
                              </span>
                            </div>
                          ) : null,
                        )}
                        {selectedVehicle.allocKw.every((value) => value <= 0.01) ? (
                          <p className="text-xs text-[#86847b]">
                            No allocation in the active plan.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title">Vehicle Schedule</h2>
                  <div className="inline-flex rounded-md bg-[#efeee9] p-0.5">
                    <button
                      type="button"
                      className={`rounded px-2.5 py-1 text-[11.5px] font-medium transition ${
                        tableMode === 'rep'
                          ? 'bg-white font-semibold text-[#141413] shadow-sm'
                          : 'text-[#57564f] hover:text-[#141413]'
                      }`}
                      onClick={() => setTableMode('rep')}
                    >
                      12 Representative
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2.5 py-1 text-[11.5px] font-medium transition ${
                        tableMode === 'all'
                          ? 'bg-white font-semibold text-[#141413] shadow-sm'
                          : 'text-[#57564f] hover:text-[#141413]'
                      }`}
                      onClick={() => setTableMode('all')}
                    >
                      All EVs ({sim.vehicles.length})
                    </button>
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto rounded-md border border-[#e5e3dc]">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Charger</th>
                        <th>Arr / Dep</th>
                        <th>Need</th>
                        <th>SOC</th>
                        <th>Window</th>
                        <th>Solar</th>
                        <th>06:00–20:00</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleVehicles.map((vehicle) => {
                        const urgent = state.urgentIds.includes(vehicle.id);
                        return (
                          <tr
                            key={vehicle.id}
                            className={
                              selectedVehicle?.id === vehicle.id ? 'bg-[#f0fdfa]' : ''
                            }
                          >
                            <td className="whitespace-nowrap">
                              <button
                                type="button"
                                className="font-mono font-semibold text-[#0f766e] hover:underline"
                                onClick={() => setSelectedVehicleId(vehicle.id)}
                              >
                                {vehicle.id}
                              </button>
                              {vehicle.rep ? <span className="tag ml-1.5">Rep</span> : null}
                              {urgent ? (
                                <span className="tag tag-danger ml-1.5">Urgent</span>
                              ) : null}
                            </td>
                            <td className="tnum whitespace-nowrap">{vehicle.charger}</td>
                            <td className="tnum whitespace-nowrap text-[#57564f]">
                              {vehicle.arr}–{vehicle.dep}
                            </td>
                            <td className="tnum whitespace-nowrap">
                              {vehicle.needKwh.toFixed(1)} kWh
                            </td>
                            <td className="tnum whitespace-nowrap">
                              {vehicle.soc}% → {vehicle.finalSoc}%
                            </td>
                            <td className="tnum whitespace-nowrap text-[#57564f]">
                              {vehicle.windowLabel}
                            </td>
                            <td className="tnum whitespace-nowrap font-medium text-[#b45309]">
                              {vehicle.solarSharePct}%
                            </td>
                            <td>
                              <GanttBar vehicle={vehicle} />
                            </td>
                            <td className="whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  className="btn btn-secondary !min-h-0 !px-2 !py-1 !text-[11px]"
                                  onClick={() => {
                                    setSelectedVehicleId(vehicle.id);
                                    document
                                      .getElementById('explainability')
                                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }}
                                >
                                  Why now?
                                </button>
                                <button
                                  type="button"
                                  className={`btn !min-h-0 !px-2 !py-1 !text-[11px] ${
                                    urgent ? 'btn-danger' : 'btn-solar'
                                  }`}
                                  onClick={() => toggleUrgent(vehicle.id)}
                                >
                                  {urgent ? 'Clear' : 'Urgent'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-start gap-2.5 rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#57564f]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1d4ed8]" />
                  <div>
                    <strong className="text-[#141413]">GDPR Tenant Boundary:</strong> Charging
                    information is used only for energy scheduling. No employee names, attendance
                    records or trip destinations are stored. HQ receives aggregates only.
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {/* ══ TAB 2 · Before vs Optimized ══ */}
          {tab === 2 ? (
            <div className="space-y-5">
              <section className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title">Before vs Optimized Comparison</h2>
                  <span className="tag tag-building">Synchronized axes</span>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="inset">
                    <div className="label mb-2">Before · uncoordinated baseline</div>
                    <ForecastChart
                      slots={sim.slots}
                      building={sim.building}
                      ev={sim.baselineEv}
                      solar={sim.solar}
                      grid={sim.baselineGrid}
                      targetPeak={targetPeak}
                      clockSlot={clock.slot}
                      height={260}
                      yMaxFixed={dualYMax}
                    />
                  </div>
                  <div className="inset">
                    <div className="label mb-2">After · AI optimized</div>
                    <ForecastChart
                      slots={sim.slots}
                      building={sim.building}
                      ev={sim.optimizedEv}
                      solar={sim.solar}
                      grid={sim.optimizedGrid}
                      targetPeak={targetPeak}
                      clockSlot={clock.slot}
                      ghostGrid={sim.baselineGrid}
                      showBands
                      height={260}
                      yMaxFixed={dualYMax}
                    />
                  </div>
                </div>
              </section>

              <section className="card border-l-4 border-l-[#0f766e]">
                <div className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#0f766e]">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Recommendation
                </div>
                <p className="mt-1.5 max-w-5xl text-[14px] leading-relaxed text-[#141413]">
                  Shift {sim.shiftedPct}% of EV energy into the midday solar window, cap each
                  charger at 22 kW and hold the site ceiling at {targetPeak} kW. This cuts the
                  predicted peak by {peakShaved} kW while keeping {sim.optimizedReadyPct}% of
                  sessions ready by departure.
                </p>
              </section>

              <section className="card overflow-hidden !p-0">
                <div className="grid grid-cols-2 divide-x divide-y divide-[#e5e3dc] md:grid-cols-4 md:divide-y-0">
                  <KpiCell
                    label="Peak Reduction"
                    value={`${sim.peakReductionPct}%`}
                    sub={`${sim.baselinePeakKw} → ${sim.optimizedPeakKw} kW`}
                    tone="accent"
                  />
                  <KpiCell
                    label="Energy Shifted"
                    value={`${sim.shiftedPct}%`}
                    sub="Into solar window"
                    tone="solar"
                  />
                  <KpiCell
                    label="Charged by Departure"
                    value={`${sim.optimizedReadyPct}%`}
                    sub={
                      sim.optimizedReadyPct === 100
                        ? 'All sessions ready'
                        : 'Readiness shortfall'
                    }
                    tone={sim.optimizedReadyPct === 100 ? 'accent' : 'danger'}
                  />
                  <KpiCell
                    label="Daily Saving"
                    value={`€${sim.dailySavingEur.toFixed(1)}`}
                    sub="Simulated"
                    tone="accent"
                  />
                </div>
              </section>

              <section className="card">
                <h2 className="section-title">Outcome Breakdown</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="inset">
                    <div className="label">Peak Demand Saving</div>
                    <div className="metric mt-1.5 text-xl text-[#0f766e]">
                      €{sim.economics.peakSavingEur.toFixed(1)}
                    </div>
                    <p className="mt-1 text-[11.5px] text-[#57564f]">
                      Avoided €/kW peak charge on the monthly invoice. Simulated.
                    </p>
                  </div>
                  <div className="inset">
                    <div className="label">Energy Arbitrage</div>
                    <div className="metric mt-1.5 text-xl text-[#b45309]">
                      €{sim.economics.energySavingEur.toFixed(1)}
                    </div>
                    <p className="mt-1 text-[11.5px] text-[#57564f]">
                      Solar self-consumption and off-peak shifting. Simulated.
                    </p>
                  </div>
                  <div className="inset">
                    <div className="label">Avoided Grid CapEx</div>
                    <div className="metric mt-1.5 text-xl text-[#1d4ed8]">€55k / site</div>
                    <p className="mt-1 text-[11.5px] text-[#57564f]">
                      Deferred transformer reinforcement. Simulated.
                    </p>
                  </div>
                </div>
              </section>

              <section className="card">
                <h2 className="section-title">Predict → Plan → Human Check</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    [
                      '01 · Predict',
                      'Weather, building load, occupancy and arrival/departure windows produce a 56-slot forecast.',
                    ],
                    [
                      '02 · Plan',
                      'The deterministic solver respects 22 kW per charger, the site ceiling and the 80% departure target.',
                    ],
                    [
                      '03 · Human Check',
                      'The manager approves, modifies or rejects. Every action lands in the immutable audit log.',
                    ],
                  ].map(([stepTitle, detail]) => (
                    <div key={stepTitle} className="inset">
                      <div className="font-mono text-[11px] font-semibold text-[#0f766e]">
                        {stepTitle}
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#57564f]">{detail}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {/* ══ TAB 3 · Manager Control ══ */}
          {tab === 3 ? (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
                <section className="card">
                  <h2 className="section-title">Manager Constraints &amp; Policy</h2>
                  <div className="mt-4 space-y-4">
                    <label className="block">
                      <span className="flex items-center justify-between">
                        <span className="label">Max Site Demand</span>
                        <span className="tnum text-xs font-semibold text-[#0f766e]">
                          {maxSiteKw} kW
                        </span>
                      </span>
                      <input
                        type="range"
                        min={50}
                        max={site.capKw}
                        step={5}
                        value={maxSiteKw}
                        className="mt-1.5 w-full cursor-pointer"
                        style={{ accentColor: '#0f766e' }}
                        onChange={(event) => setMaxSiteKw(Number(event.target.value))}
                      />
                      <span className="mt-1 block text-[11px] text-[#86847b]">
                        Hard ceiling for the optimizer. Physical site cap is {site.capKw} kW.
                      </span>
                    </label>

                    <label className="block">
                      <span className="flex items-center justify-between">
                        <span className="label">Min Vehicle Charge</span>
                        <span className="tnum text-xs font-semibold text-[#b45309]">
                          {minCharge}%
                        </span>
                      </span>
                      <input
                        type="range"
                        min={50}
                        max={100}
                        step={1}
                        value={minCharge}
                        className="mt-1.5 w-full cursor-pointer"
                        style={{ accentColor: '#b45309' }}
                        onChange={(event) => setMinCharge(Number(event.target.value))}
                      />
                      <span className="mt-1 block text-[11px] text-[#86847b]">
                        Minimum departure state of charge for every session.
                      </span>
                    </label>

                    <div>
                      <div className="label">Priority Vehicle Policy</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {PRIORITY_MODES.map((policy) => (
                          <button
                            key={policy.id}
                            type="button"
                            className={`btn !min-h-0 !px-3 !py-1.5 !text-[12px] ${
                              priorityMode === policy.id ? 'btn-accent' : 'btn-secondary'
                            }`}
                            onClick={() => setPriorityMode(policy.id)}
                          >
                            {policy.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button type="button" className="btn btn-accent" onClick={applyConstraints}>
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Apply Constraints
                    </button>

                    <div className="flex flex-wrap gap-2 border-t border-[#e5e3dc] pt-4">
                      <button
                        type="button"
                        className="btn btn-accent !min-h-0 !px-3 !py-1.5 !text-[12px]"
                        disabled={!state.optimized || !state.aiEnabled}
                        onClick={() => void dispatch({ type: 'SITE_APPROVE', siteId })}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary !min-h-0 !px-3 !py-1.5 !text-[12px]"
                        disabled={!state.optimized}
                        onClick={() => setModifyOpen((value) => !value)}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        {modifyOpen ? 'Close Modify' : 'Modify'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger !min-h-0 !px-3 !py-1.5 !text-[12px]"
                        disabled={!state.optimized}
                        onClick={() => void dispatch({ type: 'SITE_REJECT', siteId })}
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                </section>

                <section className="card">
                  <h2 className="section-title">Approval, Urgency &amp; Fail-Safe</h2>
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={planTagClass(state.planStatus)}>{state.planStatus}</span>
                      <span className={`tag ${state.aiEnabled ? 'tag-accent' : ''}`}>
                        AI {state.aiEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                      {state.failSafe ? <span className="tag tag-danger">Fail-Safe</span> : null}
                    </div>

                    <div>
                      <div className="label">Urgent Business Trip</div>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <select
                          className="select !w-auto min-w-[150px]"
                          value={urgentVehicleId}
                          aria-label="Select a vehicle for an urgent trip"
                          onChange={(event) => setUrgentVehicleId(event.target.value)}
                        >
                          {sim.vehicles.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicle.id} · {vehicle.charger}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={`btn !min-h-0 !px-3 !py-1.5 !text-[12px] ${
                            urgentSelected ? 'btn-danger' : 'btn-solar'
                          }`}
                          onClick={() => toggleUrgent(urgentVehicleId)}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {urgentSelected ? 'Clear Urgent' : 'Flag Urgent'}
                        </button>
                      </div>
                      <p className="mt-1.5 text-[11.5px] text-[#57564f]">
                        Urgent flags jump the queue on the next bay while preserving the 22 kW
                        charger limit.
                      </p>
                    </div>

                    <div className="border-t border-[#e5e3dc] pt-4">
                      <div className="label">Cloud Outage Simulation</div>
                      <button
                        type="button"
                        className={`btn mt-2 w-full ${
                          state.failSafe ? 'btn-danger' : 'btn-secondary'
                        }`}
                        onClick={() =>
                          void dispatch({
                            type: 'SITE_FAILSAFE',
                            siteId,
                            enabled: !state.failSafe,
                          })
                        }
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {state.failSafe
                          ? 'Clear Edge Fail-Safe'
                          : 'Engage Edge Fail-Safe (3.7 kW)'}
                      </button>
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#57564f]">
                        {state.failSafe
                          ? 'Every active bay is capped at 3.7 kW. The site keeps charging safely without HQ.'
                          : 'Simulates loss of HQ connectivity: edge controller falls back to a safe 3.7 kW per bay.'}
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              {modifyOpen ? (
                <section className="card border-[#141413]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="section-title">Inline Override Editor</h2>
                    <span className="tag tag-building">SITE_OVERRIDES</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="field">
                      <span className="label">Vehicle</span>
                      <select
                        className="select"
                        value={overrideVehicleId}
                        onChange={(event) => setOverrideVehicleId(event.target.value)}
                      >
                        {sim.vehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.id} · {vehicle.charger}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Priority</span>
                      <select
                        className="select"
                        value={overridePriority}
                        onChange={(event) =>
                          setOverridePriority(event.target.value as PriorityLevel)
                        }
                      >
                        {PRIORITIES.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Charging Window</span>
                      <input
                        className="input"
                        value={overrideWindow}
                        placeholder="e.g. 10:00-14:00"
                        onChange={(event) => setOverrideWindow(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="label">Energy Override kWh</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step={1}
                        value={overrideEnergy}
                        placeholder="default"
                        onChange={(event) => setOverrideEnergy(event.target.value)}
                      />
                    </label>
                  </div>
                  <label className="field mt-3">
                    <span className="label">Manager Note</span>
                    <input
                      className="input"
                      value={overrideNote}
                      placeholder="Reason for the override (logged in audit trail)"
                      onChange={(event) => setOverrideNote(event.target.value)}
                    />
                  </label>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button type="button" className="btn btn-accent" onClick={saveOverride}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Save Override
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setModifyOpen(false)}
                    >
                      Cancel
                    </button>
                    <span className="ml-auto text-[11px] text-[#86847b]">
                      Existing overrides: {Object.keys(state.overrides).length}
                    </span>
                  </div>
                </section>
              ) : null}

              <section className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title">Agent Notification History</h2>
                  <span className="tag tag-agent">
                    {unreadNotifications.length} unread / {data.notifications.length} total
                  </span>
                </div>
                <div className="mt-3 max-h-[360px] overflow-auto rounded-md border border-[#e5e3dc]">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>At</th>
                        <th>Agent</th>
                        <th>Severity</th>
                        <th>Notification</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.notifications].reverse().map((entry) => (
                        <tr key={entry.id}>
                          <td className="tnum whitespace-nowrap text-[#86847b]">{entry.at}</td>
                          <td className="whitespace-nowrap font-medium text-[#3730a3]">
                            {entry.agentName}
                          </td>
                          <td>
                            <span className={`tag ${agentSeverityTag(entry.severity)}`}>
                              {entry.severity}
                            </span>
                          </td>
                          <td className="min-w-[320px]">
                            <span className="font-semibold text-[#141413]">{entry.title}</span>
                            <br />
                            <span className="text-[#57564f]">{entry.message}</span>
                          </td>
                          <td className="whitespace-nowrap">
                            {entry.acknowledged ? (
                              <span className="tag tag-accent">Acknowledged</span>
                            ) : entry.requiresApproval ? (
                              <span className="tag tag-solar">Pending</span>
                            ) : (
                              <span className="tag">Unread</span>
                            )}
                          </td>
                          <td>
                            {entry.acknowledged ? null : (
                              <button
                                type="button"
                                className="btn btn-secondary !min-h-0 !px-2 !py-1 !text-[11px]"
                                onClick={() => ackNotification(entry.id)}
                              >
                                Ack
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {data.notifications.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-[#86847b]">
                            No agent notifications for this campus yet. Switch scenario or run an
                            agent cycle from the Switchboard.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title">Immutable Site Audit Log</h2>
                  <span className="font-mono text-[11px] text-[#86847b]">
                    {data.auditLog.length} entries
                  </span>
                </div>
                <div className="mt-3 max-h-[360px] overflow-auto rounded-md border border-[#e5e3dc]">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Seq</th>
                        <th>At</th>
                        <th>Action</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.auditLog]
                        .reverse()
                        .slice(0, 40)
                        .map((entry) => (
                          <tr key={entry.id}>
                            <td className="tnum text-[#86847b]">
                              {String(entry.seq).padStart(4, '0')}
                            </td>
                            <td className="tnum whitespace-nowrap text-[#57564f]">{entry.at}</td>
                            <td className="whitespace-nowrap font-mono text-[11.5px] font-medium text-[#0f766e]">
                              {entry.action}
                            </td>
                            <td className="min-w-[300px]">{entry.message}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}

          {/* ══ TAB 4 · 30-Day Pilot & Monitoring ══ */}
          {tab === 4 ? (
            <div className="space-y-5">
              <section className="card overflow-hidden !p-0">
                <div className="grid grid-cols-2 divide-x divide-y divide-[#e5e3dc] md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
                  <KpiCell
                    label="Forecast MAE"
                    value={`${forecastMae}%`}
                    sub="Simulated · 30-day rolling"
                    tone="building"
                  />
                  <KpiCell
                    label="Peak Avoided"
                    value={`${peakShaved} kW`}
                    sub={`${sim.baselinePeakKw} → ${sim.optimizedPeakKw} kW`}
                    tone="accent"
                  />
                  <KpiCell
                    label="Override Rate"
                    value={`${overrideRate}%`}
                    sub={`${Object.keys(state.overrides).length} overrides`}
                    tone="solar"
                  />
                  <KpiCell
                    label="Charged by Departure"
                    value={`${sim.readyPct}%`}
                    sub={`${sim.readyCount}/${site.evsConnected} sessions`}
                    tone={sim.readyPct === 100 ? 'accent' : 'danger'}
                  />
                  <KpiCell
                    label="Solar Self-Use"
                    value={`${sim.solarSelfPct}%`}
                    sub={`${sim.solarKwh} kWh available`}
                    tone="solar"
                  />
                  <KpiCell
                    label="Bay Availability"
                    value={`${chargerAvailability}%`}
                    sub={`${sim.current.activeBays}/${site.totalBays} busy now`}
                  />
                </div>
              </section>

              <section className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title">30-Day Pilot · Control vs Pilot Peak</h2>
                  <span className="tag tag-building">vercors-control → alptech-hq</span>
                </div>
                <div className="mt-4">
                  <Pilot30DayChart days={data.pilot30Day} height={270} />
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="card">
                  <h2 className="section-title">3-Layer MLOps Health</h2>
                  <div className="mt-4 space-y-2.5">
                    {[
                      {
                        name: 'Data',
                        status: mode === 'ws' ? 'Healthy' : 'Degraded',
                        detail:
                          mode === 'ws'
                            ? `Live Durable Object stream · synced at ${clock.time}`
                            : 'Local deterministic fallback · localStorage + BroadcastChannel',
                      },
                      {
                        name: 'Model',
                        status: sim.optimizedReadyPct === 100 ? 'Healthy' : 'Watch',
                        detail: `22 kW charger cap · ${targetPeak} kW site ceiling · deterministic solver`,
                      },
                      {
                        name: 'Ops & Cyber',
                        status: 'Healthy',
                        detail: `Room ${data.room} · GDPR aggregate boundary · immutable audit trail`,
                      },
                    ].map((layer) => (
                      <div key={layer.name} className="inset flex flex-wrap items-center gap-2.5">
                        <Activity className="h-3.5 w-3.5 text-[#0f766e]" />
                        <span className="text-[12.5px] font-semibold text-[#141413]">
                          {layer.name}
                        </span>
                        <span
                          className={`tag ${
                            layer.status === 'Healthy' ? 'tag-accent' : 'tag-solar'
                          }`}
                        >
                          {layer.status}
                        </span>
                        <span className="text-[12px] text-[#57564f]">{layer.detail}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="card">
                  <h2 className="section-title">Multi-Site TCO Projection</h2>
                  <div className="mt-4 overflow-x-auto rounded-md border border-[#e5e3dc]">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Site</th>
                          <th>Cap</th>
                          <th>EVs</th>
                          <th>Annual Saving</th>
                          <th>CapEx Avoided</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tcoRows.map((entry) => (
                          <tr key={entry.id}>
                            <td className="whitespace-nowrap font-mono text-[11.5px]">
                              {entry.id}
                            </td>
                            <td className="tnum">{entry.capKw} kW</td>
                            <td className="tnum">{entry.evsConnected}</td>
                            <td className="tnum font-medium text-[#0f766e]">
                              €{entry.annual.toLocaleString()}
                            </td>
                            <td className="tnum">€55k</td>
                          </tr>
                        ))}
                        <tr className="bg-[#faf9f6] font-semibold">
                          <td className="text-[#141413]">Total</td>
                          <td className="tnum">
                            {tcoRows.reduce((sum, entry) => sum + entry.capKw, 0)} kW
                          </td>
                          <td className="tnum">
                            {tcoRows.reduce((sum, entry) => sum + entry.evsConnected, 0)}
                          </td>
                          <td className="tnum text-[#0f766e]">
                            €
                            {tcoRows
                              .reduce((sum, entry) => sum + entry.annual, 0)
                              .toLocaleString()}
                          </td>
                          <td className="tnum">€{tcoRows.length * 55}k</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2.5 text-[11px] text-[#86847b]">
                    Annualised projection from the 30-day pilot. Every financial value is simulated.
                  </p>
                </section>
              </div>
            </div>
          ) : null}

          {/* ══ TAB 5 · Governance & Local Policy ══ */}
          {tab === 5 ? (
            <div className="space-y-5">
              <section className="card">
                <h2 className="section-title">Tenant Isolation Architecture</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    [
                      'Browser Boundary',
                      `Room ${data.room}. localStorage key grid-sense:room:${data.room} and BroadcastChannel grid-sense:${data.room} are strictly room-scoped.`,
                    ],
                    [
                      'Site Boundary',
                      `${site.id} keeps full fleet sessions, allocations and explanations locally. HQ receives only aggregate telemetry and layout.`,
                    ],
                    [
                      'Edge Durable Object',
                      'One Cloudflare Durable Object per room owns authoritative state, WebSocket fan-out and the simulation clock alarm.',
                    ],
                  ].map(([title, detail]) => (
                    <div key={title} className="inset">
                      <div className="text-[12.5px] font-semibold text-[#141413]">{title}</div>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#57564f]">{detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="card">
                  <h2 className="section-title">L3 Autonomy Ladder</h2>
                  <ol className="mt-4 space-y-2">
                    {LADDER.map((level) => (
                      <li
                        key={level.level}
                        className={`flex gap-3 rounded-md border px-3 py-2.5 ${
                          level.level === 3
                            ? 'border-[#0f766e] bg-[#f0fdfa]'
                            : 'border-[#e5e3dc] bg-[#faf9f6]'
                        }`}
                      >
                        <span
                          className={`font-mono text-xs font-semibold ${
                            level.level === 3 ? 'text-[#0f766e]' : 'text-[#86847b]'
                          }`}
                        >
                          L{level.level}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-semibold text-[#141413]">
                            {level.name}
                            {level.level === 3 ? ' · Current Mode' : ''}
                          </span>
                          <span className="block text-[12px] leading-relaxed text-[#57564f]">
                            {level.detail}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="card">
                  <h2 className="section-title">GAS Model Matrix</h2>
                  <div className="mt-4 overflow-x-auto rounded-md border border-[#e5e3dc]">
                    <table className="table">
                      <tbody>
                        {GAS_ROWS.map(([key, value]) => (
                          <tr key={key}>
                            <td className="w-24 whitespace-nowrap font-mono text-[11px] font-semibold text-[#0f766e]">
                              {key}
                            </td>
                            <td className="text-[#57564f]">{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <section className="card">
                <h2 className="section-title">
                  Regulatory Guardrails · EU AI Act · GDPR · CSE · ISO 42001
                </h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {GUARDRAILS.map((guardrail) => (
                    <div key={guardrail.name} className="inset">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-[#0f766e]" />
                        <span className="text-[12.5px] font-semibold text-[#141413]">
                          {guardrail.name}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-[#57564f]">
                        {guardrail.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card">
                <h2 className="section-title">Stakeholder Change Management</h2>
                <div className="mt-4 overflow-x-auto rounded-md border border-[#e5e3dc]">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Stakeholder</th>
                        <th>What Changes</th>
                        <th>Core Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STAKEHOLDERS.map(([stakeholder, change, message]) => (
                        <tr key={stakeholder}>
                          <td className="whitespace-nowrap font-semibold text-[#141413]">
                            {stakeholder}
                          </td>
                          <td className="text-[#57564f]">{change}</td>
                          <td className="font-medium text-[#0f766e]">{message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 rounded-md border border-[#e5e3dc] bg-[#faf9f6] px-3.5 py-2.5 text-[11.5px] text-[#57564f]">
                  Classroom simulation only. No real vehicles, employees, chargers or grid
                  connections are controlled by this prototype.
                </p>
              </section>
            </div>
          ) : null}
        </div>
      </div>

      <DemoGuideDrawer
        open={demoOpen}
        activeStep={activeStep}
        onRunStep={runStep}
        onClose={() => setDemoOpen(false)}
      />
    </AppShell>
  );
}
