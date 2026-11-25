import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  ExternalLink,
  LayoutGrid,
  Map as MapIcon,
  Menu,
  Pause,
  Play,
  X,
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
  if (!serverOnline || !site.online) return '#86847b';
  if (site.breaching || site.currentKw > site.capKw) return '#dc2626';
  if (site.optimized && !site.failSafe) return '#0f766e';
  if (site.failSafe || site.urgentCount > 0 || site.planStatus === 'PENDING') return '#b45309';
  return '#1d4ed8';
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [roomDraft, setRoomDraft] = useState(room);

  useEffect(() => {
    setRoomDraft(room);
  }, [room]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  const handleRoomSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = roomDraft
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 64);
    const target = cleaned || room;
    setRoomDraft(target);
    navigate(`${location.pathname}?room=${encodeURIComponent(target)}`);
  };

  const isLive = syncMode === 'ws';
  const roomQuery = `?room=${encodeURIComponent(room)}`;

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white text-[#141413]">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-[#e5e3dc] px-4 py-4">
        <Link
          to={`/${roomQuery}`}
          className="flex items-center gap-2.5 text-[#141413] no-underline hover:no-underline"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#141413] text-white">
            <Zap className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <div className="leading-tight">
            <div className="text-[13.5px] font-bold tracking-[-0.02em] text-[#141413]">
              Grid-Sense
            </div>
            <div className="font-mono text-[10px] font-medium text-[#86847b]">
              Grenoble Grid
            </div>
          </div>
        </Link>
        <button
          type="button"
          aria-label="Close navigation"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#57564f] hover:bg-[#efeee9] hover:text-[#141413] lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Nav + Campuses */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-2 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[#86847b]">
          Workspace
        </div>
        <nav className="space-y-0.5" aria-label="Primary navigation">
          <Link
            to={`/${roomQuery}`}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] no-underline transition-colors hover:no-underline ${
              activeNav === 'launcher'
                ? 'bg-[#efeee9] font-semibold text-[#141413]'
                : 'font-medium text-[#57564f] hover:bg-[#faf9f6] hover:text-[#141413]'
            }`}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" />
            <span className="truncate">Switchboard</span>
          </Link>

          <Link
            to={`/hq${roomQuery}`}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] no-underline transition-colors hover:no-underline ${
              activeNav === 'hq'
                ? 'bg-[#efeee9] font-semibold text-[#141413]'
                : 'font-medium text-[#57564f] hover:bg-[#faf9f6] hover:text-[#141413]'
            }`}
          >
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="truncate">HQ Analytics</span>
          </Link>

          <a
            href={`/map${roomQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium text-[#57564f] no-underline transition-colors hover:bg-[#faf9f6] hover:text-[#141413] hover:no-underline"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <MapIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">3D Spatial Map</span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#86847b]" />
          </a>
        </nav>

        {/* Campuses List */}
        <div className="mt-6 flex items-center justify-between px-2 pb-1.5">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[#86847b]">
            Campuses ({hqData.sites.length})
          </span>
          <span className="font-mono text-[10px] text-[#86847b] tabular-nums">
            {Math.round(hqData.substation.currentKw)} kW
          </span>
        </div>

        <nav className="space-y-0.5" aria-label="Campuses">
          {hqData.sites.map((site) => {
            const isActive = activeNav === 'site' && activeSiteId === site.id;
            const effectiveOn = site.online && hqData.serverOnline;
            const dotColor = statusDotColor(site, hqData.serverOnline);
            const isBreach = effectiveOn && (site.breaching || site.currentKw > site.capKw);

            return (
              <Link
                key={site.id}
                to={`/sites/${site.id}${roomQuery}`}
                className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[12.5px] no-underline transition-colors hover:no-underline ${
                  isActive
                    ? 'bg-[#efeee9] font-semibold text-[#141413]'
                    : 'font-medium text-[#57564f] hover:bg-[#faf9f6] hover:text-[#141413]'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span className="truncate">{shortCampusLabel(site)}</span>
                  {site.unreadNotifications > 0 ? (
                    <span
                      title={`${site.unreadNotifications} unread agent alert(s)`}
                      className="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-[#eef2ff] px-1 font-mono text-[9.5px] font-semibold text-[#3730a3]"
                    >
                      {site.unreadNotifications}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`shrink-0 font-mono text-[11px] tabular-nums ${
                    !effectiveOn
                      ? 'text-[#86847b]'
                      : isBreach
                        ? 'font-semibold text-[#dc2626]'
                        : 'text-[#57564f]'
                  }`}
                >
                  {effectiveOn ? `${Math.round(site.currentKw)} kW` : 'Off'}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Pinned Bottom Control Footer */}
      <div className="space-y-3 border-t border-[#e5e3dc] bg-[#faf9f6] px-3.5 py-3.5">
        {/* Sync status + Inline room switcher */}
        <form onSubmit={handleRoomSubmit} className="flex items-center gap-1.5">
          <span
            className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] font-medium text-[#57564f]"
            title={isLive ? 'Live WebSocket Durable Object sync' : 'Local browser fallback sync'}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: isLive ? '#0f766e' : '#b45309' }}
            />
            {isLive ? 'Live' : 'Local'}
          </span>
          <input
            type="text"
            value={roomDraft}
            aria-label="Room name"
            onChange={(e) => setRoomDraft(e.target.value)}
            className="input min-w-0 flex-1 !px-2 !py-1 font-mono !text-[11px]"
            placeholder="room"
          />
          <button
            type="submit"
            className="btn btn-secondary !min-h-0 shrink-0 !px-2 !py-1 !text-[11px]"
            title="Switch sync room"
          >
            Go
          </button>
        </form>

        {/* Clock Play/Pause + Time + Scrubber */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="btn btn-secondary !min-h-0 !px-2 !py-1 !text-[11px]"
              onClick={() =>
                void onDispatch({ type: 'SET_CLOCK', playing: !hqData.clock.playing })
              }
            >
              {hqData.clock.playing ? (
                <Pause className="h-3 w-3" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {hqData.clock.playing ? 'Pause' : 'Play'}
            </button>
            <span className="font-mono text-[12px] font-semibold text-[#141413] tabular-nums">
              {hqData.clock.time}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={55}
            step={1}
            value={hqData.clock.slot}
            aria-label="Simulation clock 06:00–19:45"
            className="w-full cursor-pointer"
            style={{ accentColor: '#0f766e' }}
            onChange={(e) =>
              void onDispatch({ type: 'SET_CLOCK', slot: Number(e.target.value) })
            }
          />
        </div>

        {/* Scenario dropdown */}
        <div>
          <select
            className="select !py-1.5 !text-[11.5px]"
            value={hqData.scenario}
            aria-label="Simulation scenario"
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

        {/* Quiet Demo Guide trigger */}
        {onOpenDemoGuide ? (
          <button
            type="button"
            className="btn btn-secondary w-full !min-h-0 !py-1.5 !text-[11.5px] text-[#57564f]"
            onClick={onOpenDemoGuide}
          >
            <BookOpen className="h-3.5 w-3.5 text-[#57564f]" />
            8-Min Demo Guide
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f4f0] text-[#141413]">
      {/* Desktop fixed left sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-[248px] lg:border-r lg:border-[#e5e3dc] lg:bg-white">
        {sidebarContent}
      </aside>

      {/* Mobile collapsible top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#e5e3dc] bg-white px-4 py-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            aria-label="Open navigation menu"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#e5e3dc] text-[#141413] hover:bg-[#efeee9]"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#141413] text-white">
            <Zap className="h-3 w-3" strokeWidth={2.25} />
          </span>
          <span className="truncate text-[13.5px] font-bold tracking-[-0.02em] text-[#141413]">
            Grid-Sense
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-[#57564f]">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: isLive ? '#0f766e' : '#b45309' }}
          />
          <span className="tabular-nums">{hqData.clock.time}</span>
        </div>
      </div>

      {/* Mobile slide-over nav drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Dismiss navigation menu"
            className="absolute inset-0 cursor-default bg-[#141413]/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[268px] max-w-[85vw] border-r border-[#e5e3dc] bg-white shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      ) : null}

      {/* Main scrollable paper canvas */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-[248px]">
        <header className="border-b border-[#e5e3dc] bg-[#f5f4f0] px-4 py-4 md:px-7 md:py-5">
          <div className="mx-auto flex w-full max-w-[1380px] flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-[-0.025em] text-[#141413] md:text-[22px]">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-0.5 text-[12.5px] text-[#57564f]">{subtitle}</p>
              ) : null}
            </div>
            {headerActions ? (
              <div className="flex flex-wrap items-center gap-2">{headerActions}</div>
            ) : null}
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 md:px-7 md:py-6">
          <div className="mx-auto w-full min-w-0 max-w-[1380px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
