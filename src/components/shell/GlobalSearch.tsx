import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format, parse } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  FolderKanban,
  LayoutDashboard,
  LineChart,
  Package,
  Search,
  Settings,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import type { ProjectListItem } from "@/lib/db/freelance";
import type { GoodItem } from "@/lib/db/purse";
import { GOODS_CATEGORY_LABEL } from "@/lib/db/purse";
import { cn } from "@/lib/cn";
import { fromCents } from "@/lib/money";

export type GlobalSearchHit = {
  id: string;
  kind: "page" | "project" | "good";
  title: string;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  imageDataUrl?: string | null;
};

function goodMonthLabel(purchasedOn: string): string {
  try {
    return format(
      parse(`${purchasedOn.slice(0, 7)}-01`, "yyyy-MM-dd", new Date()),
      "MMMM yyyy",
    );
  } catch {
    return purchasedOn.slice(0, 7);
  }
}

function goodPriceSearchParts(priceCents: number): string[] {
  const amount = fromCents(priceCents);
  const fixed2 = amount.toFixed(2);
  const whole = String(Math.trunc(amount));
  const trimmed = fixed2.replace(/\.?0+$/, "") || "0";
  const localized = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return [
    fixed2,
    trimmed,
    whole,
    localized,
    localized.replace(/,/g, ""),
    `¥${fixed2}`,
    `¥${trimmed}`,
    `¥${whole}`,
    `￥${fixed2}`,
  ];
}

function matchesGoodPrice(query: string, priceCents: number): boolean {
  const raw = query.trim().toLowerCase();
  if (!raw) return true;
  if (matches(raw, ...goodPriceSearchParts(priceCents))) return true;

  const numeric = raw.replace(/[¥￥$,\s]/g, "");
  if (!numeric || !/^[\d.]+$/.test(numeric)) return false;

  const amount = fromCents(priceCents);
  const parsed = Number(numeric);
  if (!Number.isFinite(parsed)) return false;
  // Exact amount, or typed cents (e.g. 9900 for ¥99.00)
  return (
    Math.abs(amount - parsed) < 0.005 ||
    Math.abs(priceCents - parsed) < 0.5
  );
}

const PAGES: Array<{
  id: string;
  title: string;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  keywords: string[];
}> = [
  {
    id: "page-dashboard",
    title: "Dashboard",
    subtitle: "Overview",
    href: "/",
    icon: LayoutDashboard,
    keywords: ["home", "overview"],
  },
  {
    id: "page-goods",
    title: "Goods",
    subtitle: "Wallet & purchases",
    href: "/goods",
    icon: ShoppingBag,
    keywords: ["purse", "wallet", "shopping"],
  },
  {
    id: "page-projects",
    title: "Projects",
    subtitle: "Clients & milestones",
    href: "/projects",
    icon: FolderKanban,
    keywords: ["work", "client"],
  },
  {
    id: "page-freelance",
    title: "Freelance",
    subtitle: "Monthly released income",
    href: "/freelance",
    icon: Briefcase,
    keywords: ["income", "released"],
  },
  {
    id: "page-insights",
    title: "Insights",
    subtitle: "Charts & rollups",
    href: "/insights",
    icon: LineChart,
    keywords: ["charts", "stats"],
  },
  {
    id: "page-settings",
    title: "Settings",
    subtitle: "Password & backups",
    href: "/settings",
    icon: Settings,
    keywords: ["password", "backup"],
  },
];

const easePremium = [0.22, 1, 0.36, 1] as const;

function matches(query: string, ...parts: Array<string | null | undefined>) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts.some((p) => (p ?? "").toLowerCase().includes(q));
}

export function buildGlobalSearchHits(input: {
  query: string;
  projects: ProjectListItem[];
  goods: GoodItem[];
}): GlobalSearchHit[] {
  const q = input.query.trim().toLowerCase();
  const hits: GlobalSearchHit[] = [];

  for (const page of PAGES) {
    if (
      !q ||
      matches(q, page.title, page.subtitle, ...page.keywords)
    ) {
      hits.push({
        id: page.id,
        kind: "page",
        title: page.title,
        subtitle: page.subtitle,
        href: page.href,
        icon: page.icon,
      });
    }
  }

  for (const project of input.projects) {
    if (
      matches(
        q,
        project.name,
        project.client_name,
        project.project_type,
        project.description,
      )
    ) {
      hits.push({
        id: `project-${project.id}`,
        kind: "project",
        title: project.name,
        subtitle: `${project.client_name} · ${project.project_type}`,
        href: `/projects?project=${encodeURIComponent(project.id)}`,
        icon: FolderKanban,
      });
    }
  }

  for (const good of input.goods) {
    if (
      matches(
        q,
        good.title,
        good.notes,
        good.comment,
        GOODS_CATEGORY_LABEL[good.category],
        good.forWhom,
        ...goodPriceSearchParts(good.priceCents),
      ) ||
      matchesGoodPrice(q, good.priceCents)
    ) {
      hits.push({
        id: `good-${good.id}`,
        kind: "good",
        title: good.title,
        subtitle: `${goodMonthLabel(good.purchasedOn)} · ${GOODS_CATEGORY_LABEL[good.category]} · ¥${fromCents(good.priceCents).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        href: `/goods?good=${encodeURIComponent(good.id)}`,
        icon: Package,
        imageDataUrl: good.imageDataUrl,
      });
    }
  }

  // Prefer concrete matches when typing; pages first when empty.
  if (!q) return hits.slice(0, 10);

  const rank = (h: GlobalSearchHit) => {
    if (h.kind === "project") return 0;
    if (h.kind === "good") return 1;
    return 2;
  };
  return hits.sort((a, b) => rank(a) - rank(b)).slice(0, 32);
}

export function GlobalSearch({
  open,
  onClose,
  projects,
  goods,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectListItem[];
  goods: GoodItem[];
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const hits = useMemo(
    () => buildGlobalSearchHits({ query, projects, goods }),
    [query, projects, goods],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function go(hit: GlobalSearchHit) {
    onClose();
    // Replace so re-picking a hit while already on the page still updates search.
    navigate(hit.href, { replace: false });
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close search"
            className="global-search-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: easePremium }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search LuckyGain"
            className="global-search"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.28, ease: easePremium }}
          >
            <div className="global-search__field">
              <Search
                className="h-4 w-4 shrink-0 text-[#9a8768]"
                strokeWidth={2}
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects, goods, prices…"
                className="global-search__input"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIndex((i) =>
                      hits.length ? (i + 1) % hits.length : 0,
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIndex((i) =>
                      hits.length
                        ? (i - 1 + hits.length) % hits.length
                        : 0,
                    );
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const hit = hits[activeIndex];
                    if (hit) go(hit);
                  }
                }}
              />
              <kbd className="global-search__kbd">Esc</kbd>
            </div>

            <div className="global-search__results" role="listbox">
              {hits.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-muted">
                  No matches for “{query.trim()}”
                </p>
              ) : (
                hits.map((hit, index) => {
                  const Icon = hit.icon;
                  const active = index === activeIndex;
                  const showPhoto =
                    hit.kind === "good" && Boolean(hit.imageDataUrl);
                  return (
                    <button
                      key={hit.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cn(
                        "global-search__hit",
                        active && "is-active",
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(hit)}
                    >
                      {showPhoto ? (
                        <span className="global-search__hit-thumb">
                          <img
                            src={hit.imageDataUrl!}
                            alt=""
                            draggable={false}
                          />
                        </span>
                      ) : (
                        <span className="global-search__hit-icon">
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-[13.5px] font-semibold tracking-[-0.015em] text-[#3a3124]">
                          {hit.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-[#9a8b78]">
                          {hit.subtitle}
                        </span>
                      </span>
                      <span className="global-search__kind">{hit.kind}</span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
