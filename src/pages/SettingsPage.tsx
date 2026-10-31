import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  changePassword,
  hasPassword,
  setPassword,
} from "@/lib/auth";
import {
  downloadDatabaseBackup,
  mergeGoodsFromBackup,
  resetDatabase,
  restoreDatabaseFromBackup,
} from "@/lib/db/client";
import type { SettingsSnapshot } from "@/lib/db/domain";
import { Panel, PanelTitle, Pill } from "@/components/ui/primitives";
import { GoodsSyncPanel } from "@/components/settings/GoodsSyncPanel";
import { cn } from "@/lib/cn";

const btnPrimary =
  "pressable inline-flex h-10 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-gold-soft)_88%,white),color-mix(in_srgb,var(--color-gold-soft)_52%,white))] px-4 text-[12.5px] font-semibold text-[#7a5b1f] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.75)] hover:border-[color-mix(in_srgb,var(--color-gold)_55%,transparent)] disabled:cursor-not-allowed disabled:opacity-45";

const btnSecondary =
  "pressable inline-flex h-10 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--color-gold)_28%,#cfc5b4)] bg-[rgb(255_255_255_/_0.82)] px-4 text-[12.5px] font-semibold text-[#6b6358] hover:border-[color-mix(in_srgb,var(--color-gold)_42%,#cfc5b4)] hover:bg-white hover:text-[#3a3124] disabled:opacity-50";

const btnDanger =
  "pressable inline-flex h-10 items-center justify-center rounded-xl border border-coral/35 bg-coral-soft px-4 text-[12.5px] font-semibold text-coral hover:border-coral/50";

export function SettingsPage({
  snapshot,
  onSaveUsdCnyRate,
  onPasswordChanged,
}: {
  snapshot: SettingsSnapshot;
  onSaveUsdCnyRate: (rate: number) => void;
  onPasswordChanged?: () => void;
}) {
  const [rateDraft, setRateDraft] = useState(String(snapshot.usdCnyRate));
  const [rateError, setRateError] = useState<string | null>(null);
  const [backupName, setBackupName] = useState<string | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [mergeNote, setMergeNote] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRateDraft(String(snapshot.usdCnyRate));
    setRateError(null);
  }, [snapshot.usdCnyRate]);

  return (
    <div className="grid max-w-4xl gap-4">
      <PasswordPanel onPasswordChanged={onPasswordChanged} />

      <Panel>
        <PanelTitle title="Exchange rate" />
        <p className="mb-3 text-[13px] leading-relaxed text-muted">
          Used on Insights → Freelance to convert USD ↔ Yuan for in-hand
          amounts.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              1 USD = CNY
            </span>
            <input
              className="field h-10 w-[140px] tabular"
              inputMode="decimal"
              value={rateDraft}
              onChange={(e) => {
                setRateDraft(e.target.value);
                setRateError(null);
              }}
            />
          </label>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              const n = Number(rateDraft);
              if (!Number.isFinite(n) || n <= 0) {
                setRateError("Enter a positive rate");
                return;
              }
              onSaveUsdCnyRate(n);
            }}
          >
            Save rate
          </button>
          <Pill tone="neutral">Current {snapshot.usdCnyRate}</Pill>
        </div>
        {rateError ? (
          <p className="mt-2 text-[12.5px] text-coral">{rateError}</p>
        ) : null}
      </Panel>

      <GoodsSyncPanel />

      <Panel>
        <PanelTitle title="Backup & data" />
        <p className="mb-4 text-[13px] leading-relaxed text-muted">
          Download a{" "}
          <code className="rounded bg-ivory-deep px-1.5 py-0.5 text-[12px]">
            .sqlite
          </code>{" "}
          snapshot anytime — it goes to your Downloads folder. Restore replaces
          the ledger on this computer. Merge goods brings a phone backup in
          beside the projects already here: a good is copied when the phone
          copy is newer, including its photo and wallet lines.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              try {
                setBackupName(downloadDatabaseBackup());
                setMergeNote(null);
              } catch (e) {
                window.alert(
                  e instanceof Error ? e.message : "Could not create backup",
                );
              }
            }}
          >
            Download database backup
          </button>
          <button
            type="button"
            disabled={restoreBusy}
            className={btnSecondary}
            onClick={() => restoreInputRef.current?.click()}
          >
            {restoreBusy ? "Restoring…" : "Restore from backup"}
          </button>
          <button
            type="button"
            disabled={restoreBusy}
            className={btnSecondary}
            onClick={() => mergeInputRef.current?.click()}
          >
            {restoreBusy ? "Working…" : "Merge goods"}
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".sqlite,application/x-sqlite3,application/octet-stream"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (
                !window.confirm(
                  `Replace all local LuckyGain data with “${file.name}”? This cannot be undone.`,
                )
              ) {
                return;
              }
              setRestoreBusy(true);
              try {
                await restoreDatabaseFromBackup(file);
                window.location.reload();
              } catch (err) {
                window.alert(
                  err instanceof Error
                    ? err.message
                    : "Could not restore backup",
                );
                setRestoreBusy(false);
              }
            }}
          />
          <input
            ref={mergeInputRef}
            type="file"
            accept=".sqlite,application/x-sqlite3,application/octet-stream"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (
                !window.confirm(
                  `Merge goods from “${file.name}” into this computer? Projects, clients, and milestones stay. A good is updated when the phone copy is newer.`,
                )
              ) {
                return;
              }
              setRestoreBusy(true);
              setMergeNote(null);
              try {
                const result = await mergeGoodsFromBackup(file);
                const added =
                  result.inserted === 1 ? "1 added" : `${result.inserted} added`;
                const updated =
                  result.updated === 1
                    ? "1 updated"
                    : `${result.updated} updated`;
                const current =
                  result.unchanged === 1
                    ? "1 already current"
                    : `${result.unchanged} already current`;
                setMergeNote(
                  `Goods merged. ${updated}, ${added}, ${current}. Projects on this computer were left in place.`,
                );
                setRestoreBusy(false);
              } catch (err) {
                window.alert(
                  err instanceof Error ? err.message : "Could not merge goods",
                );
                setRestoreBusy(false);
              }
            }}
          />
          <button
            type="button"
            className={btnDanger}
            onClick={() => {
              if (window.confirm("Reset all LuckyGain local data and reload?")) {
                resetDatabase();
                window.location.reload();
              }
            }}
          >
            Reset local database
          </button>
        </div>
        {mergeNote ? (
          <p className="mt-3 text-[12.5px] text-emerald">{mergeNote}</p>
        ) : null}
        {backupName ? (
          <p className="mt-3 text-[12.5px] text-emerald">
            Saved as{" "}
            <code className="rounded bg-ivory-deep px-1.5 py-0.5 text-[12px]">
              {backupName}
            </code>{" "}
            — check your Downloads folder.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

function PasswordPanel({
  onPasswordChanged,
}: {
  onPasswordChanged?: () => void;
}) {
  const [secured, setSecured] = useState(() => hasPassword());
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      if (next.trim().length < 4) {
        setError("Password must be at least 4 characters");
        return;
      }
      if (next.trim() !== confirm.trim()) {
        setError("New passwords do not match");
        return;
      }
      if (secured) {
        await changePassword(current, next);
        setOkMsg("Password updated");
      } else {
        await setPassword(next);
        setSecured(true);
        setOkMsg("Password saved — use Log out to lock this tab");
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      onPasswordChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelTitle
        title="Password"
        action={
          <Pill tone={secured ? "success" : "neutral"}>
            {secured ? "Protected" : "Not set"}
          </Pill>
        }
      />
      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        {secured
          ? "Change the password used to unlock LuckyGain on this device. Logging out locks this tab until you enter it again."
          : "Set a password to protect this local ledger. After saving, Log out appears in the sidebar."}
      </p>
      <form onSubmit={submit} className="grid max-w-md gap-3">
        {secured ? (
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Current password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              className="field h-10 w-full"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
                setError(null);
                setOkMsg(null);
              }}
              required
            />
          </label>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            {secured ? "New password" : "Password"}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            className="field h-10 w-full"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setError(null);
              setOkMsg(null);
            }}
            required
            minLength={4}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Confirm password
          </span>
          <input
            type="password"
            autoComplete="new-password"
            className="field h-10 w-full"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
              setOkMsg(null);
            }}
            required
            minLength={4}
          />
        </label>
        {error ? (
          <p className="text-[12.5px] text-coral">{error}</p>
        ) : null}
        {okMsg ? (
          <p className="text-[12.5px] text-emerald">{okMsg}</p>
        ) : null}
        <div>
          <button
            type="submit"
            disabled={busy || next.trim().length < 4}
            className={cn(btnPrimary)}
          >
            {busy
              ? "Saving…"
              : secured
                ? "Update password"
                : "Set password"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
