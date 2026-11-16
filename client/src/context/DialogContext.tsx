import { createContext, useCallback, useContext, useRef, useState } from "react";
import { X } from "lucide-react";

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

export interface ChooseOption {
  id: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}

interface ChooseOpts {
  title: string;
  message?: string;
  options: ChooseOption[];
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Optional middle button that goes ahead with nothing ticked (resolves []).
   * Keeps "do it, but none of these" distinct from Cancel (resolves null), so
   * backing out never applies anything.
   */
  altLabel?: string;
}

interface DialogCtx {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
  /** Checkbox list. Resolves to the checked ids, [] for altLabel, or null if cancelled. */
  choose: (opts: ChooseOpts) => Promise<string[] | null>;
}

const Ctx = createContext<DialogCtx | null>(null);

type State =
  | { kind: "none" }
  | { kind: "confirm"; opts: ConfirmOpts }
  | { kind: "prompt"; opts: PromptOpts; value: string }
  | { kind: "choose"; opts: ChooseOpts; checked: string[] };

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

  const choose = useCallback((opts: ChooseOpts) => {
    setState({
      kind: "choose",
      opts,
      checked: opts.options.filter((o) => o.defaultChecked !== false).map((o) => o.id),
    });
    return new Promise<string[] | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // Cancelling means "don't do anything": null for prompt/choose, false for confirm.
  const cancelValue = () => (state.kind === "prompt" || state.kind === "choose" ? null : false);

  return (
    <Ctx.Provider value={{ confirm, prompt, choose }}>
      {children}
      {state.kind !== "none" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={() => close(cancelValue())}
          onKeyDown={(e) => {
            if (e.key === "Escape") close(cancelValue());
            if (e.key === "Enter" && state.kind === "confirm") close(true);
            if (e.key === "Enter" && state.kind === "choose") close(state.checked);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl animate-[fadeIn_0.12s_ease-out] outline-none"
            onMouseDown={(e) => e.stopPropagation()}
            tabIndex={-1}
            ref={(el) => {
              // Focus the panel so Escape/Enter work immediately on confirm dialogs.
              if (el && (state.kind === "confirm" || state.kind === "choose")) el.focus();
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-heading text-lg font-bold text-brand-800">{state.opts.title}</h3>
              {/* Same as Cancel: closes without doing anything. */}
              <button
                type="button"
                aria-label="Close"
                title="Close (Esc)"
                className="-mr-2 -mt-1 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                onClick={() => close(cancelValue())}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
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

            {state.kind === "choose" && (
              <div className="mt-4 max-h-64 space-y-1 overflow-y-auto">
                {state.opts.options.map((o) => {
                  const isChecked = state.checked.includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={isChecked}
                        onChange={(e) => {
                          const nowChecked = e.target.checked;
                          // Functional update: two quick clicks batch into one
                          // render, and spreading stale state would drop one.
                          setState((s) =>
                            s.kind !== "choose"
                              ? s
                              : {
                                  ...s,
                                  checked: nowChecked
                                    ? [...s.checked, o.id]
                                    : s.checked.filter((id) => id !== o.id),
                                }
                          );
                        }}
                      />
                      <span className="text-sm">
                        <span className="font-medium text-gray-800">{o.label}</span>
                        {o.hint && <span className="ml-1.5 text-gray-500">{o.hint}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                onClick={() => close(cancelValue())}
              >
                {state.kind === "confirm" || state.kind === "choose"
                  ? state.opts.cancelLabel ?? "Cancel"
                  : "Cancel"}
              </button>
              {state.kind === "choose" && state.opts.altLabel && (
                <button
                  className="rounded-md border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                  onClick={() => close([])}
                >
                  {state.opts.altLabel}
                </button>
              )}
              <button
                className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                  state.kind === "confirm" && state.opts.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-brand-600 hover:bg-brand-700"
                }`}
                onClick={() =>
                  close(state.kind === "prompt" ? state.value : state.kind === "choose" ? state.checked : true)
                }
              >
                {state.kind === "prompt"
                  ? state.opts.confirmLabel ?? "OK"
                  : state.opts.confirmLabel ?? "Confirm"}
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
