
LG
LOCAL-FIRST PERSONAL FINANCE
LuckyGain
Complete Product & Experience Specification

PRODUCT PROMISE  See every dollar clearly, understand where it goes, and create a deliberate path toward higher income and stronger net gain.


Edition	Platform	Data model	Audience
1.0	Windows desktop first	Local SQLite	Single owner / household

Prepared for Kareem  •  August 2026
 
1. Product definition
LuckyGain is a premium, local-first personal finance application for managing personal spending, household support, marketplace purchases, freelance income, savings, attachments, and account balances in one trustworthy ledger. It is designed as a desktop application with a web-quality interface. All primary data remains on the user’s computer.
1.1 Product goals
•	Replace the current multi-sheet Excel workbook without losing its useful detail.
•	Make the true financial position visible: balances, income, expenses, transfers, fees, savings, and net gain.
•	Eliminate hidden assumptions such as hardcoded deductions, text amounts, inconsistent dates, and incomplete totals.
•	Support product screenshots and receipts without bloating the database.
•	Make monthly review fast, calm, and encouraging rather than accounting-heavy.
•	Keep the architecture ready for optional cloud sync, mobile access, and multi-device use later.
1.2 Product principles
Principle	Meaning
Local and private	SQLite and attachments live in the protected application-data directory.
One source of truth	Every monetary movement is represented by an auditable transaction.
Transfers are not spending	Moving money between owned accounts never changes income or expense.
Explain every number	Summary values link to filtered source transactions.
Progress over punishment	Design emphasizes net gain, targets, and clarity—not guilt.
Premium restraint	Gold indicates achievement and primary action; it is never decorative noise.

1.3 Target user and scope
Primary user: Kareem, managing personal money, Jackie and family spending, JD purchases, freelance earnings, platform fees, and savings/Keep allocations. Version 1 is optimized for one user on one computer. Multiple profiles, bank APIs, cloud sync, and mobile apps are intentionally deferred.
 
2. Information architecture
RECOMMENDED SCOPE  Eight main pages, supported by shared drawers, dialogs, detail views, and a global search. This keeps navigation simple while preserving depth.

#	Main page	Primary job	Key secondary views
1	Dashboard	Understand the current financial position	Month picker, drill-down cards, review alerts
2	Transactions	Capture and inspect every movement	Add/edit drawer, transaction detail, bulk edit
3	Accounts	See real balances by money location	Account detail, reconciliation, balance adjustment
4	Budget	Plan spending and compare actuals	Monthly plan, category detail, rollover settings
5	Freelance	Track projects, gross pay, deductions and net	Client/project detail, payment detail
6	Insights	Understand trends and behavior	Income, spending, people, categories, comparisons
7	Attachments	Find receipts and product screenshots	Gallery, preview, orphan review
8	Settings	Configure and protect the application	People, categories, import, backup, preferences

2.1 Persistent desktop shell
•	Left sidebar: logo, page navigation, compact total-balance footer, backup status, settings.
•	Top bar: page title, month/date range, global search, notifications/review badge, gold Add Transaction button.
•	Main canvas: warm ivory background, responsive card grid, maximum content width for readability.
•	Right drawer: create or edit transactions without losing the current context.
•	Command palette: Ctrl/Cmd + K for navigation, search, add transaction, import, and backup.
•	Status bar when offline/background work is active: import progress, backup progress, or pending file operation.
2.2 Shared overlays
Overlay	Purpose
Add transaction drawer	Fast entry for expense, income, transfer, refund, and adjustment.
Transaction detail	Full audit view, attachments, related transfer, edit history.
Global search	Search transactions, clients, products, descriptions, accounts, and attachment filenames.
Filter panel	Date, type, person, account, category, project, amount, attachment, status.
Confirmation dialog	Used only for delete, restore, destructive import, and reconciliation adjustment.
Quick calculator	Evaluate arithmetic in amount fields without leaving the form.

 
3. Dashboard page
The dashboard answers four questions immediately: How much do I have? What changed this month? Am I gaining or losing? What needs attention?
3.1 Header and summary row
Component	Content / behavior
Greeting	“Good morning, Kareem” with selected month and partial-month label.
Total available	Sum of included asset accounts; clickable to Accounts.
Monthly income	Confirmed income in selected period; green delta vs prior comparable period.
Monthly expenses	Confirmed expenses; excludes transfers and optionally excludes savings transfers.
Net gain	Income minus expenses for the period; gold when positive, coral when negative.
Savings rate	Net gain ÷ income. Shows “—” when income is zero.

3.2 Main dashboard modules
Cash-flow chart
Daily or weekly income and expense lines/bars; hover reveals values; click filters Transactions.
My Accounts
Bank, Cash, JD Wallet, Keep, and other active accounts with balance and latest activity.
Lucky Goal
Monthly income target, achieved amount, remaining amount, percentage, and expected pace.
Budget health
Top categories nearing or exceeding budget; compact progress bars and variance.
Recent transactions
Latest 6–8 movements with icon, description, person, account, attachment thumbnail, and amount.
Spending by person
Me, Jackie, Family, and configurable people/household groups.
Review center
Missing category/date/account, suspected duplicate, text import issue, unreconciled account, orphan attachment.
Freelance pipeline
Expected, invoiced, paid, fees, and net received for the selected month.
3.3 Dashboard states
State	Presentation
Current partial month	Visible “In progress” pill; comparisons use same number of elapsed days by default.
No data	Guided empty state: Add transaction or Import Excel.
Negative net	Calm coral treatment with the main contributing categories, no alarmist language.
Goal achieved	Subtle gold glow/confetti once, then a persistent achieved badge.
Data quality issue	Amber review card with count and direct “Review now” action.

 
4. Transactions page
4.1 Layout
A dense but elegant working page with a filter toolbar, summary strip, transaction table, optional grouped-by-day mode, and a details drawer. Default columns: date, type, description, person, category, account, project, attachment, status, and amount.
4.2 Supported transaction types
Type	Effect
Income	Increases an account and period income.
Expense	Decreases an account and period expense.
Transfer	Moves value between owned accounts; creates linked source and destination entries.
Refund	Reverses or reduces an earlier expense and links to it.
Opening balance	Establishes account starting balance without distorting income.
Balance adjustment	Controlled reconciliation entry with mandatory reason.
Fee	Expense linked to a freelance payment or financial transaction.

4.3 Add/edit transaction drawer
Section	Fields
Core	Type, date/time, amount, currency, description, notes.
Classification	Category, subcategory, person/beneficiary, tags.
Money location	Account; for transfers, source and destination accounts.
Freelance	Client, project, payment status, gross/net relationship.
Evidence	Multiple screenshots/receipts, drag-and-drop, paste from clipboard, camera import if supported.
Repeat	One-time or recurring template; recurrence never silently posts without user preference.
Audit	Created/updated timestamps; imported source row; duplicate-warning status.

4.4 List actions and safeguards
•	Inline category/person/account editing with undo.
•	Multi-select for categorize, tag, move account, export, or archive.
•	Soft delete to Trash; permanent deletion only from Settings > Data management.
•	Duplicate detection uses amount, date window, account, and normalized description; user makes final decision.
•	Changing one side of a transfer updates its linked pair atomically.
•	Amounts are numeric and currency-aware; text such as “779(boss)” is parsed into amount 779 plus note “boss” during import review.
 
5. Accounts page
5.1 Account overview
Cards show current balance, reconciled balance, institution/type, inclusion in Total Available, monthly inflow/outflow, and latest transaction. Suggested initial accounts: Bank, Cash, JD Wallet, Keep/Savings, and Freelancer Clearing.
5.2 Account types
Type	Examples	Balance rule
Cash	Wallet / physical cash	Opening balance + inflows − outflows
Bank	Checking / debit	Ledger balance, optionally reconciled to statement
Marketplace wallet	JD Wallet	Funding transfers − purchases + refunds
Savings	Keep	Transfers in − transfers out; not income by itself
Receivable/clearing	Freelancer pending	Tracks earned/expected vs actually received
Liability (later)	Credit card / loan	Displayed separately from assets

5.3 Account detail
•	Balance timeline and inflow/outflow chart.
•	Account-scoped transactions and search.
•	Statement balance and reconciliation date.
•	Uncleared and unreconciled totals.
•	Edit name, icon, opening balance, currency, archive status, and dashboard inclusion.
•	Export transactions and attachments for this account.
5.4 Reconciliation workflow
1.	Enter statement/end balance and statement date.
2.	System calculates difference from cleared ledger balance.
3.	Review suspected missing, duplicate, or incorrectly assigned transactions.
4.	Mark matched items cleared.
5.	If a legitimate unexplained difference remains, create a labeled balance adjustment with reason.
6.	Lock the reconciliation record; later edits that affect it trigger a warning and reopen status.
 
6. Budget page
6.1 Purpose and layout
Budget is a monthly plan, not another ledger. The page shows planned income, planned category spending, fixed commitments, planned transfers to savings, actuals, remaining amount, and projected month-end result.
6.2 Budget structure
Area	Details
Income plan	Expected freelance and other income by source.
Fixed commitments	Rent/home, recurring family support, subscriptions, or mandatory monthly amounts.
Flexible categories	Food, clothing, shoes, sport, transport, shopping, cigarettes, personal.
People envelopes	Optional limits for Me, Jackie, Family, or another beneficiary.
Savings goal	Target transfer to Keep/Savings.
Net target	Desired income − expense result, independent from the savings transfer.

6.3 Budget behavior
•	Copy prior month as a starting plan.
•	Optional category rollover; disabled by default for simplicity.
•	Actual expense comes only from posted expense transactions.
•	Transfers to savings are shown separately, preventing double counting.
•	Forecast uses actual-to-date plus scheduled/expected entries.
•	Over-budget states use muted coral; near-limit uses amber; healthy uses emerald.
•	Click any amount to open the exact contributing transactions.
 
7. Freelance page
This page solves the gap between project income, platform deductions, net received, payment timing, and transfers into personal accounts.
7.1 Portfolio summary
Metric	Definition
Expected	Approved or probable payments not yet received.
Invoiced / milestone funded	Payment requested or funded but not released.
Gross earned	Contract value associated with received or recognized work.
Fees and deductions	Platform fee, partner share, tax withholding, transfer charge.
Net received	Actual money credited to an owned account.
Outstanding	Expected/invoiced minus received, respecting status.

7.2 Clients and projects
Client cards show active projects, total gross, total fees, total net, outstanding payments, most recent payment, and notes. Initial examples can include Savills, Chip/UFI, Androw, and Toast/Makr Shakr projects, but seed data should be optional and editable.
7.3 Payment record
Field group	Fields
Identity	Client, project, milestone/invoice, platform, reference.
Amounts	Gross, fee lines, deductions, tax, currency, exchange rate, net expected, net received.
Status	Expected, funded, invoiced, released, received, disputed, cancelled.
Timing	Earned date, expected date, released date, received date.
Destination	Receiving account and linked income transaction.
Evidence	Invoice, milestone screenshot, chat/payment confirmation.

7.4 Fee calculation
Fees are explicit line items—never hidden percentages. The interface may calculate a suggested fee from a percentage, but stores both the fee amount and rate snapshot. A payment validates: gross − all deductions = expected net. Actual net received can differ because of exchange rates or transfer charges, which are recorded separately.
 
8. Insights page
8.1 Insight tabs
Tab	Questions answered
Overview	Is income, spending, net gain, and savings improving?
Income	Which clients/projects generate the most reliable net income?
Spending	Which categories and merchants drive expenses?
People	How much is spent for Me, Jackie, Family, and others?
Accounts	Where does money sit and move?
Comparisons	How do months, quarters, and custom ranges differ?
Data quality	What records weaken confidence in the totals?

8.2 Recommended charts
•	Income, expense, and net gain trend by month.
•	Cumulative net gain area chart.
•	Spending composition by category; limit donut charts to a small number of categories.
•	Net freelance income by client/project.
•	Gross-to-net waterfall for freelance payments.
•	Budget variance bars.
•	Account balance history.
•	Calendar heatmap for spending frequency, with privacy-friendly labels.
8.3 Comparison rules
Completed months compare against completed months. A partial current month compares either against the same elapsed-day window of the prior month or displays no percentage if the comparison would mislead. Filters and excluded accounts are always visible. Every chart supports drill-down to transactions.
 
9. Attachments page
9.1 Gallery
A searchable gallery for product screenshots, order confirmations, receipts, invoices, and payment evidence. Cards show thumbnail, filename/title, transaction, amount, date, merchant/category, and person. Views: grid, compact list, and unlinked/orphan review.
9.2 File handling
Capability	Rule
Storage	Files live in an attachments directory; SQLite stores metadata and a relative path.
Formats	PNG, JPG/JPEG, WEBP, PDF; HEIC conversion can be added later.
Naming	Generated stable ID plus safe extension; original filename retained in metadata.
Thumbnails	Generated locally for fast browsing; originals remain unchanged.
Deduplication	SHA-256 hash prevents accidental duplicate storage while allowing multiple links if needed.
Deletion	Removing a link does not delete a shared file; orphan cleanup requires confirmation.
Privacy	No upload or external image processing in v1.

9.3 Attachment detail
•	Large preview with zoom and rotate.
•	Linked transaction/payment/product context.
•	Edit title, notes, tags, capture date, and document type.
•	Open original file in the operating system.
•	Relink to another record or add an additional link.
•	Reveal integrity details: file size, format, hash, added date.
 
10. Settings page
10.1 Settings sections
Section	Configuration
Profile & appearance	Name, greeting, theme, density, number format, start page.
Currency & locale	Base currency, display separators, date format, timezone.
Accounts	Create, edit, archive, opening balances, dashboard inclusion.
Categories	Income/expense hierarchy, icons, colors, merge/archive.
People & groups	Me, Jackie, Family; roles and inactive status.
Freelance setup	Clients, projects, platforms, default fees, statuses.
Import & export	Excel/CSV mapping, import history, exports.
Backup & restore	Destination, schedule, retention, encryption, restore validation.
Data management	Trash, orphan files, integrity check, database location.
About	Version, release notes, licenses, diagnostics.

10.2 Category model
Categories are hierarchical and typed as income, expense, or both only when explicitly allowed. Recommended expense parents: Home, Food, Family Support, Shopping, Clothing & Shoes, Health, Sport, Transport, Entertainment, Subscriptions, Fees, and Other. Original descriptions remain unchanged even when categories are standardized.
 
11. Excel import and migration
11.1 Import workflow
7.	Select workbook and choose the source sheet.
8.	Preview detected columns, data types, formulas, dates, and amount candidates.
9.	Map source columns to LuckyGain fields; save mapping template per sheet layout.
10.	Normalize dates and parse values such as “779(boss)” into an amount plus note.
11.	Identify header rows, totals, formulas, blanks, and duplicate candidates.
12.	Preview proposed transactions with warnings; nothing is committed yet.
13.	Commit as one import batch inside a database transaction.
14.	Show results: created, skipped, merged, and needs-review records.
15.	Allow complete rollback of that import batch.
11.2 Workbook-specific migration
Current sheet	Destination
Ledger	Transactions classified by person and month; hardcoded 300 reviewed as explicit savings transfer or expense.
JD	JD Wallet funding transfers and purchase expenses; missing date flagged.
Work	Clients, projects, payments, fees, and linked income transactions.
Keep	Savings account transfers; March 644/640 mismatch flagged for decision.

CRITICAL RULE  Imported displayed totals are not trusted as source transactions. LuckyGain recalculates totals from normalized rows and preserves the original source value for audit.

 
12. Core financial rules
Metric	Calculation
Account balance	Opening balance + posted inflows − posted outflows, in account currency.
Income	Sum of posted income/refund treatment for the selected range, excluding transfers.
Expenses	Sum of posted expenses and fees, net of linked refunds, excluding transfers.
Net gain	Income − expenses.
Savings rate	Net gain ÷ income × 100; undefined when income is zero.
Total available	Sum of active asset accounts marked Include in total, converted to base currency if needed.
Budget remaining	Planned expense − actual expense.
Freelance net	Gross − explicit fees − deductions − taxes; exchange effects shown separately.
JD Wallet balance	Opening balance + funding transfers + refunds − purchases.
Keep balance	Opening balance + transfers in − transfers out; transfer is not income.

12.1 Status and timing rules
•	Draft and expected records do not affect cash balances.
•	Posted records affect balances and reports.
•	Cleared means recognized by the external account/statement.
•	Reconciled means included in a completed reconciliation.
•	Voided records remain in audit history but contribute zero.
•	Transaction date drives normal reporting; created date is only audit metadata.
•	Selected month is explicitly marked Partial until the user closes it or the month ends.
12.2 Currency
Version 1 can use one base currency while retaining a currency code on every account and transaction. If foreign-currency support is enabled, the original amount and exchange-rate snapshot are immutable; reports use the stored converted amount, not a newly fetched rate.
 
13. Data model
Entity	Purpose / key fields
users	Local profile, preferences, base currency.
accounts	Name, type, currency, opening balance/date, inclusion, archived.
transactions	Type, status, date, amount, currency, account, category, person, description, notes, import batch.
transaction_links	Transfer pairs, refunds, fee/payment links, parent-child relationships.
categories	Typed hierarchy, color/icon, archived.
people	Me/Jackie/Family or other beneficiaries/groups.
clients / projects	Freelance business context.
payments / payment_fees	Gross, explicit deductions, net, lifecycle dates and destination.
budgets / budget_lines	Month, scope, planned amount, rollover and notes.
attachments / attachment_links	File metadata/hash/path and links to transactions/payments/projects.
reconciliations	Account, period, statement balance, difference, completed timestamp.
recurring_templates	Planned recurring entry definition and next occurrence.
imports / import_rows	Source file, mapping, row snapshot, status and rollback group.
audit_events	Create/update/delete/restore and sensitive calculation changes.
app_settings	Theme, locale, backup, feature flags.

13.1 Database constraints
•	Money is stored as integer minor units (for example cents), avoiding floating-point errors.
•	Foreign keys are enforced; SQLite WAL mode is enabled.
•	Transfer pairs and imports commit atomically.
•	Relative file paths are stored; absolute machine-specific paths are not.
•	Soft deletion protects normal records; audit events retain essential history.
•	Schema migrations are versioned, tested, and automatically backed up before upgrade.
 
14. Design system
14.1 Brand
Token	Value	Use
Deep charcoal	#171916	Sidebar, high-contrast headers
Warm ivory	#F7F5EF	Main background
Refined gold	#C6A15B	Primary action, logo, achievement
Dark gold	#8F6B2E	Gold text and accessible accents
Deep emerald	#24705A	Income and positive progress
Muted terracotta	#B95F50	Expense and negative variance
Soft black	#20221F	Primary text
Warm line	#DED9CD	Borders and dividers

14.2 Component language
•	Cards: 16–20px radius, thin warm border, minimal shadow.
•	Buttons: gold primary, charcoal secondary, quiet text/ghost tertiary.
•	Typography: large tabular figures, compact labels, sentence-case navigation.
•	Charts: direct labels and tooltips; never rely on color alone.
•	Tables: sticky header, comfortable row height, right-aligned money, clear selected state.
•	Motion: 150–220ms; subtle count-up and drawer transitions; honor reduced-motion setting.
•	Dark mode: charcoal surfaces, muted gold, warm off-white text; preserve semantic colors.
14.3 Accessibility
•	Keyboard-complete navigation and visible focus rings.
•	Minimum 4.5:1 contrast for normal text; gold text uses dark-gold variant on light surfaces.
•	Semantic labels and screen-reader names for icon-only actions.
•	Charts include table/list alternatives.
•	Touch targets at least 40×40px where practical.
•	Amounts never use red/green alone: include sign, label, and icon.
 
15. Local architecture
Layer	Recommended technology	Responsibility
Desktop shell	Tauri 2	Windows installer, secure filesystem access, updates, native dialogs.
UI	React + TypeScript + Vite	Pages, components, state, forms, charts.
Styling	Tailwind CSS + design tokens	Consistent premium theme and responsive layout.
Database	SQLite	Local durable structured data.
Data access	Rust SQLx or Drizzle via safe commands	Queries, transactions, migrations, validation.
Charts	Recharts	Dashboard and insights visualization.
Validation	Zod + backend validation	Consistent form and command contracts.
Files	Tauri filesystem APIs	Attachments, exports, and backups.
Testing	Vitest + Playwright + Rust tests	Logic, UI flows, database and migration confidence.

15.1 Local file layout
Application data should use the operating system’s protected application-data directory. A representative structure is: database/luckygain.db, attachments/originals/YYYY/MM, attachments/thumbnails, backups, exports, and logs. The app never depends on its installation directory for writable data.
15.2 Security
•	No network dependency for normal use.
•	Optional application lock with OS-backed secret/key storage.
•	Encrypted backup archives; optional database encryption can be evaluated for v1.1.
•	Sanitize imported filenames and block executable attachments.
•	Content Security Policy and strict Tauri allowlist.
•	Diagnostic export excludes attachments and sensitive values unless explicitly selected.
 
16. Backup, restore, and data integrity
16.1 Backup package
A backup contains a consistent SQLite snapshot, original attachments, thumbnail index if desired, application settings, and a manifest with schema version and checksums. It is written as a versioned archive and can be encrypted with a user passphrase.
16.2 Backup policy
Mode	Recommended behavior
Automatic	Daily on first successful app close/open after the interval.
Before-risk action	Always before schema migration, large import rollback, or restore.
Manual	One-click “Back up now” with destination picker.
Retention	Keep 7 daily, 4 weekly, and 6 monthly by default.
Verification	Validate database integrity and archive checksums before reporting success.

16.3 Restore workflow
16.	Choose backup and validate manifest, schema, checksums, and available disk space.
17.	Display backup date, record counts, attachment count, and app version.
18.	Create a safety backup of current data.
19.	Restore to a temporary location and run integrity checks.
20.	Atomically switch to restored data only after validation.
21.	Restart and show a restoration summary.
 
17. Notifications and review center
17.1 Review items
Signal	Trigger
Missing classification	Posted record lacks required account/category/person under configured rules.
Possible duplicate	Similarity score exceeds threshold.
Unreconciled balance	Statement difference remains or account is overdue for review.
Budget threshold	80%, 100%, or custom threshold reached.
Income goal	Behind pace, reached, or exceeded.
Expected payment due	Expected date reached without received status.
Backup overdue	No verified backup within configured interval.
Orphan attachment	File exists without a valid record link.

Notifications remain inside the application by default. Native desktop notifications are opt-in and should be limited to backups, expected payments, and explicitly selected financial goals.
 
18. Key end-to-end workflows
18.1 Record a JD purchase with screenshot
22.	Click Add Transaction and choose Expense.
23.	Enter date, amount, description/product, JD Wallet account, category, and person.
24.	Paste or select the product screenshot; preview is generated locally.
25.	Save. JD balance and expense reports update immediately.
26.	Open the transaction later from Recent Transactions, JD account, category insight, or Attachments gallery.
18.2 Fund JD Wallet
27.	Choose Transfer, not Expense or Income.
28.	Select source account and JD Wallet destination.
29.	Enter amount/date and save.
30.	Both linked entries post atomically; Total Available does not change.
18.3 Record freelance payment
31.	Open Freelance > project > Add Payment.
32.	Enter gross amount and explicit platform/partner/transfer deductions.
33.	Set status and expected/received dates.
34.	When received, select destination account and confirm actual net.
35.	LuckyGain creates/links the income and fee entries and validates the gross-to-net bridge.
18.4 Monthly close
36.	Resolve missing/duplicate warnings.
37.	Reconcile active accounts.
38.	Review income, expenses, savings transfers, and budget variance.
39.	Confirm the month as complete and add an optional note.
40.	Generate/export the monthly summary and verified backup.
 
19. Error handling and edge cases
Case	Expected behavior
Zero income month	Savings rate shows “—”; net gain remains meaningful.
Negative account balance	Allowed for selected account types, visibly flagged.
Future transaction	Stored as scheduled/draft until posted; excluded from current cash balance.
Attachment moved externally	Show missing-file status and offer relink; do not crash.
Import interrupted	Database transaction rolls back; temporary files are cleaned.
Database locked/corrupt	Stop writes, preserve files, offer recovery/restore workflow.
Transfer account deleted	Block deletion; require archive or reassignment.
Category merged	Reassign records transactionally and preserve audit event.
Edited reconciled item	Warn, mark reconciliation affected, and record audit event.
Refund exceeds original	Require explicit override and reason.

 
20. Search, export, and reporting
20.1 Global search
Search indexes descriptions, notes, merchants/products, categories, people, accounts, clients, projects, attachment titles, and import source references. Results are grouped by entity and can be narrowed with natural filters such as date, amount, and type.
20.2 Exports
Export	Contents
Transactions CSV/XLSX	Filtered row data with stable IDs and classifications.
Monthly report PDF	Summary, charts, category/person breakdown, account position, review status.
Freelance report	Gross, deductions, net, payment status, client/project.
Account statement	Opening/closing balances, inflows, outflows, reconciliation.
Attachment package	Selected originals plus a manifest linking each file to its record.
Full portable backup	Database, attachments, settings, manifest and checksums.

 
21. Delivery roadmap
Phase	Scope	Exit criteria
0 — Foundation	Repository, Tauri shell, theme, SQLite schema, migrations, test harness.	App installs and data persists safely.
1 — Core ledger	Transactions, accounts, categories, people, transfers, dashboard basics.	All ledger calculations and CRUD flows pass tests.
2 — Import & evidence	Excel import review, attachments, gallery, duplicate detection.	Current workbook can migrate with auditable warnings.
3 — Planning & work	Budget, Freelance, explicit fees, expected payments.	Gross-to-net and budget flows reconcile.
4 — Intelligence	Insights, search, review center, monthly close.	All headline numbers drill to sources.
5 — Hardening	Backup/restore, accessibility, performance, installer, update process.	Recovery tested; production release candidate signed off.

21.1 MVP boundary
A credible MVP includes Dashboard, Transactions, Accounts, Settings foundations, Excel import, attachments, transfers, and verified backup. Budget, Freelance, and Insights may follow immediately, but the data model should support them from the beginning.
21.2 Later opportunities
•	Optional PostgreSQL/cloud synchronization and multi-device access.
•	Mobile companion for quick capture and receipt photos.
•	Bank statement CSV adapters; bank APIs only if privacy and maintenance justify them.
•	OCR for receipts, always with human review.
•	Rules for automatic categorization learned locally.
•	Multi-user household profiles and permissions.
•	Forecasting and income scenario planning.
 
22. Acceptance criteria
•	A user can add, edit, archive, restore, filter, and export income, expense, transfer, refund, fee, and adjustment records.
•	All dashboard totals reconcile exactly to posted source transactions and expose a drill-down.
•	A transfer changes individual account balances but never total income, expense, or combined available assets.
•	Multiple screenshots can be attached, previewed, searched, relinked, backed up, and restored.
•	The supplied workbook structure can be imported through a preview-and-review workflow without trusting formula totals.
•	Freelance gross, explicit deductions, and actual net received reconcile or show a blocking explanation.
•	Partial months are visibly labeled and do not produce misleading comparisons.
•	Backup restoration is tested against a new application-data directory and reproduces record and attachment counts.
•	The app remains usable by keyboard, supports high-contrast focus, and does not encode meaning by color alone.
•	A clean Windows installation works without PostgreSQL, internet access, or a separate database server.
22.1 Definition of done
RELEASE STANDARD  No unexplained balance difference, no headline total without drill-down, no silent import coercion, no attachment outside backup coverage, and no destructive action without a recoverable path.

 
Appendix A — Initial navigation labels
Sidebar	Primary action
Dashboard	Review current position
Transactions	Manage all movements
Accounts	Verify balances
Budget	Plan the month
Freelance	Manage earnings
Insights	Analyze trends
Attachments	Browse evidence
Settings	Configure and protect

Appendix B — Recommended keyboard shortcuts
Shortcut	Action
Ctrl/Cmd + K	Open command palette
Ctrl/Cmd + N	Add transaction
Ctrl/Cmd + I	Import file
Ctrl/Cmd + B	Back up now
/	Focus page search
Esc	Close drawer/dialog
Ctrl/Cmd + Enter	Save current form

Appendix C — Final recommendation
Build LuckyGain as a Tauri desktop application from the beginning, using React/TypeScript for the premium web-style interface and SQLite for local data. Keep attachments as local files referenced by relative paths. This is simpler, faster, more private, and more reliable for the first release than running local PostgreSQL. The architecture can add an optional PostgreSQL synchronization service later without replacing the desktop ledger.
