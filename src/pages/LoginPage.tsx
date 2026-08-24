import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { markSessionUnlocked, verifyPassword } from "@/lib/auth";
import { publicAsset } from "@/lib/publicAsset";

function CloverMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <circle cx="10" cy="5.2" r="3.1" />
      <circle cx="10" cy="14.8" r="3.1" />
      <circle cx="5.2" cy="10" r="3.1" />
      <circle cx="14.8" cy="10" r="3.1" />
      <circle cx="10" cy="10" r="1.5" />
    </svg>
  );
}

function LoginDecor() {
  return (
    <div className="login-shell__decor" aria-hidden>
      <svg
        className="login-shell__curve login-shell__curve--left"
        viewBox="0 0 520 280"
        fill="none"
      >
        <path
          d="M40 240C120 210 170 140 210 90C250 40 310 18 470 30"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      </svg>
      <svg
        className="login-shell__curve login-shell__curve--right"
        viewBox="0 0 500 260"
        fill="none"
      >
        <path
          d="M30 40C120 28 190 55 240 100C300 155 360 190 470 210"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      </svg>
      <CloverMark className="login-shell__clover login-shell__clover--left" />
      <CloverMark className="login-shell__clover login-shell__clover--right" />
    </div>
  );
}

export function LoginPage({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPasswordInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readOnly, setReadOnly] = useState(true);

  useEffect(() => {
    setError(null);
  }, [password]);

  useEffect(() => {
    const clear = () => setPasswordInput("");
    clear();
    const t = window.setTimeout(clear, 100);
    return () => window.clearTimeout(t);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyPassword(password);
      if (!ok) {
        setError("Incorrect password");
        return;
      }
      markSessionUnlocked();
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <LoginDecor />

      <form onSubmit={submit} autoComplete="off" className="login-card">
        <input
          type="text"
          name="username"
          autoComplete="username"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          value=""
          readOnly
        />
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          value=""
          readOnly
        />

        <img
          src={publicAsset("icon.png")}
          alt=""
          width={92}
          height={92}
          className="mx-auto h-[92px] w-[92px] object-contain"
          style={{
            filter: "drop-shadow(0 10px 18px rgba(140, 110, 40, 0.22))",
          }}
          draggable={false}
        />

        <h1 className="mt-5 font-display text-[34px] font-semibold tracking-tight text-charcoal">
          LuckyGain
        </h1>

        <div className="login-card__rule">
          <span className="login-card__rule-line" />
          <span className="font-display text-[10.5px] font-medium tracking-[0.22em] text-gold uppercase">
            Local ledger
          </span>
          <span className="login-card__rule-line" />
        </div>

        <div className="login-card__clover-row">
          <span className="login-card__clover-line" />
          <CloverMark className="h-3.5 w-3.5 text-gold" />
          <span className="login-card__clover-line" />
        </div>

        <label className="mt-8 block text-left">
          <span className="mb-2 block text-[10.5px] font-medium tracking-[0.14em] text-[#8a8578] uppercase">
            Password
          </span>
          <span className="login-card__field-wrap">
            <input
              type="password"
              name="lg-session-unlock"
              autoFocus
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              readOnly={readOnly}
              className="login-card__field"
              value={password}
              onFocus={() => setReadOnly(false)}
              onChange={(e) => setPasswordInput(e.target.value)}
              required
              minLength={4}
            />
            <Lock className="login-card__lock" strokeWidth={1.75} />
          </span>
        </label>

        {error ? (
          <p className="mt-3 text-left text-[12.5px] text-coral">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={busy || password.trim().length < 4}
          className="pressable login-card__submit"
        >
          <span className="login-card__submit-label">
            {busy ? "Please wait…" : "Unlock"}
          </span>
          {!busy ? (
            <ArrowRight className="login-card__submit-arrow" strokeWidth={2} />
          ) : null}
        </button>

        <div className="login-card__footer">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald"
            strokeWidth={2}
          />
          <p className="text-[11.5px] leading-relaxed text-[#7a766c]">
            Stays unlocked until you log out or change the password in Settings.
          </p>
        </div>
      </form>
    </div>
  );
}
