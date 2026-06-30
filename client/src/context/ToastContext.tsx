import { createContext, useCallback, useContext, useState } from "react";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastCtx {
  toast: (message: string, tone?: ToastTone) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`min-w-[220px] max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg border animate-[fadeIn_0.15s_ease-out] ${
              t.tone === "success"
                ? "bg-white border-green-200 text-green-800"
                : t.tone === "error"
                ? "bg-white border-red-200 text-red-700"
                : "bg-white border-gray-200 text-gray-700"
            }`}
          >
            <span className="mr-2">{t.tone === "success" ? "✓" : t.tone === "error" ? "⚠" : "ℹ"}</span>
            {t.message}
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
