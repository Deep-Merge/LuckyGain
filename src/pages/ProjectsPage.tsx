import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format, parse } from "date-fns";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  ChevronDown,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  FreelanceMilestone,
  MilestoneReleaseResult,
  ProjectCompletionInfo,
  ProjectListItem,
  ProjectType,
} from "@/lib/db/freelance";
import { PROJECT_TYPES } from "@/lib/db/freelance";
import { Money } from "@/components/ui/primitives";
import { ProjectCompleteModal } from "@/components/projects/ProjectCompleteModal";
import { cn } from "@/lib/cn";
import { fromCents } from "@/lib/money";

const easePremium = [0.22, 1, 0.36, 1] as const;
const fadeSlide = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.28, ease: easePremium },
};

const TYPE_CHIP_CLASS = "projects-chip--type";

const STATUS_FILTERS: Array<{
  id: "all" | "active" | "finished";
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "finished", label: "Finished" },
];

const SORT_OPTIONS: Array<{
  id: "status-active" | "status-finished" | "budget-desc" | "budget-asc" | "name";
  label: string;
}> = [
  { id: "status-active", label: "Status · in progress first" },
  { id: "status-finished", label: "Status · finished first" },
  { id: "budget-desc", label: "Budget · high → low" },
  { id: "budget-asc", label: "Budget · low → high" },
  { id: "name", label: "Name · A–Z" },
];

function formatWorkedOnSpan(
  start: string | null | undefined,
  finish: string | null | undefined,
): string {
  const startLabel = (() => {
    if (!start) return null;
    try {
      return format(parse(start, "yyyy-MM-dd", new Date()), "MMM yyyy");
    } catch {
      return start;
    }
  })();
  const finishLabel = (() => {
    if (!finish) return "present";
    try {
      return format(parse(finish, "yyyy-MM-dd", new Date()), "MMM yyyy");
    } catch {
      return finish;
    }
  })();
  if (!startLabel) {
    return finish ? `Until ${finishLabel}` : "Dates not set";
  }
  return `${startLabel} — ${finishLabel}`;
}

/** Keep existing newlines; also split packed milestone lines (M1 … M2 …). */
function formatProjectDescription(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/([^\n])[ \t]+(?=M\d+\b)/g, "$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function projectDescriptionLines(text: string): string[] {
  return formatProjectDescription(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function projectDescriptionPreview(text: string): string {
  const lines = projectDescriptionLines(text);
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];
  const first = lines[0];
  const short =
    first.length > 42 ? `${first.slice(0, 40).trimEnd()}…` : first;
  return `${short} · ${lines.length} lines`;
}

function formatReleasedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const d = parse(value.trim().slice(0, 10), "yyyy-MM-dd", new Date());
    if (!Number.isNaN(d.getTime())) return format(d, "MMM d, yyyy");
  } catch {
    /* fall through */
  }
  return value.trim().slice(0, 10);
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().slice(0, 10);
}

function formatDollars(cents: number): string {
  return Math.round(cents / 100).toLocaleString("en-US");
}

function ProjectDescriptionPeek({ text }: { text: string }) {
  const lines = useMemo(() => projectDescriptionLines(text), [text]);
  const preview = useMemo(() => projectDescriptionPreview(text), [text]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tipId = useId();
  const closeTimer = useRef<number | null>(null);

  function clearCloseTimer() {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  if (lines.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="projects-desc-peek"
      onMouseEnter={() => {
        clearCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="projects-desc-peek__trigger"
        aria-expanded={open}
        aria-controls={tipId}
        onClick={(e) => {
          e.stopPropagation();
          clearCloseTimer();
          setOpen((v) => !v);
        }}
        onFocus={() => {
          clearCloseTimer();
          setOpen(true);
        }}
        onBlur={scheduleClose}
      >
        <span className="projects-desc-peek__label">Scope</span>
        <span className="projects-desc-peek__preview">{preview}</span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={tipId}
            role="tooltip"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: easePremium }}
            className="projects-desc-peek__panel"
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="projects-desc-peek__panel-title">Description</div>
            <ul className="projects-desc-peek__list">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MilestoneProgressGlyph({
  budgetPct,
  releasedMilestones,
  totalMilestones,
  finished,
}: {
  /** Budget progress: released gross / total gross */
  budgetPct: number;
  releasedMilestones: number;
  totalMilestones: number;
  finished: boolean;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(budgetPct)));
  const uid = useId().replace(/:/g, "");
  const goldId = `plp-gold-${uid}`;
  const emeraldId = `plp-emerald-${uid}`;
  const r = 13.5;
  const cx = 18;
  const cy = 17.5;
  // Semi-circle from left to right, open at the bottom
  const circumference = Math.PI * r;
  const progress = pct / 100;
  const dash = circumference * progress;
  const gap = circumference - dash;
  const track = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const hasProgress = pct > 0;

  return (
    <span
      className={cn(
        "project-list-progress",
        finished
          ? "project-list-progress--done"
          : "project-list-progress--active",
        hasProgress && "project-list-progress--filled",
      )}
      title={`${pct}% of budget · ${releasedMilestones}/${totalMilestones || 0} milestones`}
      aria-label={`${pct}% of budget done · ${releasedMilestones} of ${totalMilestones || 0} milestones`}
    >
      <svg
        viewBox="0 0 36 26"
        className="project-list-progress__svg"
        aria-hidden
      >
        <defs>
          <linearGradient id={goldId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e8c56a" />
            <stop offset="45%" stopColor="#c19a55" />
            <stop offset="100%" stopColor="#8f6a28" />
          </linearGradient>
          <linearGradient id={emeraldId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5dcea0" />
            <stop offset="55%" stopColor="#2f9a6e" />
            <stop offset="100%" stopColor="#1f7a56" />
          </linearGradient>
        </defs>
        {/* Soft under-halo so the arc reads on cream cards */}
        <path
          d={track}
          fill="none"
          stroke="rgb(255 255 255 / 0.92)"
          strokeWidth="5.4"
          strokeLinecap="round"
        />
        <path
          d={track}
          className="project-list-progress__track"
          fill="none"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        {hasProgress ? (
          <path
            d={track}
            className="project-list-progress__fill"
            fill="none"
            stroke={finished ? `url(#${emeraldId})` : `url(#${goldId})`}
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
          />
        ) : null}
      </svg>
      <span className="project-list-progress__meta">
        <span className="project-list-progress__label tabular">{pct}%</span>
        <span className="project-list-progress__count tabular">
          {releasedMilestones}/{totalMilestones || 0}
        </span>
      </span>
    </span>
  );
}

function budgetProgressPct(releasedGrossCents: number, grossCents: number) {
  if (grossCents <= 0) return 0;
  return Math.round((releasedGrossCents / grossCents) * 100);
}

type ProjectDraft = {
  mode: "create" | "edit";
  projectId?: string;
  clientName?: string;
  projectName?: string;
  description?: string;
  startDate?: string;
  projectType?: ProjectType;
};

type MilestoneDraft = {
  mode: "create" | "edit";
  projectId: string;
  projectLabel: string;
  milestoneId?: string;
  title?: string;
  amountYuan?: number;
  transferFeePercent?: number;
  accountFeePercent?: number;
  feeCompound?: boolean;
  /** Default / editable month for waiting milestones. */
  workMonth: string;
  releasedAt?: string | null;
  isReleased?: boolean;
};

export function ProjectsPage({
  projects,
  onAddProject,
  onUpdateProject,
  onAddMilestone,
  onUpdateMilestone,
  onToggleReleased,
  onDeleteProject,
  onDeleteMilestone,
  onReorderMilestones,
}: {
  projects: ProjectListItem[];
  onAddProject: (input: {
    month?: string;
    clientName: string;
    projectName: string;
    description?: string;
    startDate?: string | null;
    finishDate?: string | null;
    projectType: ProjectType;
  }) => void;
  onUpdateProject: (input: {
    projectId: string;
    clientName: string;
    projectName: string;
    description?: string;
    startDate?: string | null;
    finishDate?: string | null;
    projectType?: ProjectType;
  }) => void;
  onAddMilestone: (input: {
    projectId: string;
    month: string;
    title?: string;
    amountYuan: number;
    transferFeePercent: number;
    accountFeePercent: number;
    feeCompound?: boolean;
  }) => void;
  onUpdateMilestone: (input: {
    id: string;
    title?: string;
    amountYuan: number;
    transferFeePercent: number;
    accountFeePercent: number;
    feeCompound?: boolean;
    workMonth?: string;
    releasedAt?: string | null;
  }) => void;
  onToggleReleased: (
    id: string,
    released: boolean,
    releasedAt?: string | null,
  ) => MilestoneReleaseResult | void;
  onDeleteProject: (projectId: string) => void;
  onDeleteMilestone: (id: string) => void;
  onReorderMilestones: (projectId: string, orderedIds: string[]) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusProjectId = searchParams.get("project");
  const focusMilestoneId = searchParams.get("milestone");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["id"]>(
    "all",
  );
  const [typeFilter, setTypeFilter] = useState<"all" | ProjectType>("all");
  const [sortBy, setSortBy] = useState<(typeof SORT_OPTIONS)[number]["id"]>(
    "status-active",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightMilestoneId, setHighlightMilestoneId] = useState<
    string | null
  >(null);
  const [celebration, setCelebration] = useState<ProjectCompletionInfo | null>(
    null,
  );
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null);
  const [milestoneDraft, setMilestoneDraft] = useState<MilestoneDraft | null>(
    null,
  );
  const currentMonth = format(new Date(), "yyyy-MM");
  const pendingFocusRef = useRef<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (status === "active" && p.status !== "active") return false;
      if (status === "finished" && p.status !== "finished") return false;
      if (typeFilter !== "all" && p.project_type !== typeFilter) return false;
      if (!q) return true;
      return (
        p.client_name.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.project_type.toLowerCase().includes(q)
      );
    });

    const statusRank = (s: string) => (s === "finished" ? 1 : 0);
    list.sort((a, b) => {
      switch (sortBy) {
        case "budget-desc":
          return b.grossCents - a.grossCents || a.name.localeCompare(b.name);
        case "budget-asc":
          return a.grossCents - b.grossCents || a.name.localeCompare(b.name);
        case "status-finished":
          return (
            statusRank(b.status) - statusRank(a.status) ||
            b.grossCents - a.grossCents
          );
        case "name":
          return (
            a.name.localeCompare(b.name) ||
            a.client_name.localeCompare(b.client_name)
          );
        case "status-active":
        default:
          return (
            statusRank(a.status) - statusRank(b.status) ||
            b.grossCents - a.grossCents
          );
      }
    });
    return list;
  }, [projects, query, status, typeFilter, sortBy]);

  function clearFocusLink() {
    pendingFocusRef.current = null;
    if (searchParams.has("project") || searchParams.has("milestone")) {
      setSearchParams({}, { replace: true });
    }
    setHighlightMilestoneId(null);
  }

  function selectProject(id: string) {
    clearFocusLink();
    setSelectedId(id);
  }

  function handleToggleReleased(
    id: string,
    released: boolean,
    releasedAt?: string | null,
  ) {
    const result = onToggleReleased(id, released, releasedAt);
    if (result?.completed) {
      setCelebration(result.completed);
    }
    return result;
  }

  // Deep-link from Search / Freelance: select project and clear URL after apply.
  useEffect(() => {
    if (!focusProjectId) {
      pendingFocusRef.current = null;
      return;
    }
    const exists = projects.some((p) => p.id === focusProjectId);
    if (!exists) return;

    const key = `${focusProjectId}:${focusMilestoneId ?? ""}`;
    pendingFocusRef.current = key;
    setStatus("all");
    setTypeFilter("all");
    setQuery("");
    setSelectedId(focusProjectId);
    setHighlightMilestoneId(focusMilestoneId);

    const t = window.setTimeout(() => {
      document
        .getElementById(`project-list-${focusProjectId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      setSearchParams({}, { replace: true });
      // Keep pending key briefly so selection-sync won't steal focus this tick.
      window.setTimeout(() => {
        if (pendingFocusRef.current === key) pendingFocusRef.current = null;
      }, 0);
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusProjectId, focusMilestoneId, projects, setSearchParams]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    const pendingId = pendingFocusRef.current?.split(":")[0] ?? null;
    const focusId =
      (focusProjectId && filtered.some((p) => p.id === focusProjectId)
        ? focusProjectId
        : null) ??
      (pendingId && filtered.some((p) => p.id === pendingId)
        ? pendingId
        : null);
    if (focusId) {
      if (selectedId !== focusId) setSelectedId(focusId);
      return;
    }
    if (!selectedId || !filtered.some((p) => p.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId, focusProjectId]);

  const selected = useMemo(
    () => filtered.find((p) => p.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  useEffect(() => {
    if (!highlightMilestoneId || !selected) return;
    if (!selected.milestones.some((m) => m.id === highlightMilestoneId)) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`project-milestone-${highlightMilestoneId}`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
    }, 80);
    return () => window.clearTimeout(t);
  }, [highlightMilestoneId, selected]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-stretch">
        <aside className="flex max-h-[36vh] w-full shrink-0 flex-col lg:max-h-none lg:w-[320px]">
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-line/80 bg-white/55 p-2">
            <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2 px-1.5 pt-0.5">
              <div className="min-w-0 text-[12px] font-semibold tracking-tight text-[#3a3124]">
                Projects
                <span className="ml-1 font-medium text-muted tabular">
                  ({filtered.length}
                  {filtered.length !== projects.length
                    ? `/${projects.length}`
                    : ""}
                  )
                </span>
              </div>
              <button
                type="button"
                onClick={() => setProjectDraft({ mode: "create" })}
                className="pressable inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--color-gold)_38%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-gold-soft)_55%,white)] text-[#7a5b1f] hover:border-gold/55 hover:bg-[color-mix(in_srgb,var(--color-gold-soft)_78%,white)]"
                aria-label="Add project"
                title="Add project"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
              </button>
            </div>

            <label className="relative mb-1.5 block shrink-0">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-8 w-full rounded-lg border border-line bg-white py-1.5 pr-2.5 pl-8 text-[12px] text-charcoal outline-none transition-[border-color,box-shadow] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-gold/40 focus:border-gold/55 focus:shadow-[0_0_0_3px_rgb(198_161_91/0.16)]"
              />
            </label>

            <div className="mb-1.5 flex shrink-0 flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setTypeFilter("all")}
                className={cn(
                  "projects-chip",
                  TYPE_CHIP_CLASS,
                  typeFilter === "all" ? "is-on" : "projects-chip--idle",
                )}
              >
                All
              </button>
              {PROJECT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "projects-chip",
                    TYPE_CHIP_CLASS,
                    typeFilter === t ? "is-on" : "projects-chip--idle",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="mb-1.5 flex shrink-0 flex-wrap gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatus(f.id)}
                  className={cn(
                    "projects-chip",
                    f.id === "all" && "projects-chip--status-all",
                    f.id === "active" && "projects-chip--status-progressing",
                    f.id === "finished" && "projects-chip--status-finished",
                    status === f.id ? "is-on" : "projects-chip--idle",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="mb-1.5 shrink-0 px-0.5">
              <SortCombobox value={sortBy} onChange={setSortBy} />
            </div>

            <nav className="project-list-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-0.5 pt-1 pb-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {filtered.length === 0 ? (
                  <motion.div
                    key="empty-list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: easePremium }}
                    className="px-2 py-6 text-center text-[12px] text-muted"
                  >
                    No matching projects
                  </motion.div>
                ) : (
                  filtered.map((project) => {
                    const active = project.id === selectedId;
                    const finished = project.progressStatus === "complete";
                    return (
                      <motion.button
                        key={project.id}
                        id={`project-list-${project.id}`}
                        type="button"
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.24, ease: easePremium }}
                        whileTap={{ scale: 0.985 }}
                        onClick={() => selectProject(project.id)}
                        className={cn(
                          "project-list-item group",
                          finished
                            ? "project-list-item--finished"
                            : "project-list-item--progressing",
                          active && "project-list-item--active",
                        )}
                      >
                        <span
                          aria-hidden
                          className="project-list-item__rail"
                        />

                        <span className="absolute top-2 right-2">
                          <MilestoneProgressGlyph
                            budgetPct={budgetProgressPct(
                              project.releasedGrossCents,
                              project.grossCents,
                            )}
                            releasedMilestones={project.releasedCount}
                            totalMilestones={project.milestoneCount}
                            finished={finished}
                          />
                        </span>

                        <div className="pl-1">
                          <div
                            className={cn(
                              "text-[10px] font-medium tracking-[0.12em] uppercase",
                              finished ? "text-emerald" : "text-gold-dark",
                            )}
                          >
                            {finished ? "Finished" : "Progressing"}
                          </div>

                          <div className="mt-1.5 truncate text-[10px] font-medium tracking-[0.05em] uppercase text-muted">
                            <span className="text-[#5c4e38]">
                              {project.client_name}
                            </span>
                            <span className="mx-1 text-muted/50">·</span>
                            <span className="normal-case tracking-normal text-[#9a8768]">
                              {project.project_type}
                            </span>
                          </div>

                          <div className="mt-0.5 truncate font-display text-[14px] leading-snug font-semibold tracking-[-0.02em] text-[#3a3124]">
                            {project.name}
                          </div>

                          <div className="mt-2 flex items-baseline justify-between gap-2">
                            <span className="text-[10.5px] text-muted">
                              {project.milestoneCount} MS ·{" "}
                              {project.releasedCount}/
                              {project.milestoneCount || 0}
                            </span>
                            <span
                              className="text-[12px] font-semibold tabular tracking-tight"
                              title="Total gross / remaining gross"
                            >
                              <span className="text-charcoal">
                                {formatDollars(project.grossCents)}
                              </span>
                              <span className="mx-0.5 text-muted/45">/</span>
                              <span className="text-gold-dark">
                                {formatDollars(project.pendingGrossCents)}
                              </span>
                            </span>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })
                )}
              </AnimatePresence>
            </nav>
          </div>
        </aside>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          <AnimatePresence mode="wait" initial={false}>
            {selected ? (
              <motion.div
                key={selected.id}
                {...fadeSlide}
                className="min-h-0"
              >
                <ProjectBoardCard
                  project={selected}
                  highlightMilestoneId={highlightMilestoneId}
                  onClearHighlight={clearFocusLink}
                  onEditProject={() =>
                    setProjectDraft({
                      mode: "edit",
                      projectId: selected.id,
                      clientName: selected.client_name,
                      projectName: selected.name,
                      description: selected.description,
                      startDate: selected.start_date ?? undefined,
                      projectType: selected.project_type,
                    })
                  }
                  onAddMilestone={() =>
                    setMilestoneDraft({
                      mode: "create",
                      projectId: selected.id,
                      projectLabel: `${selected.client_name} · ${selected.name}`,
                      workMonth: currentMonth,
                    })
                  }
                  onEditMilestone={(ms) =>
                    setMilestoneDraft({
                      mode: "edit",
                      projectId: selected.id,
                      projectLabel: `${selected.client_name} · ${selected.name}`,
                      milestoneId: ms.id,
                      title: ms.title,
                      amountYuan: fromCents(ms.gross_cents),
                      transferFeePercent: ms.transfer_fee_bps / 100,
                      accountFeePercent: ms.account_fee_bps / 100,
                      feeCompound: ms.fee_compound,
                      workMonth: ms.work_month,
                      releasedAt: ms.released_at,
                      isReleased: ms.status === "released",
                    })
                  }
                  onToggleReleased={handleToggleReleased}
                  onDeleteProject={() => onDeleteProject(selected.id)}
                  onReorderMilestones={(orderedIds) =>
                    onReorderMilestones(selected.id, orderedIds)
                  }
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty-detail"
                {...fadeSlide}
                className="rounded-2xl border border-dashed border-line bg-white/40 px-5 py-10 text-center"
              >
                <p className="font-display text-[16px] font-semibold text-charcoal">
                  No projects yet
                </p>
                <p className="mt-1 text-[12.5px] text-muted">
                  Add a project, then manage milestones and payments here.
                </p>
                <button
                  type="button"
                  onClick={() => setProjectDraft({ mode: "create" })}
                  className="pressable mt-4 inline-flex h-10 items-center gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-gold-soft)_88%,white),color-mix(in_srgb,var(--color-gold-soft)_52%,white))] px-4 text-[13px] font-semibold text-[#7a5b1f] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.75)] hover:border-[color-mix(in_srgb,var(--color-gold)_55%,transparent)]"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.25} />
                  Add project
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <ProjectDrawer
        draft={projectDraft}
        onClose={() => setProjectDraft(null)}
        onSave={(data) => {
          if (!projectDraft) return;
          if (projectDraft.mode === "edit" && projectDraft.projectId) {
            onUpdateProject({
              projectId: projectDraft.projectId,
              clientName: data.clientName,
              projectName: data.projectName,
              description: data.description,
              startDate: data.startDate,
              projectType: data.projectType,
            });
          } else {
            const monthFromStart = data.startDate?.slice(0, 7);
            onAddProject({
              month: monthFromStart || currentMonth,
              clientName: data.clientName,
              projectName: data.projectName,
              description: data.description,
              startDate: data.startDate,
              finishDate: null,
              projectType: data.projectType,
            });
          }
          setProjectDraft(null);
        }}
      />

      <MilestoneDrawer
        draft={milestoneDraft}
        onClose={() => setMilestoneDraft(null)}
        onSave={(data) => {
          if (!milestoneDraft) return;
          if (milestoneDraft.mode === "edit" && milestoneDraft.milestoneId) {
            onUpdateMilestone({
              id: milestoneDraft.milestoneId,
              title: data.title,
              amountYuan: data.amountYuan,
              transferFeePercent: data.transferFeePercent,
              accountFeePercent: data.accountFeePercent,
              feeCompound: data.feeCompound,
              workMonth: data.workMonth,
              releasedAt: data.releasedAt,
            });
          } else {
            onAddMilestone({
              projectId: milestoneDraft.projectId,
              month: data.workMonth || milestoneDraft.workMonth,
              title: data.title,
              amountYuan: data.amountYuan,
              transferFeePercent: data.transferFeePercent,
              accountFeePercent: data.accountFeePercent,
              feeCompound: data.feeCompound,
            });
          }
          setMilestoneDraft(null);
        }}
        onDelete={
          milestoneDraft?.mode === "edit" && milestoneDraft.milestoneId
            ? () => {
                onDeleteMilestone(milestoneDraft.milestoneId!);
                setMilestoneDraft(null);
              }
            : undefined
        }
      />

      <ProjectCompleteModal
        info={celebration}
        onClose={() => setCelebration(null)}
      />
    </div>
  );
}

function ProjectBoardCard({
  project,
  highlightMilestoneId,
  onClearHighlight,
  onEditProject,
  onAddMilestone,
  onEditMilestone,
  onToggleReleased,
  onDeleteProject,
  onReorderMilestones,
}: {
  project: ProjectListItem;
  highlightMilestoneId?: string | null;
  onClearHighlight: () => void;
  onEditProject: () => void;
  onAddMilestone: () => void;
  onEditMilestone: (milestone: FreelanceMilestone) => void;
  onToggleReleased: (
    id: string,
    released: boolean,
    releasedAt?: string | null,
  ) => MilestoneReleaseResult | void;
  onDeleteProject: () => void;
  onReorderMilestones: (orderedIds: string[]) => void;
}) {
  const progress = budgetProgressPct(
    project.releasedGrossCents,
    project.grossCents,
  );
  const finished = project.progressStatus === "complete";
  const [releasePrompt, setReleasePrompt] = useState<{
    id: string;
    mode: "release" | "unrelease";
    date: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    setConfirmDelete(false);
    setDragId(null);
    setOverId(null);
  }, [project.id]);

  useEffect(() => {
    if (!releasePrompt) return;
    if (!project.milestones.some((m) => m.id === releasePrompt.id)) {
      setReleasePrompt(null);
    }
  }, [project.milestones, releasePrompt]);

  function withClear(action: () => void) {
    onClearHighlight();
    setConfirmDelete(false);
    action();
  }

  function dismissReleasePrompt() {
    setReleasePrompt(null);
  }

  function moveMilestone(fromId: string, toId: string) {
    if (fromId === toId) return;
    const ids = project.milestones.map((m) => m.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    onReorderMilestones(next);
  }

  return (
    <section
      className={cn(
        "rounded-2xl border bg-white/55",
        finished
          ? "border-[color-mix(in_srgb,var(--color-emerald)_16%,#e4ebe7)]"
          : "border-[color-mix(in_srgb,var(--color-gold)_16%,#ebe6dc)]",
      )}
      onClick={() => {
        if (highlightMilestoneId) onClearHighlight();
        if (releasePrompt) dismissReleasePrompt();
        if (confirmDelete) setConfirmDelete(false);
      }}
    >
      <div
        className={cn(
          "projects-detail-hero",
          finished
            ? "projects-detail-hero--finished"
            : "projects-detail-hero--progressing",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="projects-detail-title">{project.name}</h3>
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <AnimatePresence mode="wait" initial={false}>
                {confirmDelete ? (
                  <motion.div
                    key="delete-confirm"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="flex items-center gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDelete(false);
                        onDeleteProject();
                      }}
                      className="pressable projects-detail-action projects-detail-action--yes"
                      aria-label="Confirm delete"
                      title="Yes, delete"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="pressable projects-detail-action projects-detail-action--no"
                      aria-label="Cancel delete"
                      title="No"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.4} />
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="actions"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="flex items-center gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => withClear(onEditProject)}
                      className="pressable projects-detail-action"
                      aria-label="Edit project"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2.1} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClearHighlight();
                        setConfirmDelete(true);
                      }}
                      className="pressable projects-detail-action projects-detail-action--danger"
                      aria-label="Delete project"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.1} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          {project.description?.trim() ? (
            <ProjectDescriptionPeek text={project.description} />
          ) : null}

          <div className="projects-detail-meta">
            <div className="projects-detail-meta__row">
              <span className="projects-detail-meta__label">Client</span>
              <span className="projects-detail-meta__value">
                {project.client_name}
              </span>
            </div>
            <div className="projects-detail-meta__row">
              <span className="projects-detail-meta__label">Type</span>
              <span>
                <span className="projects-type-badge">
                  {project.project_type}
                </span>
              </span>
            </div>
            <div className="projects-detail-meta__row">
              <span className="projects-detail-meta__label">Worked on</span>
              <span className="projects-detail-meta__value">
                {formatWorkedOnSpan(project.start_date, project.finish_date)}
              </span>
            </div>
            <div className="projects-detail-meta__row">
              <span className="projects-detail-meta__label">Progress</span>
              <div
                className={cn(
                  "projects-detail-progress",
                  project.progressStatus === "complete" &&
                    "projects-detail-progress--done",
                  project.progressStatus === "partial" &&
                    "projects-detail-progress--partial",
                  project.progressStatus === "empty" &&
                    "projects-detail-progress--empty",
                )}
                title={`${progress}% of budget · ${project.releasedCount}/${project.milestoneCount || 0} milestones`}
              >
                <span className="projects-detail-progress__pct tabular">
                  {progress}%
                </span>
                <div className="projects-detail-progress__track">
                  <div
                    className="projects-detail-progress__fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="projects-detail-progress__count tabular">
                  {project.releasedCount}/{project.milestoneCount || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.06em] text-[#9a8768]">
              Project gross
            </div>
            <Money
              cents={project.grossCents}
              className="text-[22px] font-semibold text-[#3a3124]"
            />
            <div className="mt-0.5 space-y-0.5 text-[11px]">
              <div className="text-azure">
                Released{" "}
                <Money
                  cents={project.releasedGrossCents}
                  className="text-[11px] font-medium text-azure"
                />
              </div>
              <div className="text-gold-dark">
                Remaining{" "}
                <Money
                  cents={project.pendingGrossCents}
                  className="text-[11px] font-medium text-gold-dark"
                />
              </div>
            </div>
          </div>
      </div>

      <div className="px-4 pt-5 pb-6">
        {project.milestones.length === 0 ? (
          <button
            type="button"
            onClick={onAddMilestone}
            className="pressable w-full rounded-xl border border-dashed border-line px-3 py-5 text-left text-[12.5px] text-muted hover:border-gold/40 hover:bg-white/50"
          >
            Add the first milestone for this project
          </button>
        ) : (
          <div className="project-milestones-grid">
            <AnimatePresence initial={false}>
              {project.milestones.map((ms, index) => {
                const released = ms.status === "released";
                const highlighted = highlightMilestoneId === ms.id;
                const prompt =
                  releasePrompt?.id === ms.id ? releasePrompt : null;
                const dragging = dragId === ms.id;
                const dropTarget =
                  overId === ms.id && dragId != null && dragId !== ms.id;
                return (
                  <div
                    key={ms.id}
                    className={cn(
                      "project-milestone-shell",
                      released
                        ? "project-milestone-shell--released"
                        : "project-milestone-shell--pending",
                      dragging && "project-milestone-shell--dragging",
                      dropTarget && "project-milestone-shell--drop",
                    )}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragId && dragId !== ms.id) setOverId(ms.id);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      if (dragId && dragId !== ms.id) setOverId(ms.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const fromId =
                        e.dataTransfer.getData("text/plain") || dragId;
                      if (fromId) moveMilestone(fromId, ms.id);
                      setDragId(null);
                      setOverId(null);
                    }}
                  >
                  <motion.div
                    id={`project-milestone-${ms.id}`}
                    role="button"
                    tabIndex={0}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.22,
                      delay: Math.min(index * 0.03, 0.12),
                      ease: easePremium,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (didDragRef.current) return;
                      if (prompt) {
                        dismissReleasePrompt();
                        return;
                      }
                      withClear(() => onEditMilestone(ms));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (prompt) {
                          dismissReleasePrompt();
                          return;
                        }
                        withClear(() => onEditMilestone(ms));
                      }
                    }}
                    aria-label={`Edit milestone ${ms.title || ""}`}
                    className={cn(
                      "project-milestone relative flex h-full w-full cursor-pointer scroll-mt-4 flex-col rounded-[18px] px-3.5 pt-3.5 pb-4",
                      released
                        ? "project-milestone--released"
                        : "project-milestone--pending",
                      highlighted && "project-milestone--focus",
                      prompt && "project-milestone--prompt",
                    )}
                  >
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "project-milestone__status",
                        released
                          ? "project-milestone__status--released"
                          : "project-milestone__status--waiting",
                      )}
                    >
                      {released ? "Released" : "Waiting"}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-semibold tracking-[0.08em] text-[#b5aa95] uppercase">
                        MS {index + 1}
                      </span>
                      <button
                        type="button"
                        draggable={!prompt}
                        aria-label={`Drag to reorder ${ms.title || "milestone"}`}
                        title="Drag to reorder"
                        className="project-milestone__drag pressable"
                        onClick={(e) => e.stopPropagation()}
                        onDragStart={(e) => {
                          if (prompt) {
                            e.preventDefault();
                            return;
                          }
                          e.stopPropagation();
                          didDragRef.current = true;
                          setDragId(ms.id);
                          setOverId(ms.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", ms.id);
                          const shell = e.currentTarget.closest(
                            ".project-milestone-shell",
                          );
                          if (shell instanceof HTMLElement) {
                            try {
                              e.dataTransfer.setDragImage(shell, 24, 24);
                            } catch {
                              /* ignore */
                            }
                          }
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverId(null);
                          window.setTimeout(() => {
                            didDragRef.current = false;
                          }, 0);
                        }}
                      >
                        <GripVertical
                          className="h-3.5 w-3.5"
                          strokeWidth={2.2}
                        />
                      </button>
                    </div>
                  </div>

                  <p className="min-h-[40px] text-left text-[13px] leading-snug font-semibold tracking-tight text-[#3a3124]">
                    {ms.title || "Milestone"}
                  </p>

                  <p
                    className={cn(
                      "mt-1.5 min-h-[17px] text-[11px] font-medium",
                      released ? "text-emerald" : "invisible",
                    )}
                    aria-hidden={!released}
                  >
                    {released
                      ? (formatReleasedAt(ms.released_at) ?? "\u00a0")
                      : "\u00a0"}
                  </p>

                  <div className="project-milestone__body relative mt-3 flex min-h-[168px] flex-col border-t border-[#e8e0d2]/90 pt-3">
                    <AnimatePresence initial={false} mode="wait">
                      {prompt ? (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          className="project-milestone__confirm"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {prompt.mode === "release" ? (
                            <>
                              <p className="project-milestone__confirm-label">
                                Release date
                              </p>
                              <input
                                type="date"
                                value={prompt.date}
                                onChange={(e) =>
                                  setReleasePrompt((prev) =>
                                    prev && prev.id === ms.id
                                      ? { ...prev, date: e.target.value }
                                      : prev,
                                  )
                                }
                                className="project-milestone__confirm-date"
                                aria-label="Release date"
                              />
                            </>
                          ) : (
                            <p className="mb-2 px-0.5 text-[12px] leading-snug text-charcoal">
                              Clear this release?
                            </p>
                          )}
                          <div className="project-milestone__confirm-actions">
                            <button
                              type="button"
                              onClick={dismissReleasePrompt}
                              className="pressable project-milestone__confirm-no"
                            >
                              No
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  prompt.mode === "release" &&
                                  !/^\d{4}-\d{2}-\d{2}$/.test(prompt.date)
                                ) {
                                  return;
                                }
                                withClear(() =>
                                  onToggleReleased(
                                    ms.id,
                                    prompt.mode === "release",
                                    prompt.mode === "release"
                                      ? prompt.date
                                      : null,
                                  ),
                                );
                                dismissReleasePrompt();
                              }}
                              disabled={
                                prompt.mode === "release" &&
                                !/^\d{4}-\d{2}-\d{2}$/.test(prompt.date)
                              }
                              className={cn(
                                "pressable project-milestone__confirm-yes",
                                prompt.mode === "unrelease" &&
                                  "project-milestone__confirm-yes--danger",
                              )}
                            >
                              Yes
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="details"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          className="flex min-h-[148px] flex-1 flex-col"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-2 text-[11px] text-[#9a8768]">
                              <span>Gross</span>
                              <Money
                                cents={ms.gross_cents}
                                className="text-[12px] font-medium text-[#3a3124]"
                              />
                            </div>
                            <div className="flex items-baseline justify-between gap-2 text-[11px] text-[#9a8768]">
                              <span>
                                Transfer {ms.transfer_fee_bps / 100}%
                                {ms.fee_compound ? " · ×" : ""}
                              </span>
                              <Money
                                cents={ms.transfer_fee_cents}
                                className="text-[12px] font-medium text-[#6b6358]"
                              />
                            </div>
                            <div className="flex items-baseline justify-between gap-2 text-[11px] text-[#9a8768]">
                              <span>
                                Account {ms.account_fee_bps / 100}%
                              </span>
                              <Money
                                cents={ms.account_fee_cents}
                                className="text-[12px] font-medium text-[#6b6358]"
                              />
                            </div>
                            <div className="project-milestone__net">
                              <span className="project-milestone__net-label">
                                Net
                              </span>
                              <Money
                                cents={ms.net_cents}
                                className={cn(
                                  "project-milestone__amount",
                                  released
                                    ? "project-milestone__amount--released"
                                    : "project-milestone__amount--pending",
                                )}
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onClearHighlight();
                              setReleasePrompt({
                                id: ms.id,
                                mode: released ? "unrelease" : "release",
                                date: format(new Date(), "yyyy-MM-dd"),
                              });
                            }}
                            className={cn(
                              "pressable projects-release-btn",
                              released && "projects-release-btn--done",
                            )}
                          >
                            {released ? (
                              <>
                                <Check
                                  className="h-3.5 w-3.5"
                                  strokeWidth={2.5}
                                />
                                Released
                              </>
                            ) : (
                              "Mark released"
                            )}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  </motion.div>
                  </div>
                );
              })}
            </AnimatePresence>

            <button
              type="button"
              onClick={onAddMilestone}
              className="pressable project-milestone-shell project-milestone-shell--add flex min-h-[280px] w-full flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-[color-mix(in_srgb,var(--color-gold)_30%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-gold-soft)_22%,white)] text-[12px] font-medium text-[#8a7d66] hover:border-gold/50 hover:bg-[color-mix(in_srgb,var(--color-gold-soft)_40%,white)] hover:text-[#3a3124]"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ProjectDrawer({
  draft,
  onClose,
  onSave,
}: {
  draft: ProjectDraft | null;
  onClose: () => void;
  onSave: (data: {
    clientName: string;
    projectName: string;
    description?: string;
    startDate: string | null;
    projectType: ProjectType;
  }) => void;
}) {
  const open = draft != null;
  const [clientName, setClientName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("Kareem");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    setClientName(draft.clientName ?? "");
    setProjectName(draft.projectName ?? "");
    setDescription(
      draft.description ? formatProjectDescription(draft.description) : "",
    );
    setStartDate(
      draft.mode === "edit"
        ? (draft.startDate ?? "")
        : (draft.startDate ?? format(new Date(), "yyyy-MM-dd")),
    );
    setProjectType(draft.projectType ?? "Kareem");
    setError(null);
  }, [draft]);

  return (
    <ModalShell
      open={open}
      tone="gold"
      wide
      title={draft?.mode === "edit" ? "Edit project" : "Add project"}
      onClose={onClose}
      onSubmit={() => {
        try {
          onSave({
            clientName,
            projectName,
            description,
            startDate: startDate.trim() || null,
            projectType,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save");
        }
      }}
      submitLabel={draft?.mode === "edit" ? "Save changes" : "Save project"}
      disabled={!clientName.trim() || !projectName.trim()}
    >
      <Field label="Project name">
        <input
          className="field"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Website rebuild"
          required
        />
      </Field>
      <Field label="Client name">
        <input
          className="field"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Androw"
          required
        />
      </Field>
      <div className="block space-y-1.5">
        <span className="projects-modal__field-label">Type</span>
        <ProjectTypeCombobox value={projectType} onChange={setProjectType} />
      </div>
      <Field label="Start date">
        <input
          className="field"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </Field>
      <Field label="Description">
        <textarea
          className="field projects-modal__desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={"M1 Scope · ~1 week · $2,000\nM2 …"}
          rows={8}
        />
      </Field>
      {error && (
        <p className="rounded-xl bg-coral-soft px-3 py-2 text-[13px] text-coral">
          {error}
        </p>
      )}
    </ModalShell>
  );
}

function MilestoneDrawer({
  draft,
  onClose,
  onSave,
  onDelete,
}: {
  draft: MilestoneDraft | null;
  onClose: () => void;
  onSave: (data: {
    title?: string;
    amountYuan: number;
    transferFeePercent: number;
    accountFeePercent: number;
    feeCompound: boolean;
    workMonth?: string;
    releasedAt?: string | null;
  }) => void;
  onDelete?: () => void;
}) {
  const open = draft != null;
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [transferFee, setTransferFee] = useState("5");
  const [accountFee, setAccountFee] = useState("0");
  const [feeCompound, setFeeCompound] = useState(false);
  const [workMonth, setWorkMonth] = useState("");
  const [releasedAt, setReleasedAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setTitle(draft.title ?? "");
    setAmount(draft.amountYuan != null ? String(draft.amountYuan) : "");
    setTransferFee(
      draft.transferFeePercent != null ? String(draft.transferFeePercent) : "5",
    );
    setAccountFee(
      draft.accountFeePercent != null ? String(draft.accountFeePercent) : "0",
    );
    setFeeCompound(Boolean(draft.feeCompound));
    setWorkMonth(draft.workMonth ?? "");
    setReleasedAt(toDateInput(draft.releasedAt));
    setError(null);
    setConfirmDelete(false);
  }, [draft]);

  const amountNum = Number(amount);
  const transferFeeNum = Number(transferFee);
  const accountFeeNum = Number(accountFee);
  const feesValid =
    Number.isFinite(transferFeeNum) &&
    Number.isFinite(accountFeeNum) &&
    transferFeeNum >= 0 &&
    transferFeeNum <= 100 &&
    accountFeeNum >= 0 &&
    accountFeeNum <= 100 &&
    (feeCompound || transferFeeNum + accountFeeNum <= 100);
  const netPreview =
    Number.isFinite(amountNum) && feesValid
      ? feeCompound
        ? amountNum * (1 - transferFeeNum / 100) * (1 - accountFeeNum / 100)
        : amountNum * (1 - (transferFeeNum + accountFeeNum) / 100)
      : null;

  const releasedTone = Boolean(draft?.isReleased);

  return (
    <ModalShell
      open={open}
      tone={releasedTone ? "emerald" : "gold"}
      title={
        draft?.mode === "edit"
          ? releasedTone
            ? "Edit released milestone"
            : "Edit milestone"
          : "Add milestone"
      }
      subtitle={draft?.projectLabel}
      onClose={onClose}
      onSubmit={() => {
        try {
          onSave({
            title: title.trim() || undefined,
            amountYuan: amountNum,
            transferFeePercent: transferFeeNum,
            accountFeePercent: accountFeeNum,
            feeCompound,
            workMonth:
              draft?.isReleased
                ? undefined
                : workMonth.trim() || draft?.workMonth || undefined,
            releasedAt: draft?.isReleased
              ? releasedAt.trim() || null
              : undefined,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save");
        }
      }}
      submitLabel={draft?.mode === "edit" ? "Save changes" : "Save milestone"}
      disabled={!(amountNum > 0) || !feesValid}
      footerStart={
        onDelete ? (
          confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete();
                }}
                className="pressable projects-modal__delete-confirm"
              >
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="pressable projects-modal__delete-cancel"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="pressable projects-modal__delete"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.1} />
              Delete
            </button>
          )
        ) : undefined
      }
    >
      <Field label="Title">
        <input
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="M1 · Sprint · Bonus"
        />
      </Field>
      <Field label="Gross amount">
        <input
          className="field tabular"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1200"
          required
        />
      </Field>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <Field label="Transfer fee %">
          <input
            className="field tabular"
            inputMode="decimal"
            value={transferFee}
            onChange={(e) => setTransferFee(e.target.value)}
            placeholder="5"
            required
          />
        </Field>
        <button
          type="button"
          onClick={() => setFeeCompound((v) => !v)}
          title={
            feeCompound
              ? "Compound on: net = gross × (1−transfer) × (1−account)"
              : "Additive: net = gross − both fees"
          }
          className={cn(
            "pressable projects-modal__compound",
            feeCompound && "is-on",
          )}
          aria-pressed={feeCompound}
          aria-label={
            feeCompound ? "Compound fees on" : "Compound fees off"
          }
        >
          ×
        </button>
        <Field label="Account fee %">
          <input
            className="field tabular"
            inputMode="decimal"
            value={accountFee}
            onChange={(e) => setAccountFee(e.target.value)}
            placeholder="0"
            required
          />
        </Field>
      </div>
      <p className="text-[11px] text-muted">
        {feeCompound
          ? "Compound on — keep (1 − transfer%) then (1 − account%)"
          : "Additive — both fees taken from gross"}
      </p>
      {draft?.isReleased && (
        <Field label="Released date">
          <input
            className="field"
            type="date"
            value={releasedAt}
            onChange={(e) => setReleasedAt(e.target.value)}
          />
        </Field>
      )}
      {netPreview != null && Number.isFinite(netPreview) && (
        <div className="projects-modal__net">
          <span className="projects-modal__net-label">Net after fees</span>
          <span className="projects-modal__net-value tabular">
            {netPreview.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      )}
      {error && (
        <p className="rounded-xl bg-coral-soft px-3 py-2 text-[13px] text-coral">
          {error}
        </p>
      )}
    </ModalShell>
  );
}

function ProjectTypeCombobox({
  value,
  onChange,
}: {
  value: ProjectType;
  onChange: (next: ProjectType) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="project-type-combo relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "project-type-combo__trigger",
          open && "project-type-combo__trigger--open",
        )}
      >
        <span className="truncate font-semibold text-[#7a5b1f]">{value}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[#9a8768] transition-transform duration-180",
            open && "rotate-180 text-[#7a5b1f]",
          )}
          strokeWidth={2.2}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.ul
            role="listbox"
            aria-label="Project type"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="project-type-combo__menu"
          >
            {PROJECT_TYPES.map((t) => {
              const active = t === value;
              return (
                <li key={t} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(t);
                      setOpen(false);
                    }}
                    className={cn(
                      "project-type-combo__option",
                      active && "project-type-combo__option--active",
                    )}
                  >
                    <span className="truncate">{t}</span>
                    {active ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-[#7a5b1f]"
                        strokeWidth={2.4}
                      />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SortCombobox({
  value,
  onChange,
}: {
  value: (typeof SORT_OPTIONS)[number]["id"];
  onChange: (id: (typeof SORT_OPTIONS)[number]["id"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected =
    SORT_OPTIONS.find((o) => o.id === value) ?? SORT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="project-sort relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn("project-sort__trigger", open && "project-sort__trigger--open")}
      >
        <span className="project-sort__label truncate">
          <span className="text-muted">Sort</span>
          <span className="project-sort__dot">·</span>
          <span>{selected.label}</span>
        </span>
        <ChevronDown
          className={cn(
            "project-sort__chevron h-3.5 w-3.5 shrink-0",
            open && "project-sort__chevron--open",
          )}
          strokeWidth={2}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.ul
            role="listbox"
            aria-label="Sort projects"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="project-sort__menu"
          >
            {SORT_OPTIONS.map((opt) => {
              const active = opt.id === value;
              return (
                <li key={opt.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "project-sort__option",
                      active && "project-sort__option--active",
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {active ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-emerald"
                        strokeWidth={2.4}
                      />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ModalShell({
  open,
  tone = "gold",
  wide = false,
  title,
  subtitle,
  onClose,
  onSubmit,
  submitLabel,
  disabled,
  footerStart,
  children,
}: {
  open: boolean;
  tone?: "gold" | "azure" | "emerald";
  wide?: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
  footerStart?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close dialog"
            className={cn(
              "projects-modal-scrim",
              tone === "azure" && "projects-modal-scrim--azure",
              tone === "emerald" && "projects-modal-scrim--emerald",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: easePremium }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="projects-modal-title"
            className={cn(
              "projects-modal",
              wide && "projects-modal--wide",
              tone === "azure" && "projects-modal--azure",
              tone === "emerald" && "projects-modal--emerald",
            )}
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.34, ease: easePremium }}
          >
            <div className="projects-modal__header">
              <div className="min-w-0">
                <h2
                  id="projects-modal-title"
                  className="projects-modal__title"
                >
                  {title}
                </h2>
                {subtitle ? (
                  <p className="projects-modal__subtitle">{subtitle}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="pressable projects-modal__close"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.35} />
              </button>
            </div>

            <div className="projects-modal__body">{children}</div>

            <div
              className={cn(
                "projects-modal__footer",
                footerStart && "projects-modal__footer--with-start",
              )}
            >
              {footerStart ? (
                <div className="projects-modal__footer-start">{footerStart}</div>
              ) : null}
              <div className="projects-modal__footer-actions">
                <button
                  type="button"
                  onClick={onClose}
                  className="pressable projects-modal__cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onSubmit}
                  className="pressable projects-modal__submit"
                >
                  {submitLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="projects-modal__field-label">{label}</span>
      {children}
    </label>
  );
}
