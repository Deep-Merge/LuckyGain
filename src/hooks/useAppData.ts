import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { addMonths, startOfMonth } from "date-fns";
import { getDbVersion, initDatabase, subscribeDb } from "@/lib/db/client";
import {
  cashflowSeries,
  countReviewIssues,
  createTransaction,
  dailySparkline,
  getDashboardSummary,
  getUserName,
  listAccounts,
  listCategories,
  listPeople,
  listTransactions,
  listTransactionsForMonth,
  softDeleteTransaction,
  spendingByPerson,
  topExpenseCategories,
  type NewTransactionInput,
} from "@/lib/db/queries";
import {
  getBudgetForMonth,
  getFreelanceBoard,
  getInsights,
  getProjectList,
  getSettingsSnapshot,
  listAttachments,
  setUsdCnyRate,
} from "@/lib/db/domain";
import {
  addFreelanceProject,
  addMilestone,
  setMilestoneReleased,
  deleteMilestone,
  deleteProject,
  reorderProjectMilestones,
  updateFreelanceProject,
  updateMilestone,
  upsertFreelanceHandIncome,
} from "@/lib/db/freelance";
import {
  addChuckChannelEntry,
  updateChuckChannelEntry,
  deleteChuckChannelEntry,
} from "@/lib/db/chuckChannel";
import {
  addPurseCash,
  addGood,
  deleteGood,
  deletePurseCashEntry,
  getPurseBoard,
  returnGood,
  setGoodEnabled,
  updateGood,
  updateGoodReturnFee,
  updatePurseCashEntry,
  upsertJackieMonthIncome,
  upsertChuckMonthIncome,
  type GoodsCategory,
  type GoodsForWhom,
} from "@/lib/db/purse";

function useDbVersion(): number {
  return useSyncExternalStore(subscribeDb, getDbVersion, () => 0);
}

export function useAppData() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthAnchor, setMonthAnchor] = useState(() =>
    startOfMonth(new Date()),
  );
  const version = useDbVersion();
  const light = useLocation().pathname === "/settings";

  useEffect(() => {
    let cancelled = false;
    initDatabase()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to open database",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshKey = ready ? version : 0;
  void refreshKey;

  const summary = ready ? getDashboardSummary(monthAnchor) : null;
  const accounts = ready ? listAccounts() : [];
  const people = ready ? listPeople() : [];
  const transactions = ready && !light ? listTransactions(80) : [];
  const monthTransactions =
    ready && !light ? listTransactionsForMonth(monthAnchor) : [];
  const expenseCategories = ready && !light ? listCategories("expense") : [];
  const incomeCategories = ready && !light ? listCategories("income") : [];
  const personSpend = ready && !light ? spendingByPerson(monthAnchor) : [];
  const cashflow = ready && !light ? cashflowSeries(monthAnchor) : [];
  const reviewCount = ready && !light ? countReviewIssues() : 0;
  const userName = ready ? getUserName() : "Peter";
  const incomeSpark =
    ready && !light ? dailySparkline(monthAnchor, ["income"]) : [];
  const expenseSpark =
    ready && !light ? dailySparkline(monthAnchor, ["expense", "fee"]) : [];
  const topCategories =
    ready && !light ? topExpenseCategories(monthAnchor) : [];
  const budget = ready && !light ? getBudgetForMonth(monthAnchor) : null;
  const freelance = ready && !light ? getFreelanceBoard() : null;
  const projects = ready && !light ? getProjectList() : [];
  const insights = ready && !light ? getInsights(monthAnchor) : null;
  const purse = ready && !light ? getPurseBoard() : null;
  const attachments = ready && !light ? listAttachments() : [];
  const settings = ready ? getSettingsSnapshot() : null;

  const addTransaction = useCallback((input: NewTransactionInput) => {
    createTransaction(input);
  }, []);

  const removeTransaction = useCallback((id: string) => {
    softDeleteTransaction(id);
  }, []);

  const shiftMonth = useCallback((delta: number) => {
    setMonthAnchor((current) => startOfMonth(addMonths(current, delta)));
  }, []);

  const handleAddProject = useCallback(
    (input: {
      month?: string;
      clientName: string;
      projectName: string;
      description?: string;
      startDate?: string | null;
      finishDate?: string | null;
      projectType: "Kareem" | "Greg" | "Binance";
    }) => {
      addFreelanceProject(input);
    },
    [],
  );

  const handleAddMilestone = useCallback(
    (input: {
      projectId: string;
      month: string;
      title?: string;
      amountYuan: number;
      transferFeePercent: number;
      accountFeePercent: number;
      feeCompound?: boolean;
    }) => {
      addMilestone(input);
    },
    [],
  );

  const handleToggleReleased = useCallback(
    (id: string, released: boolean, releasedAt?: string | null) => {
      return setMilestoneReleased(id, released, releasedAt);
    },
    [],
  );

  const handleDeleteProject = useCallback((projectId: string) => {
    deleteProject(projectId);
  }, []);

  const handleDeleteMilestone = useCallback((id: string) => {
    deleteMilestone(id);
  }, []);

  const handleReorderMilestones = useCallback(
    (projectId: string, orderedIds: string[]) => {
      reorderProjectMilestones(projectId, orderedIds);
    },
    [],
  );

  const handleUpdateProject = useCallback(
    (input: {
      projectId: string;
      clientName: string;
      projectName: string;
      description?: string;
      startDate?: string | null;
      finishDate?: string | null;
      projectType?: "Kareem" | "Greg" | "Binance";
    }) => {
      updateFreelanceProject(input);
    },
    [],
  );

  const handleUpdateMilestone = useCallback(
    (input: {
      id: string;
      title?: string;
      amountYuan: number;
      transferFeePercent: number;
      accountFeePercent: number;
      feeCompound?: boolean;
      workMonth?: string;
      releasedAt?: string | null;
    }) => {
      updateMilestone(input);
    },
    [],
  );

  const handleUpsertFreelanceHand = useCallback(
    (input: {
      month: string;
      usdAmount: number;
      yuanAmount: number;
      keepAmount?: number;
      notes?: string;
    }) => {
      upsertFreelanceHandIncome(input);
    },
    [],
  );

  const handleUpsertJackieIncome = useCallback(
    (input: { month: string; amountYuan: number }) => {
      upsertJackieMonthIncome(input);
    },
    [],
  );

  const handleUpsertChuckIncome = useCallback(
    (input: { month: string; amountYuan: number }) => {
      upsertChuckMonthIncome(input);
    },
    [],
  );

  const handleAddChuckChannel = useCallback(
    (input: {
      occurredOn: string;
      givenUsd: number;
      realIncomeUsd: number;
      note?: string;
    }) => {
      addChuckChannelEntry(input);
    },
    [],
  );

  const handleUpdateChuckChannel = useCallback(
    (input: {
      id: string;
      occurredOn: string;
      givenUsd: number;
      realIncomeUsd: number;
      note?: string | null;
    }) => {
      updateChuckChannelEntry(input);
    },
    [],
  );

  const handleDeleteChuckChannel = useCallback((id: string) => {
    deleteChuckChannelEntry(id);
  }, []);

  const handleSetUsdCnyRate = useCallback((rate: number) => {
    setUsdCnyRate(rate);
  }, []);

  const handleAddPurseCash = useCallback(
    (input: {
      kind: "deposit" | "withdraw";
      amountYuan: number;
      occurredOn?: string;
      note?: string;
    }) => {
      addPurseCash(input);
    },
    [],
  );

  const handleUpdatePurseCash = useCallback(
    (input: {
      id: string;
      amountYuan: number;
      occurredOn: string;
      note?: string | null;
    }) => {
      updatePurseCashEntry(input);
    },
    [],
  );

  const handleDeletePurseCash = useCallback((id: string) => {
    deletePurseCashEntry(id);
  }, []);

  const handleAddGood = useCallback(
    (input: {
      title: string;
      priceYuan: number;
      purchasedOn?: string;
      forWhom: GoodsForWhom;
      category: GoodsCategory;
      url?: string | null;
      notes?: string | null;
      imageDataUrl?: string | null;
      enabled?: boolean;
      comment?: string | null;
      calledPriceYuan?: number | null;
    }) => {
      addGood(input);
    },
    [],
  );

  const handleUpdateGood = useCallback(
    (input: {
      id: string;
      title: string;
      priceYuan: number;
      purchasedOn: string;
      forWhom: GoodsForWhom;
      category: GoodsCategory;
      url?: string | null;
      notes?: string | null;
      imageDataUrl?: string | null;
      enabled?: boolean;
      comment?: string | null;
      calledPriceYuan?: number | null;
    }) => {
      updateGood(input);
    },
    [],
  );

  const handleDeleteGood = useCallback((id: string) => {
    deleteGood(id);
  }, []);

  const handleReturnGood = useCallback(
    (input: { id: string; feeYuan: number; returnedOn?: string }) => {
      returnGood(input);
    },
    [],
  );

  const handleUpdateReturnFee = useCallback(
    (input: { id: string; feeYuan: number; returnedOn?: string }) => {
      updateGoodReturnFee(input);
    },
    [],
  );

  const handleSetGoodEnabled = useCallback((id: string, enabled: boolean) => {
    setGoodEnabled(id, enabled);
  }, []);

  return {
    ready,
    error,
    monthAnchor,
    shiftMonth,
    summary,
    accounts,
    people,
    transactions,
    monthTransactions,
    expenseCategories,
    incomeCategories,
    personSpend,
    cashflow,
    reviewCount,
    userName,
    incomeSpark,
    expenseSpark,
    topCategories,
    budget,
    freelance,
    projects,
    insights,
    purse,
    attachments,
    settings,
    addTransaction,
    removeTransaction,
    handleAddProject,
    handleAddMilestone,
    handleToggleReleased,
    handleDeleteProject,
    handleDeleteMilestone,
    handleReorderMilestones,
    handleUpdateProject,
    handleUpdateMilestone,
    handleUpsertFreelanceHand,
    handleUpsertJackieIncome,
    handleUpsertChuckIncome,
    handleAddChuckChannel,
    handleUpdateChuckChannel,
    handleDeleteChuckChannel,
    handleSetUsdCnyRate,
    handleAddPurseCash,
    handleUpdatePurseCash,
    handleDeletePurseCash,
    handleAddGood,
    handleUpdateGood,
    handleDeleteGood,
    handleReturnGood,
    handleUpdateReturnFee,
    handleSetGoodEnabled,
  };
}
