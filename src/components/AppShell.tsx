import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  Clock,
  ExternalLink,
  LayoutGrid,
  Map as MapIcon,
  Pause,
  Play,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import type { ActionPayload, HqSnapshot, HqSiteSummary, ScenarioKey, SiteId } from '../engine';

export type NeighborhoodAction = ActionPayload;

export interface AppShellProps {
  room: string;
  hqData: HqSnapshot;
  syncMode: 'ws' | 'local' | 'offline';
  onDispatch: (action: NeighborhoodAction) => Promise<void> | void;
  activeNav: 'launcher' | 'hq' | 'site';
  activeSiteId?: SiteId;
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  onOpenDemoGuide?: () => void;
  children: ReactNode;
}

const SHORT_NAMES: Record<SiteId, string> = {
  'alptech-hq': 'AlpTech HQ',
  'isere-rd': 'Isère R&D',
  'dauphine-cloud': 'Dauphiné Cloud',
  'vercors-control': 'Vercors Ctrl',
  'chartreuse-annex': 'Chartreuse',
};

function shortCampusLabel(site: HqSiteSummary): string {
  return SHORT_NAMES[site.id] ?? site.name;
}

function statusDotColor(site: HqSiteSummary, serverOnline: boolean): string {
  if (!serverOnline || !site.online) return '#9ca3af';
  if (site.breaching || site.currentKw > site.capKw) return '#ef4444';
  if (site.optimized && !site.failSafe) return '#10b981';
  if (site.failSafe || site.urgentCount > 0 || site.planStatus === 'PENDING') return '#f59e0b';
  return '#2563eb';
}

export function AppShell({
  room,
  hqData,
  syncMode,
  onDispatch,
  activeNav,
  activeSiteId,
  title,
  subtitle,
  headerActions,
  onOpenDemoGuide,
  children,
}: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [buildingsOpen, setBuildingsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [roomDraft, setRoomDraft] = useState(room);

  const buildingsRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRoomDraft(room);
  }, [room]);

  useEffect(() => {
    setBuildingsOpen(false);
    setControlsOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buildingsRef.current && !buildingsRef.current.contains(target)) {
        setBuildingsOpen(false);
      }
      if (controlsRef.current && !controlsRef.current.contains(target)) {
        setControlsOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, []);

  const handleRoomSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = roomDraft
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 64);
    const target = cleaned || room;
    setRoomDraft(target);
    setControlsOpen(false);
    navigate(`${location.pathname}?room=${encodeURIComponent(target)}`);
  };

  const isLive = syncMode === 'ws';
  const roomQuery = `?room=${encodeURIComponent(room)}`;
  const activeScenario = hqData.scenarios.find((s) => s.key === hqData.scenario);
  const activeBuilding = hqData.sites.find((s) => s.id === activeSiteId);
  const totalUnread = hqData.sites.reduce((sum, s) => sum + (s.unreadNotifications ?? 0), 0);

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#111827]">
      {/* Sticky Minimalist Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-8">
          {/* Brand */}
          <Link
            to={`/${roomQuery}`}
            className="flex shrink-0 items-center gap-2.5 text-[#111827] no-underline hover:no-underline"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#111827] text-white shadow-sm">
              <Zap className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <span className="text-[15px] font-bold tracking-[-0.02em] text-[#111827]">
              Grid-Sense
            </span>
          </Link>

          {/* Primary Navigation */}
          <nav
            className="flex items-center gap-1 overflow-x-auto sm:overflow-visible"
            aria-label="Primary navigation"
          >
            <Link
              to={`/${roomQuery}`}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium no-underline transition hover:no-underline ${
                activeNav === 'launcher'
                  ? 'bg-[#111827] text-white'
                  : 'text-[#4b5563] hover:bg-[#f1f5f9] hover:text-[#111827]'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Switchboard
            </Link>

            {/* Buildings Dropdown */}
            <div ref={buildingsRef} className="relative">
              <button
                type="button"
                aria-expanded={buildingsOpen}
                onClick={() => {
                  setBuildingsOpen((v) => !v);
                  setControlsOpen(false);
                }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                  activeNav === 'site'
                    ? 'bg-[#111827] text-white'
                    : 'text-[#4b5563] hover:bg-[#f1f5f9] hover:text-[#111827]'
                }`}
              >
                <span>
                  {activeBuilding ? shortCampusLabel(activeBuilding) : 'Buildings'}
                </span>
                {totalUnread > 0 && activeNav !== 'site' ? (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                ) : null}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>

              {buildingsOpen ? (
                <div className="fixed left-4 right-4 top-[68px] z-50 rounded-2xl border border-black/[0.08] bg-white p-2 shadow-xl sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-72">
                  <div className="px-2.5 py-1.5 text-[11px] font-medium text-[#6b7280]">
                    Grenoble Campuses ({hqData.sites.length})
                  </div>
                  <div className="space-y-0.5">
                    {hqData.sites.map((site) => {
                      const isActive = activeNav === 'site' && activeSiteId === site.id;
                      const effectiveOn = site.online && hqData.serverOnline;
                      const dot = statusDotColor(site, hqData.serverOnline);
                      const isBreach =
                        effectiveOn && (site.breaching || site.currentKw > site.capKw);
                      return (
                        <Link
                          key={site.id}
                          to={`/sites/${site.id}${roomQuery}`}
                          className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-[13px] no-underline transition hover:no-underline ${
                            isActive
                              ? 'bg-[#f1f5f9] font-semibold text-[#111827]'
                              : 'text-[#374151] hover:bg-[#f8fafc]'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: dot }}
                            />
                            <span className="truncate">{site.name}</span>
                          </span>
                          <span
                            className={`shrink-0 font-mono text-[11.5px] tabular-nums ${
                              !effectiveOn
                                ? 'text-[#9ca3af]'
                                : isBreach
                                  ? 'font-semibold text-[#dc2626]'
                                  : 'text-[#4b5563]'
                            }`}
                          >
                            {effectiveOn ? `${Math.round(site.currentKw)} kW` : 'Off'}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <Link
              to={`/hq${roomQuery}`}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium no-underline transition hover:no-underline ${
                activeNav === 'hq'
                  ? 'bg-[#111827] text-white'
                  : 'text-[#4b5563] hover:bg-[#f1f5f9] hover:text-[#111827]'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </Link>

            <a
              href={`/map${roomQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#4b5563] no-underline transition hover:bg-[#f1f5f9] hover:text-[#111827] hover:no-underline"
            >
              <MapIcon className="h-3.5 w-3.5" />
              3D Map
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          </nav>

          {/* Simulation & Room Controls Popover */}
          <div ref={controlsRef} className="relative shrink-0">
            <button
              type="button"
              aria-expanded={controlsOpen}
              onClick={() => {
                setControlsOpen((v) => !v);
                setBuildingsOpen(false);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-[#f8fafc] px-3 py-1.5 text-[12.5px] font-medium text-[#111827] transition hover:bg-[#f1f5f9]"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: isLive ? '#10b981' : '#f59e0b' }}
              />
              <span className="font-mono font-semibold tabular-nums">{hqData.clock.time}</span>
              <span className="hidden text-[#6b7280] sm:inline">
                · {activeScenario?.short ?? hqData.scenario}
              </span>
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#6b7280]" />
            </button>

            {controlsOpen ? (
              <div className="fixed left-4 right-4 top-[68px] z-50 space-y-4 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111827]">
                      <Clock className="h-3.5 w-3.5 text-[#6b7280]" />
                      Simulation Clock
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void onDispatch({
                          type: 'SET_CLOCK',
                          playing: !hqData.clock.playing,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-black/[0.08] bg-[#f8fafc] px-2.5 py-1 text-xs font-medium text-[#111827] hover:bg-[#f1f5f9]"
                    >
                      {hqData.clock.playing ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      {hqData.clock.playing ? 'Pause' : 'Play'}
                    </button>
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={55}
                      step={1}
                      value={hqData.clock.slot}
                      aria-label="Simulation clock 06:00–19:45"
                      className="h-1.5 flex-1 cursor-pointer accent-[#111827]"
                      onChange={(e) =>
                        void onDispatch({
                          type: 'SET_CLOCK',
                          slot: Number(e.target.value),
                        })
                      }
                    />
                    <span className="font-mono text-xs font-semibold text-[#111827] tabular-nums">
                      {hqData.clock.time}
                    </span>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="app-shell-scenario"
                    className="block text-xs font-semibold text-[#111827]"
                  >
                    Weather &amp; Grid Scenario
                  </label>
                  <select
                    id="app-shell-scenario"
                    value={hqData.scenario}
                    className="select mt-1.5"
                    onChange={(e) =>
                      void onDispatch({
                        type: 'SET_SCENARIO',
                        scenario: e.target.value as ScenarioKey,
                      })
                    }
                  >
                    {hqData.scenarios.map((meta) => (
                      <option key={meta.key} value={meta.key}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>

                <form onSubmit={handleRoomSubmit}>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="app-shell-room"
                      className="text-xs font-semibold text-[#111827]"
                    >
                      Shared Room Sync
                    </label>
                    <span className="text-[11px] font-medium text-[#6b7280]">
                      {isLive ? 'Live Cloud Sync' : 'Local Mode'}
                    </span>
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="app-shell-room"
                      type="text"
                      value={roomDraft}
                      onChange={(e) => setRoomDraft(e.target.value)}
                      className="input flex-1 !py-1.5 font-mono text-xs"
                      placeholder="gem-demo"
                    />
                    <button
                      type="submit"
                      className="btn btn-accent !min-h-0 !px-3 !py-1.5 text-xs"
                    >
                      Join
                    </button>
                  </div>
                </form>

                {onOpenDemoGuide ? (
                  <button
                    type="button"
                    className="btn btn-secondary w-full"
                    onClick={() => {
                      setControlsOpen(false);
                      onOpenDemoGuide();
                    }}
                  >
                    <BookOpen className="h-3.5 w-3.5 text-[#6b7280]" />
                    Open 8-Min Demo Guide
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-8 sm:py-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-[-0.03em] text-[#111827] sm:text-[28px]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-[13.5px] text-[#6b7280]">{subtitle}</p>
            ) : null}
          </div>
          {headerActions ? (
            <div className="flex flex-wrap items-center gap-2">{headerActions}</div>
          ) : null}
        </div>

        <main>{children}</main>
      </div>
    </div>
  );
}
