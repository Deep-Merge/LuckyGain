import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, parse } from "date-fns";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import type {
  FreelanceBoard,
  FreelanceMilestone,
  FreelanceMonthCard,
} from "@/lib/db/freelance";
import { Money, Panel } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const MONTH_BUTTONS = [
  { num: 12, short: "Dec" },
  { num: 11, short: "Nov" },
  { num: 10, short: "Oct" },
  { num: 9, short: "Sep" },
  { num: 8, short: "Aug" },
  { num: 7, short: "Jul" },
  { num: 6, short: "Jun" },
  { num: 5, short: "May" },
  { num: 4, short: "Apr" },
  { num: 3, short: "Mar" },
  { num: 2, short: "Feb" },
  { num: 1, short: "Jan" },
] as const;

function monthKey(year: number, monthNum: number): string {
  return `${year}-${String(monthNum).padStart(2, "0")}`;
}

function monthKeyLabel(month: string): string {
  return format(parse(`${month}-01`, "yyyy-MM-dd", new Date()), "MMMM yyyy");
}

function emptyMonthCard(month: string): FreelanceMonthCard {
  return {
    month,
    label: monthKeyLabel(month),
    grossCents: 0,
    transferFeeCents: 0,
    accountFeeCents: 0,
    feeCents: 0,
    incomeCents: 0,
    releasedCount: 0,
    projectCount: 0,
    projects: [],
  };
}

function formatReleasedAt(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = parse(value.trim().slice(0, 10), "yyyy-MM-dd", new Date());
    if (!Number.isNaN(d.getTime())) return format(d, "MMM d");
  } catch {
    /* fall through */
  }
  return value.trim().slice(0, 10);
}

type ReleasedRow = FreelanceMilestone & {
  client_name: string;
  project_name: string;
  project_id: string;
};

function releasedRowsForMonth(month: FreelanceMonthCard): ReleasedRow[] {
  return month.projects
    .flatMap((project) =>
      project.milestones.map((ms) => ({
        ...ms,
        client_name: project.client_name,
        project_name: project.name,
        project_id: project.id,
      })),
    )
    .sort((a, b) =>
      (b.released_at ?? "").localeCompare(a.released_at ?? ""),
    );
}

export function FreelancePage({ board }: { board: FreelanceBoard }) {
  const [searchParams] = useSearchParams();
  const focusProjectId = searchParams.get("project");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [activeMonth, setActiveMonth] = useState(() =>
    monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  );
  const [showHiddenMonths, setShowHiddenMonths] = useState(false);
  const pendingScrollRef = useRef<string | null>(null);
  const lastFocusRef = useRef<string | null>(null);
  const didInitScrollRef = useRef(false);
  const clickScrollLockRef = useRef(false);

  const currentMonthKey = useMemo(
    () => monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
    [],
  );

  const yearBounds = useMemo(() => {
    const years = board.months.map((m) => Number(m.month.slice(0, 4)));
    const current = new Date().getFullYear();
    return {
      min: Math.min(current - 4, ...years, current),
      max: Math.max(current + 1, ...years, current),
    };
  }, [board.months]);

  const activityByMonth = useMemo(() => {
    const map = new Map<string, { count: number; netCents: number }>();
    for (const m of board.months) {
      map.set(m.month, {
        count: m.releasedCount,
        netCents: m.incomeCents,
      });
    }
    return map;
  }, [board.months]);

  const yearMonths = useMemo(() => {
    return MONTH_BUTTONS.map((m) => {
      const key = monthKey(year, m.num);
      return (
        board.months.find((card) => card.month === key) ?? emptyMonthCard(key)
      );
    });
  }, [board.months, year]);

  const visibleMonths = useMemo(() => {
    if (showHiddenMonths) return yearMonths;
    return yearMonths.filter(
      (m) =>
        m.releasedCount > 0 ||
        m.month === currentMonthKey ||
        m.month === activeMonth,
    );
  }, [yearMonths, showHiddenMonths, currentMonthKey, activeMonth]);

  useLayoutEffect(() => {
    const now = new Date();
    const currentKey = monthKey(now.getFullYear(), now.getMonth() + 1);

    if (focusProjectId && lastFocusRef.current !== focusProjectId) {
      lastFocusRef.current = focusProjectId;
      didInitScrollRef.current = true;
      const host = board.months.find((m) =>
        m.projects.some((p) => p.id === focusProjectId),
      );
      if (!host) return;
      const y = Number(host.month.slice(0, 4));
      setYear(y);
      setActiveMonth(host.month);
      setShowHiddenMonths(true);
      requestAnimationFrame(() => {
        document
          .getElementById(`freelance-month-${host.month}`)
          ?.scrollIntoView({ behavior: "instant", block: "start" });
      });
      return;
    }

    if (didInitScrollRef.current) return;
    didInitScrollRef.current = true;
    setYear(now.getFullYear());
    setActiveMonth(currentKey);
    document
      .getElementById(`freelance-month-${currentKey}`)
      ?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [board.months, focusProjectId]);

  useEffect(() => {
    const key = pendingScrollRef.current;
    if (!key || !showHiddenMonths) return;
    pendingScrollRef.current = null;
    clickScrollLockRef.current = true;
    setActiveMonth(key);
    requestAnimationFrame(() => {
      document
        .getElementById(`freelance-month-${key}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        clickScrollLockRef.current = false;
      }, 650);
    });
  }, [showHiddenMonths, visibleMonths]);

  // Keep month-rail selection in sync while scrolling the month panels
  useEffect(() => {
    const nodes = visibleMonths
      .map((m) => document.getElementById(`freelance-month-${m.month}`))
      .filter((el): el is HTMLElement => el != null);
    if (nodes.length === 0) return;

    const ratios = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const month = entry.target.id.replace("freelance-month-", "");
          ratios.set(month, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        if (clickScrollLockRef.current) return;

        let bestMonth: string | null = null;
        let bestScore = -1;
        for (const [month, ratio] of ratios) {
          if (ratio > bestScore) {
            bestScore = ratio;
            bestMonth = month;
          }
        }
        if (bestMonth && bestScore > 0) {
          setActiveMonth((current) =>
            current === bestMonth ? current : bestMonth!,
          );
        }
      },
      {
        root: null,
        // Bias toward the panel sitting near the top of the viewport
        rootMargin: "-12% 0px -55% 0px",
        threshold: [0, 0.15, 0.35, 0.55, 0.75, 1],
      },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [visibleMonths]);

  function shiftYear(delta: number) {
    setYear((y) => {
      const next = Math.min(yearBounds.max, Math.max(yearBounds.min, y + delta));
      const monthNum = Number(activeMonth.slice(5, 7)) || 12;
      setActiveMonth(monthKey(next, monthNum));
      return next;
    });
  }

  function scrollToMonth(key: string) {
    const hasWork = (activityByMonth.get(key)?.count ?? 0) > 0;
    const isPinned = key === currentMonthKey;
    if (!showHiddenMonths && !hasWork && !isPinned) {
      pendingScrollRef.current = key;
      setShowHiddenMonths(true);
      return;
    }
    clickScrollLockRef.current = true;
    setActiveMonth(key);
    document
      .getElementById(`freelance-month-${key}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      clickScrollLockRef.current = false;
    }, 650);
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
        <aside className="w-full shrink-0 lg:sticky lg:top-0 lg:w-[260px]">
          <div className="rounded-2xl border border-line/80 bg-white/55 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-1 rounded-xl bg-emerald px-1.5 py-2 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]">
              <button
                type="button"
                onClick={() => shiftYear(-1)}
                disabled={year <= yearBounds.min}
                className="pressable inline-flex h-7 w-7 items-center justify-center rounded-lg text-white/65 hover:bg-white/12 hover:text-white disabled:opacity-25"
                aria-label="Previous year"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="font-display text-[20px] font-semibold tracking-tight text-[#f3faf6] tabular">
                {year}
              </div>
              <button
                type="button"
                onClick={() => shiftYear(1)}
                disabled={year >= yearBounds.max}
                className="pressable inline-flex h-7 w-7 items-center justify-center rounded-lg text-white/65 hover:bg-white/12 hover:text-white disabled:opacity-25"
                aria-label="Next year"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowHiddenMonths((v) => !v)}
              className={cn(
                "chip mb-2 flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left",
                showHiddenMonths
                  ? "bg-emerald-soft text-emerald"
                  : "bg-ivory-deep text-muted hover:text-charcoal",
              )}
            >
              <span className="text-[11px] font-medium">
                {showHiddenMonths ? "Hide empty" : "Show empty"}
              </span>
              {showHiddenMonths ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>

            <div className="space-y-0.5">
              {MONTH_BUTTONS.map((m) => {
                const key = monthKey(year, m.num);
                const meta = activityByMonth.get(key);
                const count = meta?.count ?? 0;
                const netCents = meta?.netCents ?? 0;
                const active = activeMonth === key;
                const isCurrent = key === currentMonthKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => scrollToMonth(key)}
                    className={cn(
                      "chip relative flex w-full flex-col items-stretch gap-0.5 overflow-hidden rounded-lg px-2.5 py-2 text-left",
                      active
                        ? "bg-[color-mix(in_srgb,var(--color-gold-soft)_78%,white)] text-charcoal ring-1 ring-gold/45"
                        : count > 0
                          ? "text-charcoal hover:bg-ivory-deep"
                          : "text-muted/70 hover:bg-ivory-deep/70 hover:text-muted",
                    )}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-1.5 left-1 w-[3px] rounded-full bg-emerald"
                      />
                    ) : null}
                    <div className="flex items-center justify-between gap-2 pl-1">
                      <span className="text-[12.5px] font-semibold tracking-tight">
                        {m.short}
                        {isCurrent ? (
                          <span
                            className={cn(
                              "ml-1 text-[10px]",
                              active ? "text-emerald" : "text-gold-dark",
                            )}
                          >
                            ·
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "tabular text-[10.5px]",
                          active ? "text-gold-dark/80" : "text-muted/80",
                        )}
                      >
                        {count > 0 ? `${count} rel` : "—"}
                      </span>
                    </div>
                    <Money
                      cents={netCents}
                      className={cn(
                        "pl-1 text-[12px] font-semibold tabular",
                        active
                          ? "text-emerald"
                          : netCents > 0
                            ? "text-emerald"
                            : "text-muted/55",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="w-full space-y-4">
            {visibleMonths.map((month) => (
              <div
                key={month.month}
                id={`freelance-month-${month.month}`}
                className="scroll-mt-3"
              >
                <MonthAccountingCard
                  month={month}
                  focusProjectId={focusProjectId}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthAccountingCard({
  month,
  focusProjectId,
}: {
  month: FreelanceMonthCard;
  focusProjectId?: string | null;
}) {
  const rows = useMemo(() => releasedRowsForMonth(month), [month]);

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-[18px] font-semibold tracking-tight text-charcoal">
              {month.label}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              {month.releasedCount} released
              {month.projectCount > 0
                ? ` · ${month.projectCount} project${month.projectCount === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.06em] text-muted">
              Net income
            </div>
            <Money
              cents={month.incomeCents}
              tone="income"
              className="text-[22px] font-semibold"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Gross"
            cents={month.grossCents}
            className="text-charcoal"
          />
          <Stat
            label="Transfer fee"
            cents={month.transferFeeCents}
            className="text-muted"
          />
          <Stat
            label="Account fee"
            cents={month.accountFeeCents}
            className="text-muted"
          />
          <Stat
            label="Net"
            cents={month.incomeCents}
            className="text-emerald"
            emphasize
          />
        </div>
      </div>

      <div className="p-2 sm:p-3">
        {rows.length === 0 ? (
          <div className="rounded-xl bg-ivory-deep/50 px-4 py-8 text-center text-[12.5px] text-muted">
            No released income this month
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[4.75rem_minmax(0,1.45fr)_minmax(0,0.7fr)_5.75rem_5.25rem_5.75rem] items-center gap-x-3 border-b border-line/70 px-3 py-2 text-[10px] font-medium tracking-[0.06em] text-muted uppercase">
                <span>Date</span>
                <span>Project</span>
                <span>Milestone</span>
                <span className="text-right">Gross</span>
                <span className="text-right">Fees</span>
                <span className="text-right">Net</span>
              </div>
              <ul className="divide-y divide-line/55">
                {rows.map((row) => {
                  const focused = focusProjectId === row.project_id;
                  return (
                    <li key={row.id}>
                      <Link
                        to={`/projects?project=${encodeURIComponent(row.project_id)}&milestone=${encodeURIComponent(row.id)}`}
                        id={`freelance-project-${row.project_id}-${month.month}`}
                        className={cn(
                          "grid grid-cols-[4.75rem_minmax(0,1.45fr)_minmax(0,0.7fr)_5.75rem_5.25rem_5.75rem] items-center gap-x-3 px-3 py-2.5 transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                          "hover:bg-gold-soft/30 focus-visible:bg-gold-soft/35",
                          focused && "bg-gold-soft/35",
                        )}
                      >
                        <div className="text-[12px] font-medium tabular tracking-tight text-muted">
                          {formatReleasedAt(row.released_at)}
                        </div>
                        <div className="min-w-0 truncate text-[12.5px] leading-snug">
                          <span className="font-semibold text-charcoal">
                            {row.client_name}
                          </span>
                          <span className="text-muted"> · </span>
                          <span className="text-charcoal/75">
                            {row.project_name}
                          </span>
                        </div>
                        <div className="min-w-0 truncate text-[12.5px] leading-snug text-charcoal/70">
                          {row.title || "Milestone"}
                        </div>
                        <div className="text-right">
                          <Money
                            cents={row.gross_cents}
                            className="text-[12px] font-medium tabular text-charcoal"
                          />
                        </div>
                        <div className="text-right">
                          <Money
                            cents={row.fee_cents}
                            className="text-[12px] font-medium tabular text-muted"
                          />
                        </div>
                        <div className="text-right">
                          <Money
                            cents={row.net_cents}
                            className="text-[12.5px] font-semibold tabular text-emerald"
                          />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Stat({
  label,
  cents,
  className,
  emphasize,
}: {
  label: string;
  cents: number;
  className?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-ivory-deep/55 px-3 py-2.5",
        emphasize && "bg-emerald-soft/55",
      )}
    >
      <div className="text-[10px] font-medium tracking-[0.06em] text-muted uppercase">
        {label}
      </div>
      <Money
        cents={cents}
        className={cn(
          "mt-0.5 text-[15px] font-semibold tabular",
          emphasize ? "text-[16px]" : "text-[15px]",
          className,
        )}
      />
    </div>
  );
}
