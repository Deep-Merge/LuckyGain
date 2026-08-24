import { ChevronLeft, ChevronRight, Plus, Search, ZoomIn, ZoomOut } from "lucide-react";

const ZOOM_MIN = 80;
const ZOOM_MAX = 130;
const ZOOM_STEP = 5;
const ZOOM_STORAGE_KEY = "luckygain.ui.zoom";

export function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

export function readStoredZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!raw) return 100;
    return clampZoom(Number(raw) || 100);
  } catch {
    return 100;
  }
}

export function writeStoredZoom(value: number) {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, String(clampZoom(value)));
  } catch {
    /* ignore */
  }
}

export function TopBar({
  title,
  monthLabel,
  isPartial,
  onAdd,
  onSearch,
  onPrevMonth,
  onNextMonth,
  showMonthNav = true,
  showAdd = true,
  zoom = 100,
  onZoomChange,
}: {
  title: string;
  monthLabel: string;
  isPartial: boolean;
  onAdd: () => void;
  onSearch?: () => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  showMonthNav?: boolean;
  showAdd?: boolean;
  zoom?: number;
  onZoomChange?: (next: number) => void;
}) {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

  const zoomPct = clampZoom(zoom);
  const zoomProgress =
    ((zoomPct - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100;
  const canZoomOut = zoomPct > ZOOM_MIN;
  const canZoomIn = zoomPct < ZOOM_MAX;

  function setZoom(next: number) {
    onZoomChange?.(clampZoom(next));
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b border-line px-8 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-charcoal">
            {title}
          </h1>
          {showMonthNav && isPartial ? (
            <span className="rounded-md px-2 py-0.5 text-[11px] font-medium text-muted">
              In progress
            </span>
          ) : null}
        </div>
        {showMonthNav ? (
          <div className="mt-1.5 flex items-center gap-0.5">
            {onPrevMonth ? (
              <button
                type="button"
                onClick={onPrevMonth}
                className="rounded-md p-0.5 text-muted transition hover:bg-ivory-deep hover:text-charcoal"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
            <p className="px-0.5 text-[13px] text-muted">{monthLabel}</p>
            {onNextMonth ? (
              <button
                type="button"
                onClick={onNextMonth}
                className="rounded-md p-0.5 text-muted transition hover:bg-ivory-deep hover:text-charcoal"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2.5">
        {onZoomChange ? (
          <div className="topbar-zoom" role="group" aria-label="Content zoom">
            <button
              type="button"
              className="topbar-zoom__btn"
              disabled={!canZoomOut}
              onClick={() => setZoom(zoomPct - ZOOM_STEP)}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" strokeWidth={2.1} />
            </button>

            <div className="topbar-zoom__meter">
              <span className="topbar-zoom__value tabular">{zoomPct}%</span>
              <div
                className="topbar-zoom__track"
                role="slider"
                aria-valuemin={ZOOM_MIN}
                aria-valuemax={ZOOM_MAX}
                aria-valuenow={zoomPct}
                aria-label="Zoom level"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "-") {
                    e.preventDefault();
                    setZoom(zoomPct - ZOOM_STEP);
                  } else if (
                    e.key === "ArrowRight" ||
                    e.key === "+" ||
                    e.key === "="
                  ) {
                    e.preventDefault();
                    setZoom(zoomPct + ZOOM_STEP);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    setZoom(ZOOM_MIN);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    setZoom(ZOOM_MAX);
                  } else if (e.key === "0") {
                    e.preventDefault();
                    setZoom(100);
                  }
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.min(
                    1,
                    Math.max(0, (e.clientX - rect.left) / rect.width),
                  );
                  const raw = ZOOM_MIN + ratio * (ZOOM_MAX - ZOOM_MIN);
                  const stepped = Math.round(raw / ZOOM_STEP) * ZOOM_STEP;
                  setZoom(stepped);
                }}
              >
                <div
                  className="topbar-zoom__fill"
                  style={{ width: `${zoomProgress}%` }}
                />
                <div
                  className="topbar-zoom__thumb"
                  style={{ left: `${zoomProgress}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              className="topbar-zoom__btn"
              disabled={!canZoomIn}
              onClick={() => setZoom(zoomPct + ZOOM_STEP)}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.1} />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSearch}
          className="pressable inline-flex h-10 items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,var(--color-gold)_28%,var(--color-line))] bg-[linear-gradient(180deg,rgb(255_255_255_/_0.9),color-mix(in_srgb,var(--color-gold-soft)_28%,white))] px-3.5 text-[13px] text-[#6b6358] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.75)] transition hover:border-gold/45 hover:text-charcoal"
          aria-label="Search"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="ml-1 hidden rounded-md border border-[color-mix(in_srgb,var(--color-gold)_22%,transparent)] bg-ivory-deep/80 px-1.5 py-0.5 text-[10px] font-semibold text-muted md:inline">
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </button>

        {showAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-charcoal px-4 text-[13px] font-semibold text-[#f4f0e7] transition hover:bg-charcoal-soft active:translate-y-px"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} />
            Add
          </button>
        ) : null}
      </div>
    </header>
  );
}
