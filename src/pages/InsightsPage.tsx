import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ChuckChannelEntry,
  ChuckChannelMonthGroup,
  FreelanceIncomeMonthRow,
  InsightsView,
  ProjectInsights,
} from "@/lib/db/domain";
import { fromCents } from "@/lib/money";
import { Money, Panel, Pill } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const TYPE_COLORS: Record<string, string> = {
  Kareem: "#24705A",
  Greg: "#C6A15B",
  Binance: "#8F6B2E",
};

type Tab = "projects" | "freelance" | "partners" | "fromChuck";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "projects", label: "Projects" },
  { id: "freelance", label: "Freelance" },
  { id: "partners", label: "Partners" },
  { id: "fromChuck", label: "From Chuck" },
];

export function InsightsPage({
  data,
  onSaveFreelanceHand,
  onSaveJackieIncome,
  onSaveChuckIncome,
  onAddChuckChannel,
  onUpdateChuckChannel,
  onDeleteChuckChannel,
}: {
  data: InsightsView;
  onSaveFreelanceHand: (input: {
    month: string;
    usdAmount: number;
    yuanAmount: number;
    keepAmount?: number;
    notes?: string;
  }) => void;
  onSaveJackieIncome: (input: { month: string; amountYuan: number }) => void;
  onSaveChuckIncome: (input: { month: string; amountYuan: number }) => void;
  onAddChuckChannel: (input: {
    occurredOn: string;
    givenUsd: number;
    realIncomeUsd: number;
    note?: string;
  }) => void;
  onUpdateChuckChannel: (input: {
    id: string;
    occurredOn: string;
    givenUsd: number;
    realIncomeUsd: number;
    note?: string | null;
  }) => void;
  onDeleteChuckChannel: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("projects");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex rounded-xl bg-ivory-deep p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition",
                tab === t.id
                  ? "bg-white text-charcoal shadow-sm"
                  : "text-muted hover:text-charcoal",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "projects" ? (
        <ProjectsTab projects={data.projects} />
      ) : tab === "freelance" ? (
        <FreelanceTab
          rows={data.freelanceMonths}
          onSave={onSaveFreelanceHand}
        />
      ) : tab === "partners" ? (
        <PartnersTab
          rows={data.freelanceMonths}
          onSaveJackie={onSaveJackieIncome}
          onSaveChuck={onSaveChuckIncome}
        />
      ) : (
        <FromChuckTab
          groups={data.chuckChannelMonths}
          onAdd={onAddChuckChannel}
          onUpdate={onUpdateChuckChannel}
          onDelete={onDeleteChuckChannel}
        />
      )}
    </div>
  );
}

function ProjectsTab({ projects }: { projects: ProjectInsights }) {
  const monthlyFreelance = projects.months.map((m) => ({
    label: m.label,
    Released: fromCents(m.releasedNetCents),
    Gross: fromCents(m.grossCents),
  }));
  const typePie = projects.byType
    .filter((t) => t.releasedNetCents > 0)
    .map((t) => ({
      name: t.type,
      value: fromCents(t.releasedNetCents),
      raw: t.releasedNetCents,
    }));
  const maxProject = Math.max(
    ...projects.topProjects.map((p) => p.releasedNetCents),
    1,
  );
  const hasProjectIncome =
    projects.totals.releasedNetCents > 0 ||
    projects.totals.pendingNetCents > 0 ||
    projects.topProjects.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="max-w-xl text-[12.5px] text-muted">
          Released milestone income from{" "}
          <Link
            to="/projects"
            className="font-medium text-gold-dark underline-offset-2 hover:underline"
          >
            Projects
          </Link>{" "}
          ·{" "}
          <Link
            to="/freelance"
            className="font-medium text-gold-dark underline-offset-2 hover:underline"
          >
            Freelance
          </Link>
        </p>
        <div className="flex flex-wrap gap-2">
          <Pill tone="success">
            Released{" "}
            <Money
              cents={projects.totals.releasedNetCents}
              className="text-[11px] font-semibold"
            />
          </Pill>
          <Pill tone="warn">
            Pending{" "}
            <Money
              cents={projects.totals.pendingNetCents}
              className="text-[11px] font-semibold"
            />
          </Pill>
        </div>
      </div>

      {!hasProjectIncome ? (
        <Panel>
          <p className="text-[13px] text-muted">
            No project milestones yet. Add projects and release milestones to see
            monthly income charts here.
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel>
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted">
                Released net
              </div>
              <Money
                cents={projects.totals.releasedNetCents}
                tone="income"
                className="mt-2 text-[20px] font-semibold"
              />
            </Panel>
            <Panel>
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted">
                Released gross
              </div>
              <Money
                cents={projects.totals.releasedGrossCents}
                className="mt-2 text-[20px] font-semibold"
              />
            </Panel>
            <Panel>
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted">
                Pipeline
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-[20px] font-semibold tabular text-charcoal">
                  {projects.totals.activeCount}
                </span>
                <span className="text-[12px] text-muted">
                  active · {projects.totals.finishedCount} finished
                </span>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Panel>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="font-display text-[15px] font-semibold text-charcoal">
                  Monthly released income
                </h3>
                <Pill tone="neutral">Last 6 months</Pill>
              </div>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyFreelance}>
                    <CartesianGrid
                      stroke="#DED9CD"
                      strokeDasharray="3 6"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#6d6a60", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#6d6a60", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #DED9CD",
                        background: "#FCFAF5",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="Gross" fill="#E8D7B0" radius={[6, 6, 0, 0]} />
                    <Bar
                      dataKey="Released"
                      fill="#24705A"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel>
              <div className="mb-4">
                <h3 className="font-display text-[15px] font-semibold text-charcoal">
                  By project type
                </h3>
                <p className="mt-1 text-[12.5px] text-muted">
                  Released net by type
                </p>
              </div>
              {typePie.length === 0 ? (
                <p className="text-[13px] text-muted">
                  No released project income yet.
                </p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="h-[160px] w-[160px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={typePie}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={42}
                          outerRadius={68}
                          paddingAngle={2}
                        >
                          {typePie.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={TYPE_COLORS[entry.name] ?? "#C6A15B"}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid #DED9CD",
                            background: "#FCFAF5",
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    {projects.byType.map((t) => (
                      <div
                        key={t.type}
                        className="flex items-center justify-between gap-2 text-[12.5px]"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              background: TYPE_COLORS[t.type] ?? "#C6A15B",
                            }}
                          />
                          {t.type}
                          <span className="text-muted">· {t.projectCount}</span>
                        </span>
                        <Money
                          cents={t.releasedNetCents}
                          className="font-semibold"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <Panel>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="font-display text-[15px] font-semibold text-charcoal">
                Top projects
              </h3>
              <Pill tone="neutral">By released net</Pill>
            </div>
            <div className="space-y-3">
              {projects.topProjects.map((p) => (
                <div key={p.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
                    <div className="min-w-0 truncate">
                      <span className="font-medium text-charcoal">{p.name}</span>
                      <span className="text-muted">
                        {" "}
                        · {p.clientName} · {p.projectType}
                      </span>
                    </div>
                    <Money
                      cents={p.releasedNetCents}
                      className="shrink-0 font-semibold text-emerald"
                    />
                  </div>
                  <div className="lg-progress lg-progress--sm lg-progress--emerald">
                    <div
                      className="lg-progress__fill"
                      style={{
                        width: `${(p.releasedNetCents / maxProject) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function amountInputValue(cents: number): string {
  if (!cents) return "";
  const n = fromCents(cents);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function chuckFeePct(
  givenCentsOrUsd: number,
  realCentsOrUsd: number,
): number | null {
  if (!(givenCentsOrUsd > 0) || !Number.isFinite(realCentsOrUsd)) return null;
  return (
    Math.round(((givenCentsOrUsd - realCentsOrUsd) / givenCentsOrUsd) * 1000) /
    10
  );
}

function formatChuckFeePct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${pct}%`;
}

function AmountInput({
  value,
  onChange,
  onCommit,
  ariaLabel,
  allowNegative = false,
  currency = "USD",
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  ariaLabel: string;
  allowNegative?: boolean;
  currency?: "USD" | "CNY";
}) {
  return (
    <div className="freelance-settle__field">
      <span className="freelance-settle__prefix" aria-hidden>
        {currency === "CNY" ? "¥" : "$"}
      </span>
      <input
        className="field freelance-settle__input"
        inputMode="decimal"
        value={value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={ariaLabel}
        title={allowNegative ? "Negative allowed" : undefined}
      />
    </div>
  );
}

function useYearFilter<T extends { month: string }>(rows: T[]) {
  const years = useMemo(() => {
    const set = new Set(rows.map((r) => Number(r.month.slice(0, 4))));
    set.add(2026);
    return [...set].sort((a, b) => b - a);
  }, [rows]);
  const [year, setYear] = useState(() => years[0] ?? 2026);

  useEffect(() => {
    if (!years.includes(year) && years.length > 0) setYear(years[0]);
  }, [years, year]);

  const visible = useMemo(
    () =>
      rows
        .filter((r) => r.month.startsWith(`${year}-`) && r.month >= "2026-01")
        .sort((a, b) => b.month.localeCompare(a.month)),
    [rows, year],
  );

  return { years, year, setYear, visible };
}

function FreelanceTab({
  rows,
  onSave,
}: {
  rows: FreelanceIncomeMonthRow[];
  onSave: (input: {
    month: string;
    usdAmount: number;
    yuanAmount: number;
    keepAmount?: number;
    notes?: string;
  }) => void;
}) {
  const { years, year, setYear, visible } = useYearFilter(rows);

  const earned = visible.reduce((s, r) => s + r.freelanceNetCents, 0);
  const received = visible.reduce((s, r) => s + r.usdCents, 0);
  const kept = visible.reduce((s, r) => s + r.keepCents, 0);
  const yours = received - kept;
  const receivedPct = earned > 0 ? Math.round((received / earned) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-[17px] font-semibold tracking-tight text-charcoal">
          Monthly settlement
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <YearSelect value={year} years={years} onChange={setYear} />
          <Link
            to="/freelance"
            className="text-[12px] font-medium text-gold-dark underline-offset-2 hover:underline"
          >
            Open Freelance board
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="freelance-stat freelance-stat--earned">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
            Earned
          </div>
          <Money
            cents={earned}
            className="mt-1.5 text-[22px] font-semibold text-charcoal"
          />
          <p className="mt-1 text-[11px] text-muted">Freelance net · {year}</p>
        </div>
        <div className="freelance-stat freelance-stat--received">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-emerald uppercase">
            Received
          </div>
          <Money
            cents={received}
            tone="income"
            className="mt-1.5 text-[22px] font-semibold"
          />
          <p className="mt-1 text-[11px] text-muted">
            {receivedPct == null ? "In hand" : `${receivedPct}% of earned`}
          </p>
        </div>
        <div className="freelance-stat freelance-stat--keep">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-gold-dark uppercase">
            Keep
          </div>
          <Money
            cents={kept}
            tone="gold"
            className="mt-1.5 text-[22px] font-semibold"
          />
          <p className="mt-1 text-[11px] text-muted">Boss share (can be −)</p>
        </div>
        <div className="freelance-stat freelance-stat--yours">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-emerald uppercase">
            Yours
          </div>
          <Money
            cents={yours}
            className={cn(
              "mt-1.5 text-[22px] font-semibold",
              yours >= 0 ? "text-emerald" : "text-coral",
            )}
          />
          <p className="mt-1 text-[11px] text-muted">Received − keep</p>
        </div>
      </div>

      <Panel>
        <div className="-mx-1 overflow-x-auto">
          <table className="freelance-settle w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr>
                <th>Month</th>
                <th>Earned</th>
                <th>Received</th>
                <th>Keep</th>
                <th>Yours</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-[13px] text-muted"
                  >
                    No months for {year}. Settlement starts Jan 2026.
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <FreelanceMonthRow key={row.month} row={row} onSave={onSave} />
                ))
              )}
            </tbody>
            {visible.length > 0 ? (
              <tfoot>
                <tr className="freelance-settle__total">
                  <td>
                    <div className="text-[13px] font-semibold tracking-tight text-charcoal">
                      Total
                    </div>
                    <div className="text-[11px] text-muted">
                      {visible.length} month{visible.length === 1 ? "" : "s"} ·{" "}
                      {year}
                    </div>
                  </td>
                  <td>
                    <Money
                      cents={earned}
                      className="text-[14px] font-semibold text-charcoal"
                    />
                  </td>
                  <td>
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-semibold tracking-[0.08em] text-emerald uppercase">
                        Received
                      </div>
                      <Money
                        cents={received}
                        tone="income"
                        className="text-[14px] font-semibold"
                      />
                    </div>
                  </td>
                  <td>
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-semibold tracking-[0.08em] text-gold-dark uppercase">
                        Keep
                      </div>
                      <Money
                        cents={kept}
                        tone="gold"
                        className="text-[14px] font-semibold"
                      />
                    </div>
                  </td>
                  <td>
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                        Yours
                      </div>
                      <Money
                        cents={yours}
                        className={cn(
                          "text-[14px] font-semibold",
                          yours >= 0 ? "text-emerald" : "text-coral",
                        )}
                      />
                    </div>
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Panel>
    </div>
  );
}

function PartnersTab({
  rows,
  onSaveJackie,
  onSaveChuck,
}: {
  rows: FreelanceIncomeMonthRow[];
  onSaveJackie: (input: { month: string; amountYuan: number }) => void;
  onSaveChuck: (input: { month: string; amountYuan: number }) => void;
}) {
  const { years, year, setYear, visible } = useYearFilter(rows);

  const jackieIncome = visible.reduce((s, r) => s + r.jackieIncomeCents, 0);
  const jackieGoods = visible.reduce((s, r) => s + r.jackieGoodsCents, 0);
  const jackieBenefit = jackieIncome - jackieGoods;
  const chuckIncome = visible.reduce((s, r) => s + r.chuckIncomeCents, 0);
  const chuckGoods = visible.reduce((s, r) => s + r.chuckGoodsCents, 0);
  const chuckBenefit = chuckIncome - chuckGoods;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-semibold tracking-tight text-charcoal">
            Jackie &amp; Chuck
          </h2>
          <p className="mt-1 max-w-xl text-[12.5px] text-muted">
            Partner income (editable) vs goods spend tagged to each person.
            Benefit is income − goods.
          </p>
        </div>
        <YearSelect value={year} years={years} onChange={setYear} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="freelance-stat freelance-stat--jackie-income">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-emerald uppercase">
            Jackie income
          </div>
          <Money
            currency="CNY"
            cents={jackieIncome}
            tone="income"
            className="mt-1.5 text-[20px] font-semibold"
          />
          <p className="mt-1 text-[11px] text-muted">Synced with Goods · {year}</p>
        </div>
        <div className="freelance-stat freelance-stat--jackie-goods">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-coral uppercase">
            Jackie goods
          </div>
          <Money
            currency="CNY"
            cents={jackieGoods}
            className="mt-1.5 text-[20px] font-semibold text-coral"
          />
          <p className="mt-1 text-[11px] text-muted">Purchases tagged Jackie</p>
        </div>
        <div className="freelance-stat freelance-stat--jackie-benefit">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-gold-dark uppercase">
            Jackie benefit
          </div>
          <Money
            currency="CNY"
            cents={jackieBenefit}
            className={cn(
              "mt-1.5 text-[20px] font-semibold",
              jackieBenefit >= 0 ? "text-emerald" : "text-coral",
            )}
          />
          <p className="mt-1 text-[11px] text-muted">Income − goods</p>
        </div>
        <div className="freelance-stat freelance-stat--chuck-income">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-emerald uppercase">
            Chuck income
          </div>
          <Money
            currency="CNY"
            cents={chuckIncome}
            tone="income"
            className="mt-1.5 text-[20px] font-semibold"
          />
          <p className="mt-1 text-[11px] text-muted">Synced with Goods · {year}</p>
        </div>
        <div className="freelance-stat freelance-stat--chuck-goods">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-coral uppercase">
            Chuck goods
          </div>
          <Money
            currency="CNY"
            cents={chuckGoods}
            className="mt-1.5 text-[20px] font-semibold text-coral"
          />
          <p className="mt-1 text-[11px] text-muted">Purchases tagged Chuck</p>
        </div>
        <div className="freelance-stat freelance-stat--chuck-benefit">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-gold-dark uppercase">
            Chuck benefit
          </div>
          <Money
            currency="CNY"
            cents={chuckBenefit}
            className={cn(
              "mt-1.5 text-[20px] font-semibold",
              chuckBenefit >= 0 ? "text-emerald" : "text-coral",
            )}
          />
          <p className="mt-1 text-[11px] text-muted">Income − goods</p>
        </div>
      </div>

      <Panel>
        <div className="-mx-1 overflow-x-auto">
          <table className="freelance-settle w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr>
                <th>Month</th>
                <th>Jackie income</th>
                <th>Jackie goods</th>
                <th>Jackie benefit</th>
                <th>Chuck income</th>
                <th>Chuck goods</th>
                <th>Chuck benefit</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-[13px] text-muted"
                  >
                    No months for {year}. Starts Jan 2026.
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <PartnersMonthRow
                    key={row.month}
                    row={row}
                    onSaveJackie={onSaveJackie}
                    onSaveChuck={onSaveChuck}
                  />
                ))
              )}
            </tbody>
            {visible.length > 0 ? (
              <tfoot>
                <tr className="freelance-settle__total">
                  <td>
                    <div className="text-[13px] font-semibold tracking-tight text-charcoal">
                      Total
                    </div>
                    <div className="text-[11px] text-muted">
                      {visible.length} month{visible.length === 1 ? "" : "s"} ·{" "}
                      {year}
                    </div>
                  </td>
                  <td>
                    <Money
                      currency="CNY"
                      cents={jackieIncome}
                      tone="income"
                      className="text-[14px] font-semibold"
                    />
                  </td>
                  <td>
                    <Money
                      currency="CNY"
                      cents={jackieGoods}
                      className="text-[14px] font-semibold text-coral"
                    />
                  </td>
                  <td>
                    <Money
                      currency="CNY"
                      cents={jackieBenefit}
                      className={cn(
                        "text-[14px] font-semibold",
                        jackieBenefit >= 0 ? "text-emerald" : "text-coral",
                      )}
                    />
                  </td>
                  <td>
                    <Money
                      currency="CNY"
                      cents={chuckIncome}
                      tone="income"
                      className="text-[14px] font-semibold"
                    />
                  </td>
                  <td>
                    <Money
                      currency="CNY"
                      cents={chuckGoods}
                      className="text-[14px] font-semibold text-coral"
                    />
                  </td>
                  <td>
                    <Money
                      currency="CNY"
                      cents={chuckBenefit}
                      className={cn(
                        "text-[14px] font-semibold",
                        chuckBenefit >= 0 ? "text-emerald" : "text-coral",
                      )}
                    />
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Panel>
    </div>
  );
}

function FromChuckTab({
  groups,
  onAdd,
  onUpdate,
  onDelete,
}: {
  groups: ChuckChannelMonthGroup[];
  onAdd: (input: {
    occurredOn: string;
    givenUsd: number;
    realIncomeUsd: number;
    note?: string;
  }) => void;
  onUpdate: (input: {
    id: string;
    occurredOn: string;
    givenUsd: number;
    realIncomeUsd: number;
    note?: string | null;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const years = useMemo(() => {
    const set = new Set(groups.map((g) => Number(g.month.slice(0, 4))));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [groups]);
  const [year, setYear] = useState(() => years[0] ?? new Date().getFullYear());
  const [editor, setEditor] = useState<null | "new" | ChuckChannelEntry>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!years.includes(year) && years.length > 0) setYear(years[0]);
  }, [years, year]);

  const visible = useMemo(
    () => groups.filter((g) => g.month.startsWith(`${year}-`)),
    [groups, year],
  );

  const given = visible.reduce((s, g) => s + g.givenCents, 0);
  const realIncome = visible.reduce((s, g) => s + g.realIncomeCents, 0);
  const net = realIncome - given;
  const keepPct =
    realIncome > 0 ? Math.round((net / realIncome) * 100) : null;
  const entryCount = visible.reduce((s, g) => s + g.entries.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-semibold tracking-tight text-charcoal">
            From Chuck
          </h2>
          <p className="mt-1 max-w-xl text-[12.5px] text-muted">
            Add dated entries for what you give Chuck and the real income you
            keep. Only months with entries appear.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <YearSelect value={year} years={years} onChange={setYear} />
          <button
            type="button"
            onClick={() => setEditor("new")}
            className="pressable from-chuck-add"
          >
            <span className="from-chuck-add__icon" aria-hidden>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            Add entry
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="freelance-stat freelance-stat--chuck-given">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-coral uppercase">
            Given to Chuck
          </div>
          <Money
            cents={given}
            className="mt-1.5 text-[22px] font-semibold text-coral"
          />
          <p className="mt-1 text-[11px] text-muted">Paid out · {year}</p>
        </div>
        <div className="freelance-stat freelance-stat--chuck-real">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-emerald uppercase">
            My real income
          </div>
          <Money
            cents={realIncome}
            tone="income"
            className="mt-1.5 text-[22px] font-semibold"
          />
          <p className="mt-1 text-[11px] text-muted">What you actually keep</p>
        </div>
        <div className="freelance-stat freelance-stat--chuck-net">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-gold-dark uppercase">
            Net
          </div>
          <Money
            cents={net}
            className={cn(
              "mt-1.5 text-[22px] font-semibold",
              net >= 0 ? "text-emerald" : "text-coral",
            )}
          />
          <p className="mt-1 text-[11px] text-muted">
            {keepPct == null
              ? "Real − given"
              : `${keepPct >= 0 ? "+" : ""}${keepPct}% of real`}
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <Panel className="from-chuck-panel">
          <div className="flex flex-col items-start gap-3 py-6">
            <p className="font-display text-[15px] font-semibold text-charcoal">
              No Chuck entries for {year}
            </p>
            <p className="max-w-md text-[13px] leading-relaxed text-muted">
              Empty months stay hidden. Add an entry with a date to start a
              month group.
            </p>
            <button
              type="button"
              onClick={() => setEditor("new")}
              className="pressable from-chuck-add"
            >
              <span className="from-chuck-add__icon" aria-hidden>
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              Add entry
            </button>
          </div>
        </Panel>
      ) : (
        <div className="space-y-3">
          {visible.map((group) => (
            <Panel key={group.month} className="from-chuck-panel !p-0 overflow-hidden">
              <div className="from-chuck-month">
                <div className="min-w-0">
                  <div className="font-display text-[15px] font-semibold tracking-tight text-charcoal">
                    {group.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {group.entries.length} entr
                    {group.entries.length === 1 ? "y" : "ies"}
                  </div>
                </div>
                <div className="from-chuck-month__totals">
                  <div className="text-right">
                    <div className="text-[10px] font-semibold tracking-[0.06em] text-coral uppercase">
                      Given
                    </div>
                    <Money
                      cents={group.givenCents}
                      className="text-[13px] font-semibold text-coral"
                    />
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold tracking-[0.06em] text-emerald uppercase">
                      Real
                    </div>
                    <Money
                      cents={group.realIncomeCents}
                      tone="income"
                      className="text-[13px] font-semibold"
                    />
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold tracking-[0.06em] text-gold-dark uppercase">
                      Fee
                    </div>
                    <div className="text-[13px] font-semibold tabular text-gold-dark">
                      {formatChuckFeePct(
                        chuckFeePct(group.givenCents, group.realIncomeCents),
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold tracking-[0.06em] text-gold-dark uppercase">
                      Net
                    </div>
                    <Money
                      cents={group.netCents}
                      className={cn(
                        "text-[13px] font-semibold",
                        group.netCents >= 0 ? "text-emerald" : "text-coral",
                      )}
                    />
                  </div>
                </div>
              </div>
              <div className="-mx-0 overflow-x-auto">
                <table className="freelance-settle from-chuck-table w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Given to Chuck</th>
                      <th>My real income</th>
                      <th>Fee</th>
                      <th>Net</th>
                      <th className="!text-right"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map((entry) => {
                      const entryNet =
                        entry.realIncomeCents - entry.givenCents;
                      return (
                        <tr key={entry.id}>
                          <td>
                            <div className="text-[13px] font-semibold text-charcoal">
                              {format(
                                new Date(`${entry.occurredOn}T12:00:00`),
                                "MMM d",
                              )}
                            </div>
                            {entry.note ? (
                              <div className="max-w-[12rem] truncate text-[11px] text-muted">
                                {entry.note}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <Money
                              cents={entry.givenCents}
                              className="text-[13px] font-semibold text-coral"
                            />
                          </td>
                          <td>
                            <Money
                              cents={entry.realIncomeCents}
                              tone="income"
                              className="text-[13px] font-semibold"
                            />
                          </td>
                          <td>
                            <span className="text-[13px] font-semibold tabular text-gold-dark">
                              {formatChuckFeePct(
                                chuckFeePct(
                                  entry.givenCents,
                                  entry.realIncomeCents,
                                ),
                              )}
                            </span>
                          </td>
                          <td>
                            <Money
                              cents={entryNet}
                              signed
                              className={cn(
                                "text-[13px] font-semibold",
                                entryNet >= 0 ? "text-emerald" : "text-coral",
                              )}
                            />
                          </td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              {deletingId === entry.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="pressable from-chuck-icon"
                                    aria-label="Cancel delete"
                                    onClick={() => setDeletingId(null)}
                                  >
                                    <X className="h-3.5 w-3.5" strokeWidth={2.4} />
                                  </button>
                                  <button
                                    type="button"
                                    className="pressable from-chuck-icon from-chuck-icon--confirm"
                                    aria-label="Confirm delete"
                                    onClick={() => {
                                      onDelete(entry.id);
                                      setDeletingId(null);
                                    }}
                                  >
                                    <Check
                                      className="h-3.5 w-3.5"
                                      strokeWidth={2.6}
                                    />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="pressable from-chuck-icon"
                                    aria-label="Edit entry"
                                    onClick={() => {
                                      setDeletingId(null);
                                      setEditor(entry);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    className="pressable from-chuck-icon from-chuck-icon--danger"
                                    aria-label="Delete entry"
                                    onClick={() => setDeletingId(entry.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
          <p className="px-1 text-[11px] text-muted">
            {entryCount} entr{entryCount === 1 ? "y" : "ies"} across{" "}
            {visible.length} month{visible.length === 1 ? "" : "s"} · {year}
          </p>
        </div>
      )}

      <ChuckChannelEditor
        open={editor != null}
        entry={editor && editor !== "new" ? editor : null}
        onClose={() => setEditor(null)}
        onSave={(input) => {
          if (editor && editor !== "new") {
            onUpdate({ id: editor.id, ...input });
          } else {
            onAdd(input);
          }
          const y = Number(input.occurredOn.slice(0, 4));
          if (Number.isFinite(y)) setYear(y);
          setEditor(null);
        }}
      />
    </div>
  );
}

function ChuckChannelEditor({
  open,
  entry,
  onClose,
  onSave,
}: {
  open: boolean;
  entry: ChuckChannelEntry | null;
  onClose: () => void;
  onSave: (input: {
    occurredOn: string;
    givenUsd: number;
    realIncomeUsd: number;
    note?: string;
  }) => void;
}) {
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [given, setGiven] = useState("");
  const [real, setReal] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(entry?.occurredOn ?? format(new Date(), "yyyy-MM-dd"));
    setGiven(entry ? amountInputValue(entry.givenCents) : "");
    setReal(entry ? amountInputValue(entry.realIncomeCents) : "");
    setNote(entry?.note ?? "");
    setError(null);
  }, [open, entry]);

  const givenNum = given.trim() === "" ? 0 : Number(given);
  const realNum = real.trim() === "" ? 0 : Number(real);
  const amountsOk =
    Number.isFinite(givenNum) &&
    givenNum >= 0 &&
    Number.isFinite(realNum) &&
    realNum >= 0 &&
    (givenNum > 0 || realNum > 0);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && amountsOk;
  const feePct = chuckFeePct(givenNum, realNum);

  return (
    <ChuckModalShell
      open={open}
      title={entry ? "Edit entry" : "Add entry"}
      onClose={onClose}
      submitLabel={entry ? "Save" : "Add entry"}
      disabled={!valid}
      onSubmit={() => {
        if (!valid) {
          setError("Enter a date and at least one positive amount.");
          return;
        }
        try {
          onSave({
            occurredOn: date,
            givenUsd: givenNum,
            realIncomeUsd: realNum,
            note: note.trim() || undefined,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save");
        }
      }}
    >
      <div className="chuck-money-card project-milestone project-milestone--pending">
        <div className="chuck-money-card__top">
          <span className="chuck-money-card__eyebrow">From Chuck</span>
        </div>

        <div className="chuck-money-card__fields">
          <label className="block">
            <span className="projects-modal__field-label">Date</span>
            <input
              type="date"
              className="field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="projects-modal__field-label">Given to Chuck</span>
            <div className="chuck-money-card__amount">
              <span className="chuck-money-card__prefix" aria-hidden>
                $
              </span>
              <input
                className="field tabular chuck-money-card__input"
                inputMode="decimal"
                value={given}
                placeholder="0"
                onChange={(e) => setGiven(e.target.value)}
              />
            </div>
          </label>

          <label className="block">
            <span className="projects-modal__field-label">My real income</span>
            <div className="chuck-money-card__amount">
              <span className="chuck-money-card__prefix" aria-hidden>
                $
              </span>
              <input
                className="field tabular chuck-money-card__input"
                inputMode="decimal"
                value={real}
                placeholder="0"
                onChange={(e) => setReal(e.target.value)}
              />
            </div>
          </label>

          <div className="projects-modal__net chuck-money-card__fee-line">
            <span className="projects-modal__net-label">Fee</span>
            <span className="projects-modal__net-value tabular">
              {formatChuckFeePct(feePct)}
            </span>
          </div>

          <label className="block">
            <span className="projects-modal__field-label">
              Note{" "}
              <span className="normal-case tracking-normal">(optional)</span>
            </span>
            <input
              className="field"
              value={note}
              placeholder="e.g. March clearing"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl bg-coral-soft px-3 py-2 text-[13px] text-coral">
          {error}
        </p>
      ) : null}
    </ChuckModalShell>
  );
}

const easePremium = [0.22, 1, 0.36, 1] as const;

function ChuckModalShell({
  open,
  title,
  subtitle,
  onClose,
  onSubmit,
  submitLabel,
  disabled,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
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
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close dialog"
            className="projects-modal-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: easePremium }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="chuck-modal-title"
            className="projects-modal chuck-entry-modal"
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.34, ease: easePremium }}
          >
            <div className="projects-modal__header">
              <div className="min-w-0">
                <h2 id="chuck-modal-title" className="projects-modal__title">
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
                ×
              </button>
            </div>
            <div className="projects-modal__body">{children}</div>
            <div className="projects-modal__footer">
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
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function YearSelect({
  value,
  years,
  onChange,
}: {
  value: number;
  years: number[];
  onChange: (year: number) => void;
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
    <div ref={rootRef} className="project-sort relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "project-sort__trigger !w-auto min-w-[8.5rem]",
          open && "project-sort__trigger--open",
        )}
      >
        <span className="project-sort__label">
          <span className="text-muted">Year</span>
          <span className="project-sort__dot">·</span>
          <span>{value}</span>
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
            aria-label="Select year"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="project-sort__menu !min-w-[8.5rem]"
          >
            {years.map((y) => {
              const active = y === value;
              return (
                <li key={y} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(y);
                      setOpen(false);
                    }}
                    className={cn(
                      "project-sort__option",
                      active && "project-sort__option--active",
                    )}
                  >
                    <span>{y}</span>
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

function FreelanceMonthRow({
  row,
  onSave,
}: {
  row: FreelanceIncomeMonthRow;
  onSave: (input: {
    month: string;
    usdAmount: number;
    yuanAmount: number;
    keepAmount?: number;
    notes?: string;
  }) => void;
}) {
  const [received, setReceived] = useState(amountInputValue(row.usdCents));
  const [keep, setKeep] = useState(amountInputValue(row.keepCents));

  useEffect(() => {
    setReceived(amountInputValue(row.usdCents));
    setKeep(amountInputValue(row.keepCents));
  }, [row.month, row.usdCents, row.keepCents]);

  const receivedNum = received.trim() === "" ? 0 : Number(received);
  const keepNum = keep.trim() === "" ? 0 : Number(keep);
  const receivedOk = Number.isFinite(receivedNum) && receivedNum >= 0;
  const keepOk = Number.isFinite(keepNum);

  const receivedCents = receivedOk
    ? Math.round(receivedNum * 100)
    : row.usdCents;
  const keepCents = keepOk ? Math.round(keepNum * 100) : row.keepCents;
  const yoursCents = receivedCents - keepCents;
  const pct =
    row.freelanceNetCents > 0
      ? Math.round((receivedCents / row.freelanceNetCents) * 100)
      : null;

  function commitHand() {
    if (!receivedOk) {
      setReceived(amountInputValue(row.usdCents));
      return;
    }
    if (!keepOk) {
      setKeep(amountInputValue(row.keepCents));
      return;
    }
    const same =
      Math.round(receivedNum * 100) === row.usdCents &&
      Math.round(keepNum * 100) === row.keepCents;
    if (same) return;
    onSave({
      month: row.month,
      usdAmount: receivedNum,
      yuanAmount: 0,
      keepAmount: keepNum,
      notes: row.notes || undefined,
    });
  }

  return (
    <tr>
      <td>
        <div className="text-[13px] font-semibold text-charcoal">{row.label}</div>
        <div className="text-[11px] text-muted">
          {row.releasedCount > 0
            ? `${row.releasedCount} milestone${row.releasedCount === 1 ? "" : "s"}${pct != null ? ` · ${pct}% received` : ""}`
            : "No freelance yet"}
        </div>
      </td>
      <td>
        {row.releasedCount > 0 || row.freelanceNetCents > 0 ? (
          <Money
            cents={row.freelanceNetCents}
            className="text-[13px] font-semibold text-charcoal"
          />
        ) : (
          <span className="text-[13px] text-muted/55">—</span>
        )}
      </td>
      <td>
        <AmountInput
          value={received}
          onChange={setReceived}
          onCommit={commitHand}
          ariaLabel={`${row.label} received`}
        />
      </td>
      <td>
        <AmountInput
          value={keep}
          onChange={setKeep}
          onCommit={commitHand}
          ariaLabel={`${row.label} keep for boss`}
          allowNegative
        />
      </td>
      <td>
        <Money
          cents={yoursCents}
          signed
          className={cn(
            "text-[13px] font-semibold",
            yoursCents >= 0 ? "text-emerald" : "text-coral",
          )}
        />
      </td>
    </tr>
  );
}

function PartnersMonthRow({
  row,
  onSaveJackie,
  onSaveChuck,
}: {
  row: FreelanceIncomeMonthRow;
  onSaveJackie: (input: { month: string; amountYuan: number }) => void;
  onSaveChuck: (input: { month: string; amountYuan: number }) => void;
}) {
  const [jackie, setJackie] = useState(
    amountInputValue(row.jackieIncomeCents),
  );
  const [chuck, setChuck] = useState(amountInputValue(row.chuckIncomeCents));

  useEffect(() => {
    setJackie(amountInputValue(row.jackieIncomeCents));
    setChuck(amountInputValue(row.chuckIncomeCents));
  }, [row.month, row.jackieIncomeCents, row.chuckIncomeCents]);

  const jackieNum = jackie.trim() === "" ? 0 : Number(jackie);
  const chuckNum = chuck.trim() === "" ? 0 : Number(chuck);
  const jackieOk = Number.isFinite(jackieNum) && jackieNum >= 0;
  const chuckOk = Number.isFinite(chuckNum) && chuckNum >= 0;

  const jackieIncomeCents = jackieOk
    ? Math.round(jackieNum * 100)
    : row.jackieIncomeCents;
  const chuckIncomeCents = chuckOk
    ? Math.round(chuckNum * 100)
    : row.chuckIncomeCents;
  const jackieBenefitCents = jackieIncomeCents - row.jackieGoodsCents;
  const chuckBenefitCents = chuckIncomeCents - row.chuckGoodsCents;

  function commitJackie() {
    if (!jackieOk) {
      setJackie(amountInputValue(row.jackieIncomeCents));
      return;
    }
    if (Math.round(jackieNum * 100) === row.jackieIncomeCents) return;
    onSaveJackie({ month: row.month, amountYuan: jackieNum });
  }

  function commitChuck() {
    if (!chuckOk) {
      setChuck(amountInputValue(row.chuckIncomeCents));
      return;
    }
    if (Math.round(chuckNum * 100) === row.chuckIncomeCents) return;
    onSaveChuck({ month: row.month, amountYuan: chuckNum });
  }

  return (
    <tr>
      <td>
        <div className="text-[13px] font-semibold text-charcoal">{row.label}</div>
      </td>
      <td>
        <AmountInput
          currency="CNY"
          value={jackie}
          onChange={setJackie}
          onCommit={commitJackie}
          ariaLabel={`${row.label} Jackie income`}
        />
      </td>
      <td>
        <Money
          currency="CNY"
          cents={row.jackieGoodsCents}
          className="text-[13px] font-semibold text-coral"
        />
      </td>
      <td>
        <Money
          currency="CNY"
          cents={jackieBenefitCents}
          signed
          className={cn(
            "text-[13px] font-semibold",
            jackieBenefitCents >= 0 ? "text-emerald" : "text-coral",
          )}
        />
      </td>
      <td>
        <AmountInput
          currency="CNY"
          value={chuck}
          onChange={setChuck}
          onCommit={commitChuck}
          ariaLabel={`${row.label} Chuck income`}
        />
      </td>
      <td>
        <Money
          currency="CNY"
          cents={row.chuckGoodsCents}
          className="text-[13px] font-semibold text-coral"
        />
      </td>
      <td>
        <Money
          currency="CNY"
          cents={chuckBenefitCents}
          signed
          className={cn(
            "text-[13px] font-semibold",
            chuckBenefitCents >= 0 ? "text-emerald" : "text-coral",
          )}
        />
      </td>
    </tr>
  );
}
