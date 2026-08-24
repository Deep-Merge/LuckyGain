import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { format, parse, subMonths } from "date-fns";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { greetingFor } from "@/lib/dates";
import { fromCents } from "@/lib/money";
import {
  GOODS_CATEGORY_LABEL,
  GOODS_WHOM_OPTIONS,
  displayWhom,
  isTaggedPartnerIncomeNote,
  isReturnFeeEntry,
  isWalletGood,
  isGoodEnabled,
  type GoodItem,
  type GoodsCategory,
  type GoodsWhomOption,
  type PurseBoard,
  type PurseEntry,
  type PurseMonthCard,
} from "@/lib/db/purse";
import { Money, Panel } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const WHOM_LABEL: Record<GoodsWhomOption, string> = {
  me: "Me",
  jackie: "Jackie",
  family: "Family",
  chuck: "Chuck",
};

const WHOM_COLORS: Record<GoodsWhomOption, string> = {
  me: "#D4B06A",
  jackie: "#7EB892",
  family: "#C4A88A",
  chuck: "#8FA7C4",
};

const CHART_RANGES = ["1Y", "6M", "3M", "All"] as const;
type ChartRange = (typeof CHART_RANGES)[number];

const CHART_SERIES = [
  { id: "walletIn", label: "Wallet in", color: "#3CB884", fillId: "dashInc" },
  { id: "goodsFees", label: "Goods + fees", color: "#E38874", fillId: "dashExp" },
  { id: "me", label: "Me", color: "#C9A25A", fillId: "dashMe" },
  { id: "jackie", label: "Jackie", color: "#7EB892", fillId: "dashJackie" },
  { id: "family", label: "Family", color: "#C4A88A", fillId: "dashFamily" },
  { id: "chuck", label: "Chuck", color: "#8FA7C4", fillId: "dashChuck" },
] as const;

type ChartSeriesId = (typeof CHART_SERIES)[number]["id"];

const DEFAULT_SERIES: Record<ChartSeriesId, boolean> = {
  walletIn: true,
  goodsFees: true,
  me: false,
  jackie: false,
  family: false,
  chuck: false,
};

const DONUT_COLORS = [
  "#C9A25A",
  "#3CB884",
  "#E38874",
  "#7EB892",
  "#C4A88A",
  "#B8B0A0",
];

function emptyMonth(month: string): PurseMonthCard {
  let label = month;
  try {
    label = format(parse(`${month}-01`, "yyyy-MM-dd", new Date()), "MMMM yyyy");
  } catch {
    /* keep */
  }
  return {
    month,
    label,
    incomeCents: 0,
    withdrawCents: 0,
    goodsSpendCents: 0,
    netCents: 0,
    goodsCount: 0,
    byWhom: GOODS_WHOM_OPTIONS.map((whom) => ({
      whom,
      spendCents: 0,
      count: 0,
    })),
    goods: [],
    incomeEntries: [],
    cashEntries: [],
  };
}

function walletIncomeCents(month: PurseMonthCard): number {
  return month.incomeEntries
    .filter((e) => !isTaggedPartnerIncomeNote(e.note))
    .reduce((s, e) => s + e.amountCents, 0);
}

function walletGoodsCents(goods: GoodItem[]): number {
  return goods
    .filter((g) => isWalletGood(g) && isGoodEnabled(g))
    .reduce((s, g) => s + g.priceCents, 0);
}

function returnFeeCents(
  entries: PurseEntry[],
  predicate: (e: PurseEntry) => boolean,
): number {
  return entries
    .filter((e) => isReturnFeeEntry(e) && predicate(e))
    .reduce((s, e) => s + e.amountCents, 0);
}

function whomWalletSpendCents(
  goods: GoodItem[],
  whom: GoodsWhomOption,
): number {
  return goods
    .filter((g) => isWalletGood(g) && isGoodEnabled(g) && displayWhom(g) === whom)
    .reduce((s, g) => s + g.priceCents, 0);
}

/** Outside-wallet spend tagged to Me / Jackie / Family. */
function whomSelfSpendCents(
  goods: GoodItem[],
  whom: GoodsWhomOption,
): number {
  return goods
    .filter((g) => !isWalletGood(g) && isGoodEnabled(g) && displayWhom(g) === whom)
    .reduce((s, g) => s + g.priceCents, 0);
}

function monthMetrics(board: PurseBoard, month: string) {
  const card = board.months.find((m) => m.month === month) ?? emptyMonth(month);
  const disabledIds = new Set(
    board.goods.filter((g) => !isGoodEnabled(g)).map((g) => g.id),
  );
  const walletIn = walletIncomeCents(card);
  const goods = walletGoodsCents(
    card.goods.filter((g) => g.purchasedOn.startsWith(month)),
  );
  const fees = returnFeeCents(
    board.entries,
    (e) =>
      e.occurredOn.startsWith(month) &&
      !(e.goodsId && disabledIds.has(e.goodsId)),
  );
  const monthPurchases = card.goods.filter((g) =>
    g.purchasedOn.startsWith(month),
  );
  return {
    month,
    label: format(parse(`${month}-01`, "yyyy-MM-dd", new Date()), "MMM"),
    fullLabel: card.label,
    walletIn,
    goods,
    fees,
    meWallet: whomWalletSpendCents(monthPurchases, "me"),
    jackieWallet: whomWalletSpendCents(monthPurchases, "jackie"),
    familyWallet: whomWalletSpendCents(monthPurchases, "family"),
    chuckWallet: whomWalletSpendCents(monthPurchases, "chuck"),
    meSelf: whomSelfSpendCents(monthPurchases, "me"),
    jackieSelf: whomSelfSpendCents(monthPurchases, "jackie"),
    familySelf: whomSelfSpendCents(monthPurchases, "family"),
    chuckSelf: whomSelfSpendCents(monthPurchases, "chuck"),
    net: walletIn - goods - fees,
    goodsCount: card.goodsCount,
  };
}

function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function formatDotDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${m}.${d}`;
}

function Trend({
  value,
  vsLabel,
}: {
  value: number | null;
  vsLabel: string;
}) {
  if (value == null) {
    return <span className="text-[11.5px] text-muted">vs {vsLabel}</span>;
  }
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11.5px] font-medium",
        up ? "text-emerald" : "text-coral",
      )}
    >
      {up ? (
        <ArrowUpRight className="h-3.5 w-3.5" />
      ) : (
        <ArrowDownRight className="h-3.5 w-3.5" />
      )}
      {Math.abs(value).toFixed(1)}% vs {vsLabel}
    </span>
  );
}

export function DashboardPage({
  userName,
  purse,
}: {
  userName: string;
  monthAnchor?: Date;
  purse: PurseBoard;
}) {
  const [range, setRange] = useState<ChartRange>("1Y");
  const [activeSeries, setActiveSeries] =
    useState<Record<ChartSeriesId, boolean>>(DEFAULT_SERIES);
  /** When on, Me/Jackie/Family lines include outside-wallet (Self) spend for that whom. */
  const [includeSelf, setIncludeSelf] = useState(false);
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const priorMonth = format(subMonths(now, 1), "yyyy-MM");

  const allMonthKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const m of purse.months) keys.add(m.month);
    for (const e of purse.entries) {
      if (e.kind === "deposit" || isReturnFeeEntry(e)) {
        keys.add(e.occurredOn.slice(0, 7));
      }
    }
    for (const g of purse.goods) keys.add(g.purchasedOn.slice(0, 7));
    keys.add(currentMonth);
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [purse, currentMonth]);

  const series = useMemo(
    () => allMonthKeys.map((m) => monthMetrics(purse, m)),
    [allMonthKeys, purse],
  );

  const chartSeries = useMemo(() => {
    if (range === "All") return series;
    const n = range === "1Y" ? 12 : range === "6M" ? 6 : 3;
    return series.slice(-n);
  }, [range, series]);

  const current = monthMetrics(purse, currentMonth);
  const prior = monthMetrics(purse, priorMonth);

  const statusClosing = useMemo(() => {
    const disabledIds = new Set(
      purse.goods.filter((g) => !isGoodEnabled(g)).map((g) => g.id),
    );
    const priorWalletIn = purse.entries
      .filter(
        (e) =>
          e.kind === "deposit" &&
          e.occurredOn.slice(0, 7) < currentMonth &&
          !isTaggedPartnerIncomeNote(e.note) &&
          !(e.goodsId && disabledIds.has(e.goodsId)),
      )
      .reduce((s, e) => s + e.amountCents, 0);
    const priorGoods = walletGoodsCents(
      purse.goods.filter((g) => g.purchasedOn.slice(0, 7) < currentMonth),
    );
    const priorFees = returnFeeCents(
      purse.entries,
      (e) =>
        e.occurredOn.slice(0, 7) < currentMonth &&
        !(e.goodsId && disabledIds.has(e.goodsId)),
    );
    return priorWalletIn - priorGoods - priorFees + current.net;
  }, [purse, currentMonth, current.net]);

  const whomRows = useMemo(() => {
    const map = new Map<
      GoodsWhomOption,
      { spendCents: number; count: number }
    >();
    for (const w of GOODS_WHOM_OPTIONS) {
      map.set(w, { spendCents: 0, count: 0 });
    }
    for (const g of purse.goods) {
      if (!isGoodEnabled(g)) continue;
      const whom = displayWhom(g);
      const slot = map.get(whom)!;
      slot.spendCents += g.priceCents;
      slot.count += 1;
    }
    return GOODS_WHOM_OPTIONS.map((whom) => ({
      whom,
      ...map.get(whom)!,
    }));
  }, [purse.goods]);

  const categorySpend = useMemo(() => {
    const map = new Map<GoodsCategory, number>();
    for (const g of purse.goods) {
      if (!isGoodEnabled(g)) continue;
      map.set(g.category, (map.get(g.category) ?? 0) + g.priceCents);
    }
    const rows = [...map.entries()]
      .map(([id, cents]) => ({
        id,
        name: GOODS_CATEGORY_LABEL[id],
        cents,
        value: fromCents(cents),
      }))
      .sort((a, b) => b.cents - a.cents);
    const total = rows.reduce((s, r) => s + r.cents, 0);
    return { rows, total };
  }, [purse.goods]);

  const recentGoods = useMemo(
    () =>
      [...purse.goods]
        .sort((a, b) =>
          `${b.purchasedOn}T${b.createdAt}`.localeCompare(
            `${a.purchasedOn}T${a.createdAt}`,
          ),
        )
        .slice(0, 6),
    [purse.goods],
  );

  const chartData = chartSeries.map((m) => ({
    month: m.label,
    key: m.month,
    walletIn: fromCents(m.walletIn),
    goodsFees: fromCents(m.goods + m.fees),
    me: fromCents(m.meWallet + (includeSelf ? m.meSelf : 0)),
    jackie: fromCents(m.jackieWallet + (includeSelf ? m.jackieSelf : 0)),
    family: fromCents(m.familyWallet + (includeSelf ? m.familySelf : 0)),
    chuck: fromCents(m.chuckWallet + (includeSelf ? m.chuckSelf : 0)),
  }));

  function toggleSeries(id: ChartSeriesId) {
    setActiveSeries((prev) => {
      const turningOff = prev[id];
      if (turningOff) {
        const stillOn = CHART_SERIES.filter((s) => s.id !== id && prev[s.id]);
        if (stillOn.length === 0) return prev;
      }
      return { ...prev, [id]: !prev[id] };
    });
  }

  const selfUseful =
    activeSeries.me ||
    activeSeries.jackie ||
    activeSeries.family ||
    activeSeries.chuck;

  const whomTotal = whomRows.reduce((s, r) => s + r.spendCents, 0);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="text-[12px] text-muted">{greetingFor(userName)}</p>
          <h2 className="mt-1.5 font-display text-[30px] leading-[1.12] font-semibold tracking-tight text-charcoal text-balance">
            See every Yuan clearly.
          </h2>
        </div>
        <Link
          to="/goods"
          className="pressable inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-panel px-3 text-[12.5px] font-semibold text-charcoal transition hover:border-gold/40"
        >
          <ShoppingBag className="h-3.5 w-3.5 text-gold-dark" />
          Open Goods
          <ArrowUpRight className="h-3.5 w-3.5 text-gold-dark" />
        </Link>
      </motion.div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Current status"
          cents={statusClosing}
          hint="Wallet running balance"
          icon={<Wallet className="h-4 w-4 text-gold-dark" />}
          primary
        />
        <KpiCard
          label="Wallet in"
          cents={current.walletIn}
          hint={<Trend value={pctChange(current.walletIn, prior.walletIn)} vsLabel={prior.label} />}
          icon={<Wallet className="h-4 w-4 text-emerald" />}
          tone="income"
        />
        <KpiCard
          label="Wallet goods"
          cents={current.goods}
          hint={<Trend value={pctChange(current.goods, prior.goods)} vsLabel={prior.label} />}
          icon={<CreditCard className="h-4 w-4 text-coral" />}
          tone="expense"
        />
        <KpiCard
          label="Month net"
          cents={current.net}
          hint={<Trend value={pctChange(current.net, prior.net)} vsLabel={prior.label} />}
          icon={
            current.net >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald" />
            ) : (
              <TrendingDown className="h-4 w-4 text-coral" />
            )
          }
          tone={current.net >= 0 ? "income" : "expense"}
          signed
        />
      </div>

      {/* Chart + by whom */}
      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Panel className="!p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-[16px] font-semibold text-charcoal">
                Cash flow
              </h3>
              <p className="mt-0.5 text-[12px] text-muted">
                Wallet in vs goods · every month
              </p>
            </div>
            <div className="flex rounded-[10px] border border-line bg-ivory-deep/40 p-0.5">
              {CHART_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition",
                    range === r
                      ? "bg-panel text-charcoal shadow-[0_1px_0_rgb(28_33_29/0.04)]"
                      : "text-muted hover:text-charcoal",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {CHART_SERIES.map((s) => {
              const on = activeSeries[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSeries(s.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition",
                    on
                      ? "border-transparent text-charcoal"
                      : "border-line bg-transparent text-muted opacity-55 hover:opacity-80",
                  )}
                  style={
                    on
                      ? {
                          background: `color-mix(in srgb, ${s.color} 16%, white)`,
                          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${s.color} 35%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: on ? s.color : "#C5BDB0",
                    }}
                  />
                  {s.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setIncludeSelf((v) => !v)}
              title={
                selfUseful
                  ? includeSelf
                    ? "Self included in Me / Jackie / Family / Chuck"
                    : "Tap to add Self (outside wallet) to Me / Jackie / Family / Chuck"
                  : "Turn on Me, Jackie, Family, or Chuck first"
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition",
                includeSelf
                  ? "border-transparent text-charcoal"
                  : "border-line bg-transparent text-muted opacity-55 hover:opacity-80",
                !selfUseful && "opacity-40",
              )}
              style={
                includeSelf
                  ? {
                      background:
                        "color-mix(in srgb, #C19A55 18%, white)",
                      boxShadow:
                        "inset 0 0 0 1px color-mix(in srgb, #C19A55 40%, transparent)",
                    }
                  : undefined
              }
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: includeSelf ? "#C19A55" : "#C5BDB0",
                }}
              />
              Self
              {includeSelf ? (
                <span className="text-[10px] font-medium text-gold-dark">
                  +
                </span>
              ) : null}
            </button>
          </div>

          {includeSelf && selfUseful ? (
            <p className="mb-2 text-[11px] text-muted">
              Self on · outside-wallet spend counted into Me / Jackie / Family / Chuck
            </p>
          ) : null}

          <div className="h-[260px]">
            {chartData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-[13px] text-muted">
                No month data yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    {CHART_SERIES.map((s) => (
                      <linearGradient
                        key={s.fillId}
                        id={s.fillId}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={s.color}
                          stopOpacity={0.32}
                        />
                        <stop
                          offset="100%"
                          stopColor={s.color}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    stroke="#EBE4D8"
                    strokeDasharray="3 6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#8A877C", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#8A877C", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #EBE4D8",
                      background: "#FFFCF8",
                      fontSize: 12,
                    }}
                    formatter={(value, name) => {
                      const label =
                        CHART_SERIES.find((s) => s.id === name)?.label ?? name;
                      return typeof value === "number"
                        ? [`¥${value.toFixed(2)}`, label]
                        : [value, label];
                    }}
                  />
                  {CHART_SERIES.map((s) =>
                    activeSeries[s.id] ? (
                      <Area
                        key={s.id}
                        type="monotone"
                        dataKey={s.id}
                        name={s.id}
                        stroke={s.color}
                        fill={`url(#${s.fillId})`}
                        strokeWidth={2}
                      />
                    ) : null,
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel className="!p-5">
          <div className="mb-4">
            <h3 className="font-display text-[16px] font-semibold text-charcoal">
              By whom
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              All-time purchases · full
            </p>
          </div>
          <div className="space-y-4">
            {whomRows.map((row) => {
              const max = Math.max(whomTotal, 1);
              return (
                <div key={row.whom}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[13.5px] font-semibold text-charcoal">
                        {WHOM_LABEL[row.whom]}
                      </div>
                      <div className="text-[11px] text-muted">
                        {row.count} purchase{row.count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <Money
                      currency="CNY"
                      cents={row.spendCents}
                      className="text-[14px] font-semibold text-charcoal"
                    />
                  </div>
                  <div className="lg-progress lg-progress--md">
                    <div
                      className="lg-progress__fill"
                      style={
                        {
                          width: `${(row.spendCents / max) * 100}%`,
                          "--lg-progress-from": WHOM_COLORS[row.whom],
                          "--lg-progress-mid": `color-mix(in srgb, ${WHOM_COLORS[row.whom]} 82%, white)`,
                          "--lg-progress-to": `color-mix(in srgb, ${WHOM_COLORS[row.whom]} 72%, #3a3124)`,
                        } as CSSProperties
                      }
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between border-t border-line/80 pt-3">
              <span className="text-[13px] font-semibold text-charcoal">
                Total
              </span>
              <Money
                currency="CNY"
                cents={whomTotal}
                className="text-[14px] font-semibold text-charcoal"
              />
            </div>
          </div>
        </Panel>
      </div>

      {/* Recent + spending donut */}
      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Panel className="!p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-[16px] font-semibold text-charcoal">
              Recent goods
            </h3>
            <Link
              to="/goods"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-gold-dark hover:underline"
            >
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recentGoods.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted">
              No purchases yet.
            </p>
          ) : (
            <div className="space-y-1">
              {recentGoods.map((g) => {
                const outside = !isWalletGood(g);
                return (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-3 rounded-[10px] px-1 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold text-charcoal">
                        {g.title}
                      </div>
                      <div className="text-[11.5px] text-muted">
                        {GOODS_CATEGORY_LABEL[g.category]} ·{" "}
                        {WHOM_LABEL[displayWhom(g)]}
                        {outside ? " · Self" : ""} · {formatDotDate(g.purchasedOn)}
                      </div>
                    </div>
                    <Money
                      currency="CNY"
                      cents={-g.priceCents}
                      signed
                      className={cn(
                        "shrink-0 text-[13.5px] font-semibold",
                        outside ? "text-muted" : "text-coral",
                      )}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className="!p-5">
          <div className="mb-1">
            <h3 className="font-display text-[16px] font-semibold text-charcoal">
              Spending overview
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              All goods by category
            </p>
          </div>
          {categorySpend.rows.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted">
              No category spend yet.
            </p>
          ) : (
            <>
              <div className="relative mx-auto h-[200px] w-full max-w-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categorySpend.rows.slice(0, 6)}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={82}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {categorySpend.rows.slice(0, 6).map((row, i) => (
                        <Cell
                          key={row.id}
                          fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) =>
                        typeof value === "number"
                          ? [`¥${value.toFixed(2)}`, "Spend"]
                          : [value, "Spend"]
                      }
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid #EBE4D8",
                        background: "#FFFCF8",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-[10px] font-medium tracking-[0.08em] text-muted uppercase">
                    Total
                  </div>
                  <Money
                    currency="CNY"
                    cents={categorySpend.total}
                    className="text-[15px] font-semibold text-charcoal"
                  />
                </div>
              </div>
              <div className="mt-2 space-y-2">
                {categorySpend.rows.slice(0, 5).map((row, i) => {
                  const pct =
                    categorySpend.total > 0
                      ? (row.cents / categorySpend.total) * 100
                      : 0;
                  return (
                    <div
                      key={row.id}
                      className="flex items-center justify-between gap-2 text-[12.5px]"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2 text-charcoal">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background:
                              DONUT_COLORS[i % DONUT_COLORS.length],
                          }}
                        />
                        <span className="truncate font-medium">{row.name}</span>
                        <span className="text-muted">{pct.toFixed(0)}%</span>
                      </span>
                      <Money
                        currency="CNY"
                        cents={row.cents}
                        className="shrink-0 text-[12.5px] font-semibold text-charcoal"
                      />
                    </div>
                  );
                })}
              </div>
              <Link
                to="/goods"
                className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-gold-dark hover:underline"
              >
                View full board <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </Panel>
      </div>

      {/* All months table */}
      <Panel className="!overflow-hidden !p-0">
        <div className="border-b border-line px-5 py-4">
          <h3 className="font-display text-[16px] font-semibold text-charcoal">
            Every month
          </h3>
          <p className="mt-0.5 text-[12px] text-muted">
            Full wallet in · goods · fees · net
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-line bg-ivory-deep/50 text-[10.5px] font-semibold tracking-[0.06em] text-muted uppercase">
                <th className="px-5 py-2.5 font-semibold">Month</th>
                <th className="px-4 py-2.5 text-right font-semibold">In</th>
                <th className="px-4 py-2.5 text-right font-semibold">Goods</th>
                <th className="px-4 py-2.5 text-right font-semibold">Fees</th>
                <th className="px-5 py-2.5 text-right font-semibold">Net</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((m) => (
                <tr
                  key={m.month}
                  className="border-b border-line/70 last:border-0"
                >
                  <td className="px-5 py-3 text-[13px] font-semibold text-charcoal">
                    {m.fullLabel}
                    {m.month === currentMonth ? (
                      <span className="ml-2 text-[10px] font-medium text-muted uppercase">
                        Now
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money
                      currency="CNY"
                      cents={m.walletIn}
                      className="text-[13px] font-semibold text-emerald"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money
                      currency="CNY"
                      cents={m.goods}
                      className="text-[13px] font-semibold text-charcoal"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money
                      currency="CNY"
                      cents={m.fees}
                      className="text-[13px] font-semibold text-muted"
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Money
                      currency="CNY"
                      cents={m.net}
                      signed
                      className={cn(
                        "text-[13px] font-semibold",
                        m.net >= 0 ? "text-emerald" : "text-coral",
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function KpiCard({
  label,
  cents,
  hint,
  icon,
  tone = "default",
  signed,
  primary,
}: {
  label: string;
  cents: number;
  hint: ReactNode;
  icon: ReactNode;
  tone?: "default" | "income" | "expense";
  signed?: boolean;
  primary?: boolean;
}) {
  return (
    <Panel
      className={cn(
        "!p-4",
        primary && "border-gold/35 bg-[color-mix(in_srgb,var(--color-gold-soft)_18%,var(--color-panel))]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
          {label}
        </div>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-gold-soft)_55%,white)]">
          {icon}
        </span>
      </div>
      <Money
        currency="CNY"
        cents={cents}
        tone={tone}
        signed={signed}
        className="mt-3 block font-display text-[26px] font-semibold tracking-tight"
      />
      <div className="mt-2 text-[12px] text-muted">{hint}</div>
    </Panel>
  );
}
