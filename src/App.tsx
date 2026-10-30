import { useEffect, useState, type CSSProperties } from "react";
import {
  BrowserRouter,
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useAppData } from "@/hooks/useAppData";
import { hasPassword, isSessionUnlocked, lockSession } from "@/lib/auth";
import { Sidebar } from "@/components/shell/Sidebar";
import {
  TopBar,
  clampZoom,
  readStoredZoom,
  writeStoredZoom,
} from "@/components/shell/TopBar";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { TransactionDrawer } from "@/components/transactions/TransactionDrawer";
import { DashboardPage } from "@/pages/DashboardPage";
import { FreelancePage } from "@/pages/FreelancePage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { InsightsPage } from "@/pages/InsightsPage";
import { GoodsPage } from "@/pages/GoodsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LoginPage } from "@/pages/LoginPage";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/goods": "Goods",
  "/freelance": "Freelance",
  "/projects": "Projects",
  "/insights": "Insights",
  "/settings": "Settings",
};

function Shell({
  onLock,
  passwordConfigured,
  onPasswordChanged,
}: {
  onLock: () => void;
  passwordConfigured: boolean;
  onPasswordChanged: () => void;
}) {
  const data = useAppData();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [zoom, setZoom] = useState(() => readStoredZoom());

  function handleZoomChange(next: number) {
    const value = clampZoom(next);
    setZoom(value);
    writeStoredZoom(value);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom((z) => {
          const value = clampZoom(z + 5);
          writeStoredZoom(value);
          return value;
        });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "-") {
        e.preventDefault();
        setZoom((z) => {
          const value = clampZoom(z - 5);
          writeStoredZoom(value);
          return value;
        });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        handleZoomChange(100);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (data.error) {
    return (
      <div className="flex h-full items-center justify-center bg-ivory p-8">
        <div className="max-w-md rounded-2xl border border-coral/30 bg-coral-soft p-6">
          <h1 className="font-display text-xl font-semibold text-coral">
            Could not open ledger
          </h1>
          <p className="mt-2 text-sm text-charcoal-soft">{data.error}</p>
        </div>
      </div>
    );
  }

  if (!data.ready || !data.summary || !data.settings) {
    return (
      <div className="grain flex h-full items-center justify-center">
        <div className="text-center">
          <div className="font-display text-2xl font-semibold text-charcoal">
            LuckyGain
          </div>
          <p className="mt-2 text-sm text-muted">Opening your local ledger…</p>
        </div>
      </div>
    );
  }

  const title = titles[location.pathname] ?? "LuckyGain";
  const isDashboard = location.pathname === "/";
  const isFreelance = location.pathname === "/freelance";
  const isProjects = location.pathname === "/projects";
  const isGoods = location.pathname === "/goods";
  const showLedgerAdd = false;
  const hideGlobalMonth =
    isDashboard ||
    isFreelance ||
    isProjects ||
    isGoods ||
    location.pathname === "/insights" ||
    location.pathname === "/settings";

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar onLock={onLock} passwordConfigured={passwordConfigured} />
      <div className="grain flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          monthLabel={data.summary.monthLabel}
          isPartial={data.summary.isPartialMonth}
          onAdd={() => setDrawerOpen(true)}
          onSearch={() => setSearchOpen(true)}
          onPrevMonth={() => data.shiftMonth(-1)}
          onNextMonth={() => data.shiftMonth(1)}
          showMonthNav={!hideGlobalMonth}
          showAdd={showLedgerAdd}
          zoom={zoom}
          onZoomChange={handleZoomChange}
        />
        <main
          className={
            isProjects
              ? "flex min-h-0 flex-1 flex-col overflow-hidden px-8 py-4"
              : "flex-1 overflow-auto px-8 py-6"
          }
          style={{ zoom: `${zoom}%` } as CSSProperties}
        >
          <div
            className={
              isFreelance || isProjects || isGoods
                ? isProjects
                  ? "flex min-h-0 w-full flex-1 flex-col"
                  : "w-full"
                : "mx-auto w-full max-w-[1480px]"
            }
          >
            <Routes>
              <Route
                path="/"
                element={
                  data.purse ? (
                    <DashboardPage
                      userName={data.userName}
                      purse={data.purse}
                    />
                  ) : null
                }
              />
              <Route
                path="/goods"
                element={
                  data.purse ? (
                    <GoodsPage
                      board={data.purse}
                      onAddCash={data.handleAddPurseCash}
                      onUpdateCash={data.handleUpdatePurseCash}
                      onDeleteCash={data.handleDeletePurseCash}
                      onAddGood={data.handleAddGood}
                      onUpdateGood={data.handleUpdateGood}
                      onDeleteGood={data.handleDeleteGood}
                      onReturnGood={data.handleReturnGood}
                      onUpdateReturnFee={data.handleUpdateReturnFee}
                      onSetGoodEnabled={data.handleSetGoodEnabled}
                    />
                  ) : null
                }
              />
              <Route
                path="/freelance"
                element={
                  data.freelance ? (
                    <FreelancePage board={data.freelance} />
                  ) : null
                }
              />
              <Route
                path="/projects"
                element={
                  <ProjectsPage
                    projects={data.projects}
                    onAddProject={data.handleAddProject}
                    onUpdateProject={data.handleUpdateProject}
                    onAddMilestone={data.handleAddMilestone}
                    onUpdateMilestone={data.handleUpdateMilestone}
                    onToggleReleased={data.handleToggleReleased}
                    onDeleteProject={data.handleDeleteProject}
                    onDeleteMilestone={data.handleDeleteMilestone}
                    onReorderMilestones={data.handleReorderMilestones}
                  />
                }
              />
              <Route
                path="/insights"
                element={
                  data.insights ? (
                    <InsightsPage
                      data={data.insights}
                      onSaveFreelanceHand={data.handleUpsertFreelanceHand}
                      onSaveJackieIncome={data.handleUpsertJackieIncome}
                      onSaveChuckIncome={data.handleUpsertChuckIncome}
                      onAddChuckChannel={data.handleAddChuckChannel}
                      onUpdateChuckChannel={data.handleUpdateChuckChannel}
                      onDeleteChuckChannel={data.handleDeleteChuckChannel}
                    />
                  ) : null
                }
              />
              <Route
                path="/settings"
                element={
                  <SettingsPage
                    snapshot={data.settings}
                    onSaveUsdCnyRate={data.handleSetUsdCnyRate}
                    onPasswordChanged={onPasswordChanged}
                  />
                }
              />
              <Route path="/purse" element={<Navigate to="/goods" replace />} />
              <Route path="/transactions" element={<Navigate to="/" replace />} />
              <Route path="/accounts" element={<Navigate to="/" replace />} />
              <Route path="/budget" element={<Navigate to="/" replace />} />
              <Route path="/attachments" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        projects={data.projects}
        goods={data.purse?.goods ?? []}
      />

      <TransactionDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={data.addTransaction}
        accounts={data.accounts}
        people={data.people}
        expenseCategories={data.expenseCategories}
        incomeCategories={data.incomeCategories}
      />
    </div>
  );
}

export default function App() {
  const [unlocked, setUnlocked] = useState(
    () => !hasPassword() || isSessionUnlocked(),
  );
  const [passwordConfigured, setPasswordConfigured] = useState(() =>
    hasPassword(),
  );

  if (passwordConfigured && !unlocked) {
    return <LoginPage onUnlocked={() => setUnlocked(true)} />;
  }

  // file:// (Electron release) needs hash routes; Vite dev/preview keep browser routes.
  const Router =
    typeof window !== "undefined" && window.location.protocol === "file:"
      ? HashRouter
      : BrowserRouter;

  return (
    <Router>
      <Shell
        passwordConfigured={passwordConfigured}
        onPasswordChanged={() => setPasswordConfigured(hasPassword())}
        onLock={() => {
          lockSession();
          setUnlocked(false);
        }}
      />
    </Router>
  );
}
