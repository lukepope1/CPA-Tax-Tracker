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
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-5 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <img
                src="https://img1.wsimg.com/isteam/ip/eeaa1e80-9acd-4ee4-b5f3-23c726733c08/balancepointlogo-gradientwithname.png/:/rs=h:32,cg:true,m"
                alt="BalancePoint Advisors"
                className="h-8 w-auto"
              />
              <span className="font-heading font-bold text-brand-600 hidden lg:inline">BalancePoint Advisors</span>
            </div>
            <nav className="flex gap-1 overflow-x-auto">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`
                  }
                  end={item.to === "/"}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              className="hidden sm:flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-gray-50"
              onClick={() => setShowPw(true)}
              title="Change password"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {initials}
              </div>
              <div className="leading-tight text-left">
                <div className="text-sm font-medium text-gray-800">{user?.name}</div>
                <div className="text-xs text-gray-400">{isAdmin ? "Admin" : "Staff"} · change password</div>
              </div>
            </button>
            <button
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Log out
            </button>
          </div>
        </div>
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
            <h3 className="font-heading text-lg font-semibold text-gray-800">Change Password</h3>
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
