import type { ReactNode } from "react";
import { Money, Panel, Pill } from "@/components/ui/primitives";
import type { BudgetView } from "@/lib/db/domain";
import { cn } from "@/lib/cn";

export function BudgetPage({
  budget,
  monthLabel,
}: {
  budget: BudgetView | null;
  monthLabel: string;
}) {
  if (!budget) {
    return (
      <Panel>
        <h2 className="font-display text-lg font-semibold text-charcoal">
          No budget for {monthLabel}
        </h2>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted">
          Budgets are monthly plans — separate from the ledger. Seed one for this
          month, or copy last month’s plan in a later release.
        </p>
      </Panel>
    );
  }

  const incomeLines = budget.lines.filter((l) => l.scope === "income");
  const fixed = budget.lines.filter((l) => l.scope === "fixed");
  const flexible = budget.lines.filter((l) => l.scope === "flexible");
  const people = budget.lines.filter((l) => l.scope === "person");
  const savings = budget.lines.filter((l) => l.scope === "savings");
  const netTarget = budget.lines.find((l) => l.scope === "net_target");

  const health =
    budget.remainingCents < 0
      ? "over"
      : budget.remainingCents < budget.plannedExpenseCents * 0.15
        ? "tight"
        : "healthy";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat
          label="Planned income"
          cents={budget.plannedIncomeCents}
          sub={
            <>
              Actual <Money cents={budget.actualIncomeCents} className="font-medium" />
            </>
          }
        />
        <Stat
          label="Planned spending"
          cents={budget.plannedExpenseCents}
          sub={
            <>
              Actual <Money cents={budget.actualExpenseCents} className="font-medium" />
            </>
          }
        />
        <Stat
          label="Remaining"
          cents={budget.remainingCents}
          tone={health === "over" ? "expense" : health === "tight" ? "warn" : "gold"}
          signed
          sub={
            health === "over"
              ? "Over plan"
              : health === "tight"
                ? "Near limit"
                : "On track"
          }
        />
        <Stat
          label="Savings target"
          cents={budget.savingsTargetCents}
          sub={
            savings[0] ? (
              <>
                Moved{" "}
                <Money cents={savings[0].actual_cents} className="font-medium" />
              </>
            ) : (
              "Keep transfers"
            )
          }
        />
      </div>

      {netTarget && (
        <Panel className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.06em] text-muted">
              Net gain target
            </div>
            <div className="mt-1 text-[13px] text-muted">
              Desired income − expense result for {monthLabel}
            </div>
          </div>
          <Money
            cents={netTarget.planned_cents}
            tone="gold"
            className="text-[22px] font-semibold"
          />
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <BudgetGroup title="Income plan" lines={incomeLines} />
        <BudgetGroup title="Fixed commitments" lines={fixed} />
        <BudgetGroup title="Flexible categories" lines={flexible} />
        <BudgetGroup title="People envelopes" lines={people} />
      </div>

      {savings.length > 0 && (
        <BudgetGroup title="Savings goal" lines={savings} />
      )}
    </div>
  );
}

function Stat({
  label,
  cents,
  sub,
  tone = "default",
  signed,
}: {
  label: string;
  cents: number;
  sub: ReactNode;
  tone?: "default" | "expense" | "gold" | "warn";
  signed?: boolean;
}) {
  return (
    <Panel>
      <div className="text-[11px] uppercase tracking-[0.06em] text-muted">
        {label}
      </div>
      <Money
        cents={cents}
        signed={signed}
        tone={
          tone === "expense"
            ? "expense"
            : tone === "gold"
              ? "gold"
              : "default"
        }
        className={cn(
          "mt-2 block text-[22px] font-semibold",
          tone === "warn" && "text-amber",
        )}
      />
      <div className="mt-2 text-[12px] text-muted">{sub}</div>
    </Panel>
  );
}

function BudgetGroup({
  title,
  lines,
}: {
  title: string;
  lines: BudgetView["lines"];
}) {
  if (lines.length === 0) return null;
  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-[15px] font-semibold text-charcoal">
          {title}
        </h3>
        <Pill tone="neutral">{lines.length}</Pill>
      </div>
      <div className="space-y-4">
        {lines.map((line) => {
          const pct =
            line.planned_cents === 0
              ? 0
              : Math.min(140, (line.actual_cents / line.planned_cents) * 100);
          const over = line.actual_cents > line.planned_cents;
          const near = !over && pct >= 80;
          return (
            <div key={line.id}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                <span className="font-medium text-charcoal">{line.label}</span>
                <span className="tabular text-muted">
                  <Money cents={line.actual_cents} className="font-semibold text-charcoal" />
                  <span className="mx-1">/</span>
                  <Money cents={line.planned_cents} />
                </span>
              </div>
              <div
                className={cn(
                  "lg-progress lg-progress--sm",
                  over
                    ? "lg-progress--coral"
                    : near
                      ? "lg-progress--amber"
                      : "lg-progress--emerald",
                )}
              >
                <div
                  className="lg-progress__fill"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
