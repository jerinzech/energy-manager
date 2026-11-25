import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PilotDay } from '../engine';

export interface Pilot30DayChartProps {
  days: PilotDay[];
  height?: number;
}

const COLORS = {
  controlSafe: '#cbd5e1',
  controlBreach: '#dc2626',
  pilot: '#0f766e',
  cap: '#141413',
  gridline: '#eceae4',
  axis: '#86847b',
};

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 100;
  const steps = [
    100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800, 900, 1000,
    1250, 1500,
  ];
  return steps.find((step) => step >= value) ?? Math.ceil(value / 250) * 250;
}

interface PilotTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: PilotDay }>;
  capKw: number;
}

function PilotTooltip({ active, payload, capKw }: PilotTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const day = payload[0]?.payload;
  if (!day) return null;

  const shavedKw = Math.max(0, day.controlPeak - day.pilotPeak);
  const controlBreach = day.controlPeak > capKw;

  return (
    <div className="min-w-[205px] rounded-lg border border-[#d6d3cb] bg-white px-3.5 py-2.5 text-xs text-[#141413] shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-[#e5e3dc] pb-1.5">
        <span className="font-mono text-[11px] font-semibold text-[#141413]">
          {day.label}
        </span>
        <span className="rounded-full border border-[#e5e3dc] bg-[#efeee9] px-2 py-0.5 font-mono text-[10px] font-medium text-[#57564f]">
          {day.type}
        </span>
      </div>

      <div className="space-y-1 font-mono text-[11px] tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[#57564f]">
            <span
              className="h-2 w-2 rounded-sm"
              style={{
                backgroundColor: controlBreach
                  ? COLORS.controlBreach
                  : COLORS.controlSafe,
              }}
            />
            Control Peak
          </span>
          <span
            className={`font-semibold ${
              controlBreach ? 'text-[#dc2626]' : 'text-[#57564f]'
            }`}
          >
            {day.controlPeak} kW
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[#57564f]">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: COLORS.pilot }}
            />
            Pilot AI Peak
          </span>
          <span className="font-semibold text-[#0f766e]">{day.pilotPeak} kW</span>
        </div>

        <div className="my-1.5 border-t border-[#e5e3dc] pt-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#57564f]">Shaved kW</span>
            <span className="font-semibold text-[#0f766e]">{shavedKw} kW</span>
          </div>

          <div className="mt-1 flex items-center justify-between gap-4">
            <span className="text-[#57564f]">Saved EUR</span>
            <span className="font-semibold text-[#b45309]">€{day.savedEur}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Pilot30DayChart({ days, height = 250 }: Pilot30DayChartProps) {
  const chartHeight = Math.max(180, height);
  const count = days.length;
  const capKw = days[0]?.capKw ?? 0;

  const { yMax, totalSaved, averageShaved, breachDaysAvoided, controlBreachDays } =
    useMemo(() => {
      let maxVal = Math.max(0, capKw);
      let savedSum = 0;
      let shavedSum = 0;
      let controlBreaches = 0;
      let avoided = 0;

      for (const day of days) {
        maxVal = Math.max(maxVal, day.controlPeak, day.pilotPeak);
        savedSum += day.savedEur;
        shavedSum += Math.max(0, day.controlPeak - day.pilotPeak);
        const dayCap = day.capKw ?? capKw;
        if (day.controlPeak > dayCap) {
          controlBreaches += 1;
          if (day.pilotPeak <= dayCap) {
            avoided += 1;
          }
        }
      }

      return {
        yMax: niceMax(maxVal * 1.12),
        totalSaved: Math.round(savedSum),
        averageShaved: Math.round(shavedSum / Math.max(1, count)),
        breachDaysAvoided: avoided,
        controlBreachDays: controlBreaches,
      };
    }, [capKw, count, days]);

  const xTicks = useMemo(
    () => days.filter((_, index) => index % 5 === 0).map((d) => d.label),
    [days],
  );

  return (
    <div className="w-full">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tag tag-solar">
            Total Saved €{totalSaved.toLocaleString()}
          </span>
          <span className="tag tag-accent">Avg Shaved {averageShaved} kW</span>
          <span className="tag tag-building">
            Breach Days Avoided {breachDaysAvoided}
            {controlBreachDays > 0 ? `/${controlBreachDays}` : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-sans text-[11px] font-medium text-[#57564f]">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={{ backgroundColor: COLORS.controlSafe }}
            />
            Control ≤ cap
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={{ backgroundColor: COLORS.controlBreach }}
            />
            Control &gt; cap
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={{ backgroundColor: COLORS.pilot }}
            />
            Pilot AI
          </span>
        </div>
      </div>

      <div
        className="w-full overflow-hidden rounded-lg border border-[#e5e3dc] bg-white pt-2"
        role="img"
        aria-label={`30-day pilot chart. Control site versus pilot AI site. Cap ${capKw} kilowatts.`}
      >
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart
            data={days}
            margin={{ top: 16, right: 16, left: 0, bottom: 4 }}
            barGap={1}
            barCategoryGap="18%"
          >
            <CartesianGrid
              stroke={COLORS.gridline}
              strokeDasharray="3 3"
              vertical={false}
            />

            <XAxis
              dataKey="label"
              ticks={xTicks}
              tick={{
                fill: COLORS.axis,
                fontSize: 11,
                fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
              }}
              axisLine={{ stroke: '#e5e3dc' }}
              tickLine={false}
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

            <Tooltip
              cursor={{ fill: 'rgba(20, 20, 19, 0.04)' }}
              content={<PilotTooltip capKw={capKw} />}
            />

            <Bar
              dataKey="controlPeak"
              name="Control Peak"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            >
              {days.map((day) => (
                <Cell
                  key={day.label}
                  fill={
                    day.controlPeak > capKw
                      ? COLORS.controlBreach
                      : COLORS.controlSafe
                  }
                />
              ))}
            </Bar>

            <Bar
              dataKey="pilotPeak"
              name="Pilot AI Peak"
              fill={COLORS.pilot}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />

            <ReferenceLine
              y={capKw}
              stroke={COLORS.cap}
              strokeWidth={1.3}
              strokeDasharray="6 4"
              strokeOpacity={0.85}
              label={{
                value: `CAP ${Math.round(capKw)} kW`,
                position: 'insideTopRight',
                fill: COLORS.cap,
                fontSize: 10.5,
                fontWeight: 600,
                fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10.5px] text-[#86847b]">
        <span>30-day rolling comparison · daily peak kW</span>
        <span>Control: vercors-control · Pilot: alptech-hq</span>
      </div>
    </div>
  );
}
