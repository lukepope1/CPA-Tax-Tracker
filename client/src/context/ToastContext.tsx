import { createContext, useCallback, useContext, useState } from "react";
import { X } from "lucide-react";

type ToastTone = "success" | "error" | "info";

/** A button inside the toast, e.g. Undo. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastCtx {
  toast: (message: string, tone?: ToastTone, action?: ToastAction) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

// A toast with a button stays longer, so there's time to read it and act.
const PLAIN_MS = 3500;
const ACTION_MS = 10000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "success", action?: ToastAction) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, tone, action }]);
      setTimeout(() => dismiss(id), action ? ACTION_MS : PLAIN_MS);
    },
    [dismiss]
  );

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`flex min-w-[220px] max-w-sm items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-lg border animate-[fadeIn_0.15s_ease-out] ${
              t.tone === "success"
                ? "bg-white border-green-200 text-green-800"
                : t.tone === "error"
                ? "bg-white border-red-200 text-red-700"
                : "bg-white border-gray-200 text-gray-700"
            }`}
          >
            <span className="flex-1">
              <span className="mr-2">{t.tone === "success" ? "✓" : t.tone === "error" ? "⚠" : "ℹ"}</span>
              {t.message}
            </span>
            {t.action && (
              <button
                className="shrink-0 rounded-md border border-brand-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                onClick={() => {
                  dismiss(t.id);
                  t.action!.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              onClick={() => dismiss(t.id)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fail soft if provider is missing — never crash a page over a toast.
    return { toast: () => {} };
  }
  return ctx;
}
