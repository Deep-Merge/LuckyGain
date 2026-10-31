import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Panel, PanelTitle } from "@/components/ui/primitives";
import type { SyncCounts, SyncProgress } from "@/lib/sync/protocol";
import { syncConnectedPhone } from "@/lib/sync/syncSession";
import { wifiHost } from "@/lib/sync/wifiHost";

const btnPrimary =
  "pressable inline-flex h-10 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-gold-soft)_88%,white),color-mix(in_srgb,var(--color-gold-soft)_52%,white))] px-4 text-[12.5px] font-semibold text-[#7a5b1f] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.75)] hover:border-[color-mix(in_srgb,var(--color-gold)_55%,transparent)] disabled:cursor-not-allowed disabled:opacity-45";

export function GoodsSyncPanel() {
  const syncing = useRef(false);
  const follow = useRef<(lead?: boolean) => void>(() => {});
  const [info, setInfo] = useState(wifiHost.info);
  const [phone, setPhone] = useState(wifiHost.phone);
  const [phase, setPhase] = useState<"idle" | "syncing">("idle");
  const [report, setReport] = useState<{
    took: SyncCounts;
    peer: SyncCounts;
  } | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(wifiHost.error);

  useEffect(() => {
    wifiHost.start();
    const syncHost = () => {
      setInfo(wifiHost.info);
      setPhone(wifiHost.phone);
      if (wifiHost.error) setError(wifiHost.error);
      if (wifiHost.link) {
        wifiHost.link.onInbound = () => follow.current(false);
      }
    };
    syncHost();
    return wifiHost.subscribe(syncHost);
  }, []);

  async function sync(lead = true) {
    const link = wifiHost.link;
    if (!link || syncing.current) return;
    syncing.current = true;
    setError(null);
    setReport(null);
    setPhase("syncing");
    setProgress({
      phase: "compare",
      title: "Comparing goods",
      detail: "Looking for newer copies",
      value: 0.08,
    });
    try {
      const result = await syncConnectedPhone(link, setProgress, lead);
      setPhase("idle");
      setProgress(null);
      setReport(result);
    } catch (caught) {
      setPhase("idle");
      setProgress(null);
      setError(caught instanceof Error ? caught.message : "Could not sync goods.");
    } finally {
      syncing.current = false;
      link.forgetPending();
    }
  }
  follow.current = (lead = true) => {
    void sync(lead);
  };

  const address = info?.ips[0] ?? null;

  return (
    <Panel>
      <PanelTitle title="Sync goods" />
      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        Use the same Wi-Fi. On the phone, enter this address and code, then
        tap Sync. The newer copy of a good wins on both sides. Projects stay
        on this computer.
      </p>
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--color-gold)_22%,#ebe4d8)] bg-[linear-gradient(180deg,#fffcf8,#fbf6ec)] px-4 py-3.5">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-[#a8823d] uppercase">
          This computer
        </p>
        <p className="mt-1 font-display text-[28px] leading-none font-semibold tracking-tight text-charcoal tabular">
          {address ?? "Starting…"}
        </p>
        {info && info.ips.length > 1 ? (
          <p className="mt-2 text-[12px] text-muted">
            Also {info.ips.slice(1).join(", ")}
          </p>
        ) : null}
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[10px] font-semibold tracking-[0.16em] text-[#a8823d] uppercase">
            Code
          </span>
          <span className="font-display text-[22px] font-semibold tracking-[0.18em] text-charcoal tabular">
            {info?.code ?? "····"}
          </span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={!phone || phase === "syncing"}
          onClick={() => void sync(true)}
        >
          {phase === "syncing" ? "Syncing…" : "Sync goods"}
        </button>
        <span className="text-[12.5px] text-muted">
          {phone ? "Phone connected" : "Waiting for the phone"}
        </span>
      </div>
      {progress ? <SyncTrail progress={progress} /> : null}
      {error ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-coral">{error}</p>
      ) : null}
      <SyncResultModal report={report} onClose={() => setReport(null)} />
    </Panel>
  );
}

const SYNC_PHASES = [
  ["compare", "Compare"],
  ["send", "Send"],
  ["receive", "Receive"],
  ["save", "Save"],
] as const;

function SyncTrail({ progress }: { progress: SyncProgress }) {
  return (
    <div className="mt-4 rounded-2xl border border-[color-mix(in_srgb,var(--color-gold)_22%,#ebe4d8)] bg-[linear-gradient(180deg,#fffcf8,#fbf6ec)] px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-[15px] font-semibold tracking-tight text-charcoal">
          {progress.title}
        </p>
        <p className="shrink-0 text-[12px] text-muted">{progress.detail}</p>
      </div>
      <div className="mt-2.5 lg-progress lg-progress--sm lg-progress--gold">
        <div
          className="lg-progress__fill"
          style={{ width: `${Math.max(6, Math.round(progress.value * 100))}%` }}
        />
      </div>
      <ol className="mt-2.5 grid grid-cols-4">
        {SYNC_PHASES.map(([id, label]) => {
          const current = id === progress.phase;
          return (
            <li
              key={id}
              className={
                current
                  ? "text-[10px] font-semibold tracking-[0.14em] text-[#7a5b1f] uppercase"
                  : "text-[10px] font-semibold tracking-[0.14em] text-[#c4bbae] uppercase"
              }
            >
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SyncResultModal({
  report,
  onClose,
}: {
  report: { took: SyncCounts; peer: SyncCounts } | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!report) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report, onClose]);

  return (
    <AnimatePresence>
      {report ? (
        <div className="fixed inset-y-0 right-0 left-[240px] z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-[rgb(42_47_43/0.28)] backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Goods updated"
            className="goods-modal relative z-10 flex max-h-[min(88vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-[1.35rem] border border-[color-mix(in_srgb,var(--color-line)_70%,transparent)] shadow-[0_28px_64px_-28px_rgb(42_47_43/0.38)]"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="goods-modal-header px-5 pt-5 pb-4">
              <p className="text-[10px] font-semibold tracking-[0.16em] text-[#a8823d] uppercase">
                Sync
              </p>
              <h2 className="mt-2 font-display text-[26px] leading-none font-semibold tracking-tight text-charcoal">
                Goods updated
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                The newer copy won on each side.
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <ChangeSide label="This computer" counts={report.took} />
              <ChangeSide label="The phone" counts={report.peer} />
            </div>
            <div className="goods-modal-footer px-5 py-4">
              <button type="button" className={`${btnPrimary} w-full`} onClick={onClose}>
                Done
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function ChangeSide({ label, counts }: { label: string; counts: SyncCounts }) {
  const updated = counts.changes.filter((change) => change.action === "updated");
  const added = counts.changes.filter((change) => change.action === "added");
  return (
    <section className="rounded-2xl border border-[color-mix(in_srgb,var(--color-gold)_22%,#ebe4d8)] bg-white/70 px-3.5 py-3">
      <p className="text-[10px] font-semibold tracking-[0.16em] text-[#a8823d] uppercase">
        {label}
      </p>
      <ChangeList title="Updated" names={updated.map((change) => change.title)} />
      <ChangeList title="Added" names={added.map((change) => change.title)} />
    </section>
  );
}

function ChangeList({ title, names }: { title: string; names: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-[12px] font-semibold text-charcoal">
        {title}
        <span className="ml-1.5 font-medium text-muted tabular">{names.length}</span>
      </p>
      {names.length ? (
        <ul className="mt-1.5 space-y-1">
          {names.map((name, index) => (
            <li
              key={`${name}-${index}`}
              className="truncate font-display text-[15px] leading-snug font-semibold tracking-tight text-charcoal"
              title={name}
            >
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12.5px] text-muted">None</p>
      )}
    </div>
  );
}
