import type { Database } from "sql.js";
import { format, startOfMonth, subMonths } from "date-fns";
import { uid } from "../dates";
import { seedPurseFromSheet } from "./purseSeed";

function insertTx(
  db: Database,
  row: {
    type: string;
    date: string;
    amountCents: number;
    description: string;
    notes?: string;
    accountId: string;
    categoryId?: string | null;
    personId?: string | null;
  },
): string {
  const id = uid("txn");
  db.run(
    `INSERT INTO transactions
      (id, type, status, date, amount_cents, description, notes, account_id, category_id, person_id)
     VALUES (?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      row.type,
      row.date,
      row.amountCents,
      row.description,
      row.notes ?? null,
      row.accountId,
      row.categoryId ?? null,
      row.personId ?? null,
    ],
  );
  return id;
}

function insertTransfer(
  db: Database,
  date: string,
  amountCents: number,
  description: string,
  fromAccountId: string,
  toAccountId: string,
): void {
  const linkId = uid("lnk");
  const fromId = uid("txn");
  const toId = uid("txn");
  db.run(
    `INSERT INTO transactions
      (id, type, status, date, amount_cents, description, account_id, transfer_pair_id)
     VALUES (?, 'transfer', 'posted', ?, ?, ?, ?, ?)`,
    [fromId, date, amountCents, description, fromAccountId, linkId],
  );
  db.run(
    `INSERT INTO transactions
      (id, type, status, date, amount_cents, description, account_id, transfer_pair_id)
     VALUES (?, 'transfer', 'posted', ?, ?, ?, ?, ?)`,
    [toId, date, amountCents, description, toAccountId, linkId],
  );
  db.run(
    `INSERT INTO transaction_links (id, from_transaction_id, to_transaction_id, link_type)
     VALUES (?, ?, ?, 'transfer')`,
    [linkId, fromId, toId],
  );
}

export function seedDatabase(db: Database): void {
  const userId = uid("user");
  db.run(
    `INSERT INTO users (id, name, greeting_name, base_currency) VALUES (?, ?, ?, ?)`,
    [userId, "Peter", "Peter", "USD"],
  );

  const bank = uid("acc");
  const cash = uid("acc");
  const jd = uid("acc");
  const keep = uid("acc");
  const clearing = uid("acc");

  const accounts = [
    { id: bank, name: "Bank", type: "bank", opening: 209294, include: 1, icon: "landmark", order: 1 },
    { id: cash, name: "Cash", type: "cash", opening: 0, include: 1, icon: "wallet", order: 2 },
    { id: jd, name: "JD Wallet", type: "marketplace_wallet", opening: 29390, include: 1, icon: "shopping-bag", order: 3 },
    { id: keep, name: "Keep", type: "savings", opening: 50000, include: 1, icon: "piggy-bank", order: 4 },
    { id: clearing, name: "Freelancer Clearing", type: "clearing", opening: 0, include: 0, icon: "briefcase", order: 5 },
  ] as const;

  for (const a of accounts) {
    db.run(
      `INSERT INTO accounts (id, name, type, opening_balance_cents, include_in_total, icon, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [a.id, a.name, a.type, a.opening, a.include, a.icon, a.order],
    );
  }

  const me = uid("ppl");
  const jackie = uid("ppl");
  const family = uid("ppl");
  for (const p of [
    { id: me, name: "Me", role: "self", order: 1 },
    { id: jackie, name: "Jackie", role: "partner", order: 2 },
    { id: family, name: "Family", role: "household", order: 3 },
  ]) {
    db.run(
      `INSERT INTO people (id, name, role, sort_order) VALUES (?, ?, ?, ?)`,
      [p.id, p.name, p.role, p.order],
    );
  }

  const cats: Record<string, string> = {};
  const expenseParents: Array<{ key: string; name: string; icon: string; color: string }> = [
    { key: "home", name: "Home", icon: "home", color: "#8F6B2E" },
    { key: "food", name: "Food", icon: "utensils", color: "#24705A" },
    { key: "family", name: "Family Support", icon: "heart", color: "#B95F50" },
    { key: "shopping", name: "Shopping", icon: "shopping-bag", color: "#C6A15B" },
    { key: "clothing", name: "Clothing & Shoes", icon: "shirt", color: "#5B6BC6" },
    { key: "health", name: "Health", icon: "heart-pulse", color: "#B95F50" },
    { key: "sport", name: "Sport", icon: "dumbbell", color: "#24705A" },
    { key: "transport", name: "Transport", icon: "car", color: "#5B7080" },
    { key: "entertainment", name: "Entertainment", icon: "clapperboard", color: "#8F6B2E" },
    { key: "subscriptions", name: "Subscriptions", icon: "repeat", color: "#5B7080" },
    { key: "fees", name: "Fees", icon: "percent", color: "#B95F50" },
    { key: "other", name: "Other", icon: "circle", color: "#6B6B66" },
  ];

  expenseParents.forEach((cat, i) => {
    const id = uid("cat");
    cats[cat.key] = id;
    db.run(
      `INSERT INTO categories (id, name, parent_id, kind, icon, color, sort_order)
       VALUES (?, ?, NULL, 'expense', ?, ?, ?)`,
      [id, cat.name, cat.icon, cat.color, i + 1],
    );
  });

  const incomeKeys = [
    { key: "freelance", name: "Freelance", icon: "briefcase", color: "#24705A" },
    { key: "salary", name: "Salary", icon: "banknote", color: "#24705A" },
    { key: "otherInc", name: "Other Income", icon: "plus", color: "#24705A" },
  ];
  incomeKeys.forEach((cat, i) => {
    const id = uid("cat");
    cats[cat.key] = id;
    db.run(
      `INSERT INTO categories (id, name, parent_id, kind, icon, color, sort_order)
       VALUES (?, ?, NULL, 'income', ?, ?, ?)`,
      [id, cat.name, cat.icon, cat.color, i + 1],
    );
  });

  // Sample ledger — current month + prior month so cards/sparklines feel real.
  const now = new Date();
  const thisMonth = startOfMonth(now);
  const prior = startOfMonth(subMonths(now, 1));
  const d = (month: Date, day: number) =>
    format(new Date(month.getFullYear(), month.getMonth(), day), "yyyy-MM-dd");

  // Prior month (for delta %)
  insertTx(db, {
    type: "income",
    date: d(prior, 5),
    amountCents: 560000,
    description: "Freelance payment — Androw",
    notes: "Milestone M2",
    accountId: bank,
    categoryId: cats.freelance,
    personId: me,
  });
  insertTx(db, {
    type: "expense",
    date: d(prior, 12),
    amountCents: 343000,
    description: "Monthly shopping",
    accountId: jd,
    categoryId: cats.shopping,
    personId: jackie,
  });

  // Current month (aligned with Transactions mock spirit)
  insertTx(db, {
    type: "income",
    date: d(thisMonth, 28),
    amountCents: 280000,
    description: "Freelancer payment — Website project",
    notes: "Invoice #WF-0826",
    accountId: bank,
    categoryId: cats.freelance,
    personId: me,
  });
  insertTx(db, {
    type: "expense",
    date: d(thisMonth, 27),
    amountCents: 89900,
    description: "JD order — headphones",
    notes: "Order JD8821",
    accountId: jd,
    categoryId: cats.shopping,
    personId: me,
  });
  insertTx(db, {
    type: "expense",
    date: d(thisMonth, 26),
    amountCents: 150000,
    description: "Family support",
    notes: "Monthly remittance",
    accountId: bank,
    categoryId: cats.family,
    personId: family,
  });
  insertTx(db, {
    type: "expense",
    date: d(thisMonth, 24),
    amountCents: 28650,
    description: "Groceries",
    notes: "Weekly food run",
    accountId: cash,
    categoryId: cats.food,
    personId: me,
  });
  insertTransfer(
    db,
    d(thisMonth, 22),
    100000,
    "Transfer to Keep",
    bank,
    keep,
  );
  insertTx(db, {
    type: "refund",
    date: d(thisMonth, 20),
    amountCents: 45900,
    description: "Refund — returned shoes",
    notes: "JD return",
    accountId: jd,
    categoryId: cats.clothing,
    personId: jackie,
  });
  insertTx(db, {
    type: "income",
    date: d(thisMonth, 15),
    amountCents: 350000,
    description: "Freelance payment — Paul M2",
    notes: "Released",
    accountId: bank,
    categoryId: cats.freelance,
    personId: me,
  });
  insertTx(db, {
    type: "expense",
    date: d(thisMonth, 10),
    amountCents: 46840,
    description: "Sport kit",
    accountId: jd,
    categoryId: cats.sport,
    personId: jackie,
  });
  // Intentionally uncategorized → needs review
  insertTx(db, {
    type: "expense",
    date: d(thisMonth, 8),
    amountCents: 12800,
    description: "Misc purchase",
    notes: "Import candidate",
    accountId: cash,
    categoryId: null,
    personId: me,
  });

  // Freelance — month → project → milestones (released = month income)
  const androw = uid("cli");
  const paul = uid("cli");
  const ali = uid("cli");
  const chip = uid("cli");
  for (const c of [
    { id: androw, name: "Androw" },
    { id: paul, name: "Paul" },
    { id: ali, name: "Ali" },
    { id: chip, name: "Chip" },
  ]) {
    db.run(`INSERT INTO clients (id, name) VALUES (?, ?)`, [c.id, c.name]);
  }

  const addProject = (
    clientId: string,
    name: string,
    description: string,
    month: string,
    startDate?: string | null,
    finishDate?: string | null,
    projectType: "Kareem" | "Greg" | "Binance" = "Kareem",
  ) => {
    const id = uid("prj");
    db.run(
      `INSERT INTO projects (id, client_id, name, notes, origin_month, start_date, finish_date, project_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        id,
        clientId,
        name,
        description,
        month,
        startDate ?? `${month}-01`,
        finishDate ?? null,
        projectType,
      ],
    );
    return id;
  };

  const addMs = (
    projectId: string,
    month: string,
    title: string,
    amountYuan: number,
    transferFeePercent: number,
    status: "released" | "unreleased",
    sort: number,
    accountFeePercent = 0,
    feeCompound = false,
  ) => {
    const transferBps = Math.round(transferFeePercent * 100);
    const accountBps = Math.round(accountFeePercent * 100);
    db.run(
      `INSERT INTO milestones
        (id, project_id, title, gross_cents, fee_bps, transfer_fee_bps, account_fee_bps,
         fee_compound, work_month, status, released_at, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid("ms"),
        projectId,
        title,
        Math.round(amountYuan * 100),
        transferBps + accountBps,
        transferBps,
        accountBps,
        feeCompound ? 1 : 0,
        month,
        status,
        status === "released" ? `${month}-15` : null,
        sort,
      ],
    );
  };

  const aliFl = addProject(
    ali,
    "Ali FL",
    "Freelance retainer & phases",
    "2026-03",
    "2026-03-01",
    "2026-03-28",
  );
  addMs(aliFl, "2026-03", "FL package 2k", 1600, 0, "released", 0);
  addMs(aliFl, "2026-03", "FL package 4k", 3000, 0, "released", 1);

  const androwApr = addProject(
    androw,
    "Androw delivery",
    "Weekly delivery cadence",
    "2026-04",
    "2026-03-20",
    "2026-04-30",
  );
  addMs(androwApr, "2026-03", "Sprint 3.28", 1200, 5, "released", 0);
  addMs(androwApr, "2026-04", "Sprint 4.3", 1200, 5, "released", 0);
  addMs(androwApr, "2026-04", "Sprint 4.10", 1200, 5, "released", 1);
  addMs(androwApr, "2026-04", "Sprint 4.24", 1200, 5, "released", 2);

  const mayMix = addProject(
    paul,
    "Paul milestones",
    "Platform M1–M2",
    "2026-05",
    "2026-05-01",
    "2026-05-31",
    "Greg",
  );
  const androwMay = addProject(
    androw,
    "Androw May",
    "May pushes + M3",
    "2026-05",
    "2026-05-01",
    "2026-05-28",
  );
  const aliMay = addProject(
    ali,
    "Ali Phase 2",
    "Phase 2 delivery",
    "2026-05",
    "2026-05-05",
    "2026-05-25",
  );
  addMs(androwMay, "2026-05", "5.2 drop", 3000, 5, "released", 0);
  addMs(androwMay, "2026-05", "M3", 2000, 5, "released", 1);
  addMs(mayMix, "2026-05", "M1", 2800, 7, "released", 0);
  addMs(mayMix, "2026-05", "M2", 4200, 7, "released", 1);
  addMs(aliMay, "2026-05", "Phase 2", 1400, 0, "released", 0);

  const julChip = addProject(
    chip,
    "Chip / UFI",
    "July task pack",
    "2026-07",
    "2026-07-15",
    null,
    "Binance",
  );
  addMs(julChip, "2026-07", "7.21", 300, 10, "released", 0);
  addMs(julChip, "2026-07", "7.24", 450, 10, "released", 1);
  addMs(julChip, "2026-07", "7.27", 300, 10, "released", 2);
  addMs(julChip, "2026-07", "7.30", 300, 10, "unreleased", 3);
  addMs(julChip, "2026-07", "Bonus", 100, 0, "unreleased", 4);

  const augAndrow = addProject(
    androw,
    "Androw M1",
    "August milestone draft",
    "2026-08",
    "2026-08-01",
    null,
  );
  addMs(augAndrow, "2026-08", "M1", 2000, 5, "unreleased", 0);

  // Monthly budget
  const budgetId = uid("bud");
  db.run(
    `INSERT INTO budgets (id, month, notes) VALUES (?, ?, ?)`,
    [budgetId, format(thisMonth, "yyyy-MM"), "Seeded monthly plan"],
  );
  const budgetLines: Array<{
    scope: string;
    label: string;
    planned: number;
    categoryId?: string;
    personId?: string;
  }> = [
    { scope: "income", label: "Expected freelance", planned: 700000 },
    { scope: "fixed", label: "Family Support", planned: 200000, categoryId: cats.family },
    { scope: "flexible", label: "Food", planned: 80000, categoryId: cats.food },
    { scope: "flexible", label: "Shopping", planned: 150000, categoryId: cats.shopping },
    { scope: "flexible", label: "Sport", planned: 60000, categoryId: cats.sport },
    { scope: "flexible", label: "Clothing & Shoes", planned: 100000, categoryId: cats.clothing },
    { scope: "person", label: "Jackie envelope", planned: 180000, personId: jackie },
    { scope: "savings", label: "Keep transfer target", planned: 100000 },
    { scope: "net_target", label: "Net gain target", planned: 250000 },
  ];
  for (const line of budgetLines) {
    db.run(
      `INSERT INTO budget_lines
        (id, budget_id, scope, category_id, person_id, label, planned_cents, rollover)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        uid("bln"),
        budgetId,
        line.scope,
        line.categoryId ?? null,
        line.personId ?? null,
        line.label,
        line.planned,
      ],
    );
  }

  // Attachment metadata (local-first placeholders — no binary blobs in SQLite)
  const att1 = uid("att");
  const att2 = uid("att");
  const att3 = uid("att");
  db.run(
    `INSERT INTO attachments
      (id, filename, original_filename, relative_path, mime_type, size_bytes, sha256, title, document_type, capture_date)
     VALUES (?, 'receipt-headphones.webp', 'jd-headphones.png', 'attachments/originals/demo/jd-headphones.png', 'image/png', 248112, 'sha_demo_1', 'JD headphones receipt', 'receipt', ?)`,
    [att1, d(thisMonth, 27)],
  );
  db.run(
    `INSERT INTO attachments
      (id, filename, original_filename, relative_path, mime_type, size_bytes, sha256, title, document_type, capture_date)
     VALUES (?, 'invoice-wf0826.pdf', 'WF-0826.pdf', 'attachments/originals/demo/WF-0826.pdf', 'application/pdf', 102400, 'sha_demo_2', 'Website invoice', 'invoice', ?)`,
    [att2, d(thisMonth, 28)],
  );
  db.run(
    `INSERT INTO attachments
      (id, filename, original_filename, relative_path, mime_type, size_bytes, sha256, title, document_type, capture_date)
     VALUES (?, 'orphan-screenshot.webp', 'unknown-product.png', 'attachments/originals/demo/unknown-product.png', 'image/png', 180224, 'sha_demo_3', 'Unlinked product shot', 'screenshot', ?)`,
    [att3, d(thisMonth, 12)],
  );

  const headphoneTx = execOneId(
    db,
    `SELECT id FROM transactions WHERE description LIKE 'JD order%' LIMIT 1`,
  );
  const freelanceTx = execOneId(
    db,
    `SELECT id FROM transactions WHERE description LIKE 'Freelancer payment — Website%' LIMIT 1`,
  );
  if (headphoneTx) {
    db.run(
      `INSERT INTO attachment_links (id, attachment_id, entity_type, entity_id) VALUES (?, ?, 'transaction', ?)`,
      [uid("atl"), att1, headphoneTx],
    );
  }
  if (freelanceTx) {
    db.run(
      `INSERT INTO attachment_links (id, attachment_id, entity_type, entity_id) VALUES (?, ?, 'transaction', ?)`,
      [uid("atl"), att2, freelanceTx],
    );
  }

  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', '1'), ('seeded', 'true'), ('demo_seed', 'v7')`,
  );

  seedPurseFromSheet(db);
}

function execOneId(db: Database, sql: string): string | null {
  const stmt = db.prepare(sql);
  const row = stmt.step() ? (stmt.getAsObject() as { id?: string }) : null;
  stmt.free();
  return row?.id ?? null;
}
