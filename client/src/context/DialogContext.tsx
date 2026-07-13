import { createContext, useCallback, useContext, useRef, useState } from "react";

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

interface PromptOpts {
  title: string;
  message?: string;
  defaultValue?: string;
  confirmLabel?: string;
  placeholder?: string;
  numeric?: boolean;
}

interface DialogCtx {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
}

const Ctx = createContext<DialogCtx | null>(null);

type State =
  | { kind: "none" }
  | { kind: "confirm"; opts: ConfirmOpts }
  | { kind: "prompt"; opts: PromptOpts; value: string };

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ kind: "none" });
  const resolver = useRef<((v: any) => void) | null>(null);

  const close = (result: any) => {
    resolver.current?.(result);
    resolver.current = null;
    setState({ kind: "none" });
  };

  const confirm = useCallback((opts: ConfirmOpts) => {
    setState({ kind: "confirm", opts });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const prompt = useCallback((opts: PromptOpts) => {
    setState({ kind: "prompt", opts, value: opts.defaultValue ?? "" });
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      {state.kind !== "none" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={() => close(state.kind === "prompt" ? null : false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close(state.kind === "prompt" ? null : false);
            if (e.key === "Enter" && state.kind === "confirm") close(true);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl animate-[fadeIn_0.12s_ease-out] outline-none"
            onMouseDown={(e) => e.stopPropagation()}
            tabIndex={-1}
            ref={(el) => {
              // Focus the panel so Escape/Enter work immediately on confirm dialogs.
              if (el && state.kind === "confirm") el.focus();
            }}
          >
            <h3 className="font-heading text-lg font-semibold text-gray-800">{state.opts.title}</h3>
            {state.opts.message && <p className="mt-1.5 whitespace-pre-line text-sm text-gray-500">{state.opts.message}</p>}

            {state.kind === "prompt" && (
              <input
                autoFocus
                type={state.opts.numeric ? "number" : "text"}
                step={state.opts.numeric ? "0.01" : undefined}
                placeholder={state.opts.placeholder}
                className="mt-4 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={state.value}
                onChange={(e) => setState({ ...state, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") close(state.value);
                  if (e.key === "Escape") close(null);
                }}
              />
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                onClick={() => close(state.kind === "prompt" ? null : false)}
              >
                {state.kind === "confirm" ? state.opts.cancelLabel ?? "Cancel" : "Cancel"}
              </button>
              <button
                className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                  state.kind === "confirm" && state.opts.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-brand-600 hover:bg-brand-700"
                }`}
                onClick={() => close(state.kind === "prompt" ? state.value : true)}
              >
                {state.kind === "confirm" ? state.opts.confirmLabel ?? "Confirm" : state.opts.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}
