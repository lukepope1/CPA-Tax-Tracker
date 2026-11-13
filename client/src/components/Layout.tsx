import { FormEvent, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

const baseNav = [
  { to: "/", label: "Dashboard" },
  { to: "/clients", label: "Clients" },
  { to: "/due-dates", label: "Due Dates" },
  { to: "/time", label: "Time Entry" },
];

const adminNav = [
  { to: "/firm", label: "Firm" },
  { to: "/billing", label: "Billing" },
  { to: "/reports", label: "Reports" },
  { to: "/admin", label: "Admin" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";

  const items = [...baseNav, ...(isAdmin ? adminNav : []), { to: "/trash", label: "Trash" }];

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate("/login");
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive ? "bg-white text-brand-800 shadow-sm" : "text-brand-100 hover:bg-white/10 hover:text-white"
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
    <div className="min-h-screen bg-[#f1f5f5]">
      {/* Deep brand bar with a gold rule beneath it, so the app has a clear
          identity from the top instead of white-on-white. */}
      <header className="sticky top-0 z-40 bg-brand-700 border-b-[3px] border-accent-400 shadow-md">
        <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-14 gap-3">
          <div className="flex items-center gap-5 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-9 items-center rounded-md bg-white px-1.5 shadow-sm">
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
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <button
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/10"
              onClick={() => setShowPw(true)}
              title={`${user?.name ?? ""} — change password`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-400 text-xs font-bold text-brand-900">
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
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-400 text-xs font-bold text-brand-900">
                  {initials}
                </div>
                <div className="leading-tight text-left min-w-0">
                  <div className="text-sm font-medium text-white truncate">{user?.name}</div>
                  <div className="text-xs text-brand-200">{isAdmin ? "Admin" : "Staff"} · change password</div>
                </div>
              </button>
              <button
                className="shrink-0 rounded-md border border-white/30 px-3 py-1.5 text-sm text-white hover:bg-white/10"
                onClick={handleLogout}
              >
                Log out
              </button>
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
