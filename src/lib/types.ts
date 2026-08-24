export type TxType =
  | "income"
  | "expense"
  | "transfer"
  | "refund"
  | "opening_balance"
  | "balance_adjustment"
  | "fee";

export type TxStatus =
  | "draft"
  | "expected"
  | "posted"
  | "cleared"
  | "reconciled"
  | "voided";

export type AccountType =
  | "cash"
  | "bank"
  | "marketplace_wallet"
  | "savings"
  | "clearing"
  | "liability";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  opening_balance_cents: number;
  include_in_total: number;
  icon: string | null;
  color: string | null;
  archived: number;
  sort_order: number;
  balance_cents?: number;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  kind: "income" | "expense" | "both";
  icon: string | null;
  color: string | null;
  archived: number;
}

export interface Person {
  id: string;
  name: string;
  role: string | null;
  archived: number;
  sort_order: number;
}

export interface Transaction {
  id: string;
  type: TxType;
  status: TxStatus;
  date: string;
  amount_cents: number;
  currency: string;
  description: string;
  notes: string | null;
  account_id: string;
  category_id: string | null;
  person_id: string | null;
  project_id: string | null;
  transfer_pair_id: string | null;
  account_name?: string;
  account_icon?: string | null;
  category_name?: string;
  category_icon?: string | null;
  category_color?: string | null;
  person_name?: string;
  attachment_count?: number;
  needs_review?: number;
}

export interface DashboardSummary {
  totalAvailableCents: number;
  incomeCents: number;
  expenseCents: number;
  netGainCents: number;
  savingsRate: number | null;
  priorIncomeCents: number;
  priorExpenseCents: number;
  priorNetGainCents: number;
  monthLabel: string;
  isPartialMonth: boolean;
}

export interface MonthPeriod {
  start: string;
  end: string;
  key: string;
  label: string;
  isPartial: boolean;
}
