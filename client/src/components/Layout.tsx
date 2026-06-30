import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";

  const items = [...baseNav, ...(isAdmin ? adminNav : []), { to: "/trash", label: "Trash" }];

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
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
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {initials}
              </div>
              <div className="leading-tight">
                <div className="text-sm font-medium text-gray-800">{user?.name}</div>
                <div className="text-xs text-gray-400">{isAdmin ? "Admin" : "Staff"}</div>
              </div>
            </div>
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
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
