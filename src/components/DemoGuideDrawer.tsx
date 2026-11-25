import { useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';

export interface DemoGuideDrawerProps {
  open: boolean;
  activeStep: number | null;
  onRunStep: (step: number) => void;
  onClose: () => void;
}

interface DemoStep {
  n: number;
  time: string;
  title: string;
  duration: string;
  goal: string;
  actions: string[];
  talk: string;
}

const TEAM = 'Diego Arce Mejia · Sacha Cherifi · Assil El Kharsa · Jerin James · Vignesh Dillibabu';

const STEPS: DemoStep[] = [
  {
    n: 1,
    time: '0:00–1:30',
    title: 'Open the HQ 3D neighborhood',
    duration: '90 s',
    goal: 'Show the five-site Grenoble campus, the 1,650 kW MV feeder and the matched control site.',
    actions: [
      'Start on / and let the camera settle on the campus.',
      'Point out AlpTech HQ, the Isère R&D lab, the Dauphiné cloud hall, the Vercors control site and the Chartreuse annex.',
      'Read the feeder headroom and note that Vercors is deliberately AI-free.',
    ],
    talk: '“This is one distribution feeder. Every site is a real operational constraint, not a chart.”',
  },
  {
    n: 2,
    time: '1:30–3:00',
    title: 'Trigger the unexpected peak',
    duration: '90 s',
    goal: 'Compare the uncoordinated baseline with the AI plan under stress.',
    actions: [
      'Switch the scenario to “Unexpected building peak”.',
      'Run Optimize All and watch the feeder/site peaks separate.',
      'Open the Before vs Optimized view and point at the red breach hatch and green shaved region.',
    ],
    talk: '“The building spike is real. The question is whether EV demand makes it worse.”',
  },
  {
    n: 3,
    time: '3:00–4:30',
    title: 'Explain one charging decision',
    duration: '90 s',
    goal: 'Move from aggregate numbers to a single auditable session.',
    actions: [
      'Open /sites/alptech-hq and stay on the Day-Ahead Forecast tab.',
      'Hover the forecast and click a slot to jump the simulation clock.',
      'Pick EV-04 or EV-06 in the explainability inspector and read the “Why now?” narrative.',
    ],
    talk: '“We do not ask employees to trust a black box. Every session has a reason, a window and a solar share.”',
  },
  {
    n: 4,
    time: '4:30–6:30',
    title: 'Manager control and human approval',
    duration: '120 s',
    goal: 'Demonstrate L3 autonomy: the AI proposes, the manager approves or modifies.',
    actions: [
      'On Manager Control, tighten Max Site Demand and raise Min Vehicle Charge.',
      'Flag an Urgent Business Trip and show the plan re-prioritise.',
      'Approve the plan, then engage the Edge Fail-Safe to show the 3.7 kW fallback.',
      'Point at the immutable audit log entries.',
    ],
    talk: '“The manager keeps the pen. The system keeps the receipt.”',
  },
  {
    n: 5,
    time: '6:30–8:00',
    title: 'Prove the 30-day pilot and close on governance',
    duration: '90 s',
    goal: 'Show measured impact, MLOps health and the policy guardrails.',
    actions: [
      'Open the 30-Day Pilot tab and hover the control-vs-pilot chart.',
      'Read the six operational KPIs and the three MLOps health layers.',
      'Finish on Governance: GDPR aggregate boundary, EU AI Act oversight, CSE consultation, ISO 42001.',
    ],
    talk: '“We are not selling a dashboard. We are selling a measurable, reversible operating change.”',
  },
];

export function DemoGuideDrawer({
  open,
  activeStep,
  onRunStep,
  onClose,
}: DemoGuideDrawerProps) {
  const [expanded, setExpanded] = useState<number | null>(1);

  useEffect(() => {
    if (activeStep != null) setExpanded(activeStep);
  }, [activeStep]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        aria-label="Close the 8-minute demo guide"
        className="absolute inset-0 cursor-default bg-[#141413]/25"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="8-minute GEM MDAI Group presentation walkthrough"
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-[#e5e3dc] bg-white text-[#141413] shadow-xl"
      >
        <header className="border-b border-[#e5e3dc] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#0f766e]">
                <BookOpen className="h-3.5 w-3.5" />
                GEM MDAI Group · 8-minute run of show
              </div>
              <h2 className="mt-1 text-lg font-bold leading-tight text-[#141413]">
                Demo Guide
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-[#57564f]">{TEAM}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary !min-h-0 !px-2.5 !py-1.5 !text-[11.5px]"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="stamp stamp-accent">
              <Sparkles className="h-3 w-3" />5 steps
            </span>
            <span className="stamp">
              <Clock className="h-3 w-3" />8:00 total
            </span>
            <span className="stamp">Simulated</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-[#faf9f6] px-5 py-4">
          <ol className="space-y-2.5">
            {STEPS.map((step) => {
              const isActive = activeStep === step.n;
              const isOpen = expanded === step.n;
              return (
                <li
                  key={step.n}
                  className={`overflow-hidden rounded-lg border transition-colors ${
                    isActive
                      ? 'border-[#141413] bg-white shadow-sm'
                      : 'border-[#e5e3dc] bg-white hover:border-[#cfccc3]'
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
                    onClick={() => setExpanded(isOpen ? null : step.n)}
                    aria-expanded={isOpen}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-semibold ${
                        isActive
                          ? 'border-[#141413] bg-[#141413] text-white'
                          : 'border-[#e5e3dc] bg-[#efeee9] text-[#57564f]'
                      }`}
                    >
                      {step.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] font-medium text-[#86847b]">
                          {step.time} · {step.duration}
                        </span>
                        {isActive ? <span className="tag tag-accent">Active</span> : null}
                      </span>
                      <span className="mt-0.5 block text-[13.5px] font-semibold leading-snug text-[#141413]">
                        {step.title}
                      </span>
                    </span>
                    <span className="mt-1 text-[#86847b]">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="border-t border-[#e5e3dc] px-3.5 py-3">
                      <p className="text-[12.5px] leading-relaxed text-[#141413]">
                        {step.goal}
                      </p>
                      <ul className="mt-2.5 space-y-1.5">
                        {step.actions.map((action) => (
                          <li
                            key={action}
                            className="flex items-start gap-2 text-[12px] leading-relaxed text-[#57564f]"
                          >
                            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0f766e]" />
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[12px] italic leading-relaxed text-[#b45309]">
                        {step.talk}
                      </p>
                      <button
                        type="button"
                        className={`btn mt-3 w-full ${isActive ? 'btn-accent' : 'btn-secondary'}`}
                        onClick={() => onRunStep(step.n)}
                      >
                        {isActive ? (
                          <RotateCcw className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        {isActive ? 'Replay' : 'Run'} Step {String(step.n).padStart(2, '0')}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        <footer className="border-t border-[#e5e3dc] bg-white px-5 py-3">
          <p className="text-[11px] leading-relaxed text-[#57564f]">
            Tip: keep this drawer open while presenting. Each step jumps the live view to the
            relevant tab; press <span className="mono font-medium text-[#141413]">Esc</span> to close.
          </p>
        </footer>
      </aside>
    </div>
  );
}
