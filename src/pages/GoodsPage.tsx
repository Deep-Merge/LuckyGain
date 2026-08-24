import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format, parse } from "date-fns";
import { useSearchParams } from "react-router-dom";
import {
  Briefcase,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cigarette,
  Dumbbell,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Footprints,
  Gift,
  HeartPulse,
  Home,
  ImagePlus,
  Layers,
  Package,
  PackagePlus,
  Pencil,
  Power,
  RotateCcw,
  Shirt,
  Smartphone,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  GOODS_CATEGORIES,
  GOODS_CATEGORY_LABEL,
  GOODS_WHOM_OPTIONS,
  displayWhom,
  isGoodEnabled,
  isReturnedGood,
  isTaggedPartnerIncomeNote,
  isOutsideWallet,
  isReturnFeeEntry,
  isReturnRefundEntry,
  isWalletGood,
  stripOutsideWalletMarker,
  stripReturnFeeMarker,
  withOutsideWalletMarker,
  type GoodItem,
  type GoodsCategory,
  type GoodsForWhom,
  type GoodsWhomOption,
  type PurseBoard,
  type PurseEntry,
  type PurseMonthCard,
} from "@/lib/db/purse";
import { inferGoodsCategory } from "@/lib/db/purseSeed";
import { compressImageFile } from "@/lib/image";
import { fromCents } from "@/lib/money";
import { Money, Panel } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const CATEGORY_ICON: Record<GoodsCategory, LucideIcon> = {
  clothes: Shirt,
  shoes: Footprints,
  socks: Layers,
  bags: Briefcase,
  sports: Dumbbell,
  beauty: Sparkles,
  health: HeartPulse,
  smoking: Cigarette,
  food: UtensilsCrossed,
  electronics: Smartphone,
  home: Home,
  cash_gift: Gift,
  other: Package,
};

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

const WHOM_LABEL: Record<GoodsWhomOption, string> = {
  me: "Me",
  jackie: "Jackie",
  family: "Family",
  chuck: "Chuck",
};

const easePremium = [0.22, 1, 0.36, 1] as const;

const GOODS_SUMMARY_OPEN_KEY = "luckygain.goods.summaryOpen";

function monthKey(year: number, monthNum: number): string {
  return `${year}-${String(monthNum).padStart(2, "0")}`;
}

function monthKeyLabel(month: string): string {
  try {
    return format(parse(`${month}-01`, "yyyy-MM-dd", new Date()), "MMMM yyyy");
  } catch {
    return month;
  }
}

function emptyMonth(month: string): PurseMonthCard {
  return {
    month,
    label: monthKeyLabel(month),
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

/** Goods page ignores Jackie/Chuck partner deposits — those live on Insights → Partners. */
function walletIncomeEntries(month: PurseMonthCard) {
  return month.incomeEntries.filter((e) => !isTaggedPartnerIncomeNote(e.note));
}

type WhomFilter = "all" | GoodsWhomOption;

function activityRowMatchesWhom(
  row: {
    kind: string;
    good?: GoodItem;
    entry?: PurseEntry;
  },
  filter: WhomFilter,
  goodsById: Map<string, GoodItem>,
): boolean {
  if (filter === "all") return true;
  if (row.kind === "income") return false;
  if (
    row.kind === "good" ||
    row.kind === "return_parent" ||
    row.kind === "return_refund" ||
    row.kind === "return_fee_child"
  ) {
    return row.good != null && displayWhom(row.good) === filter;
  }
  if (row.kind === "return_fee" && row.entry?.goodsId) {
    const good = goodsById.get(row.entry.goodsId);
    return good != null && displayWhom(good) === filter;
  }
  return false;
}

function walletIncomeCents(month: PurseMonthCard): number {
  return walletIncomeEntries(month).reduce((s, e) => s + e.amountCents, 0);
}

function isSalaryNote(note: string | null | undefined): boolean {
  const n = (note ?? "").trim().toLowerCase();
  return n === "salary" || n.startsWith("salary ");
}

/** Me / Jackie / Family spend from wallet unless Self (outside) is marked. */
function affectsWalletStatus(good: GoodItem): boolean {
  return isWalletGood(good);
}

function walletGoodsCents(goods: GoodItem[]): number {
  return goods
    .filter((g) => affectsWalletStatus(g) && isGoodEnabled(g))
    .reduce((s, g) => s + g.priceCents, 0);
}

function selfGoodsSpendCents(goods: GoodItem[]): number {
  return goods
    .filter((g) => !isWalletGood(g) && isGoodEnabled(g))
    .reduce((s, g) => s + g.priceCents, 0);
}

function purchasesInMonth(goods: GoodItem[], monthKey: string): GoodItem[] {
  return goods.filter(
    (g) => g.purchasedOn.startsWith(monthKey) && isGoodEnabled(g),
  );
}

function returnFeeCents(
  entries: PurseEntry[],
  predicate: (e: PurseEntry) => boolean = () => true,
): number {
  return entries
    .filter((e) => isReturnFeeEntry(e) && predicate(e))
    .reduce((s, e) => s + e.amountCents, 0);
}

function disabledGoodIds(goods: GoodItem[]): Set<string> {
  return new Set(goods.filter((g) => !isGoodEnabled(g)).map((g) => g.id));
}

function countsTowardWallet(
  entry: PurseEntry,
  disabledIds: Set<string>,
): boolean {
  return !(entry.goodsId && disabledIds.has(entry.goodsId));
}

function returnRefundForGood(
  entries: PurseEntry[],
  goodId: string,
): PurseEntry | undefined {
  return entries.find(
    (e) => isReturnRefundEntry(e) && e.goodsId === goodId,
  );
}

function returnFeeForGood(
  entries: PurseEntry[],
  goodId: string,
): PurseEntry | undefined {
  return entries.find(
    (e) => isReturnFeeEntry(e) && e.goodsId === goodId,
  );
}

/** Full spend by Me / Jackie / Family — includes Self / outside-wallet goods. */
function byWhomFull(goods: GoodItem[]) {
  const map = new Map<
    GoodsWhomOption,
    { spendCents: number; count: number }
  >();
  for (const w of GOODS_WHOM_OPTIONS) {
    map.set(w, { spendCents: 0, count: 0 });
  }
  for (const g of goods) {
    if (!isGoodEnabled(g)) continue;
    // Count on original purchase only (avoid double-count when also listed for return month).
    const whom = displayWhom(g);
    const slot = map.get(whom)!;
    slot.spendCents += g.priceCents;
    slot.count += 1;
  }
  return GOODS_WHOM_OPTIONS.map((whom) => ({
    whom,
    spendCents: map.get(whom)!.spendCents,
    count: map.get(whom)!.count,
  }));
}

type CashDraft = {
  mode: "create" | "edit";
  entry?: PurseEntry;
  defaultDate?: string;
} | null;

type GoodDraft = {
  mode: "create" | "edit";
  good?: GoodItem;
  defaultDate?: string;
} | null;

export function GoodsPage({
  board,
  onAddCash,
  onUpdateCash,
  onDeleteCash,
  onAddGood,
  onUpdateGood,
  onDeleteGood,
  onReturnGood,
  onUpdateReturnFee,
  onSetGoodEnabled,
}: {
  board: PurseBoard;
  onAddCash: (input: {
    kind: "deposit" | "withdraw";
    amountYuan: number;
    occurredOn?: string;
    note?: string;
  }) => void;
  onUpdateCash: (input: {
    id: string;
    amountYuan: number;
    occurredOn: string;
    note?: string | null;
  }) => void;
  onDeleteCash: (id: string) => void;
  onAddGood: (input: {
    title: string;
    priceYuan: number;
    purchasedOn?: string;
    forWhom: GoodsForWhom;
    category: GoodsCategory;
    url?: string | null;
    notes?: string | null;
    imageDataUrl?: string | null;
    enabled?: boolean;
    comment?: string | null;
    calledPriceYuan?: number | null;
  }) => void;
  onUpdateGood: (input: {
    id: string;
    title: string;
    priceYuan: number;
    purchasedOn: string;
    forWhom: GoodsForWhom;
    category: GoodsCategory;
    url?: string | null;
    notes?: string | null;
    imageDataUrl?: string | null;
    enabled?: boolean;
    comment?: string | null;
    calledPriceYuan?: number | null;
  }) => void;
  onDeleteGood: (id: string) => void;
  onReturnGood: (input: {
    id: string;
    feeYuan: number;
    returnedOn?: string;
  }) => void;
  onUpdateReturnFee: (input: {
    id: string;
    feeYuan: number;
    returnedOn?: string;
  }) => void;
  onSetGoodEnabled: (id: string, enabled: boolean) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusGoodId = searchParams.get("good");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [activeMonth, setActiveMonth] = useState(() => {
    if (board.months[0]) return board.months[0].month;
    return monthKey(new Date().getFullYear(), new Date().getMonth() + 1);
  });
  const [cashDraft, setCashDraft] = useState<CashDraft>(null);
  const [goodDraft, setGoodDraft] = useState<GoodDraft>(null);
  const [returnDraft, setReturnDraft] = useState<{
    mode: "create" | "edit";
    good: GoodItem;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [dateSort, setDateSort] = useState<"asc" | "desc">("desc");
  const [selectedGoodId, setSelectedGoodId] = useState<string | null>(null);
  const [checkedGoodIds, setCheckedGoodIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [summaryOpen, setSummaryOpen] = useState(() => {
    try {
      return localStorage.getItem(GOODS_SUMMARY_OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [whomFilter, setWhomFilter] = useState<WhomFilter>("all");
  const pendingScrollGoodIdRef = useRef<string | null>(null);
  const [focusScrollToken, setFocusScrollToken] = useState(0);

  const currentMonthKey = useMemo(
    () => monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
    [],
  );

  useEffect(() => {
    if (!focusGoodId) return;
    const good = board.goods.find((g) => g.id === focusGoodId);
    if (!good) {
      setSearchParams({}, { replace: true });
      return;
    }
    const month = good.purchasedOn.slice(0, 7);
    // Set before month change — activeMonth effect must not wipe this selection.
    pendingScrollGoodIdRef.current = good.id;
    setYear(Number(month.slice(0, 4)));
    setActiveMonth(month);
    setSelectedGoodId(good.id);
    setFocusScrollToken((n) => n + 1);
    setSearchParams({}, { replace: true });
  }, [focusGoodId, board.goods, setSearchParams]);

  useEffect(() => {
    if (!focusScrollToken) return;
    const id = pendingScrollGoodIdRef.current;
    if (!id) return;
    // Re-assert selection in case the month-reset effect raced.
    if (selectedGoodId !== id) setSelectedGoodId(id);

    const month = board.goods
      .find((g) => g.id === id)
      ?.purchasedOn.slice(0, 7);
    if (month && activeMonth !== month) return;

    let tries = 0;
    let timer = 0;
    const attempt = () => {
      const el = document.getElementById(`goods-row-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        if (pendingScrollGoodIdRef.current === id) {
          pendingScrollGoodIdRef.current = null;
        }
        return;
      }
      tries += 1;
      if (tries < 12) {
        timer = window.setTimeout(attempt, 50);
      } else if (pendingScrollGoodIdRef.current === id) {
        pendingScrollGoodIdRef.current = null;
      }
    };
    timer = window.setTimeout(attempt, 50);
    return () => window.clearTimeout(timer);
  }, [focusScrollToken, activeMonth, selectedGoodId, board.goods]);

  const byMonth = useMemo(() => {
    const map = new Map<string, PurseMonthCard>();
    for (const m of board.months) map.set(m.month, m);
    return map;
  }, [board.months]);

  const yearBounds = useMemo(() => {
    const years = board.months.map((m) => Number(m.month.slice(0, 4)));
    const current = new Date().getFullYear();
    return {
      min: Math.min(current - 2, ...years, current),
      max: Math.max(current + 1, ...years, current),
    };
  }, [board.months]);

  const selected =
    byMonth.get(activeMonth) ?? emptyMonth(activeMonth);

  const disabledIds = useMemo(
    () => disabledGoodIds(board.goods),
    [board.goods],
  );

  const walletEntries = walletIncomeEntries(selected).filter((e) =>
    countsTowardWallet(e, disabledIds),
  );
  const monthPurchaseGoods = useMemo(
    () =>
      selected.goods.filter((g) => g.purchasedOn.startsWith(activeMonth)),
    [selected.goods, activeMonth],
  );
  const monthReturnedGoods = useMemo(
    () =>
      selected.goods.filter((g) =>
        Boolean(g.returnedOn?.startsWith(activeMonth)),
      ),
    [selected.goods, activeMonth],
  );
  const walletInCents = walletEntries.reduce((s, e) => s + e.amountCents, 0);
  const walletGoodsSpendCents = walletGoodsCents(monthPurchaseGoods);
  const selfSpendCents = selfGoodsSpendCents(monthPurchaseGoods);
  const monthReturnFeeCents = returnFeeCents(
    board.entries,
    (e) =>
      e.occurredOn.startsWith(activeMonth) &&
      countsTowardWallet(e, disabledIds),
  );
  const walletNetCents = walletInCents - walletGoodsSpendCents - monthReturnFeeCents;
  const byWhomRows = byWhomFull(monthPurchaseGoods);
  const byWhomTotalCents = byWhomRows.reduce((s, r) => s + r.spendCents, 0);
  const byWhomTotalCount = byWhomRows.reduce((s, r) => s + r.count, 0);

  /** Live goods-wallet balance (deposits incl. refunds − wallet goods − legacy fees). */
  const currentWalletCents = useMemo(() => {
    const deposits = board.entries
      .filter(
        (e) =>
          e.kind === "deposit" &&
          !isTaggedPartnerIncomeNote(e.note) &&
          countsTowardWallet(e, disabledIds),
      )
      .reduce((s, e) => s + e.amountCents, 0);
    const goods = walletGoodsCents(board.goods);
    const fees = returnFeeCents(board.entries, (e) =>
      countsTowardWallet(e, disabledIds),
    );
    return deposits - goods - fees;
  }, [board.entries, board.goods, disabledIds]);

  const activityRows = useMemo(() => {
    const walletIn = walletIncomeEntries(selected).filter(
      (e) => !isReturnRefundEntry(e),
    );
    const returnFees = board.entries.filter(
      (e) =>
        isReturnFeeEntry(e) && e.occurredOn.slice(0, 7) === activeMonth,
    );
    const nestedRefundGoodIds = new Set(
      monthReturnedGoods.map((g) => g.id),
    );
    // Legacy orphan fees only (new returns use refund deposits, not fee withdraws).
    const orphanReturnFees = returnFees.filter(
      (e) => !e.goodsId || !nestedRefundGoodIds.has(e.goodsId),
    );

    const priorWalletIn = board.entries
      .filter(
        (e) =>
          e.kind === "deposit" &&
          e.occurredOn.slice(0, 7) < activeMonth &&
          !isTaggedPartnerIncomeNote(e.note) &&
          countsTowardWallet(e, disabledIds),
      )
      .reduce((s, e) => s + e.amountCents, 0);
    const priorGoods = walletGoodsCents(
      board.goods.filter((g) => g.purchasedOn.slice(0, 7) < activeMonth),
    );
    const priorReturnFees = returnFeeCents(
      board.entries,
      (e) =>
        e.occurredOn.slice(0, 7) < activeMonth &&
        countsTowardWallet(e, disabledIds),
    );
    const openingCents = priorWalletIn - priorGoods - priorReturnFees;

    type Chrono =
      | {
          sortKey: string;
          kind: "income";
          entry: PurseEntry;
          date: string;
          deltaCents: number;
        }
      | {
          sortKey: string;
          kind: "good";
          good: GoodItem;
          date: string;
          deltaCents: number;
          affectsWallet: boolean;
        }
      | {
          sortKey: string;
          kind: "return_group";
          good: GoodItem;
          date: string;
          deltaCents: number;
        }
      | {
          sortKey: string;
          kind: "return_fee";
          entry: PurseEntry;
          date: string;
          deltaCents: number;
        };

    const chrono: Chrono[] = [
      ...walletIn.map((entry) => ({
        sortKey: `${entry.occurredOn}T${entry.createdAt}\twallet\t${entry.id}`,
        kind: "income" as const,
        entry,
        date: entry.occurredOn,
        deltaCents: entry.amountCents,
      })),
      // Original purchases stay on purchase date (−price even after return).
      ...monthPurchaseGoods.map((good) => {
        const affectsWallet = affectsWalletStatus(good);
        const counts = isGoodEnabled(good);
        return {
          sortKey: `${good.purchasedOn}T${good.createdAt}\tgood\t${good.id}`,
          kind: "good" as const,
          good,
          date: good.purchasedOn,
          deltaCents: affectsWallet && counts ? -good.priceCents : 0,
          affectsWallet,
        };
      }),
      // Return group on retrieve date; refund deposit provides the +delta.
      ...monthReturnedGoods.map((good) => {
        const refund = returnRefundForGood(board.entries, good.id);
        const date = good.returnedOn ?? good.purchasedOn;
        return {
          sortKey: `${date}T${good.updatedAt}\treturn\t${good.id}`,
          kind: "return_group" as const,
          good,
          date,
          deltaCents: isGoodEnabled(good) ? (refund?.amountCents ?? 0) : 0,
        };
      }),
      ...orphanReturnFees
        .filter((entry) => countsTowardWallet(entry, disabledIds))
        .map((entry) => ({
        sortKey: `${entry.occurredOn}T${entry.createdAt}\tfeereturn\t${entry.id}`,
        kind: "return_fee" as const,
        entry,
        date: entry.occurredOn,
        deltaCents: -entry.amountCents,
      })),
    ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    let running = openingCents;
    const rows: Array<
      | {
          kind: "income";
          entry: PurseEntry;
          date: string;
          statusAfterCents: number;
        }
      | {
          kind: "good";
          good: GoodItem;
          date: string;
          statusAfterCents: number;
          affectsWallet: boolean;
        }
      | {
          kind: "return_parent";
          good: GoodItem;
          date: string;
          statusAfterCents: number;
        }
      | {
          kind: "return_refund";
          good: GoodItem;
          entry: PurseEntry | undefined;
          refundCents: number;
          feeCents: number;
          date: string;
          statusAfterCents: number;
        }
      | {
          kind: "return_fee_child";
          good: GoodItem;
          feeCents: number;
          date: string;
          statusAfterCents: number;
        }
      | {
          kind: "return_fee";
          entry: PurseEntry;
          date: string;
          statusAfterCents: number;
        }
    > = [];

    for (const evt of chrono) {
      running += evt.deltaCents;
      if (evt.kind === "income") {
        rows.push({
          kind: "income",
          entry: evt.entry,
          date: evt.date,
          statusAfterCents: running,
        });
      } else if (evt.kind === "return_fee") {
        rows.push({
          kind: "return_fee",
          entry: evt.entry,
          date: evt.date,
          statusAfterCents: running,
        });
      } else if (evt.kind === "return_group") {
        const refund = returnRefundForGood(board.entries, evt.good.id);
        const legacyFee = returnFeeForGood(board.entries, evt.good.id);
        const refundCents =
          refund?.amountCents ??
          Math.max(
            0,
            evt.good.priceCents - (legacyFee?.amountCents ?? 0),
          );
        const feeCents = Math.max(0, evt.good.priceCents - refundCents);
        rows.push({
          kind: "return_parent",
          good: evt.good,
          date: evt.date,
          statusAfterCents: running,
        });
        rows.push({
          kind: "return_refund",
          good: evt.good,
          entry: refund,
          refundCents,
          feeCents,
          date: evt.date,
          statusAfterCents: running,
        });
        if (feeCents > 0) {
          rows.push({
            kind: "return_fee_child",
            good: evt.good,
            feeCents,
            date: evt.date,
            statusAfterCents: running,
          });
        }
      } else {
        rows.push({
          kind: "good",
          good: evt.good,
          date: evt.date,
          statusAfterCents: running,
          affectsWallet: evt.affectsWallet,
        });
      }
    }

    return {
      openingCents,
      closingCents: running,
      rows,
    };
  }, [
    board.entries,
    board.goods,
    activeMonth,
    selected,
    monthPurchaseGoods,
    monthReturnedGoods,
    disabledIds,
  ]);

  const displayActivityRows = useMemo(() => {
    type Row = (typeof activityRows.rows)[number];
    const goodsById = new Map(board.goods.map((g) => [g.id, g]));
    const groups: Row[][] = [];
    const rows = activityRows.rows;
    let i = 0;
    while (i < rows.length) {
      const row = rows[i]!;
      if (row.kind === "return_parent") {
        const group: Row[] = [row];
        i += 1;
        while (i < rows.length) {
          const next = rows[i]!;
          if (
            (next.kind === "return_refund" ||
              next.kind === "return_fee_child") &&
            next.good.id === row.good.id
          ) {
            group.push(next);
            i += 1;
          } else break;
        }
        groups.push(group);
      } else {
        groups.push([row]);
        i += 1;
      }
    }
    const filteredGroups =
      whomFilter === "all"
        ? groups
        : groups.filter((group) =>
            activityRowMatchesWhom(group[0]!, whomFilter, goodsById),
          );
    const ordered =
      dateSort === "desc" ? [...filteredGroups].reverse() : filteredGroups;
    return ordered.flat();
  }, [activityRows.rows, dateSort, whomFilter, board.goods]);

  const whomFilterTotal = useMemo(() => {
    if (whomFilter === "all") return { cents: 0, count: 0 };
    const seen = new Set<string>();
    let cents = 0;
    let count = 0;
    for (const row of displayActivityRows) {
      if (row.kind !== "good" && row.kind !== "return_parent") continue;
      const good = row.good;
      if (seen.has(good.id) || !isGoodEnabled(good)) continue;
      seen.add(good.id);
      cents += good.priceCents;
      count += 1;
    }
    return { cents, count };
  }, [displayActivityRows, whomFilter]);

  const monthGoodIds = useMemo(
    () =>
      displayActivityRows
        .filter(
          (row): row is Extract<typeof row, { kind: "good" }> =>
            row.kind === "good",
        )
        .map((row) => row.good.id),
    [displayActivityRows],
  );
  const allGoodsChecked =
    monthGoodIds.length > 0 &&
    monthGoodIds.every((id) => checkedGoodIds.has(id));
  const someGoodsChecked =
    monthGoodIds.some((id) => checkedGoodIds.has(id)) && !allGoodsChecked;

  function toggleGoodChecked(id: string) {
    setCheckedGoodIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllGoodsChecked() {
    setCheckedGoodIds((prev) => {
      if (monthGoodIds.length === 0) return prev;
      if (monthGoodIds.every((id) => prev.has(id))) return new Set();
      return new Set(monthGoodIds);
    });
  }

  const todayKey = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    try {
      localStorage.setItem(GOODS_SUMMARY_OPEN_KEY, summaryOpen ? "1" : "0");
    } catch {
      /* ignore quota / private mode */
    }
  }, [summaryOpen]);

  useEffect(() => {
    setConfirmDeleteId(null);
    // Keep search deep-link selection when month is switched to the target.
    if (pendingScrollGoodIdRef.current) return;
    setSelectedGoodId(null);
    setCheckedGoodIds(new Set());
  }, [activeMonth]);

  useEffect(() => {
    setCheckedGoodIds(new Set());
  }, [whomFilter]);

  const showWalletStatus = whomFilter === "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-4">
        <aside className="w-full shrink-0 xl:sticky xl:top-0 xl:w-[248px]">
          <div className="rounded-2xl border border-line/80 bg-white/55 p-2.5">
            <div className="goods-year-bar">
              <button
                type="button"
                onClick={() => {
                  setYear((y) => {
                    const next = Math.max(yearBounds.min, y - 1);
                    setActiveMonth(
                      monthKey(next, Number(activeMonth.slice(5, 7))),
                    );
                    return next;
                  });
                }}
                disabled={year <= yearBounds.min}
                className="pressable inline-flex h-7 w-7 items-center justify-center rounded-lg text-white/70 hover:bg-white/12 hover:text-white disabled:opacity-25"
                aria-label="Previous year"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="font-display text-[20px] font-semibold tracking-tight text-white tabular">
                {year}
              </div>
              <button
                type="button"
                onClick={() => {
                  setYear((y) => {
                    const next = Math.min(yearBounds.max, y + 1);
                    setActiveMonth(
                      monthKey(next, Number(activeMonth.slice(5, 7))),
                    );
                    return next;
                  });
                }}
                disabled={year >= yearBounds.max}
                className="pressable inline-flex h-7 w-7 items-center justify-center rounded-lg text-white/70 hover:bg-white/12 hover:text-white disabled:opacity-25"
                aria-label="Next year"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-0.5">
              {MONTH_BUTTONS.map(({ num, short }) => {
                const key = monthKey(year, num);
                const card = byMonth.get(key);
                const active = key === activeMonth;
                const isCurrent = key === currentMonthKey;
                const count = card?.goodsCount ?? 0;
                const walletIn = card ? walletIncomeCents(card) : 0;
                const monthPurchases = purchasesInMonth(card?.goods ?? [], key);
                const walletSpendCents = walletGoodsCents(monthPurchases);
                const selfSpendCents = selfGoodsSpendCents(monthPurchases);
                const hasData = Boolean(
                  card && (card.goodsCount > 0 || walletIn > 0),
                );
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveMonth(key)}
                    className={cn(
                      "chip relative flex w-full flex-col items-stretch gap-0.5 overflow-hidden rounded-lg px-2.5 py-2 text-left",
                      active
                        ? "bg-[color-mix(in_srgb,var(--color-gold-soft)_78%,white)] text-charcoal ring-1 ring-gold/45"
                        : hasData
                          ? "text-charcoal hover:bg-ivory-deep"
                          : "text-muted/70 hover:bg-ivory-deep/70 hover:text-muted",
                    )}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-1.5 left-1 w-[3px] rounded-full bg-azure"
                      />
                    ) : null}
                    <div className="flex items-center justify-between gap-2 pl-1">
                      <span className="text-[12.5px] font-semibold tracking-tight">
                        {short}
                        {isCurrent ? (
                          <span
                            className={cn(
                              "ml-1 text-[10px]",
                              active ? "text-azure" : "text-gold-dark",
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
                        {hasData ? `${count} goods` : "—"}
                      </span>
                    </div>
                    <MonthSpendSplit
                      walletCents={walletSpendCents}
                      selfCents={selfSpendCents}
                      active={active}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Column 2 — month summary (fully hidden so Activity can grow) */}
        {summaryOpen ? (
        <section className="w-full shrink-0 space-y-3 xl:sticky xl:top-0 xl:w-[320px]">
          <div className="purse-hero relative overflow-hidden rounded-3xl border border-line/80 px-5 py-5">
            <div className="relative z-[1]">
              <div className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
                {selected.label}
              </div>

              <div className="mt-3">
                <div className="text-[10.5px] font-semibold tracking-[0.08em] text-[#9a8768] uppercase">
                  Current wallet
                </div>
                <Money
                  currency="CNY"
                  cents={currentWalletCents}
                  className={cn(
                    "mt-1 font-display text-[32px] font-semibold tracking-tight tabular",
                    currentWalletCents >= 0 ? "text-charcoal" : "text-coral",
                  )}
                />
              </div>

              <div className="mt-4 flex items-end justify-between gap-3 border-t border-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] pt-3.5">
                <div>
                  <div className="text-[10.5px] font-semibold tracking-[0.08em] text-[#9a8768] uppercase">
                    Opening · this month
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Status before {selected.label}
                  </p>
                </div>
                <Money
                  currency="CNY"
                  cents={activityRows.openingCents}
                  className={cn(
                    "font-display text-[20px] font-semibold tracking-tight tabular",
                    activityRows.openingCents >= 0
                      ? "text-[#7a5b1f]"
                      : "text-coral",
                  )}
                />
              </div>
            </div>
          </div>

          <Panel className="!p-4">
            <div className="mb-2.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
              This month
            </div>
            <div className="space-y-3">
              <SummaryRow
                label="Wallet in"
                cents={walletInCents}
                tone="income"
              />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-[12px] font-medium text-muted">
                    Goods spend
                  </span>
                  <p className="text-[10.5px] text-muted/80">
                    Wallet + Self
                  </p>
                </div>
                <MonthSpendSplit
                  walletCents={walletGoodsSpendCents}
                  selfCents={selfSpendCents}
                  size="md"
                />
              </div>
              {monthReturnFeeCents > 0 ? (
                <SummaryRow
                  label="Retrieve fees"
                  cents={monthReturnFeeCents}
                  tone="expense"
                />
              ) : null}
              <div className="flex items-center justify-between gap-2 border-t border-line/80 pt-2.5">
                <span className="text-[12.5px] font-semibold text-charcoal">
                  Month net
                </span>
                <Money
                  currency="CNY"
                  cents={walletNetCents}
                  signed
                  className={cn(
                    "text-[14px] font-semibold tabular",
                    walletNetCents >= 0 ? "text-emerald" : "text-coral",
                  )}
                />
              </div>
            </div>
          </Panel>

          <Panel className="!p-4">
            <div className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
              By whom
            </div>
            <div className="space-y-2.5">
              {byWhomRows.map((row) => (
                <div
                  key={row.whom}
                  className="flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-[13px] font-semibold text-charcoal">
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
              ))}
              <div className="flex items-center justify-between gap-2 border-t border-line/80 pt-2.5">
                <div>
                  <div className="text-[13px] font-semibold text-charcoal">
                    Total
                  </div>
                  <div className="text-[11px] text-muted">
                    {byWhomTotalCount} purchase
                    {byWhomTotalCount === 1 ? "" : "s"}
                  </div>
                </div>
                <Money
                  currency="CNY"
                  cents={byWhomTotalCents}
                  className="text-[14px] font-semibold text-charcoal"
                />
              </div>
            </div>
          </Panel>

          <Panel className="!p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-display text-[14px] font-semibold text-charcoal">
                Wallet log
              </h3>
              <button
                type="button"
                onClick={() =>
                  setCashDraft({ mode: "create", defaultDate: todayKey })
                }
                className="pressable inline-flex h-8 items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--color-azure)_32%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-azure-soft)_92%,white),color-mix(in_srgb,var(--color-azure-soft)_58%,white))] px-2.5 text-[12px] font-semibold tracking-tight text-[#2f5f9e] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.75)] hover:border-[color-mix(in_srgb,var(--color-azure)_48%,transparent)]"
              >
                <Wallet className="h-3.5 w-3.5" strokeWidth={2.1} />
                Add income
              </button>
            </div>
            {walletEntries.length === 0 ? (
              <p className="text-[13px] text-muted">
                No money added to wallet this month.
              </p>
            ) : (
              <ul className="divide-y divide-line/70">
                {walletEntries.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium text-charcoal">
                        {e.note?.trim() || "Deposit"}
                      </div>
                      <div className="text-[10.5px] text-muted">
                        {format(
                          parse(e.occurredOn, "yyyy-MM-dd", new Date()),
                          "MMM d",
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Money
                        currency="CNY"
                        cents={e.amountCents}
                        className="mr-1 text-[12.5px] font-semibold text-emerald"
                      />
                      {confirmDeleteId === e.id ? null : (
                        <button
                          type="button"
                          onClick={() =>
                            setCashDraft({ mode: "edit", entry: e })
                          }
                          className="rounded-lg p-1.5 text-muted hover:bg-gold-soft/70 hover:text-gold-dark"
                          aria-label="Edit income"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <InlineConfirmDelete
                        active={confirmDeleteId === e.id}
                        onAsk={() => setConfirmDeleteId(e.id)}
                        onCancel={() => setConfirmDeleteId(null)}
                        onConfirm={() => {
                          onDeleteCash(e.id);
                          setConfirmDeleteId(null);
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>
        ) : null}

        {/* Column 3 — activity table (wallet in + goods + status) */}
        <section className="min-w-0 flex-1 space-y-3">
          <div className="space-y-2.5 px-0.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-[15px] font-semibold text-charcoal">
                  Activity
                </h3>
                <p className="text-[11px] text-muted">
                  {dateSort === "desc" ? "Newest first" : "Oldest first"} · Self
                  flag skips Status
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {showWalletStatus ? (
                  <div className="goods-activity-header__balance">
                    <span>Balance</span>
                    <Money
                      currency="CNY"
                      cents={activityRows.closingCents}
                      className={cn(
                        "text-[12px] font-semibold tabular",
                        activityRows.closingCents >= 0
                          ? "text-emerald"
                          : "text-coral",
                      )}
                    />
                  </div>
                ) : whomFilterTotal.count > 0 ? (
                  <div className="goods-activity-header__balance">
                    <span>{WHOM_LABEL[whomFilter]}</span>
                    <Money
                      currency="CNY"
                      cents={whomFilterTotal.cents}
                      className="text-[12px] font-semibold tabular text-charcoal"
                    />
                  </div>
                ) : null}
                <button
                type="button"
                onClick={() =>
                  setCashDraft({ mode: "create", defaultDate: todayKey })
                }
                className="pressable inline-flex h-8 items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--color-azure)_32%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-azure-soft)_92%,white),color-mix(in_srgb,var(--color-azure-soft)_58%,white))] px-2.5 text-[12px] font-semibold tracking-tight text-[#2f5f9e] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.75)] hover:border-[color-mix(in_srgb,var(--color-azure)_48%,transparent)]"
              >
                <Wallet className="h-3.5 w-3.5" strokeWidth={2.1} />
                Add income
              </button>
              <button
                type="button"
                onClick={() =>
                  setGoodDraft({ mode: "create", defaultDate: todayKey })
                }
                className="pressable inline-flex h-8 items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-gold-soft)_88%,white),color-mix(in_srgb,var(--color-gold-soft)_52%,white))] px-3 text-[12px] font-semibold tracking-tight text-[#7a5b1f] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.75)] hover:border-[color-mix(in_srgb,var(--color-gold)_55%,transparent)]"
              >
                <PackagePlus className="h-3.5 w-3.5" strokeWidth={2.15} />
                Add goods
              </button>
              </div>
            </div>

            <div className="goods-activity-toolbar">
              <div className="goods-activity-toolbar__group">
                <span className="goods-activity-toolbar__label">Whom</span>
                <div
                  className="goods-activity-segment"
                  role="group"
                  aria-label="Filter by person"
                >
                  <button
                    type="button"
                    onClick={() => setWhomFilter("all")}
                    className="goods-activity-segment__btn pressable"
                    aria-pressed={whomFilter === "all"}
                  >
                    All
                  </button>
                  {GOODS_WHOM_OPTIONS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWhomFilter(w)}
                      className="goods-activity-segment__btn goods-activity-segment__btn--person pressable"
                      aria-pressed={whomFilter === w}
                    >
                      {WHOM_LABEL[w]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="goods-activity-toolbar__divider" aria-hidden />

              <div className="goods-activity-toolbar__group">
                <span className="goods-activity-toolbar__label">Summary</span>
                <div
                  className="goods-activity-segment"
                  role="group"
                  aria-label="Show summary column"
                >
                  <button
                    type="button"
                    onClick={() => setSummaryOpen(true)}
                    className="goods-activity-segment__btn pressable"
                    aria-pressed={summaryOpen}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setSummaryOpen(false)}
                    className="goods-activity-segment__btn pressable"
                    aria-pressed={!summaryOpen}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          </div>

          <Panel className="!overflow-hidden !p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-ivory-deep/60 text-[10.5px] font-semibold tracking-[0.06em] text-muted uppercase">
                    <th className="w-10 px-2 py-2.5 text-center font-semibold">
                      <span className="sr-only">Check</span>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={
                          allGoodsChecked
                            ? true
                            : someGoodsChecked
                              ? "mixed"
                              : false
                        }
                        aria-label={
                          allGoodsChecked
                            ? "Uncheck all goods"
                            : "Check all goods"
                        }
                        disabled={monthGoodIds.length === 0}
                        onClick={toggleAllGoodsChecked}
                        className={cn(
                          "goods-check",
                          allGoodsChecked && "goods-check--on",
                          someGoodsChecked && "goods-check--mixed",
                          monthGoodIds.length === 0 && "opacity-40",
                        )}
                      >
                        {allGoodsChecked ? (
                          <Check className="h-3 w-3" strokeWidth={2.8} />
                        ) : someGoodsChecked ? (
                          <span className="goods-check__dash" />
                        ) : null}
                      </button>
                    </th>
                    <th className="px-3 py-2.5 font-semibold">Title</th>
                    <th className="px-3 py-2.5 font-semibold">Type</th>
                    <th className="px-3 py-2.5 font-semibold">
                      <button
                        type="button"
                        onClick={() =>
                          setDateSort((s) => (s === "desc" ? "asc" : "desc"))
                        }
                        className="inline-flex items-center gap-1 rounded-md text-[10.5px] font-semibold tracking-[0.06em] text-muted uppercase transition hover:text-charcoal"
                        title={
                          dateSort === "desc"
                            ? "Sorted newest first — click for oldest first"
                            : "Sorted oldest first — click for newest first"
                        }
                      >
                        Date
                        {dateSort === "desc" ? (
                          <ArrowDown className="h-3 w-3 text-gold-dark" />
                        ) : (
                          <ArrowUp className="h-3 w-3 text-gold-dark" />
                        )}
                      </button>
                    </th>
                    <th className="px-3 py-2.5 font-semibold">Whom</th>
                    <th className="px-3 py-2.5 font-semibold">Link</th>
                    <th className="px-3 py-2.5 text-right font-semibold">
                      Amount
                    </th>
                    <th className="px-3 py-2.5 text-right font-semibold">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayActivityRows.length === 0 &&
                  (whomFilter !== "all" || activityRows.openingCents === 0) ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-8 text-center text-[13px] text-muted"
                      >
                        {whomFilter !== "all"
                          ? `No goods for ${WHOM_LABEL[whomFilter]} in ${selected.label}.`
                          : `No wallet or goods activity for ${selected.label}.`}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {showWalletStatus && dateSort === "asc" ? (
                        <tr className="border-b border-line/70 bg-ivory-deep/50">
                          <td className="px-3 py-2.5" colSpan={6}>
                            <div className="text-[13px] font-semibold text-charcoal">
                              Opening
                            </div>
                            <div className="text-[11px] text-muted">
                              Wallet status at start of {selected.label}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Money
                              currency="CNY"
                              cents={activityRows.openingCents}
                              className={cn(
                                "text-[13px] font-semibold tabular",
                                activityRows.openingCents >= 0
                                  ? "text-charcoal"
                                  : "text-coral",
                              )}
                            />
                          </td>
                          <td className="px-3 py-2.5" />
                        </tr>
                      ) : null}
                      {displayActivityRows.map((row) =>
                      row.kind === "income" ? (
                        <tr
                          key={`income-${row.entry.id}`}
                          className="goods-income-row"
                        >
                          <td className="px-2 py-3 text-center">
                            <span className="goods-check goods-check--ghost" />
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex max-w-[260px] items-center gap-2.5">
                              <span className="goods-income-icon">
                                <Wallet className="h-4 w-4" strokeWidth={2.1} />
                              </span>
                              <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                  <span className="goods-income-title line-clamp-2 text-[13px]">
                                    {row.entry.note?.trim() || "Wallet in"}
                                  </span>
                                  {isSalaryNote(row.entry.note) ? (
                                    <span className="goods-income-pill">
                                      Salary
                                    </span>
                                  ) : null}
                                </div>
                                <div className="goods-income-sub">
                                  {isSalaryNote(row.entry.note)
                                    ? "Salary · wallet in"
                                    : "Income · wallet"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {isSalaryNote(row.entry.note) ? (
                              <span className="goods-type-chip">Salary</span>
                            ) : (
                              <span className="goods-type-chip">In</span>
                            )}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-[12.5px] font-medium text-charcoal tabular">
                            {formatDotDate(row.date)}
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Money
                              currency="CNY"
                              cents={row.entry.amountCents}
                              signed
                              className="text-[14px] font-bold text-azure"
                            />
                          </td>
                          <td className="px-3 py-3 text-right">
                            {showWalletStatus ? (
                              <Money
                                currency="CNY"
                                cents={row.statusAfterCents}
                                className={cn(
                                  "text-[13px] font-semibold tabular",
                                  row.statusAfterCents >= 0
                                    ? "text-azure"
                                    : "text-coral",
                                )}
                              />
                            ) : (
                              <span className="text-[12px] text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="inline-flex items-center justify-end gap-0.5">
                              {confirmDeleteId === row.entry.id ? null : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCashDraft({
                                      mode: "edit",
                                      entry: row.entry,
                                    })
                                  }
                                  className="rounded-lg p-1.5 text-muted hover:bg-gold-soft/70 hover:text-gold-dark"
                                  aria-label="Edit income"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <InlineConfirmDelete
                                active={confirmDeleteId === row.entry.id}
                                onAsk={() => setConfirmDeleteId(row.entry.id)}
                                onCancel={() => setConfirmDeleteId(null)}
                                onConfirm={() => {
                                  onDeleteCash(row.entry.id);
                                  setConfirmDeleteId(null);
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ) : row.kind === "return_fee" ? (
                        <tr
                          key={`return-fee-${row.entry.id}`}
                          className="border-b border-line/70 bg-ivory-deep/40 last:border-0"
                        >
                          <td className="px-2 py-2.5 text-center">
                            <span className="goods-check goods-check--ghost" />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex max-w-[260px] items-center gap-2.5">
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-charcoal/90 text-gold">
                                <RotateCcw
                                  className="h-4 w-4"
                                  strokeWidth={2.1}
                                />
                              </span>
                              <div className="min-w-0">
                                <div className="line-clamp-2 text-[13px] font-medium text-charcoal">
                                  {stripReturnFeeMarker(row.entry.note) ||
                                    "Retrieve fee"}
                                </div>
                                <div className="text-[10px] font-medium tracking-[0.06em] text-muted uppercase">
                                  Kept from refund
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex rounded-md border border-line bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-muted">
                              Retrieve fee
                            </span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-[12.5px] text-charcoal tabular">
                            {formatDotDate(row.date)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Money
                              currency="CNY"
                              cents={-row.entry.amountCents}
                              signed
                              className="text-[13px] font-semibold text-coral"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {showWalletStatus ? (
                              <Money
                                currency="CNY"
                                cents={row.statusAfterCents}
                                className={cn(
                                  "text-[13px] font-semibold tabular",
                                  row.statusAfterCents >= 0
                                    ? "text-charcoal"
                                    : "text-coral",
                                )}
                              />
                            ) : (
                              <span className="text-[12px] text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="inline-flex items-center justify-end gap-0.5">
                              <InlineConfirmDelete
                                active={confirmDeleteId === row.entry.id}
                                onAsk={() => setConfirmDeleteId(row.entry.id)}
                                onCancel={() => setConfirmDeleteId(null)}
                                onConfirm={() => {
                                  onDeleteCash(row.entry.id);
                                  setConfirmDeleteId(null);
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ) : row.kind === "return_parent" ? (
                        <tr
                          key={`return-parent-${row.good.id}`}
                          className={cn(
                            "goods-row--returned border-b border-line/70 last:border-0",
                            !isGoodEnabled(row.good) && "goods-row--disabled",
                          )}
                        >
                          <td className="px-2 py-2.5 text-center">
                            <span className="goods-check goods-check--ghost" />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex max-w-[260px] items-center gap-2.5">
                              {row.good.imageDataUrl ? (
                                <GoodPhotoThumb
                                  src={row.good.imageDataUrl}
                                  onZoom={() =>
                                    setZoomSrc(row.good.imageDataUrl!)
                                  }
                                />
                              ) : (
                                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-charcoal/90 text-gold">
                                  <RotateCcw
                                    className="h-4 w-4"
                                    strokeWidth={2.1}
                                  />
                                </span>
                              )}
                              <div className="min-w-0">
                                <div className="line-clamp-2 text-[13px] font-medium text-charcoal">
                                  {row.good.title}
                                </div>
                                {row.good.comment ? (
                                  <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">
                                    {row.good.comment}
                                  </div>
                                ) : null}
                                <div className="mt-0.5 text-[10px] font-semibold tracking-[0.07em] text-emerald uppercase">
                                  Returned
                                  {row.good.returnedOn
                                    ? ` · ${formatDotDate(row.good.returnedOn)}`
                                    : ""}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <CategoryBadge category={row.good.category} />
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-[12.5px] text-charcoal tabular">
                            {formatDotDate(row.date)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="goods-whom-pill">
                              {WHOM_LABEL[displayWhom(row.good)]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="inline-flex rounded-full border border-emerald/30 bg-emerald-soft/45 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-emerald uppercase">
                              Returned
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="inline-flex items-center justify-end gap-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  onSetGoodEnabled(
                                    row.good.id,
                                    !row.good.enabled,
                                  )
                                }
                                className={cn(
                                  "rounded-lg p-1.5",
                                  row.good.enabled
                                    ? "text-gold-dark hover:bg-gold-soft/70"
                                    : "text-muted hover:bg-ivory-deep hover:text-charcoal",
                                )}
                                aria-label={
                                  row.good.enabled
                                    ? "Disable good"
                                    : "Enable good"
                                }
                                title={
                                  row.good.enabled
                                    ? "Disable — exclude from totals"
                                    : "Enable — include in totals"
                                }
                              >
                                <Power className="h-3.5 w-3.5" strokeWidth={2.2} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setReturnDraft({
                                    mode: "edit",
                                    good: row.good,
                                  })
                                }
                                className="rounded-lg p-1.5 text-muted hover:bg-ivory-deep hover:text-charcoal"
                                aria-label="Edit retrieve fee"
                                title="Edit fee"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : row.kind === "return_refund" ? (
                        <tr
                          key={`return-refund-${row.good.id}`}
                          className="goods-return-child border-b border-line/50 last:border-0"
                        >
                          <td className="px-2 py-2 text-center">
                            <span className="goods-check goods-check--ghost" />
                          </td>
                          <td className="px-3 py-2">
                            <div className="goods-return-child__label">
                              <span className="goods-return-child__branch" />
                              <div className="min-w-0">
                                <div className="text-[12.5px] font-semibold text-emerald">
                                  Refund
                                </div>
                                <div className="text-[10px] font-medium tracking-[0.06em] text-muted uppercase">
                                  Wallet income
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex rounded-md border border-emerald/25 bg-emerald-soft/40 px-2 py-0.5 text-[11px] font-semibold text-emerald">
                              Refund
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-[12px] text-muted tabular">
                            {formatDotDate(row.date)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Money
                              currency="CNY"
                              cents={row.refundCents}
                              signed
                              className="text-[13px] font-semibold text-azure"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {showWalletStatus ? (
                              <Money
                                currency="CNY"
                                cents={row.statusAfterCents}
                                className={cn(
                                  "text-[12.5px] font-semibold tabular",
                                  row.statusAfterCents >= 0
                                    ? "text-charcoal"
                                    : "text-coral",
                                )}
                              />
                            ) : (
                              <span className="text-[12px] text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {row.entry ? (
                              <div className="inline-flex items-center justify-end gap-0.5">
                                <InlineConfirmDelete
                                  active={confirmDeleteId === row.entry.id}
                                  onAsk={() =>
                                    setConfirmDeleteId(row.entry!.id)
                                  }
                                  onCancel={() => setConfirmDeleteId(null)}
                                  onConfirm={() => {
                                    onDeleteCash(row.entry!.id);
                                    setConfirmDeleteId(null);
                                  }}
                                />
                              </div>
                            ) : (
                              <span className="text-[12px] text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ) : row.kind === "return_fee_child" ? (
                        <tr
                          key={`return-fee-child-${row.good.id}`}
                          className="goods-return-child border-b border-line/50 last:border-0"
                        >
                          <td className="px-2 py-2 text-center">
                            <span className="goods-check goods-check--ghost" />
                          </td>
                          <td className="px-3 py-2">
                            <div className="goods-return-child__label">
                              <span className="goods-return-child__branch" />
                              <div className="min-w-0">
                                <div className="text-[12.5px] font-semibold text-charcoal">
                                  Retrieve fee
                                </div>
                                <div className="text-[10px] font-medium tracking-[0.06em] text-muted uppercase">
                                  Kept from refund
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex rounded-md border border-line bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-muted">
                              Retrieve fee
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-[12px] text-muted tabular">
                            {formatDotDate(row.date)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Money
                              currency="CNY"
                              cents={-row.feeCents}
                              signed
                              className="text-[13px] font-semibold text-coral"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setReturnDraft({
                                  mode: "edit",
                                  good: row.good,
                                })
                              }
                              className="rounded-lg p-1.5 text-muted hover:bg-ivory-deep hover:text-charcoal"
                              aria-label="Edit retrieve fee"
                              title="Edit fee"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr
                          id={`goods-row-${row.good.id}`}
                          key={`good-${row.good.id}`}
                          data-good-id={row.good.id}
                          className={cn(
                            "cursor-pointer scroll-mt-24",
                            row.affectsWallet
                              ? "goods-wallet-row"
                              : "goods-self-row",
                            selectedGoodId === row.good.id &&
                              "goods-row--selected",
                            checkedGoodIds.has(row.good.id) &&
                              "goods-row--checked",
                            !isGoodEnabled(row.good) && "goods-row--disabled",
                          )}
                          onClick={() => setSelectedGoodId(row.good.id)}
                          onDoubleClick={() =>
                            setGoodDraft({ mode: "edit", good: row.good })
                          }
                        >
                          <td
                            className="px-2 py-2.5 text-center"
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={checkedGoodIds.has(row.good.id)}
                              aria-label={
                                checkedGoodIds.has(row.good.id)
                                  ? `Uncheck ${row.good.title}`
                                  : `Check ${row.good.title}`
                              }
                              onClick={() => toggleGoodChecked(row.good.id)}
                              className={cn(
                                "goods-check",
                                checkedGoodIds.has(row.good.id) &&
                                  "goods-check--on",
                              )}
                            >
                              {checkedGoodIds.has(row.good.id) ? (
                                <Check className="h-3 w-3" strokeWidth={2.8} />
                              ) : null}
                            </button>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex max-w-[260px] items-center gap-2.5">
                              {row.good.imageDataUrl ? (
                                <GoodPhotoThumb
                                  src={row.good.imageDataUrl}
                                  onZoom={() =>
                                    setZoomSrc(row.good.imageDataUrl!)
                                  }
                                />
                              ) : null}
                              <div className="min-w-0">
                                <span
                                  className={cn(
                                    "line-clamp-2 min-w-0 text-[13px] font-medium tracking-tight",
                                    row.affectsWallet
                                      ? "text-charcoal"
                                      : "text-[#6b5324]",
                                  )}
                                >
                                  {row.good.title}
                                </span>
                                {row.good.comment ? (
                                  <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">
                                    {row.good.comment}
                                  </div>
                                ) : null}
                                {isReturnedGood(row.good) ? (
                                  <div className="mt-0.5 text-[10px] font-semibold tracking-[0.07em] text-emerald uppercase">
                                    Returned
                                    {row.good.returnedOn
                                      ? ` · ${formatDotDate(row.good.returnedOn)}`
                                      : ""}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <CategoryBadge category={row.good.category} />
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-[12.5px] text-charcoal tabular">
                            {formatDotDate(row.date)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "goods-whom-pill",
                                !row.affectsWallet && "goods-whom-pill--self",
                              )}
                            >
                              {WHOM_LABEL[displayWhom(row.good)]}
                              {!row.affectsWallet ? (
                                <span className="goods-whom-pill__self">
                                  Self
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td
                            className="px-3 py-2.5"
                            onDoubleClick={(e) => e.stopPropagation()}
                          >
                            {row.good.url ? (
                              <a
                                href={row.good.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-w-0 max-w-[160px] items-center gap-1 truncate text-[12px] font-medium text-gold-dark hover:underline"
                                title={row.good.url}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">
                                  {displayUrl(row.good.url)}
                                </span>
                              </a>
                            ) : (
                              <span className="text-[12px] text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Money
                              currency="CNY"
                              cents={-row.good.priceCents}
                              signed
                              className={cn(
                                "text-[13px] font-semibold",
                                !isGoodEnabled(row.good)
                                  ? "text-muted"
                                  : row.affectsWallet
                                    ? "text-coral"
                                    : "font-bold text-[#9a7336]",
                              )}
                            />
                            {row.good.calledPriceCents != null ? (
                              <div
                                className="text-[10px] font-medium tabular text-muted"
                                title="Called price — not used in totals"
                              >
                                Called{" "}
                                <Money
                                  currency="CNY"
                                  cents={row.good.calledPriceCents}
                                  className="text-[10px] font-medium text-muted"
                                />
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {!showWalletStatus ? (
                              <span className="text-[12px] text-muted">—</span>
                            ) : !isGoodEnabled(row.good) ? (
                              <span
                                className="inline-flex rounded-full border border-line bg-ivory-deep/80 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-muted uppercase"
                                title="Disabled — excluded from all totals"
                              >
                                Off
                              </span>
                            ) : row.affectsWallet ? (
                              <Money
                                currency="CNY"
                                cents={row.statusAfterCents}
                                className={cn(
                                  "text-[13px] font-semibold tabular",
                                  row.statusAfterCents >= 0
                                    ? "text-charcoal"
                                    : "text-coral",
                                )}
                              />
                            ) : (
                              <span
                                className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--color-gold)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-gold-soft)_35%,white)] px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-gold-dark/80 uppercase"
                                title="Outside this wallet — Status unchanged"
                              >
                                Outside
                              </span>
                            )}
                          </td>
                          <td
                            className="px-3 py-2.5 text-right"
                            onDoubleClick={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-0.5">
                              {confirmDeleteId === row.good.id ? null : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onSetGoodEnabled(
                                        row.good.id,
                                        !row.good.enabled,
                                      )
                                    }
                                    className={cn(
                                      "rounded-lg p-1.5",
                                      row.good.enabled
                                        ? "text-gold-dark hover:bg-gold-soft/70"
                                        : "text-muted hover:bg-ivory-deep hover:text-charcoal",
                                    )}
                                    aria-label={
                                      row.good.enabled
                                        ? "Disable good"
                                        : "Enable good"
                                    }
                                    title={
                                      row.good.enabled
                                        ? "Disable — exclude from totals"
                                        : "Enable — include in totals"
                                    }
                                  >
                                    <Power
                                      className="h-3.5 w-3.5"
                                      strokeWidth={2.2}
                                    />
                                  </button>
                                  {row.affectsWallet &&
                                  !isReturnedGood(row.good) &&
                                  isGoodEnabled(row.good) ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReturnDraft({
                                          mode: "create",
                                          good: row.good,
                                        })
                                      }
                                      className="rounded-lg p-1.5 text-muted hover:bg-emerald-soft/70 hover:text-emerald"
                                      aria-label="Return"
                                      title="Return"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setGoodDraft({
                                        mode: "edit",
                                        good: row.good,
                                      })
                                    }
                                    className="rounded-lg p-1.5 text-muted hover:bg-ivory-deep hover:text-charcoal"
                                    aria-label="Edit"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                              <InlineConfirmDelete
                                active={confirmDeleteId === row.good.id}
                                onAsk={() => setConfirmDeleteId(row.good.id)}
                                onCancel={() => setConfirmDeleteId(null)}
                                onConfirm={() => {
                                  onDeleteGood(row.good.id);
                                  setConfirmDeleteId(null);
                                  setCheckedGoodIds((prev) => {
                                    if (!prev.has(row.good.id)) return prev;
                                    const next = new Set(prev);
                                    next.delete(row.good.id);
                                    return next;
                                  });
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                      {showWalletStatus && dateSort === "desc" ? (
                        <tr className="border-t border-line/70 bg-ivory-deep/50">
                          <td className="px-3 py-2.5" colSpan={6}>
                            <div className="text-[13px] font-semibold text-charcoal">
                              Opening
                            </div>
                            <div className="text-[11px] text-muted">
                              Wallet status at start of {selected.label}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Money
                              currency="CNY"
                              cents={activityRows.openingCents}
                              className={cn(
                                "text-[13px] font-semibold tabular",
                                activityRows.openingCents >= 0
                                  ? "text-charcoal"
                                  : "text-coral",
                              )}
                            />
                          </td>
                          <td className="px-3 py-2.5" />
                        </tr>
                      ) : null}
                      {whomFilter !== "all" && whomFilterTotal.count > 0 ? (
                        <tr className="border-t-2 border-line bg-ivory-deep/80">
                          <td className="px-3 py-3" colSpan={6}>
                            <div className="text-[13px] font-semibold text-charcoal">
                              Total · {WHOM_LABEL[whomFilter]}
                            </div>
                            <div className="text-[11px] text-muted">
                              {whomFilterTotal.count} item
                              {whomFilterTotal.count === 1 ? "" : "s"} · purchase
                              price
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Money
                              currency="CNY"
                              cents={whomFilterTotal.cents}
                              className="text-[15px] font-bold text-charcoal"
                            />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-[12px] text-muted">—</span>
                          </td>
                          <td className="px-3 py-3" />
                        </tr>
                      ) : null}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      </div>

      <CashDrawer
        draft={cashDraft}
        onClose={() => setCashDraft(null)}
        onSave={(data) => {
          if (cashDraft?.mode === "edit" && cashDraft.entry) {
            onUpdateCash({
              id: cashDraft.entry.id,
              amountYuan: data.amountYuan,
              occurredOn: data.occurredOn ?? cashDraft.entry.occurredOn,
              note: data.note,
            });
          } else {
            onAddCash({ kind: "deposit", ...data });
          }
          setCashDraft(null);
        }}
      />
      <GoodDrawer
        draft={goodDraft}
        onClose={() => setGoodDraft(null)}
        onSave={(data) => {
          if (goodDraft?.mode === "edit" && goodDraft.good) {
            onUpdateGood({ id: goodDraft.good.id, ...data });
          } else {
            onAddGood(data);
          }
          setGoodDraft(null);
        }}
        onZoomPhoto={setZoomSrc}
      />
      <ReturnDrawer
        draft={returnDraft}
        boardEntries={board.entries}
        onClose={() => setReturnDraft(null)}
        onConfirm={(data) => {
          if (!returnDraft) return;
          if (returnDraft.mode === "edit") {
            onUpdateReturnFee({ id: returnDraft.good.id, ...data });
          } else {
            onReturnGood({ id: returnDraft.good.id, ...data });
          }
          setReturnDraft(null);
        }}
      />
      <ImageLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  );
}

function CategoryBadge({ category }: { category: GoodsCategory }) {
  const Icon = CATEGORY_ICON[category];
  return (
    <span className="goods-category-badge">
      <span className="goods-category-badge__icon">
        <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
      </span>
      <span className="truncate">{GOODS_CATEGORY_LABEL[category]}</span>
    </span>
  );
}

function CategoryPicker({
  value,
  onChange,
}: {
  value: GoodsCategory;
  onChange: (next: GoodsCategory) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
    openUp: boolean;
  } | null>(null);

  const SelectedIcon = CATEGORY_ICON[value];

  function placeMenu() {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight && rect.top > spaceBelow;
    setMenuBox({
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      left: rect.left,
      width: Math.max(rect.width, 280),
      openUp,
    });
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      placeMenu();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group field flex h-11 w-full items-center gap-2.5 px-2.5 text-left transition",
          open
            ? "border-emerald/45 bg-white shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-emerald)_14%,transparent)]"
            : "hover:border-emerald/30",
        )}
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]">
          <SelectedIcon className="h-4 w-4" strokeWidth={2.1} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-charcoal">
          {GOODS_CATEGORY_LABEL[value]}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition duration-200",
            open && "rotate-180 text-emerald",
          )}
        />
      </button>

      <AnimatePresence>
        {open && menuBox ? (
          <motion.div
            role="listbox"
            aria-label="Goods category"
            className="fixed z-[95] overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-line)_75%,transparent)] bg-[color-mix(in_srgb,white_92%,var(--color-ivory))] shadow-[0_28px_56px_-24px_rgb(47_45_41/0.42),0_1px_0_rgb(255_255_255/0.85)_inset] backdrop-blur-md"
            style={{
              left: menuBox.left,
              width: Math.min(menuBox.width, window.innerWidth - 24),
              maxWidth: "calc(100vw - 24px)",
              ...(menuBox.openUp
                ? { bottom: window.innerHeight - menuBox.top }
                : { top: menuBox.top }),
            }}
            initial={{ opacity: 0, y: menuBox.openUp ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: menuBox.openUp ? 4 : -4, scale: 0.985 }}
            transition={{ duration: 0.18, ease: easePremium }}
          >
            <div className="border-b border-line/60 bg-emerald/[0.04] px-3.5 py-2.5">
              <div className="text-[10px] font-semibold tracking-[0.12em] text-emerald uppercase">
                Choose type
              </div>
              <div className="mt-0.5 text-[12px] text-muted">
                Icon-tagged categories for your goods log
              </div>
            </div>
            <div className="grid max-h-[min(52vh,340px)] grid-cols-1 gap-1 overflow-y-auto p-2 sm:grid-cols-2">
              {GOODS_CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICON[c.id];
                const active = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition",
                      active
                        ? "bg-emerald text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16)]"
                        : "text-charcoal hover:bg-ivory-deep/90",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        active
                          ? "bg-white/15 text-white"
                          : "bg-emerald-soft/80 text-emerald",
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.1} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                      {c.label}
                    </span>
                    {active ? (
                      <Check className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.5} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function GoodPhotoThumb({
  src,
  onZoom,
}: {
  src: string;
  onZoom?: () => void;
}) {
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);

  return (
    <>
      <button
        type="button"
        className="relative inline-flex shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald/40"
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor({
            top: rect.top,
            left: rect.left + rect.width / 2,
          });
        }}
        onMouseLeave={() => setAnchor(null)}
        onClick={(e) => {
          e.stopPropagation();
          onZoom?.();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        aria-label="Zoom photo"
      >
        <img
          src={src}
          alt=""
          className="h-9 w-9 rounded-lg object-cover ring-1 ring-line transition duration-200 hover:ring-emerald/40"
        />
      </button>
      <AnimatePresence>
        {anchor ? (
          <motion.div
            className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-full"
            style={{
              top: Math.max(12, anchor.top - 12),
              left: anchor.left,
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.16, ease: easePremium }}
          >
            <img
              src={src}
              alt=""
              className="h-48 w-48 rounded-2xl object-cover shadow-[0_24px_48px_-18px_rgb(47_45_41/0.5)] ring-2 ring-white/90"
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function ImageLightbox({
  src,
  onClose,
}: {
  src: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!src) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);

  return (
    <AnimatePresence>
      {src ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-6">
          <motion.button
            type="button"
            aria-label="Close zoom"
            className="absolute inset-0 bg-charcoal/55 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.img
            src={src}
            alt=""
            className="relative z-10 max-h-[min(88vh,920px)] max-w-[min(92vw,920px)] rounded-2xl object-contain shadow-2xl ring-1 ring-white/30"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22, ease: easePremium }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function InlineConfirmDelete({
  active,
  onAsk,
  onCancel,
  onConfirm,
}: {
  active: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (active) {
    return (
      <div className="inline-flex items-center gap-0.5">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg p-1.5 text-emerald hover:bg-emerald-soft"
          aria-label="Confirm delete"
          title="Yes, delete"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-muted hover:bg-ivory-deep hover:text-charcoal"
          aria-label="Cancel delete"
          title="No"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onAsk}
      className="rounded-lg p-1.5 text-muted hover:bg-coral-soft hover:text-coral"
      aria-label="Delete"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function formatDotDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${y}.${m}.${d}`;
}

function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url.length > 28 ? `${url.slice(0, 28)}…` : url;
  }
}

function MonthSpendSplit({
  walletCents,
  selfCents,
  active = false,
  size = "sm",
}: {
  walletCents: number;
  selfCents: number;
  active?: boolean;
  size?: "sm" | "md";
}) {
  const textSize = size === "md" ? "text-[13px]" : "text-[11.5px]";

  if (walletCents <= 0 && selfCents <= 0) {
    return (
      <span
        className={cn(
          "pl-1 font-semibold text-muted/55 tabular",
          size === "md" ? "text-[13px]" : "text-[12px]",
        )}
      >
        —
      </span>
    );
  }

  const title =
    walletCents > 0 && selfCents > 0
      ? `Wallet spend + Self spend`
      : walletCents > 0
        ? "Wallet spend"
        : "Self spend";

  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-1",
        size === "sm" ? "pl-1" : "justify-end",
      )}
      title={title}
    >
      {walletCents > 0 ? (
        <Money
          currency="CNY"
          cents={walletCents}
          className={cn(
            textSize,
            "font-semibold tabular",
            active ? "text-azure" : "text-charcoal",
          )}
        />
      ) : null}
      {walletCents > 0 && selfCents > 0 ? (
        <span className="text-[10px] font-semibold text-muted">+</span>
      ) : null}
      {selfCents > 0 ? (
        <Money
          currency="CNY"
          cents={selfCents}
          className={cn(
            textSize,
            "font-semibold tabular",
            active ? "text-gold-dark" : "text-[#9a7336]",
          )}
        />
      ) : null}
    </div>
  );
}

function SummaryRow({
  label,
  cents,
  tone,
}: {
  label: string;
  cents: number;
  tone: "income" | "expense" | "default";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      <Money
        currency="CNY"
        cents={cents}
        tone={tone === "default" ? "default" : tone}
        className="text-[14px] font-semibold"
      />
    </div>
  );
}

function ReturnDrawer({
  draft,
  boardEntries,
  onClose,
  onConfirm,
}: {
  draft: { mode: "create" | "edit"; good: GoodItem } | null;
  boardEntries: PurseEntry[];
  onClose: () => void;
  onConfirm: (data: { feeYuan: number; returnedOn?: string }) => void;
}) {
  const open = draft != null;
  const good = draft?.good ?? null;
  const editing = draft?.mode === "edit";
  const [fee, setFee] = useState("0");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    const g = draft.good;
    if (draft.mode === "edit") {
      const refund = returnRefundForGood(boardEntries, g.id);
      const feeCents = Math.max(0, g.priceCents - (refund?.amountCents ?? 0));
      setFee(String(fromCents(feeCents)));
      setDate(
        (g.returnedOn ?? refund?.occurredOn ?? format(new Date(), "yyyy-MM-dd")).slice(
          0,
          10,
        ),
      );
    } else {
      setFee("0");
      setDate(format(new Date(), "yyyy-MM-dd"));
    }
    setError(null);
  }, [draft, boardEntries]);

  const feeNum = Number(fee);
  const priceYuan = good ? fromCents(good.priceCents) : 0;
  const refundYuan =
    good && Number.isFinite(feeNum) && feeNum >= 0
      ? Math.max(0, priceYuan - feeNum)
      : 0;
  const feeOk =
    Number.isFinite(feeNum) &&
    feeNum >= 0 &&
    good != null &&
    feeNum * 100 <= good.priceCents + 0.0001;

  return (
    <ModalShell
      open={open}
      title={editing ? "Edit retrieve fee" : "Return"}
      subtitle={
        good
          ? editing
            ? `Update fee for “${good.title}”. Refund to wallet = price − fee.`
            : `Refund to wallet = price − retrieve fee for “${good.title}”.`
          : undefined
      }
      eyebrow="Goods"
      onClose={onClose}
      submitLabel={editing ? "Save fee" : "Confirm return"}
      disabled={!feeOk}
      onSubmit={() => {
        try {
          if (!good || !feeOk) return;
          onConfirm({ feeYuan: feeNum, returnedOn: date });
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : editing
                ? "Could not update fee"
                : "Could not return",
          );
        }
      }}
    >
      <div className="rounded-xl border border-line/80 bg-ivory-deep/40 px-3.5 py-3">
        <div className="text-[11px] font-medium tracking-[0.06em] text-muted uppercase">
          Purchase
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold text-charcoal">
            {good?.title}
          </span>
          <Money
            currency="CNY"
            cents={good?.priceCents ?? 0}
            className="text-[14px] font-semibold text-charcoal"
          />
        </div>
      </div>
      <Field label="Retrieve fee (Yuan)">
        <input
          className="field tabular"
          inputMode="decimal"
          value={fee}
          onChange={(e) => {
            setFee(e.target.value);
            setError(null);
          }}
          placeholder="0"
          required
        />
      </Field>
      <Field label="Return date">
        <input
          className="field"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald/25 bg-emerald-soft/40 px-3.5 py-3">
        <span className="text-[12px] font-medium text-emerald">
          Refunded to wallet
        </span>
        <Money
          currency="CNY"
          cents={Math.round(refundYuan * 100)}
          className="text-[15px] font-bold text-emerald"
        />
      </div>
      {error ? (
        <p className="text-[12.5px] text-coral">{error}</p>
      ) : null}
    </ModalShell>
  );
}

function CashDrawer({
  draft,
  onClose,
  onSave,
}: {
  draft: CashDraft;
  onClose: () => void;
  onSave: (data: {
    amountYuan: number;
    occurredOn?: string;
    note?: string;
  }) => void;
}) {
  const open = draft != null;
  const editing = draft?.mode === "edit";
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    if (draft.mode === "edit" && draft.entry) {
      setAmount(String(fromCents(draft.entry.amountCents)));
      setDate(draft.entry.occurredOn.slice(0, 10));
      setNote(draft.entry.note?.trim() || "");
    } else {
      setAmount("");
      setDate(draft.defaultDate ?? format(new Date(), "yyyy-MM-dd"));
      setNote("Salary");
    }
    setError(null);
  }, [draft]);

  const amountNum = Number(amount);

  return (
    <ModalShell
      open={open}
      title={editing ? "Edit wallet income" : "Add to wallet"}
      subtitle="Log money you put into the wallet — Salary or other Yuan. Jackie & Chuck income is on Insights → Partners."
      eyebrow="Wallet"
      onClose={onClose}
      submitLabel={editing ? "Save changes" : "Save to wallet"}
      disabled={!(amountNum > 0)}
      onSubmit={() => {
        try {
          if (!draft) return;
          if (isTaggedPartnerIncomeNote(note)) {
            setError("Jackie & Chuck income is recorded on Insights → Partners");
            return;
          }
          onSave({
            amountYuan: amountNum,
            occurredOn: date,
            note: note.trim() || undefined,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save");
        }
      }}
    >
      <Field label="Amount (Yuan)">
        <input
          className="field tabular"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="100"
          required
        />
      </Field>
      <Field label="Date">
        <input
          className="field"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setNote("Salary")}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition",
            note === "Salary"
              ? "bg-emerald text-white"
              : "border border-line bg-white/80 text-muted hover:border-emerald/30 hover:text-charcoal",
          )}
        >
          Salary
        </button>
      </div>
      <Field label="Note">
        <input
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Salary"
        />
      </Field>
      {error ? (
        <p className="rounded-xl bg-coral-soft px-3 py-2 text-[13px] text-coral">
          {error}
        </p>
      ) : null}
    </ModalShell>
  );
}

function GoodDrawer({
  draft,
  onClose,
  onSave,
  onZoomPhoto,
}: {
  draft: GoodDraft;
  onClose: () => void;
  onSave: (data: {
    title: string;
    priceYuan: number;
    purchasedOn: string;
    forWhom: GoodsForWhom;
    category: GoodsCategory;
    url?: string | null;
    notes?: string | null;
    imageDataUrl?: string | null;
    enabled?: boolean;
    comment?: string | null;
    calledPriceYuan?: number | null;
  }) => void;
  onZoomPhoto?: (src: string) => void;
}) {
  const open = draft != null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [forWhom, setForWhom] = useState<GoodsWhomOption>("me");
  const [outsideWallet, setOutsideWallet] = useState(false);
  const [category, setCategory] = useState<GoodsCategory>("other");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [comment, setComment] = useState("");
  const [calledPrice, setCalledPrice] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file");
      return;
    }
    void (async () => {
      try {
        // Soft size gate — compression usually brings large camera shots under quota.
        if (file.size > 12_000_000) {
          setError("Image is too large (max ~12MB before compress)");
          return;
        }
        const dataUrl = await compressImageFile(file, {
          maxEdge: 1280,
          quality: 0.72,
        });
        setImageDataUrl(dataUrl);
        setError(null);
      } catch {
        setError("Could not read image");
      }
    })();
  }

  useEffect(() => {
    if (!draft) return;
    if (draft.mode === "edit" && draft.good) {
      const g = draft.good;
      setTitle(g.title);
      setPrice(String(fromCents(g.priceCents)));
      setDate(g.purchasedOn);
      setForWhom(displayWhom(g));
      setOutsideWallet(isOutsideWallet(g));
      setCategory(g.category);
      setUrl(g.url ?? "");
      setNotes(stripOutsideWalletMarker(g.notes));
      setComment(g.comment ?? "");
      setCalledPrice(
        g.calledPriceCents != null ? String(fromCents(g.calledPriceCents)) : "",
      );
      setEnabled(g.enabled);
      setImageDataUrl(g.imageDataUrl);
    } else {
      setTitle("");
      setPrice("");
      setDate(draft.defaultDate ?? format(new Date(), "yyyy-MM-dd"));
      setForWhom("me");
      setOutsideWallet(false);
      setCategory("clothes");
      setUrl("");
      setNotes("");
      setComment("");
      setCalledPrice("");
      setEnabled(true);
      setImageDataUrl(null);
    }
    setError(null);
  }, [draft]);

  // Paste image from clipboard anywhere while this modal is open
  useEffect(() => {
    if (!open) return;

    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          applyImageFile(file);
          return;
        }
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  const priceNum = Number(price);
  const calledNum = calledPrice.trim() === "" ? null : Number(calledPrice);
  const calledOk =
    calledNum == null || (Number.isFinite(calledNum) && calledNum >= 0);

  return (
    <ModalShell
      open={open}
      title={draft?.mode === "edit" ? "Edit good" : "Add good"}
      subtitle="Name it, pick a category, tag who it’s for, and set the Yuan price."
      onClose={onClose}
      submitLabel={draft?.mode === "edit" ? "Save changes" : "Save good"}
      disabled={
        !title.trim() ||
        !(priceNum >= 0) ||
        !Number.isFinite(priceNum) ||
        !calledOk
      }
      onSubmit={() => {
        try {
          onSave({
            title: title.trim(),
            priceYuan: priceNum,
            purchasedOn: date,
            forWhom,
            category,
            url: url.trim() || null,
            notes: withOutsideWalletMarker(notes, outsideWallet),
            imageDataUrl,
            enabled,
            comment: comment.trim() || null,
            calledPriceYuan: calledNum,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save");
        }
      }}
    >
      <Field label="Title">
        <input
          className="field"
          value={title}
          onChange={(e) => {
            const next = e.target.value;
            setTitle(next);
            if (draft?.mode !== "edit") {
              setCategory(inferGoodsCategory(next || "other"));
            }
          }}
          placeholder="Wireless headphones"
          required
        />
      </Field>
      <div className="block space-y-1.5">
        <span className="text-[11px] font-medium tracking-[0.04em] text-muted uppercase">
          Category
        </span>
        <CategoryPicker value={category} onChange={setCategory} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (Yuan)">
          <input
            className="field tabular"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="89.00"
            required
          />
        </Field>
        <Field label="Called (Yuan)">
          <input
            className="field tabular"
            inputMode="decimal"
            value={calledPrice}
            onChange={(e) => setCalledPrice(e.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>
      <Field label="Purchased">
        <input
          className="field"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <Field label="For whom">
        <div className="grid grid-cols-4 gap-1.5">
          {GOODS_WHOM_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setForWhom(w)}
              className={cn(
                "h-10 rounded-xl px-1 text-[12px] font-semibold transition",
                forWhom === w
                  ? "bg-emerald text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]"
                  : "border border-line/90 bg-white/90 text-muted hover:border-emerald/30 hover:bg-emerald-soft/40 hover:text-charcoal",
              )}
            >
              {WHOM_LABEL[w]}
            </button>
          ))}
        </div>
        <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-dashed border-line/90 bg-white/50 px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--color-gold)]"
            checked={outsideWallet}
            onChange={(e) => setOutsideWallet(e.target.checked)}
          />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-charcoal">
              Self · outside wallet
            </span>
            <span className="block text-[11px] text-muted">
              Optional — still tagged Me / Jackie / Family / Chuck, but Status stays flat
            </span>
          </span>
        </label>
        <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-dashed border-line/90 bg-white/50 px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--color-gold)]"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-charcoal">
              Enabled
            </span>
            <span className="block text-[11px] text-muted">
              Off = listed, but excluded from wallet and every total
            </span>
          </span>
        </label>
      </Field>
      <Field label="Product URL">
        <input
          className="field"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
      </Field>
      <div className="block space-y-1.5">
        <span className="text-[11px] font-medium tracking-[0.04em] text-muted uppercase">
          Photo
        </span>
        <div
          className="flex items-center gap-3 rounded-2xl border border-dashed border-line/90 bg-white/50 px-3 py-3 outline-none focus-within:border-emerald/40"
          tabIndex={0}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
              if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (!file) continue;
                e.preventDefault();
                applyImageFile(file);
                return;
              }
            }
          }}
        >
          {imageDataUrl ? (
            <button
              type="button"
              onClick={() => onZoomPhoto?.(imageDataUrl)}
              className="shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald/40"
              aria-label="Zoom photo"
            >
              <img
                src={imageDataUrl}
                alt=""
                className="h-16 w-16 rounded-xl object-cover ring-1 ring-line transition hover:ring-emerald/40"
              />
            </button>
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-ivory-deep text-muted ring-1 ring-line">
              <ImagePlus className="h-5 w-5" />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                applyImageFile(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="pressable inline-flex w-fit items-center justify-center rounded-xl border border-emerald/25 bg-emerald-soft/50 px-3 py-2 text-[12px] font-semibold text-emerald hover:border-emerald/45 hover:bg-emerald-soft"
            >
              Choose image
            </button>
            <p className="text-[11px] text-muted">
              Or paste from clipboard (Ctrl+V / ⌘V)
            </p>
            {imageDataUrl ? (
              <button
                type="button"
                onClick={() => setImageDataUrl(null)}
                className="w-fit text-left text-[12px] font-medium text-muted hover:text-coral"
              >
                Remove photo
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <Field label="Comment">
        <textarea
          className="field min-h-[64px] resize-none"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Short note on this item"
        />
      </Field>
      <Field label="Notes">
        <textarea
          className="field min-h-[72px] resize-none"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </Field>
      {error ? (
        <p className="rounded-xl bg-coral-soft px-3 py-2 text-[13px] text-coral">
          {error}
        </p>
      ) : null}
    </ModalShell>
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
      <span className="text-[11px] font-medium tracking-[0.04em] text-muted uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function ModalShell({
  open,
  title,
  subtitle,
  eyebrow = "Goods",
  onClose,
  onSubmit,
  submitLabel,
  disabled,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-[rgb(47_45_41/0.28)] backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: easePremium }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="goods-modal relative z-10 flex max-h-[min(92vh,860px)] w-full max-w-lg flex-col overflow-hidden rounded-[1.35rem] border border-[color-mix(in_srgb,var(--color-line)_70%,transparent)] shadow-[0_28px_64px_-28px_rgb(47_45_41/0.38),0_1px_0_rgb(255_255_255/0.7)_inset]"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.26, ease: easePremium }}
          >
            <div className="goods-modal-header relative px-5 pt-5 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-soft/80 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-emerald uppercase">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full bg-emerald"
                    />
                    {eyebrow}
                  </div>
                  <h2 className="mt-2.5 font-display text-[20px] font-semibold tracking-tight text-charcoal">
                    {title}
                  </h2>
                  {subtitle ? (
                    <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">
                      {subtitle}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-muted transition hover:bg-white/70 hover:text-charcoal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="goods-modal-fields min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-1 pb-4">
              {children}
            </div>
            <div className="goods-modal-footer flex gap-2.5 px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="pressable h-11 flex-1 rounded-xl border border-line/90 bg-white/70 text-[13px] font-semibold text-muted hover:bg-white hover:text-charcoal"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={onSubmit}
                className="pressable h-11 flex-[1.35] rounded-xl bg-emerald text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] hover:brightness-[1.04] disabled:opacity-40"
              >
                {submitLabel}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
