import type { Account } from "@/lib/types";
import { Money, Panel, Pill } from "@/components/ui/primitives";

export function AccountsPage({ accounts }: { accounts: Account[] }) {
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-[14px] leading-relaxed text-muted">
        Balances are recalculated from opening balance plus posted inflows and
        outflows. Transfers move money between owned accounts without changing
        income or expense.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((account) => (
          <Panel key={account.id} className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold/80 to-transparent" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-[17px] font-semibold text-charcoal">
                  {account.name}
                </h3>
                <p className="mt-1 text-[12px] capitalize text-muted">
                  {account.type.replaceAll("_", " ")}
                </p>
              </div>
              {account.include_in_total === 1 ? (
                <Pill tone="gold">In total</Pill>
              ) : (
                <Pill>Excluded</Pill>
              )}
            </div>
            <Money
              cents={account.balance_cents ?? 0}
              className="mt-6 block text-[28px] font-semibold"
            />
            <p className="mt-2 text-[12px] text-muted">
              Opening{" "}
              <Money
                cents={account.opening_balance_cents}
                className="text-[12px] font-medium"
              />
            </p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
