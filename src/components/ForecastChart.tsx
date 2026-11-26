import { useId, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface ForecastChartProps {
  slots: string[];
  building: number[];
  ev: number[];
  solar: number[];
  grid: number[];
  targetPeak: number;
  clockSlot?: number;
  ghostGrid?: number[] | null;
  showBands?: boolean;
  height?: number;
  interactive?: boolean;
  yMaxFixed?: number | null;
  onSelectSlot?: (slot: number) => void;
}

interface ForecastPoint {
  index: number;
  slot: string;
  building: number;
  ev: number;
  solar: number;
  grid: number;
  ghost: number | null;
  bandLower: number;
  bandSpan: number;
  bandUpper: number;
}

type SeriesKey = 'building' | 'ev' | 'solar' | 'grid' | 'ghost';

const COLORS = {
  building: '#2563eb',
  ev: '#10b981',
  solar: '#f59e0b',
  grid: '#111827',
  ghost: '#9ca3af',
  target: '#ef4444',
  clock: '#111827',
  gridline: '#f1f5f9',
  axis: '#6b7280',
};

function safe(values: number[], index: number): number {
  const value = values[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 100;
  const steps = [
    100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000,
    1250, 1500, 1750, 2000, 2500,
  ];
  return steps.find((step) => step >= value) ?? Math.ceil(value / 250) * 250;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ForecastPoint }>;
  targetPeak: number;
  hasGhost: boolean;
  showBands: boolean;
}

function ForecastTooltip({
  active,
  payload,
  targetPeak,
  hasGhost,
  showBands,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const delta = point.grid - targetPeak;
  const isBreach = delta > 0.01;
  const shavedKw =
    hasGhost && point.ghost != null ? Math.max(0, point.ghost - point.grid) : null;

  return (
    <div className="min-w-[215px] rounded-lg border border-[#d6d3cb] bg-white px-3.5 py-2.5 text-xs text-[#141413] shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-[#e5e3dc] pb-1.5">
        <span className="font-mono text-[11px] font-semibold text-[#141413]">
          Slot {point.slot}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium ${
            isBreach
              ? 'border-[#fecaca] bg-[#fef2f2] text-[#dc2626]'
              : 'border-[#ccfbf1] bg-[#f0fdfa] text-[#0f766e]'
          }`}
        >
          {isBreach ? 'Breach' : 'Within cap'}
        </span>
      </div>

      <div className="space-y-1 font-mono text-[11px] tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[#57564f]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: COLORS.building }}
            />
            Building
          </span>
          <span className="font-medium text-[#141413]">
            {point.building.toFixed(1)} kW
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[#57564f]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: COLORS.ev }}
            />
            EV Charging
          </span>
          <span className="font-medium text-[#0f766e]">
            {point.ev.toFixed(1)} kW
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[#57564f]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: COLORS.solar }}
            />
            Solar PV
          </span>
          <span className="font-medium text-[#b45309]">
            {point.solar.toFixed(1)} kW
          </span>
        </div>

        <div className="my-1.5 border-t border-[#e5e3dc] pt-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-semibold text-[#141413]">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: COLORS.grid }}
              />
              Grid Total
            </span>
            <span
              className="font-semibold"
              style={{ color: isBreach ? COLORS.target : COLORS.grid }}
            >
              {point.grid.toFixed(1)} kW
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between gap-4">
            <span className="text-[#57564f]">
              {isBreach ? 'Breach vs cap' : 'Headroom vs cap'}
            </span>
            <span
              className={`font-semibold ${
                isBreach ? 'text-[#dc2626]' : 'text-[#0f766e]'
              }`}
            >
              {isBreach
                ? `+${delta.toFixed(1)} kW`
                : `${Math.abs(delta).toFixed(1)} kW`}
            </span>
          </div>

          {shavedKw != null ? (
            <div className="mt-1 flex items-center justify-between gap-4">
              <span className="text-[#57564f]">Shaved vs baseline</span>
              <span className="font-semibold text-[#0f766e]">
                {shavedKw.toFixed(1)} kW
              </span>
            </div>
          ) : null}

          {showBands ? (
            <div className="mt-1 flex items-center justify-between gap-4 text-[10px] text-[#86847b]">
              <span>±1σ band</span>
              <span>
                {point.bandLower.toFixed(0)}–{point.bandUpper.toFixed(0)} kW
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ChartClickState {
  activeTooltipIndex?: number;
  activeLabel?: string | number;
}

export function ForecastChart({
  slots,
  building,
  ev,
  solar,
  grid,
  targetPeak,
  clockSlot,
  ghostGrid = null,
  showBands = false,
  height = 280,
  interactive = true,
  yMaxFixed = null,
  onSelectSlot,
}: ForecastChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    building: true,
    ev: true,
    solar: true,
    grid: true,
    ghost: true,
  });

  const toggleSeries = (key: SeriesKey) => {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const count = Math.max(1, slots.length);
  const chartHeight = Math.max(180, height);

  const data = useMemo<ForecastPoint[]>(() => {
    const rows: ForecastPoint[] = [];
    for (let i = 0; i < count; i += 1) {
      const b = safe(building, i);
      const e = safe(ev, i);
      const s = safe(solar, i);
      const g = safe(grid, i);
      const gh = ghostGrid ? safe(ghostGrid, i) : null;
      const sigma = Math.max(6, (b + e) * 0.055);
      const bandLower = Math.max(0, g - sigma);
      const bandUpper = g + sigma;
      rows.push({
        index: i,
        slot: slots[i] ?? `#${i}`,
        building: b,
        ev: e,
        solar: s,
        grid: g,
        ghost: gh,
        bandLower,
        bandSpan: Math.max(0, bandUpper - bandLower),
        bandUpper,
      });
    }
    return rows;
  }, [building, count, ev, ghostGrid, grid, slots, solar]);

  const { yMax, peakValue, peakSlot, maxShavedKw } = useMemo(() => {
    let maxVal = Math.max(0, targetPeak);
    let bestPeak = -Infinity;
    let bestSlot = slots[0] ?? '';
    let bestShaved = 0;

    for (const row of data) {
      maxVal = Math.max(
        maxVal,
        row.building,
        row.ev,
        row.solar,
        row.grid,
        row.ghost ?? 0,
        showBands ? row.bandUpper : 0,
      );
      if (row.grid > bestPeak) {
        bestPeak = row.grid;
        bestSlot = row.slot;
      }
      if (row.ghost != null) {
        bestShaved = Math.max(bestShaved, row.ghost - row.grid);
      }
    }

    return {
      yMax: Math.max(50, yMaxFixed ?? niceMax(maxVal * 1.12)),
      peakValue: Number.isFinite(bestPeak) ? bestPeak : 0,
      peakSlot: bestSlot,
      maxShavedKw: Math.max(0, bestShaved),
    };
  }, [data, showBands, slots, targetPeak, yMaxFixed]);

  const xTicks = useMemo(() => {
    const ticks: string[] = [];
    for (let i = 0; i < count; i += 8) {
      const label = slots[i];
      if (label != null) ticks.push(label);
    }
    return ticks;
  }, [count, slots]);

  const clockIndex =
    clockSlot == null ? null : clamp(Math.round(clockSlot), 0, Math.max(0, count - 1));
  const clockLabel = clockIndex != null ? slots[clockIndex] : undefined;

  const isPeakBreach = peakValue > targetPeak + 0.01;

  const handleChartClick = (state: ChartClickState | null) => {
    if (!interactive || !onSelectSlot || !state) return;
    if (
      typeof state.activeTooltipIndex === 'number' &&
      state.activeTooltipIndex >= 0 &&
      state.activeTooltipIndex < count
    ) {
      onSelectSlot(state.activeTooltipIndex);
      return;
    }
    if (state.activeLabel != null) {
      const idx = slots.indexOf(String(state.activeLabel));
      if (idx >= 0) onSelectSlot(idx);
    }
  };

  const legendItems: Array<{
    key: SeriesKey;
    label: string;
    color: string;
    dashed?: boolean;
  }> = [
    { key: 'building', label: 'Building', color: COLORS.building },
    { key: 'ev', label: 'EV', color: COLORS.ev },
    { key: 'solar', label: 'Solar PV', color: COLORS.solar },
    { key: 'grid', label: 'Grid Total', color: COLORS.grid },
    ...(ghostGrid
      ? [
          {
            key: 'ghost' as const,
            label: 'Ghost Baseline',
            color: COLORS.ghost,
            dashed: true,
          },
        ]
      : []),
  ];

  return (
    <div className="w-full">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {legendItems.map((item) => {
            const active = visible[item.key];
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSeries(item.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-sans text-[11px] font-medium transition ${
                  active
                    ? 'border-[#e5e3dc] bg-white text-[#141413] hover:border-[#cfccc3]'
                    : 'border-transparent bg-transparent text-[#86847b] line-through hover:text-[#57564f]'
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block h-[2px] w-3 rounded-full"
                  style={{
                    backgroundColor: item.dashed ? 'transparent' : item.color,
                    borderTop: item.dashed ? `2px dashed ${item.color}` : undefined,
                    opacity: active ? 1 : 0.4,
                  }}
                />
                {item.label}
              </button>
            );
          })}
          {showBands ? (
            <span className="tag tag-building">±1σ Band</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] tabular-nums">
          <span className={`tag ${isPeakBreach ? 'tag-danger' : 'tag-accent'}`}>
            Peak {Math.round(peakValue)} kW · {peakSlot}
          </span>
          <span className="tag">Cap {Math.round(targetPeak)} kW</span>
          {ghostGrid && maxShavedKw > 0.5 ? (
            <span className="tag tag-accent">
              Shaved {Math.round(maxShavedKw)} kW
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="w-full overflow-hidden rounded-lg border border-[#e5e3dc] bg-white pt-2"
        role="img"
        aria-label={`Day-ahead forecast chart. Peak ${Math.round(peakValue)} kilowatts, target peak ${Math.round(targetPeak)} kilowatts.`}
        style={{ cursor: interactive && onSelectSlot ? 'crosshair' : 'default' }}
      >
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart
            data={data}
            margin={{ top: 18, right: 16, left: 0, bottom: 4 }}
            onClick={interactive ? handleChartClick : undefined}
          >
            <defs>
              <linearGradient id={`${uid}-building`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.building} stopOpacity={0.14} />
                <stop offset="95%" stopColor={COLORS.building} stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id={`${uid}-ev`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.ev} stopOpacity={0.18} />
                <stop offset="95%" stopColor={COLORS.ev} stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id={`${uid}-solar`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.solar} stopOpacity={0.16} />
                <stop offset="95%" stopColor={COLORS.solar} stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id={`${uid}-band`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.building} stopOpacity={0.13} />
                <stop offset="100%" stopColor={COLORS.building} stopOpacity={0.04} />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke={COLORS.gridline}
              strokeDasharray="3 3"
              vertical={false}
            />

            <XAxis
              dataKey="slot"
              ticks={xTicks}
              tick={{
                fill: COLORS.axis,
                fontSize: 11,
                fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
              }}
              axisLine={{ stroke: '#e5e3dc' }}
              tickLine={false}
              minTickGap={24}
            />

            <YAxis
              domain={[0, yMax]}
              width={48}
              tick={{
                fill: COLORS.axis,
                fontSize: 11,
                fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
              }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${Math.round(v)}`}
            />

            {interactive ? (
              <Tooltip
                cursor={{
                  stroke: '#86847b',
                  strokeWidth: 1,
                  strokeDasharray: '4 4',
                }}
                content={
                  <ForecastTooltip
                    targetPeak={targetPeak}
                    hasGhost={Boolean(ghostGrid)}
                    showBands={showBands}
                  />
                }
              />
            ) : null}

            {showBands ? (
              <>
                <Area
                  type="monotone"
                  dataKey="bandLower"
                  stackId="sigma"
                  stroke="none"
                  fill="transparent"
                  fillOpacity={0}
                  activeDot={false}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="bandSpan"
                  stackId="sigma"
                  stroke="rgba(37, 99, 235, 0.25)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  fill={`url(#${uid}-band)`}
                  fillOpacity={1}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </>
            ) : null}

            {visible.building ? (
              <Area
                type="monotone"
                dataKey="building"
                name="Building"
                stroke={COLORS.building}
                strokeWidth={1.6}
                fill={`url(#${uid}-building)`}
                activeDot={{ r: 3.5, fill: COLORS.building, stroke: '#ffffff', strokeWidth: 1.5 }}
                isAnimationActive={false}
              />
            ) : null}

            {visible.solar ? (
              <Area
                type="monotone"
                dataKey="solar"
                name="Solar PV"
                stroke={COLORS.solar}
                strokeWidth={1.6}
                fill={`url(#${uid}-solar)`}
                activeDot={{ r: 3.5, fill: COLORS.solar, stroke: '#ffffff', strokeWidth: 1.5 }}
                isAnimationActive={false}
              />
            ) : null}

            {visible.ev ? (
              <Area
                type="monotone"
                dataKey="ev"
                name="EV"
                stroke={COLORS.ev}
                strokeWidth={1.85}
                fill={`url(#${uid}-ev)`}
                activeDot={{ r: 3.5, fill: COLORS.ev, stroke: '#ffffff', strokeWidth: 1.5 }}
                isAnimationActive={false}
              />
            ) : null}

            {ghostGrid && visible.ghost ? (
              <Line
                type="monotone"
                dataKey="ghost"
                name="Ghost Baseline"
                stroke={COLORS.ghost}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 3, fill: COLORS.ghost, stroke: '#ffffff', strokeWidth: 1 }}
                isAnimationActive={false}
              />
            ) : null}

            {visible.grid ? (
              <Line
                type="monotone"
                dataKey="grid"
                name="Grid Total"
                stroke={COLORS.grid}
                strokeWidth={2.25}
                dot={false}
                activeDot={{ r: 4.5, fill: COLORS.grid, stroke: '#ffffff', strokeWidth: 1.5 }}
                isAnimationActive={false}
              />
            ) : null}

            <ReferenceLine
              y={targetPeak}
              stroke={COLORS.target}
              strokeWidth={1.3}
              strokeDasharray="6 4"
              strokeOpacity={0.9}
              label={{
                value: `CAP ${Math.round(targetPeak)} kW`,
                position: 'insideTopRight',
                fill: COLORS.target,
                fontSize: 10.5,
                fontWeight: 600,
                fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
              }}
            />

            {clockLabel ? (
              <ReferenceLine
                x={clockLabel}
                stroke={COLORS.clock}
                strokeWidth={1.4}
                strokeOpacity={0.85}
                label={{
                  value: `NOW ${clockLabel}`,
                  position: 'top',
                  fill: COLORS.clock,
                  fontSize: 10.5,
                  fontWeight: 600,
                  fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
                }}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10.5px] text-[#86847b]">
        <span>
          {interactive && onSelectSlot
            ? 'Hover for slot telemetry · click any slot to jump simulation clock'
            : 'kW · 06:00–20:00 · 15-min intervals'}
        </span>
        <span>
          Status:{' '}
          <strong className={isPeakBreach ? 'text-[#dc2626]' : 'text-[#0f766e]'}>
            {isPeakBreach ? 'Cap breach' : 'Within cap'}
          </strong>
        </span>
      </div>
    </div>
  );
}
