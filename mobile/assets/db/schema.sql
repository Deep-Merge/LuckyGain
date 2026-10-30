-- LuckyGain schema v1
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  greeting_name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  locale TEXT NOT NULL DEFAULT 'en-US',
  theme TEXT NOT NULL DEFAULT 'light',
  start_page TEXT NOT NULL DEFAULT 'dashboard',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash','bank','marketplace_wallet','savings','clearing','liability')),
  currency TEXT NOT NULL DEFAULT 'USD',
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  opening_date TEXT,
  include_in_total INTEGER NOT NULL DEFAULT 1 CHECK (include_in_total IN (0,1)),
  icon TEXT,
  color TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES categories(id),
  kind TEXT NOT NULL CHECK (kind IN ('income','expense','both')),
  icon TEXT,
  color TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  origin_month TEXT,
  start_date TEXT,
  finish_date TEXT,
  project_type TEXT NOT NULL DEFAULT 'Kareem'
    CHECK (project_type IN ('Kareem','Greg','Binance')),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL DEFAULT '',
  gross_cents INTEGER NOT NULL,
  fee_bps INTEGER NOT NULL DEFAULT 0,
  transfer_fee_bps INTEGER NOT NULL DEFAULT 0,
  account_fee_bps INTEGER NOT NULL DEFAULT 0,
  /** 1 = sequential: net = gross × (1−t) × (1−a); 0 = additive */
  fee_compound INTEGER NOT NULL DEFAULT 0 CHECK (fee_compound IN (0,1)),
  work_month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unreleased' CHECK (status IN ('unreleased','released')),
  released_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_milestones_month ON milestones(work_month);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer','refund','opening_balance','balance_adjustment','fee')),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','expected','posted','cleared','reconciled','voided')),
  date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT NOT NULL DEFAULT '',
  notes TEXT,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  category_id TEXT REFERENCES categories(id),
  person_id TEXT REFERENCES people(id),
  project_id TEXT REFERENCES projects(id),
  transfer_pair_id TEXT,
  import_batch_id TEXT,
  cleared INTEGER NOT NULL DEFAULT 0 CHECK (cleared IN (0,1)),
  soft_deleted INTEGER NOT NULL DEFAULT 0 CHECK (soft_deleted IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_person ON transactions(person_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

CREATE TABLE IF NOT EXISTS transaction_links (
  id TEXT PRIMARY KEY,
  from_transaction_id TEXT NOT NULL REFERENCES transactions(id),
  to_transaction_id TEXT NOT NULL REFERENCES transactions(id),
  link_type TEXT NOT NULL CHECK (link_type IN ('transfer','refund','fee','payment','parent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  project_id TEXT REFERENCES projects(id),
  reference TEXT,
  platform TEXT,
  gross_cents INTEGER NOT NULL DEFAULT 0,
  net_expected_cents INTEGER NOT NULL DEFAULT 0,
  net_received_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'expected' CHECK (status IN ('expected','funded','invoiced','released','received','disputed','cancelled')),
  earned_date TEXT,
  expected_date TEXT,
  released_date TEXT,
  received_date TEXT,
  destination_account_id TEXT REFERENCES accounts(id),
  income_transaction_id TEXT REFERENCES transactions(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_fees (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  rate_bps INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL UNIQUE,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budget_lines (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budgets(id),
  scope TEXT NOT NULL CHECK (scope IN ('income','fixed','flexible','person','savings','net_target')),
  category_id TEXT REFERENCES categories(id),
  person_id TEXT REFERENCES people(id),
  label TEXT NOT NULL,
  planned_cents INTEGER NOT NULL DEFAULT 0,
  rollover INTEGER NOT NULL DEFAULT 0 CHECK (rollover IN (0,1)),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  title TEXT,
  notes TEXT,
  document_type TEXT,
  capture_date TEXT,
  soft_deleted INTEGER NOT NULL DEFAULT 0 CHECK (soft_deleted IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachment_links (
  id TEXT PRIMARY KEY,
  attachment_id TEXT NOT NULL REFERENCES attachments(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('transaction','payment','project','goods')),
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reconciliations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  statement_date TEXT NOT NULL,
  statement_balance_cents INTEGER NOT NULL,
  ledger_balance_cents INTEGER NOT NULL,
  difference_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','reopened')),
  notes TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurring_templates (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  category_id TEXT REFERENCES categories(id),
  person_id TEXT REFERENCES people(id),
  frequency TEXT NOT NULL,
  next_occurrence TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  source_filename TEXT NOT NULL,
  sheet_name TEXT,
  mapping_json TEXT,
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','committed','rolled_back')),
  created_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  committed_at TEXT
);

CREATE TABLE IF NOT EXISTS import_rows (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES imports(id),
  row_index INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  warning TEXT,
  transaction_id TEXT REFERENCES transactions(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS work_months (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL UNIQUE,
  income_cents INTEGER NOT NULL DEFAULT 0,
  salary_cents INTEGER NOT NULL DEFAULT 0,
  keep_cents INTEGER NOT NULL DEFAULT 0,
  usd_cents INTEGER NOT NULL DEFAULT 0,
  yuan_cents INTEGER NOT NULL DEFAULT 0,
  chuck_given_cents INTEGER NOT NULL DEFAULT 0,
  chuck_real_income_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chuck_channel_entries (
  id TEXT PRIMARY KEY,
  occurred_on TEXT NOT NULL,
  given_cents INTEGER NOT NULL DEFAULT 0 CHECK (given_cents >= 0),
  real_income_cents INTEGER NOT NULL DEFAULT 0 CHECK (real_income_cents >= 0),
  note TEXT,
  soft_deleted INTEGER NOT NULL DEFAULT 0 CHECK (soft_deleted IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chuck_channel_entries_date
  ON chuck_channel_entries(occurred_on);


CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  detail TEXT,
  entity_type TEXT,
  entity_id TEXT,
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goods (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  purchased_on TEXT NOT NULL,
  for_whom TEXT NOT NULL CHECK (for_whom IN ('me','jackie','family','chuck','self')),
  category TEXT NOT NULL DEFAULT 'other',
  url TEXT,
  notes TEXT,
  image_data_url TEXT,
  returned_on TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  comment TEXT,
  called_price_cents INTEGER CHECK (called_price_cents IS NULL OR called_price_cents >= 0),
  soft_deleted INTEGER NOT NULL DEFAULT 0 CHECK (soft_deleted IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purse_entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('deposit','withdraw','goods_debit','goods_credit')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  occurred_on TEXT NOT NULL,
  note TEXT,
  goods_id TEXT REFERENCES goods(id),
  soft_deleted INTEGER NOT NULL DEFAULT 0 CHECK (soft_deleted IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goods_purchased ON goods(purchased_on);
CREATE INDEX IF NOT EXISTS idx_goods_whom ON goods(for_whom);
CREATE INDEX IF NOT EXISTS idx_goods_category ON goods(category);
CREATE INDEX IF NOT EXISTS idx_purse_entries_date ON purse_entries(occurred_on);
CREATE INDEX IF NOT EXISTS idx_purse_entries_goods ON purse_entries(goods_id);
