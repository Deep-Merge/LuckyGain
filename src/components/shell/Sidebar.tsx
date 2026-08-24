import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Briefcase,
  FolderKanban,
  LineChart,
  LogOut,
  ShoppingBag,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { publicAsset } from "@/lib/publicAsset";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/goods", label: "Goods", icon: ShoppingBag },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/freelance", label: "Freelance", icon: Briefcase },
  { to: "/insights", label: "Insights", icon: LineChart },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({
  onLock,
  passwordConfigured,
}: {
  onLock: () => void;
  passwordConfigured: boolean;
}) {
  return (
    <aside
      className="relative flex h-full w-[240px] shrink-0 flex-col overflow-x-hidden overflow-y-hidden text-sidebar-text"
      style={{
        background:
          "linear-gradient(180deg, #fbf6ec 0%, #f5eee2 45%, #f0e7d6 100%)",
        boxShadow: "inset -1px 0 0 rgb(193 154 85 / 0.2)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 95% 50% at 15% 0%, rgb(193 154 85 / 0.14), transparent 55%), radial-gradient(ellipse 70% 40% at 90% 100%, rgb(168 130 61 / 0.08), transparent 58%)",
        }}
      />

      <div className="relative z-[1] px-5 pt-6 pb-7">
        <div className="flex items-center gap-3.5">
          <img
            src={publicAsset("icon.png")}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 object-contain drop-shadow-[0_6px_14px_rgba(181,139,67,0.22)]"
            draggable={false}
          />
          <div className="min-w-0 pt-0.5">
            <div className="font-display text-[19px] font-semibold tracking-tight text-charcoal">
              LuckyGain
            </div>
            <div className="mt-1 text-[9.5px] font-medium tracking-[0.14em] text-gold uppercase">
              Local ledger
            </div>
          </div>
        </div>
      </div>

      <nav className="relative z-[1] min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn("sidebar-nav-link", isActive && "is-active")
            }
          >
            {({ isActive }) => (
              <>
                <span aria-hidden className="sidebar-nav-link__bar" />
                <item.icon
                  className="sidebar-nav-link__icon"
                  strokeWidth={isActive ? 2.15 : 1.9}
                />
                <span className="sidebar-nav-link__label">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="relative z-[1] mt-auto w-full shrink-0 px-0 pb-0 pt-1">
        <img
          src={publicAsset("sidebar-mascot.png")}
          alt=""
          className="relative left-1/2 mx-auto mb-3 block w-full max-w-full origin-bottom -translate-x-1/2 scale-x-[1.3] scale-y-[1.4] select-none object-contain object-bottom"
          draggable={false}
        />
        <p className="px-3 pb-1 text-center text-[10px] font-semibold tracking-[0.2em] text-gold uppercase">
          Make your luck
        </p>
      </div>

      <div className="relative z-[1] border-t border-[rgb(193_154_85_/_0.22)] px-3 py-3">
        {passwordConfigured ? (
          <button type="button" onClick={onLock} className="sidebar-nav-link">
            <span aria-hidden className="sidebar-nav-link__bar" />
            <LogOut className="sidebar-nav-link__icon" strokeWidth={1.9} />
            <span className="sidebar-nav-link__label">Log out</span>
          </button>
        ) : (
          <p className="px-3.5 py-2 text-[11px] leading-relaxed text-[#9a8768]">
            Set a password in Settings to protect this ledger.
          </p>
        )}
      </div>
    </aside>
  );
}
