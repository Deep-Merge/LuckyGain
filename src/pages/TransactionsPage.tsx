import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";
import {
  Briefcase,
  Filter,
  Heart,
  Landmark,
  MoreHorizontal,
  Paperclip,
  PiggyBank,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
  Wallet,
  ArrowLeftRight,
  Shirt,
  Dumbbell,
  Circle,
} from "lucide-react";
import type { DashboardSummary, Transaction } from "@/lib/types";
import { cn, deltaLabel } from "@/lib/cn";
import {
  EmptyState,
  Money,
  Panel,
  Pill,
} from "@/components/ui/primitives";

type Tab = "all" | "income" | "expense" | "transfer";

export function TransactionsPage({
  summary,
  transactions,
  incomeSpark,
  expenseSpark,
  topCategories,
  priorMonthLabel,
  onAdd,
  onDelete,
}: {
  summary: DashboardSummary;
  transactions: Transaction[];
  incomeSpark: number[];
  expenseSpark: number[];
  topCategories: Array<{
    name: string;
    icon: string | null;
    color: string | null;
    total_cents: number;
    pct: number;
  }>;
  priorMonthLabel: string;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (tab === "income" && !(tx.type === "income" || tx.type === "refund")) {
        return false;
      }
      if (tab === "expense" && !(tx.type === "expense" || tx.type === "fee")) {
        return false;
      }
      if (tab === "transfer" && tx.type !== "transfer") return false;
      if (!q) return true;
      return (
        tx.description.toLowerCase().includes(q) ||
        (tx.notes ?? "").toLowerCase().includes(q) ||
        (tx.category_name ?? "").toLowerCase().includes(q) ||
        (tx.account_name ?? "").toLowerCase().includes(q) ||
        (tx.person_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [transactions, tab, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );

  const netSpark = useMemo(() => {
    const len = Math.max(incomeSpark.length, expenseSpark.length, 1);
    const out: number[] = [];
    for (let i = 0; i < len; i++) {
      out.push((incomeSpark[i] ?? 0) - (expenseSpark[i] ?? 0));
    }
    return out;
  }, [incomeSpark, expenseSpark]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard
            label="Income"
            cents={summary.incomeCents}
            tone="income"
            delta={`${deltaLabel(summary.incomeCents, summary.priorIncomeCents)} vs ${priorMonthLabel}`}
            spark={incomeSpark}
            sparkColor="#24705A"
          />
          <MetricCard
            label="Expenses"
            cents={summary.expenseCents}
            tone="expense"
            delta={`${deltaLabel(summary.expenseCents, summary.priorExpenseCents)} vs ${priorMonthLabel}`}
            spark={expenseSpark}
            sparkColor="#B95F50"
          />
          <MetricCard
            label="Net Gain"
            cents={summary.netGainCents}
            tone={summary.netGainCents >= 0 ? "gold" : "expense"}
            signed
            delta={`${deltaLabel(summary.netGainCents, summary.priorNetGainCents)} vs ${priorMonthLabel}`}
            spark={netSpark}
            sparkColor="#C6A15B"
          />
        </div>

        <Panel className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-1 rounded-xl bg-ivory-deep p-1">
              {(
                [
                  ["all", "All"],
                  ["income", "Income"],
                  ["expense", "Expenses"],
                  ["transfer", "Transfers"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTab(id);
                    setPage(0);
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition",
                    tab === id
                      ? "bg-white text-charcoal shadow-sm"
                      : "text-muted hover:text-charcoal",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Search transactions"
                  className="h-9 w-[220px] rounded-xl border border-line bg-white pr-3 pl-9 text-[13px] outline-none focus:border-gold/50"
                />
              </label>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-[12.5px] font-medium text-muted hover:text-charcoal"
              >
                <Filter className="h-3.5 w-3.5" />
                Filter
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="px-5">
              <EmptyState
                title="No transactions in this view"
                body="Try another tab, clear search, or add a movement."
                action={
                  <button
                    type="button"
                    onClick={onAdd}
                    className="rounded-xl bg-gold px-3.5 py-2 text-[13px] font-semibold text-charcoal"
                  >
                    Add transaction
                  </button>
                }
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-[13px]">
                  <thead className="bg-ivory-deep/60 text-[11px] uppercase tracking-[0.1em] text-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-3 py-3 font-medium">Transaction</th>
                      <th className="px-3 py-3 font-medium">Category</th>
                      <th className="px-3 py-3 font-medium">Account</th>
                      <th className="px-3 py-3 font-medium">Person</th>
                      <th className="px-3 py-3 text-right font-medium">Amount</th>
                      <th className="px-3 py-3 font-medium">File</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((tx) => (
                      <tr
                        key={tx.id}
                        className="border-t border-line/70 transition hover:bg-white/55"
                      >
                        <td className="px-4 py-3.5 whitespace-nowrap text-muted">
                          {format(parseISO(tx.date), "MMM d, yyyy")}
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="font-medium text-charcoal">
                            {tx.description || "Untitled"}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                            <span>{tx.notes || typeLabel(tx.type)}</span>
                            {tx.needs_review === 1 && (
                              <Pill tone="warn">Needs review</Pill>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <IconLabel
                            icon={
                              tx.type === "transfer"
                                ? "arrow-left-right"
                                : (tx.category_icon ?? "circle")
                            }
                            label={
                              tx.type === "transfer"
                                ? "Transfer"
                                : (tx.category_name ?? "Uncategorized")
                            }
                            color={tx.category_color}
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <IconLabel
                            icon={tx.account_icon ?? "landmark"}
                            label={tx.account_name ?? "—"}
                          />
                        </td>
                        <td className="px-3 py-3.5 text-muted">
                          {tx.person_name ?? "—"}
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <Money
                            cents={signedAmount(tx)}
                            signed
                            tone={amountTone(tx)}
                            className="font-semibold"
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          {(tx.attachment_count ?? 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-ivory-deep px-1.5 py-1 text-[11px] text-muted">
                              <Paperclip className="h-3 w-3" />
                              {tx.attachment_count}
                            </span>
                          ) : (
                            <span className="text-muted/40">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => onDelete(tx.id)}
                              className="rounded-lg p-1.5 text-muted hover:bg-coral-soft hover:text-coral"
                              aria-label="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="rounded-lg p-1.5 text-muted hover:bg-ivory-deep hover:text-charcoal"
                              aria-label="More"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[12px] text-muted">
                <span>
                  Showing {safePage * pageSize + 1} to{" "}
                  {Math.min((safePage + 1) * pageSize, filtered.length)} of{" "}
                  {filtered.length} transactions
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5">
                    Rows
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(0);
                      }}
                      className="rounded-lg border border-line bg-white px-2 py-1"
                    >
                      {[7, 10, 25].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="tabular">
                    {safePage + 1}/{pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= pageCount - 1}
                    onClick={() =>
                      setPage((p) => Math.min(pageCount - 1, p + 1))
                    }
                    className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>

      <aside className="space-y-4">
        <Panel>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            {summary.monthLabel.split(" ")[0]} Snapshot
          </div>
          <div className="mt-4 flex flex-col items-center">
            <SavingsRing rate={summary.savingsRate} />
            <p className="mt-3 text-[13px] text-muted">
              {summary.savingsRate != null && summary.savingsRate >= 40
                ? "Great job!"
                : summary.savingsRate == null
                  ? "Add income to see rate"
                  : "Room to improve"}
            </p>
          </div>

          <div className="mt-5 space-y-2.5 border-t border-line pt-4 text-[13px]">
            <SnapshotRow label="Income" cents={summary.incomeCents} tone="income" />
            <SnapshotRow label="Expenses" cents={summary.expenseCents} tone="expense" />
            <SnapshotRow
              label="Net gain"
              cents={summary.netGainCents}
              tone={summary.netGainCents >= 0 ? "gold" : "expense"}
              signed
            />
          </div>
        </Panel>

        <Panel>
          <div className="mb-3 text-[13px] font-semibold text-charcoal">
            Top categories
          </div>
          <div className="space-y-3">
            {topCategories.length === 0 ? (
              <p className="text-[12.5px] text-muted">No categorized expenses yet.</p>
            ) : (
              topCategories.map((cat) => (
                <div key={cat.name} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ivory-deep text-gold-dark">
                    <CategoryGlyph name={cat.icon} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="truncate font-medium text-charcoal">
                        {cat.name}
                      </span>
                      <Money cents={cat.total_cents} className="text-[12.5px] font-semibold" />
                    </div>
                    <div className="mt-1 lg-progress lg-progress--sm lg-progress--gold">
                      <div
                        className="lg-progress__fill"
                        style={{ width: `${Math.min(100, cat.pct)}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-muted">
                      {cat.pct.toFixed(0)}% of spending
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <Link
            to="/insights"
            className="mt-4 flex h-10 items-center justify-center rounded-xl border border-line text-[12.5px] font-semibold text-charcoal transition hover:border-gold/50 hover:bg-white"
          >
            View full insights
          </Link>
        </Panel>
      </aside>
    </div>
  );
}

function MetricCard({
  label,
  cents,
  tone,
  delta,
  spark,
  sparkColor,
  signed,
}: {
  label: string;
  cents: number;
  tone: "income" | "expense" | "gold";
  delta: string;
  spark: number[];
  sparkColor: string;
  signed?: boolean;
}) {
  const data = spark.map((v, i) => ({ i, v: Math.abs(v) }));
  return (
    <Panel className="relative overflow-hidden">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </div>
      <Money
        cents={cents}
        tone={tone}
        signed={signed}
        className="mt-2 block text-[24px] font-semibold"
      />
      <p
        className={cn(
          "mt-1.5 text-[12px]",
          delta.startsWith("+") || delta.startsWith("new")
            ? "text-emerald"
            : delta.startsWith("−") || delta.startsWith("-")
              ? "text-coral"
              : "text-muted",
        )}
      >
        {delta}
      </p>
      <div className="pointer-events-none absolute right-2 bottom-2 h-12 w-28 opacity-80">
        {data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparkColor}
                fill={sparkColor}
                fillOpacity={0.15}
                strokeWidth={1.75}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}

function SnapshotRow({
  label,
  cents,
  tone,
  signed,
}: {
  label: string;
  cents: number;
  tone: "income" | "expense" | "gold";
  signed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <Money cents={cents} tone={tone} signed={signed} className="font-semibold" />
    </div>
  );
}

function SavingsRing({ rate }: { rate: number | null }) {
  const value = rate ?? 0;
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative h-[132px] w-[132px]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#EFEBE1"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#C6A15B"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={rate == null ? c : offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-[26px] font-semibold tabular text-charcoal">
          {rate == null ? "—" : `${Math.round(rate)}%`}
        </div>
        <div className="text-[11px] text-muted">Savings rate</div>
      </div>
    </div>
  );
}

function IconLabel({
  icon,
  label,
  color,
}: {
  icon: string;
  label: string;
  color?: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-ivory-deep"
        style={color ? { color } : undefined}
      >
        <CategoryGlyph name={icon} />
      </span>
      <span className="text-charcoal">{label}</span>
    </span>
  );
}

function CategoryGlyph({ name }: { name: string | null | undefined }) {
  const props = { className: "h-3.5 w-3.5", strokeWidth: 1.75 } as const;
  switch (name) {
    case "briefcase":
      return <Briefcase {...props} />;
    case "shopping-bag":
      return <ShoppingBag {...props} />;
    case "heart":
      return <Heart {...props} />;
    case "utensils":
      return <Utensils {...props} />;
    case "landmark":
      return <Landmark {...props} />;
    case "wallet":
      return <Wallet {...props} />;
    case "piggy-bank":
      return <PiggyBank {...props} />;
    case "arrow-left-right":
      return <ArrowLeftRight {...props} />;
    case "shirt":
      return <Shirt {...props} />;
    case "dumbbell":
      return <Dumbbell {...props} />;
    default:
      return <Circle {...props} />;
  }
}

function signedAmount(tx: Transaction): number {
  if (tx.type === "expense" || tx.type === "fee" || tx.type === "transfer") {
    return -tx.amount_cents;
  }
  return tx.amount_cents;
}

function amountTone(
  tx: Transaction,
): "income" | "expense" | "muted" {
  if (tx.type === "income" || tx.type === "refund") return "income";
  if (tx.type === "expense" || tx.type === "fee") return "expense";
  return "muted";
}

function typeLabel(type: string): string {
  return type.replaceAll("_", " ");
}
