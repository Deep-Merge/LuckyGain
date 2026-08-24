import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { format } from "date-fns";
import { toCents } from "@/lib/money";
import type { Account, Category, Person, TxType } from "@/lib/types";
import type { NewTransactionInput } from "@/lib/db/queries";
import { cn } from "@/lib/cn";

const TYPES: Array<{ value: TxType; label: string }> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "refund", label: "Refund" },
  { value: "fee", label: "Fee" },
];

export function TransactionDrawer({
  open,
  onClose,
  onSave,
  accounts,
  people,
  expenseCategories,
  incomeCategories,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (input: NewTransactionInput) => void;
  accounts: Account[];
  people: Person[];
  expenseCategories: Category[];
  incomeCategories: Category[];
}) {
  const [type, setType] = useState<TxType>("expense");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [personId, setPersonId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const categories = type === "income" ? incomeCategories : expenseCategories;

  useEffect(() => {
    if (!open) return;
    setType("expense");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setAmount("");
    setDescription("");
    setNotes("");
    setAccountId(accounts[0]?.id ?? "");
    setDestinationAccountId(accounts[1]?.id ?? "");
    setCategoryId("");
    setPersonId(people[0]?.id ?? "");
    setError(null);
  }, [open, accounts, people]);

  const canSave = useMemo(() => {
    if (!amount || !description || !accountId) return false;
    if (type === "transfer" && !destinationAccountId) return false;
    return true;
  }, [amount, description, accountId, type, destinationAccountId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const amountCents = toCents(Number(amount));
      onSave({
        type,
        date,
        amountCents,
        description: description.trim(),
        notes: notes.trim() || undefined,
        accountId,
        categoryId: type === "transfer" ? null : categoryId || null,
        personId: type === "transfer" ? null : personId || null,
        destinationAccountId:
          type === "transfer" ? destinationAccountId : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close drawer"
            className="drawer-scrim fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-line bg-[#fcfbf8] shadow-[-12px_0_40px_rgb(23_25_22/0.08)]"
            initial={{ x: 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-charcoal">
                  Add transaction
                </h2>
                <p className="text-[12.5px] text-muted">
                  Every movement becomes an auditable ledger row.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-line p-2 text-muted hover:text-charcoal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex flex-1 flex-col overflow-auto"
            >
              <div className="space-y-5 px-5 py-5">
                <div className="grid grid-cols-5 gap-1.5 rounded-2xl bg-ivory-deep p-1">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={cn(
                        "rounded-xl px-1 py-2 text-[11px] font-medium transition",
                        type === t.value
                          ? "bg-white text-charcoal shadow-sm"
                          : "text-muted hover:text-charcoal",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <Field label="Amount">
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="field tabular text-xl font-semibold"
                    required
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date">
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="field"
                      required
                    />
                  </Field>
                  <Field label="Description">
                    <input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What moved?"
                      className="field"
                      required
                    />
                  </Field>
                </div>

                {type === "transfer" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="From">
                      <select
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                        className="field"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="To">
                      <select
                        value={destinationAccountId}
                        onChange={(e) => setDestinationAccountId(e.target.value)}
                        className="field"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                ) : (
                  <>
                    <Field label="Account">
                      <select
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                        className="field"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Category">
                        <select
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value)}
                          className="field"
                        >
                          <option value="">Select…</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Person">
                        <select
                          value={personId}
                          onChange={(e) => setPersonId(e.target.value)}
                          className="field"
                        >
                          <option value="">—</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </>
                )}

                <Field label="Notes">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="field resize-none"
                    placeholder="Optional context"
                  />
                </Field>

                {error && (
                  <p className="rounded-xl bg-coral-soft px-3 py-2 text-[13px] text-coral">
                    {error}
                  </p>
                )}
              </div>

              <div className="mt-auto flex gap-2 border-t border-line px-5 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 flex-1 rounded-xl border border-line text-[13px] font-medium text-muted hover:text-charcoal"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSave}
                  className="h-11 flex-1 rounded-xl bg-gold text-[13px] font-semibold text-charcoal transition enabled:hover:bg-[#d0ae68] disabled:opacity-40"
                >
                  Save transaction
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
