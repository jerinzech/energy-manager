/** Shared deterministic clock helpers. 06:00–19:45 in 15-minute slots. */

export const N = 56;
export const DT = 0.25;
export const START_HOUR = 6;

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Convert a slot index (0..55) to HH:MM. */
export function slotToTime(slot: number): string {
  const safe = clamp(Math.round(slot), 0, N - 1);
  const total = START_HOUR * 60 + safe * 15;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** Convert HH:MM to the nearest slot index (0..55). */
export function timeToSlot(time: string): number {
  if (typeof time !== 'string') return 0;
  const parts = time.split(':').map(Number);
  const mins = (parts[0] || 0) * 60 + (parts[1] || 0);
  return clamp(Math.round((mins - START_HOUR * 60) / 15), 0, N - 1);
}

export function slotToHour(slot: number): number {
  return START_HOUR + clamp(slot, 0, N - 1) * DT;
}

export function slotRange(): string[] {
  return Array.from({ length: N }, (_, i) => slotToTime(i));
}
