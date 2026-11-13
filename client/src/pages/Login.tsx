import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "../components/ui";
import { Lock, LogIn, Mail, TriangleAlert, UserRound } from "lucide-react";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error?.formErrors?.[0] || err.response?.data?.error || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Matches the app it opens into: the deep-teal header colour as the backdrop,
  // with the gold rule across the top of the card.
  const input =
    "w-full rounded-md border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400";

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-4 py-10 flex items-center justify-center">
      {/* soft shapes behind the card so the backdrop isn't a flat fill */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-accent-400/10 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-white/5 blur-2xl" />

      <div className="relative w-full max-w-sm">
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="h-1.5 bg-gradient-to-r from-accent-300 via-accent-400 to-accent-500" aria-hidden="true" />
          <div className="p-8">
            <img
              src="https://img1.wsimg.com/isteam/ip/eeaa1e80-9acd-4ee4-b5f3-23c726733c08/balancepointlogo-gradientwithname.png/:/rs=h:56,cg:true,m"
              alt="BalancePoint Advisors"
              className="mb-5 h-14 w-auto"
            />
            <h1 className="font-heading text-2xl font-bold text-brand-800">Tax Tracker</h1>
            <p className="mt-1 mb-6 text-sm text-gray-600">
              {mode === "login" ? "Sign in to your account" : "Create the first admin account"}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Name</label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" aria-hidden="true" />
                    <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Email</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" aria-hidden="true" />
                  <input
                    type="email"
                    autoComplete="email"
                    className={input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" aria-hidden="true" />
                  <input
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className={input}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
              </div>
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
              >
                {loading ? <Spinner className="text-white" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
                {mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
            <button
              className="mt-5 text-sm font-medium text-brand-600 hover:text-brand-800 hover:underline"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Need to set up the first admin account?" : "Back to sign in"}
            </button>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-brand-200">BalancePoint Advisors · Tax Tracker</p>
      </div>
    </div>
  );
}
