import { addMonths, format, parse } from "date-fns";
import { uid } from "../dates";
import { exec, execOne, run, withTransaction } from "./client";
import { getPartnerMonthRollups } from "./purse";

export type MilestoneStatus = "unreleased" | "released";

export const PROJECT_TYPES = ["Kareem", "Greg", "Binance"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export function isProjectType(value: string): value is ProjectType {
  return (PROJECT_TYPES as readonly string[]).includes(value);
}

export function assertProjectType(value: string): ProjectType {
  if (!isProjectType(value)) {
    throw new Error("Project type must be Kareem, Greg, or Binance");
  }
  return value;
}

export type ProjectLifecycleStatus = "active" | "finished";

export function isProjectLifecycleStatus(
  value: string,
): value is ProjectLifecycleStatus {
  return value === "active" || value === "finished";
}

export interface FreelanceMilestone {
  id: string;
  project_id: string;
  title: string;
  gross_cents: number;
  /** Sum of transfer + account fee bps (legacy compatibility) */
  fee_bps: number;
  transfer_fee_bps: number;
  account_fee_bps: number;
  /** Sequential fees: net = gross × (1−t) × (1−a) */
  fee_compound: boolean;
  fee_cents: number;
  transfer_fee_cents: number;
  account_fee_cents: number;
  net_cents: number;
  work_month: string;
  status: MilestoneStatus;
  /** YYYY-MM-DD when released; null if still waiting */
  released_at: string | null;
}

export interface FreelanceProject {
  id: string;
  client_id: string;
  client_name: string;
  name: string;
  description: string;
  origin_month: string | null;
  start_date: string | null;
  finish_date: string | null;
  project_type: ProjectType;
  status: ProjectLifecycleStatus;
  milestones: FreelanceMilestone[];
  releasedNetCents: number;
  unreleasedNetCents: number;
}

export interface FreelanceMonthCard {
  month: string;
  label: string;
  /** Released milestone totals for the month */
  grossCents: number;
  transferFeeCents: number;
  accountFeeCents: number;
  feeCents: number;
  /** Net income after fees */
  incomeCents: number;
  releasedCount: number;
  projectCount: number;
  /** Projects that have released work this month (released milestones only) */
  projects: FreelanceProject[];
}

export interface FreelanceBoard {
  months: FreelanceMonthCard[];
  totals: {
    releasedGrossCents: number;
    transferFeeCents: number;
    accountFeeCents: number;
    releasedNetCents: number;
    projectCount: number;
  };
}

function feeCents(grossCents: number, feeBps: number): number {
  return Math.round((grossCents * feeBps) / 10000);
}

function assertFeePercents(
  transferPercent: number,
  accountPercent: number,
  compound: boolean,
): void {
  if (transferPercent < 0 || transferPercent > 100) {
    throw new Error("Transfer fee percent must be between 0 and 100");
  }
  if (accountPercent < 0 || accountPercent > 100) {
    throw new Error("Account fee percent must be between 0 and 100");
  }
  if (!compound && transferPercent + accountPercent > 100) {
    throw new Error("Combined fees cannot exceed 100%");
  }
}

function mapMilestoneFees(
  grossCents: number,
  transferFeeBps: number,
  accountFeeBps: number,
  feeCompound: boolean,
) {
  const transfer_fee_cents = feeCents(grossCents, transferFeeBps);
  let account_fee_cents: number;
  let net_cents: number;
  if (feeCompound) {
    // net = gross × (1−t) × (1−a); account fee is taken from the remainder
    const afterTransfer = grossCents - transfer_fee_cents;
    account_fee_cents = feeCents(afterTransfer, accountFeeBps);
    net_cents = afterTransfer - account_fee_cents;
  } else {
    account_fee_cents = feeCents(grossCents, accountFeeBps);
    net_cents = grossCents - transfer_fee_cents - account_fee_cents;
  }
  return {
    fee_bps: transferFeeBps + accountFeeBps,
    transfer_fee_bps: transferFeeBps,
    account_fee_bps: accountFeeBps,
    fee_compound: feeCompound,
    fee_cents: transfer_fee_cents + account_fee_cents,
    transfer_fee_cents,
    account_fee_cents,
    net_cents,
  };
}

function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return format(addMonths(new Date(y, m - 1, 1), delta), "yyyy-MM");
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMMM yyyy");
}

/** Month that owns this milestone on the board / in income. Released date month is the work month. */
function incomeMonth(m: {
  status: string;
  work_month: string;
  released_at: string | null;
}): string {
  if (m.status === "released" && m.released_at) {
    return m.released_at.slice(0, 7);
  }
  return m.work_month;
}

function findOrCreateClient(name: string): string {
  const trimmed = name.trim();
  const existing = execOne<{ id: string }>(
    `SELECT id FROM clients WHERE lower(name) = lower(?) AND archived = 0 LIMIT 1`,
    [trimmed],
  );
  if (existing) return existing.id;
  const id = uid("cli");
  run(`INSERT INTO clients (id, name) VALUES (?, ?)`, [id, trimmed]);
  return id;
}

export function getFreelanceBoard(focusMonth?: string): FreelanceBoard {
  const milestones = exec<{
    id: string;
    project_id: string;
    title: string;
    gross_cents: number;
    fee_bps: number;
    transfer_fee_bps: number;
    account_fee_bps: number;
    fee_compound: number;
    work_month: string;
    status: MilestoneStatus;
    released_at: string | null;
  }>(
    `SELECT id, project_id, title, gross_cents, fee_bps,
            transfer_fee_bps, account_fee_bps, fee_compound,
            work_month, status, released_at
     FROM milestones
     ORDER BY work_month DESC, sort_order ASC, created_at ASC`,
  );

  const projects = exec<{
    id: string;
    client_id: string;
    client_name: string;
    name: string;
    notes: string | null;
    origin_month: string | null;
    start_date: string | null;
    finish_date: string | null;
    project_type: string;
    status: string;
  }>(
    `SELECT p.id, p.client_id, c.name AS client_name, p.name, p.notes, p.origin_month,
            p.start_date, p.finish_date, p.project_type, p.status
     FROM projects p
     JOIN clients c ON c.id = p.client_id
     WHERE p.archived = 0
     ORDER BY p.created_at DESC`,
  );

  const monthSet = new Set<string>();
  for (const m of milestones) {
    if (m.status === "released") monthSet.add(incomeMonth(m));
  }
  if (focusMonth) monthSet.add(focusMonth);
  monthSet.add(format(new Date(), "yyyy-MM"));

  const months = Array.from(monthSet)
    .sort((a, b) => b.localeCompare(a))
    .map((month) => {
      const monthProjects: FreelanceProject[] = projects
        .map((p) => {
          const ms = milestones
            .filter(
              (m) =>
                m.project_id === p.id &&
                m.status === "released" &&
                incomeMonth(m) === month,
            )
            .map((m) => {
              const fees = mapMilestoneFees(
                m.gross_cents,
                m.transfer_fee_bps,
                m.account_fee_bps,
                m.fee_compound === 1,
              );
              return {
                id: m.id,
                project_id: m.project_id,
                title: m.title,
                gross_cents: m.gross_cents,
                ...fees,
                work_month: m.work_month,
                status: m.status,
                released_at: m.released_at,
              };
            });
          if (ms.length === 0) return null;
          return {
            id: p.id,
            client_id: p.client_id,
            client_name: p.client_name,
            name: p.name,
            description: p.notes ?? "",
            origin_month: p.origin_month,
            start_date: p.start_date,
            finish_date: p.finish_date,
            project_type: isProjectType(p.project_type)
              ? p.project_type
              : "Kareem",
            status: isProjectLifecycleStatus(p.status) ? p.status : "active",
            milestones: ms,
            releasedNetCents: ms.reduce((s, m) => s + m.net_cents, 0),
            unreleasedNetCents: 0,
          };
        })
        .filter((p): p is FreelanceProject => p != null);

      const allMs = monthProjects.flatMap((p) => p.milestones);
      const grossCents = allMs.reduce((s, m) => s + m.gross_cents, 0);
      const transferFeeCents = allMs.reduce(
        (s, m) => s + m.transfer_fee_cents,
        0,
      );
      const accountFeeCents = allMs.reduce(
        (s, m) => s + m.account_fee_cents,
        0,
      );
      const feeCents = transferFeeCents + accountFeeCents;
      const incomeCents = allMs.reduce((s, m) => s + m.net_cents, 0);

      return {
        month,
        label: monthLabel(month),
        grossCents,
        transferFeeCents,
        accountFeeCents,
        feeCents,
        incomeCents,
        releasedCount: allMs.length,
        projectCount: monthProjects.length,
        projects: monthProjects,
      };
    });

  return {
    months,
    totals: {
      releasedGrossCents: months.reduce((s, m) => s + m.grossCents, 0),
      transferFeeCents: months.reduce((s, m) => s + m.transferFeeCents, 0),
      accountFeeCents: months.reduce((s, m) => s + m.accountFeeCents, 0),
      releasedNetCents: months.reduce((s, m) => s + m.incomeCents, 0),
      projectCount: projects.length,
    },
  };
}

export function addFreelanceProject(input: {
  month?: string;
  clientName: string;
  projectName: string;
  description?: string;
  startDate?: string | null;
  finishDate?: string | null;
  projectType: ProjectType;
}): string {
  if (!input.clientName.trim()) throw new Error("Client name is required");
  if (!input.projectName.trim()) throw new Error("Project name is required");
  const projectType = assertProjectType(input.projectType);
  validateProjectDates(input.startDate, input.finishDate);

  const clientId = findOrCreateClient(input.clientName);
  const id = uid("prj");
  const originMonth =
    input.month?.trim() ||
    input.startDate?.trim()?.slice(0, 7) ||
    null;
  run(
    `INSERT INTO projects (id, client_id, name, notes, origin_month, start_date, finish_date, project_type, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      id,
      clientId,
      input.projectName.trim(),
      input.description?.trim() || null,
      originMonth,
      input.startDate?.trim() || null,
      input.finishDate?.trim() || null,
      projectType,
    ],
  );
  return id;
}

export function addMilestone(input: {
  projectId: string;
  month: string;
  title?: string;
  amountYuan: number;
  transferFeePercent: number;
  accountFeePercent: number;
  feeCompound?: boolean;
}): string {
  if (!(input.amountYuan > 0)) throw new Error("Amount must be positive");
  const feeCompound = Boolean(input.feeCompound);
  assertFeePercents(
    input.transferFeePercent,
    input.accountFeePercent,
    feeCompound,
  );
  const gross = Math.round(input.amountYuan * 100);
  const transferFeeBps = Math.round(input.transferFeePercent * 100);
  const accountFeeBps = Math.round(input.accountFeePercent * 100);
  const feeBps = transferFeeBps + accountFeeBps;
  const id = uid("ms");
  const sort =
    (execOne<{ c: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS c
       FROM milestones WHERE project_id = ?`,
      [input.projectId],
    )?.c ?? 0);

  run(
    `INSERT INTO milestones
      (id, project_id, title, gross_cents, fee_bps, transfer_fee_bps, account_fee_bps,
       fee_compound, work_month, status, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreleased', ?)`,
    [
      id,
      input.projectId,
      input.title?.trim() || `Milestone ${sort + 1}`,
      gross,
      feeBps,
      transferFeeBps,
      accountFeeBps,
      feeCompound ? 1 : 0,
      input.month,
      sort,
    ],
  );
  return id;
}

export function setProjectFinished(
  projectId: string,
  finished: boolean,
): void {
  run(`UPDATE projects SET status = ? WHERE id = ?`, [
    finished ? "finished" : "active",
    projectId,
  ]);
}

export function deleteProject(projectId: string): void {
  const row = execOne<{ id: string }>(
    `SELECT id FROM projects WHERE id = ? AND archived = 0`,
    [projectId],
  );
  if (!row) throw new Error("Project not found");
  run(`UPDATE projects SET archived = 1 WHERE id = ?`, [projectId]);
}

export type ProjectCompletionInfo = {
  projectId: string;
  projectName: string;
  clientName: string;
  finishDate: string;
  netCents: number;
  milestoneCount: number;
};

export type MilestoneReleaseResult = {
  /** Set when this release completed every milestone on the project. */
  completed: ProjectCompletionInfo | null;
};

export function setMilestoneReleased(
  id: string,
  released: boolean,
  releasedAt?: string | null,
): MilestoneReleaseResult {
  const row = execOne<{
    project_id: string;
    status: string;
  }>(`SELECT project_id, status FROM milestones WHERE id = ?`, [id]);
  if (!row) throw new Error("Milestone not found");

  if (released) {
    const date =
      releasedAt?.trim().slice(0, 10) ||
      format(new Date(), "yyyy-MM-dd");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Invalid released date");
    }
    run(
      `UPDATE milestones
       SET status = 'released',
           released_at = ?,
           work_month = substr(?, 1, 7),
           updated_at = datetime('now')
       WHERE id = ?`,
      [date, date, id],
    );

    const pending = execOne<{ c: number }>(
      `SELECT COUNT(*) AS c
       FROM milestones
       WHERE project_id = ? AND status = 'unreleased'`,
      [row.project_id],
    );
    const total = execOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM milestones WHERE project_id = ?`,
      [row.project_id],
    );
    // Celebrate only when this release newly closes every milestone.
    if (
      row.status === "released" ||
      (pending?.c ?? 1) > 0 ||
      (total?.c ?? 0) === 0
    ) {
      return { completed: null };
    }

    const project = execOne<{
      id: string;
      name: string;
      client_name: string;
    }>(
      `SELECT p.id, p.name, c.name AS client_name
       FROM projects p
       JOIN clients c ON c.id = p.client_id
       WHERE p.id = ?`,
      [row.project_id],
    );
    if (!project) return { completed: null };

    const latestRelease = execOne<{ d: string | null }>(
      `SELECT MAX(released_at) AS d
       FROM milestones
       WHERE project_id = ? AND status = 'released'`,
      [project.id],
    );
    const finishDate = (latestRelease?.d ?? date).slice(0, 10);

    const milestoneRows = exec<{
      gross_cents: number;
      transfer_fee_bps: number;
      account_fee_bps: number;
      fee_compound: number;
    }>(
      `SELECT gross_cents, transfer_fee_bps, account_fee_bps, fee_compound
       FROM milestones
       WHERE project_id = ?`,
      [project.id],
    );
    const netCents = milestoneRows.reduce(
      (sum, m) =>
        sum +
        mapMilestoneFees(
          m.gross_cents,
          m.transfer_fee_bps,
          m.account_fee_bps,
          Boolean(m.fee_compound),
        ).net_cents,
      0,
    );

    return {
      completed: {
        projectId: project.id,
        projectName: project.name,
        clientName: project.client_name,
        finishDate,
        netCents,
        milestoneCount: milestoneRows.length,
      },
    };
  }

  run(
    `UPDATE milestones
     SET status = 'unreleased',
         released_at = NULL,
         updated_at = datetime('now')
     WHERE id = ?`,
    [id],
  );
  return { completed: null };
}

export function moveMilestoneByMonths(id: string, delta: number): void {
  if (delta === 0) return;
  const row = execOne<{ work_month: string; status: string }>(
    `SELECT work_month, status FROM milestones WHERE id = ?`,
    [id],
  );
  if (!row) throw new Error("Milestone not found");
  if (row.status === "released") {
    throw new Error("Released milestones stay in their month");
  }
  run(
    `UPDATE milestones
     SET work_month = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [shiftMonthKey(row.work_month, delta), id],
  );
}

export function updateFreelanceProject(input: {
  projectId: string;
  clientName: string;
  projectName: string;
  description?: string;
  startDate?: string | null;
  finishDate?: string | null;
  projectType?: ProjectType;
}): void {
  if (!input.clientName.trim()) throw new Error("Client name is required");
  if (!input.projectName.trim()) throw new Error("Project name is required");
  const clientId = findOrCreateClient(input.clientName);

  const current = execOne<{
    start_date: string | null;
    finish_date: string | null;
    project_type: string;
  }>(
    `SELECT start_date, finish_date, project_type FROM projects WHERE id = ?`,
    [input.projectId],
  );
  if (!current) throw new Error("Project not found");

  const startDate =
    input.startDate !== undefined ? input.startDate : current.start_date;
  const finishDate =
    input.finishDate !== undefined ? input.finishDate : current.finish_date;
  validateProjectDates(startDate, finishDate);

  const projectType =
    input.projectType !== undefined
      ? assertProjectType(input.projectType)
      : isProjectType(current.project_type)
        ? current.project_type
        : "Kareem";

  run(
    `UPDATE projects
     SET client_id = ?, name = ?, notes = ?, start_date = ?, finish_date = ?, project_type = ?
     WHERE id = ?`,
    [
      clientId,
      input.projectName.trim(),
      input.description?.trim() || null,
      startDate?.trim() || null,
      finishDate?.trim() || null,
      projectType,
      input.projectId,
    ],
  );
}

function validateProjectDates(
  startDate?: string | null,
  finishDate?: string | null,
): void {
  const start = startDate?.trim() || null;
  const finish = finishDate?.trim() || null;
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    throw new Error("Start date must be YYYY-MM-DD");
  }
  if (finish && !/^\d{4}-\d{2}-\d{2}$/.test(finish)) {
    throw new Error("Finish date must be YYYY-MM-DD");
  }
  if (start && finish && finish < start) {
    throw new Error("Finish date cannot be before start date");
  }
}

export function updateMilestone(input: {
  id: string;
  title?: string;
  amountYuan: number;
  transferFeePercent: number;
  accountFeePercent: number;
  feeCompound?: boolean;
  workMonth?: string;
  releasedAt?: string | null;
}): void {
  if (!(input.amountYuan > 0)) throw new Error("Amount must be positive");
  const feeCompound = Boolean(input.feeCompound);
  assertFeePercents(
    input.transferFeePercent,
    input.accountFeePercent,
    feeCompound,
  );
  const row = execOne<{
    status: string;
    work_month: string;
    released_at: string | null;
  }>(`SELECT status, work_month, released_at FROM milestones WHERE id = ?`, [
    input.id,
  ]);
  if (!row) throw new Error("Milestone not found");

  let workMonth = row.work_month;
  if (input.workMonth && input.workMonth !== row.work_month) {
    if (row.status === "released") {
      throw new Error("Released milestones stay in their month");
    }
    if (!/^\d{4}-\d{2}$/.test(input.workMonth)) {
      throw new Error("Invalid work month");
    }
    workMonth = input.workMonth;
  }

  let releasedAt = row.released_at;
  if (input.releasedAt !== undefined) {
    if (row.status !== "released") {
      throw new Error("Only released milestones have a released date");
    }
    const value = input.releasedAt?.trim() || null;
    if (value && !/^\d{4}-\d{2}-\d{2}/.test(value)) {
      throw new Error("Invalid released date");
    }
    releasedAt = value ? value.slice(0, 10) : null;
    if (releasedAt) {
      workMonth = releasedAt.slice(0, 7);
    }
  }

  // Released milestones always belong to their release-date month
  if (row.status === "released" && releasedAt) {
    workMonth = releasedAt.slice(0, 7);
  }

  const transferFeeBps = Math.round(input.transferFeePercent * 100);
  const accountFeeBps = Math.round(input.accountFeePercent * 100);

  run(
    `UPDATE milestones
     SET title = ?, gross_cents = ?, fee_bps = ?, transfer_fee_bps = ?, account_fee_bps = ?,
         fee_compound = ?, work_month = ?, released_at = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      input.title?.trim() || "Milestone",
      Math.round(input.amountYuan * 100),
      transferFeeBps + accountFeeBps,
      transferFeeBps,
      accountFeeBps,
      feeCompound ? 1 : 0,
      workMonth,
      releasedAt,
      input.id,
    ],
  );
}

export function updateMilestoneFee(
  id: string,
  transferFeePercent: number,
  accountFeePercent: number,
  feeCompound = false,
): void {
  assertFeePercents(transferFeePercent, accountFeePercent, feeCompound);
  const transferFeeBps = Math.round(transferFeePercent * 100);
  const accountFeeBps = Math.round(accountFeePercent * 100);
  run(
    `UPDATE milestones
     SET fee_bps = ?, transfer_fee_bps = ?, account_fee_bps = ?, fee_compound = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      transferFeeBps + accountFeeBps,
      transferFeeBps,
      accountFeeBps,
      feeCompound ? 1 : 0,
      id,
    ],
  );
}

export function deleteMilestone(id: string): void {
  run(`DELETE FROM milestones WHERE id = ?`, [id]);
}

/** Persist display order for a project's milestones (Projects board). */
export function reorderProjectMilestones(
  projectId: string,
  orderedIds: string[],
): void {
  const existing = exec<{ id: string }>(
    `SELECT id FROM milestones WHERE project_id = ?`,
    [projectId],
  );
  const existingIds = new Set(existing.map((r) => r.id));
  if (
    orderedIds.length !== existingIds.size ||
    orderedIds.some((id) => !existingIds.has(id))
  ) {
    throw new Error("Invalid milestone order");
  }
  withTransaction(() => {
    orderedIds.forEach((id, index) => {
      run(
        `UPDATE milestones
         SET sort_order = ?, updated_at = datetime('now')
         WHERE id = ? AND project_id = ?`,
        [index, id, projectId],
      );
    });
  });
}

export type ProjectProgressStatus =
  | "empty"
  | "pending"
  | "partial"
  | "complete";

export interface ProjectListItem {
  id: string;
  client_name: string;
  name: string;
  description: string;
  origin_month: string | null;
  start_date: string | null;
  finish_date: string | null;
  project_type: ProjectType;
  status: ProjectLifecycleStatus;
  milestoneCount: number;
  releasedCount: number;
  pendingCount: number;
  grossCents: number;
  netCents: number;
  releasedGrossCents: number;
  pendingGrossCents: number;
  releasedNetCents: number;
  pendingNetCents: number;
  progressStatus: ProjectProgressStatus;
  /** Latest released work month label when fully complete */
  finishedOnLabel: string | null;
  /** Span of milestone work months, e.g. "Mar – Aug 2026" */
  monthSpanLabel: string | null;
  milestones: FreelanceMilestone[];
}

function monthSpanLabel(months: string[]): string | null {
  if (months.length === 0) return null;
  const sorted = [...months].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === last) return monthLabel(first);
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  if (fy === ly) {
    return `${format(new Date(fy, fm - 1, 1), "MMM")} – ${format(new Date(ly, lm - 1, 1), "MMM yyyy")}`;
  }
  return `${format(new Date(fy, fm - 1, 1), "MMM yyyy")} – ${format(new Date(ly, lm - 1, 1), "MMM yyyy")}`;
}

export function getProjectList(): ProjectListItem[] {
  const projects = exec<{
    id: string;
    client_name: string;
    name: string;
    notes: string | null;
    origin_month: string | null;
    start_date: string | null;
    finish_date: string | null;
    project_type: string;
    status: string;
  }>(
    `SELECT p.id, c.name AS client_name, p.name, p.notes, p.origin_month,
            p.start_date, p.finish_date, p.project_type, p.status
     FROM projects p
     JOIN clients c ON c.id = p.client_id
     WHERE p.archived = 0
     ORDER BY c.name COLLATE NOCASE ASC, p.name COLLATE NOCASE ASC`,
  );

  const milestones = exec<{
    id: string;
    project_id: string;
    title: string;
    gross_cents: number;
    fee_bps: number;
    transfer_fee_bps: number;
    account_fee_bps: number;
    fee_compound: number;
    work_month: string;
    status: MilestoneStatus;
    released_at: string | null;
  }>(
    `SELECT id, project_id, title, gross_cents, fee_bps,
            transfer_fee_bps, account_fee_bps, fee_compound,
            work_month, status, released_at
     FROM milestones
     ORDER BY sort_order ASC, created_at ASC`,
  );

  const byProject = new Map<string, typeof milestones>();
  for (const m of milestones) {
    const list = byProject.get(m.project_id) ?? [];
    list.push(m);
    byProject.set(m.project_id, list);
  }

  return projects.map((p) => {
    const raw = byProject.get(p.id) ?? [];
    const ms: FreelanceMilestone[] = raw.map((m) => {
      const fees = mapMilestoneFees(
        m.gross_cents,
        m.transfer_fee_bps,
        m.account_fee_bps,
        m.fee_compound === 1,
      );
      return {
        id: m.id,
        project_id: m.project_id,
        title: m.title,
        gross_cents: m.gross_cents,
        ...fees,
        work_month: m.work_month,
        status: m.status,
        released_at: m.released_at,
      };
    });

    let grossCents = 0;
    let netCents = 0;
    let releasedGrossCents = 0;
    let pendingGrossCents = 0;
    let releasedNetCents = 0;
    let pendingNetCents = 0;
    let releasedCount = 0;
    let pendingCount = 0;
    const workMonths: string[] = [];
    let latestReleasedMonth: string | null = null;
    let latestReleasedAt: string | null = null;

    for (const m of ms) {
      grossCents += m.gross_cents;
      netCents += m.net_cents;
      const boardMonth = incomeMonth(m);
      workMonths.push(boardMonth);
      if (m.status === "released") {
        releasedCount += 1;
        releasedGrossCents += m.gross_cents;
        releasedNetCents += m.net_cents;
        if (
          !latestReleasedMonth ||
          boardMonth.localeCompare(latestReleasedMonth) > 0
        ) {
          latestReleasedMonth = boardMonth;
        }
        const releasedDay = m.released_at?.slice(0, 10) ?? null;
        if (
          releasedDay &&
          (!latestReleasedAt || releasedDay.localeCompare(latestReleasedAt) > 0)
        ) {
          latestReleasedAt = releasedDay;
        }
      } else {
        pendingCount += 1;
        pendingGrossCents += m.gross_cents;
        pendingNetCents += m.net_cents;
      }
    }

    const milestoneCount = ms.length;
    let progressStatus: ProjectProgressStatus = "empty";
    if (milestoneCount === 0) progressStatus = "empty";
    else if (pendingCount === 0) progressStatus = "complete";
    else if (releasedCount === 0) progressStatus = "pending";
    else progressStatus = "partial";

    // Finished / finish date are derived from milestones only (no project DB write).
    const isFinished = progressStatus === "complete";
    const derivedFinishDate = isFinished ? latestReleasedAt : null;

    return {
      id: p.id,
      client_name: p.client_name,
      name: p.name,
      description: p.notes ?? "",
      origin_month: p.origin_month,
      start_date: p.start_date,
      finish_date: derivedFinishDate,
      project_type: isProjectType(p.project_type) ? p.project_type : "Kareem",
      status: isFinished ? "finished" : "active",
      milestoneCount,
      releasedCount,
      pendingCount,
      grossCents,
      netCents,
      releasedGrossCents,
      pendingGrossCents,
      releasedNetCents,
      pendingNetCents,
      progressStatus,
      finishedOnLabel:
        isFinished && latestReleasedMonth
          ? monthLabel(latestReleasedMonth)
          : null,
      monthSpanLabel: monthSpanLabel(workMonths),
      milestones: ms,
    };
  });
}

export interface ProjectInsights {
  months: Array<{
    key: string;
    label: string;
    grossCents: number;
    releasedNetCents: number;
    releasedCount: number;
  }>;
  byType: Array<{
    type: ProjectType;
    releasedNetCents: number;
    pendingNetCents: number;
    projectCount: number;
  }>;
  /** Client/person rollup — same name (case-insensitive) is one person. */
  byPerson: Array<{
    key: string;
    name: string;
    releasedNetCents: number;
    pendingNetCents: number;
    projectCount: number;
  }>;
  topProjects: Array<{
    id: string;
    name: string;
    clientName: string;
    /** lower(clientName) for filtering */
    personKey: string;
    projectType: ProjectType;
    releasedNetCents: number;
    pendingNetCents: number;
  }>;
  totals: {
    releasedNetCents: number;
    pendingNetCents: number;
    releasedGrossCents: number;
    activeCount: number;
    finishedCount: number;
  };
}

/** Six-month released income + type / project breakdowns for Insights. */
export function getProjectInsights(anchor = new Date()): ProjectInsights {
  const projects = getProjectList();
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    monthKeys.push(
      format(new Date(anchor.getFullYear(), anchor.getMonth() - i, 1), "yyyy-MM"),
    );
  }

  const monthBuckets = new Map(
    monthKeys.map((key) => [
      key,
      {
        key,
        label: format(parse(`${key}-01`, "yyyy-MM-dd", new Date()), "MMM"),
        grossCents: 0,
        releasedNetCents: 0,
        releasedCount: 0,
      },
    ]),
  );

  for (const p of projects) {
    for (const m of p.milestones) {
      if (m.status !== "released") continue;
      const key = incomeMonth(m);
      const bucket = monthBuckets.get(key);
      if (!bucket) continue;
      bucket.grossCents += m.gross_cents;
      bucket.releasedNetCents += m.net_cents;
      bucket.releasedCount += 1;
    }
  }

  const typeMap = new Map<
    ProjectType,
    {
      type: ProjectType;
      releasedNetCents: number;
      pendingNetCents: number;
      projectCount: number;
    }
  >();
  for (const t of PROJECT_TYPES) {
    typeMap.set(t, {
      type: t,
      releasedNetCents: 0,
      pendingNetCents: 0,
      projectCount: 0,
    });
  }

  const personMap = new Map<
    string,
    {
      key: string;
      name: string;
      releasedNetCents: number;
      pendingNetCents: number;
      projectCount: number;
    }
  >();

  let releasedNetCents = 0;
  let pendingNetCents = 0;
  let releasedGrossCents = 0;
  let activeCount = 0;
  let finishedCount = 0;

  for (const p of projects) {
    const slot = typeMap.get(p.project_type)!;
    slot.releasedNetCents += p.releasedNetCents;
    slot.pendingNetCents += p.pendingNetCents;
    slot.projectCount += 1;
    releasedNetCents += p.releasedNetCents;
    pendingNetCents += p.pendingNetCents;
    releasedGrossCents += p.milestones
      .filter((m) => m.status === "released")
      .reduce((s, m) => s + m.gross_cents, 0);
    if (p.progressStatus === "complete") finishedCount += 1;
    else activeCount += 1;

    const personKey = p.client_name.trim().toLowerCase() || "unknown";
    const person = personMap.get(personKey) ?? {
      key: personKey,
      name: p.client_name.trim() || "Unknown",
      releasedNetCents: 0,
      pendingNetCents: 0,
      projectCount: 0,
    };
    person.releasedNetCents += p.releasedNetCents;
    person.pendingNetCents += p.pendingNetCents;
    person.projectCount += 1;
    personMap.set(personKey, person);
  }

  const byPerson = [...personMap.values()].sort(
    (a, b) =>
      b.releasedNetCents - a.releasedNetCents ||
      b.pendingNetCents - a.pendingNetCents ||
      a.name.localeCompare(b.name),
  );

  const topProjects = [...projects]
    .sort(
      (a, b) =>
        b.releasedNetCents - a.releasedNetCents ||
        b.pendingNetCents - a.pendingNetCents,
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      clientName: p.client_name,
      personKey: p.client_name.trim().toLowerCase() || "unknown",
      projectType: p.project_type,
      releasedNetCents: p.releasedNetCents,
      pendingNetCents: p.pendingNetCents,
    }));

  return {
    months: monthKeys.map((k) => monthBuckets.get(k)!),
    byType: PROJECT_TYPES.map((t) => typeMap.get(t)!).filter(
      (t) => t.projectCount > 0 || t.releasedNetCents > 0 || t.pendingNetCents > 0,
    ),
    byPerson,
    topProjects,
    totals: {
      releasedNetCents,
      pendingNetCents,
      releasedGrossCents,
      activeCount,
      finishedCount,
    },
  };
}

export interface FreelanceIncomeMonthRow {
  month: string;
  label: string;
  /** Released milestone net for the month */
  freelanceNetCents: number;
  releasedCount: number;
  usdCents: number;
  yuanCents: number;
  /** Amount kept that month (Yuan minor units) */
  keepCents: number;
  /** Jackie purse income for the month (Yuan fen) */
  jackieIncomeCents: number;
  /** Jackie goods spend for the month (Yuan fen) */
  jackieGoodsCents: number;
  /** Jackie income − Jackie goods */
  jackieBenefitCents: number;
  /** Chuck purse income for the month (Yuan fen) */
  chuckIncomeCents: number;
  /** Chuck goods spend for the month (Yuan fen) */
  chuckGoodsCents: number;
  /** Chuck income − Chuck goods */
  chuckBenefitCents: number;
  notes: string;
}

/** Month rows from Jan 2026 through the anchor month (partner rows before freelance starts). */
export function getFreelanceIncomeTable(
  anchor = new Date(),
): FreelanceIncomeMonthRow[] {
  const floor = parse("2026-01-01", "yyyy-MM-dd", new Date());
  const end = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthKeys: string[] = [];
  if (end >= floor) {
    for (
      let d = floor;
      d <= end;
      d = addMonths(d, 1)
    ) {
      monthKeys.push(format(d, "yyyy-MM"));
    }
  }

  const netByMonth = new Map<string, { net: number; count: number }>();
  for (const p of getProjectList()) {
    for (const m of p.milestones) {
      if (m.status !== "released") continue;
      const key = incomeMonth(m);
      if (key < "2026-01") continue;
      const cur = netByMonth.get(key) ?? { net: 0, count: 0 };
      cur.net += m.net_cents;
      cur.count += 1;
      netByMonth.set(key, cur);
    }
  }

  const handRows = exec<{
    month: string;
    usd_cents: number;
    yuan_cents: number;
    keep_cents: number;
    notes: string | null;
  }>(
    `SELECT month, usd_cents, yuan_cents, keep_cents, notes
     FROM work_months
     WHERE month >= '2026-01'
     ORDER BY month DESC`,
  );
  const handByMonth = new Map(
    handRows.map((r) => [
      r.month,
      {
        usdCents: r.usd_cents ?? 0,
        yuanCents: r.yuan_cents ?? 0,
        keepCents: r.keep_cents ?? 0,
        notes: r.notes ?? "",
      },
    ]),
  );

  const jackieByMonth = getPartnerMonthRollups("jackie");
  const chuckByMonth = getPartnerMonthRollups("chuck");

  const endKey = format(end, "yyyy-MM");
  const keys = new Set([
    ...monthKeys,
    ...[...handByMonth.keys()].filter((k) => k >= "2026-01" && k <= endKey),
    ...[...jackieByMonth.keys()].filter((k) => k >= "2026-01" && k <= endKey),
    ...[...chuckByMonth.keys()].filter((k) => k >= "2026-01" && k <= endKey),
  ]);

  return [...keys]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => {
      const [y, m] = key.split("-").map(Number);
      const hand = handByMonth.get(key);
      const net = netByMonth.get(key);
      const jackie = jackieByMonth.get(key);
      const chuck = chuckByMonth.get(key);
      const jackieIncomeCents = jackie?.incomeCents ?? 0;
      const jackieGoodsCents = jackie?.goodsCents ?? 0;
      const chuckIncomeCents = chuck?.incomeCents ?? 0;
      const chuckGoodsCents = chuck?.goodsCents ?? 0;
      return {
        month: key,
        label: format(new Date(y, m - 1, 1), "MMM yyyy"),
        freelanceNetCents: net?.net ?? 0,
        releasedCount: net?.count ?? 0,
        usdCents: hand?.usdCents ?? 0,
        yuanCents: hand?.yuanCents ?? 0,
        keepCents: hand?.keepCents ?? 0,
        jackieIncomeCents,
        jackieGoodsCents,
        jackieBenefitCents: jackieIncomeCents - jackieGoodsCents,
        chuckIncomeCents,
        chuckGoodsCents,
        chuckBenefitCents: chuckIncomeCents - chuckGoodsCents,
        notes: hand?.notes ?? "",
      };
    });
}

export function upsertFreelanceHandIncome(input: {
  month: string;
  usdAmount: number;
  yuanAmount: number;
  keepAmount?: number;
  notes?: string;
}): void {
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    throw new Error("Invalid month");
  }
  if (!Number.isFinite(input.usdAmount) || input.usdAmount < 0) {
    throw new Error("USD amount must be zero or positive");
  }
  if (!Number.isFinite(input.yuanAmount) || input.yuanAmount < 0) {
    throw new Error("Yuan amount must be zero or positive");
  }
  const keepAmount = input.keepAmount ?? 0;
  if (!Number.isFinite(keepAmount)) {
    throw new Error("Keep amount must be a number");
  }

  const usdCents = Math.round(input.usdAmount * 100);
  const yuanCents = Math.round(input.yuanAmount * 100);
  const keepCents = Math.round(keepAmount * 100);
  const notes = input.notes?.trim() || null;
  const existing = execOne<{ id: string }>(
    `SELECT id FROM work_months WHERE month = ?`,
    [input.month],
  );

  if (existing) {
    run(
      `UPDATE work_months
       SET usd_cents = ?, yuan_cents = ?, keep_cents = ?, notes = ?
       WHERE id = ?`,
      [usdCents, yuanCents, keepCents, notes, existing.id],
    );
  } else {
    run(
      `INSERT INTO work_months (id, month, usd_cents, yuan_cents, keep_cents, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uid("wmo"), input.month, usdCents, yuanCents, keepCents, notes],
    );
  }
}
