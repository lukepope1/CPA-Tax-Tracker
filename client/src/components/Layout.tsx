import { FormEvent, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CalendarClock,
  Clock,
  LayoutDashboard,
  Moon,
  Receipt,
  Settings,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../lib/theme";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

const baseNav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/due-dates", label: "Due Dates", icon: CalendarClock },
  { to: "/time", label: "Time Entry", icon: Clock },
];

const adminNav = [
  { to: "/firm", label: "Firm", icon: Building2 },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin", label: "Admin", icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";

  const items = [...baseNav, ...(isAdmin ? adminNav : []), { to: "/trash", label: "Trash", icon: Trash2 }];

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const ThemeIcon = theme === "dark" ? Sun : Moon;
  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate("/login");
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive ? "nav-active keep-white bg-white text-brand-800 shadow-sm" : "text-brand-100 hover:bg-white/10 hover:text-white"
    }`;

  // Change-password modal state
  const [showPw, setShowPw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  function closePw() {
    setShowPw(false);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setPwError(null);
  }

  async function submitPw(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (newPw.length < 8) return setPwError("New password must be at least 8 characters.");
    if (newPw !== confirmPw) return setPwError("New passwords do not match.");
    setPwSaving(true);
    try {
      await api.post("/auth/change-password", { currentPassword: currentPw, newPassword: newPw });
      closePw();
      toast("Password changed.");
    } catch (err: any) {
      setPwError(err.response?.data?.error || "Could not change password.");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-page">
      {/* Deep brand bar with a gold rule beneath it, so the app has a clear
          identity from the top instead of white-on-white. */}
      <header className="sticky top-0 z-40 bg-brand-700 border-b-[3px] border-accent-400 shadow-md">
        <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-14 gap-3">
          <div className="flex items-center gap-5 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              {/* keep-white: the dark logo mark needs a white tile in dark mode too. */}
              <div className="keep-white flex h-9 items-center rounded-md bg-white px-1.5 shadow-sm">
              <img
                src="https://img1.wsimg.com/isteam/ip/eeaa1e80-9acd-4ee4-b5f3-23c726733c08/balancepointlogo-gradientwithname.png/:/rs=h:32,cg:true,m"
                alt="BalancePoint Advisors"
                className="h-7 w-auto"
              />
              </div>
              <span className="font-heading font-bold text-white hidden xl:inline">BalancePoint Advisors</span>
            </div>
            {/* Inline links only once there's room for all of them. Below that a
                horizontally scrolling strip hid half the menu behind a thin
                scrollbar, so narrower screens get the menu button instead. */}
            <nav className="hidden lg:flex gap-1">
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} className={navClass} end={item.to === "/"}>
                  {/* Labels only here: with the wordmark, account and theme
                      toggle beside them, nine links leave no room for icons
                      (icons pushed "Trash" under the account area at 1536px).
                      The menu used on smaller screens shows icons. */}
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              title={themeLabel}
              aria-label={themeLabel}
              className="flex h-9 w-9 items-center justify-center rounded-md text-brand-100 hover:bg-white/10 hover:text-white"
            >
              <ThemeIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/10"
              onClick={() => setShowPw(true)}
              title={`${user?.name ?? ""} — change password`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-400 text-xs font-bold text-[#172626]">
                {initials}
              </div>
              {/* Name collapses to just the avatar until there's space for it. */}
              <div className="hidden xl:block leading-tight text-left">
                <div className="text-sm font-medium text-white">{user?.name}</div>
                <div className="text-xs text-brand-200">{isAdmin ? "Admin" : "Staff"} · change password</div>
              </div>
            </button>
            <button
              className="rounded-md border border-white/30 px-3 py-1.5 text-sm text-white hover:bg-white/10"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
          <button
            className="lg:hidden flex items-center gap-2 rounded-md border border-white/30 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Menu"
          >
            <span aria-hidden="true" className="text-base leading-none">{menuOpen ? "✕" : "☰"}</span>
            Menu
          </button>
        </div>

        {menuOpen && (
          <div className="lg:hidden border-t border-white/10 bg-brand-800">
            <nav className="max-w-[1400px] mx-auto px-4 py-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={navClass}
                  end={item.to === "/"}
                  onClick={() => setMenuOpen(false)}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="max-w-[1400px] mx-auto px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
              <button
                className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/10 min-w-0"
                onClick={() => {
                  setMenuOpen(false);
                  setShowPw(true);
                }}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-400 text-xs font-bold text-[#172626]">
                  {initials}
                </div>
                <div className="leading-tight text-left min-w-0">
                  <div className="text-sm font-medium text-white truncate">{user?.name}</div>
                  <div className="text-xs text-brand-200">{isAdmin ? "Admin" : "Staff"} · change password</div>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={themeLabel}
                  aria-label={themeLabel}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-white/30 text-white hover:bg-white/10"
                >
                  <ThemeIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  className="shrink-0 rounded-md border border-white/30 px-3 py-1.5 text-sm text-white hover:bg-white/10"
                  onClick={handleLogout}
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        )}
      </header>
      <main className="max-w-[1400px] mx-auto px-4 py-6">
        <Outlet />
      </main>

      {showPw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={closePw}>
          <form
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl animate-[fadeIn_0.12s_ease-out] space-y-4"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={submitPw}
          >
            <h3 className="font-heading text-lg font-bold text-brand-800">Change Password</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
              <input type="password" autoFocus className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input type="password" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <input type="password" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required minLength={8} />
            </div>
            {pwError && <p className="text-sm text-red-600">{pwError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={closePw}>
                Cancel
              </button>
              <button type="submit" disabled={pwSaving} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {pwSaving ? "Saving…" : "Change Password"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
