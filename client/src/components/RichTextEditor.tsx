import { useEffect, useRef, useState } from "react";

const BTN =
  "px-2 py-1 text-sm rounded hover:bg-gray-200 text-gray-700 leading-none min-w-[1.9rem]";

const TEXT_COLORS = [
  { name: "Default", value: "#1f2937" },
  { name: "Red", value: "#dc2626" },
  { name: "Orange", value: "#d97706" },
  { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#7c3aed" },
];

function looksLikeHtml(s: string) {
  return /<[a-z][\s\S]*>/i.test(s);
}

export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  minHeight = 96,
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur?: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showColors, setShowColors] = useState(false);

  // Sync external value into the editor only when it differs from what's already
  // shown (prevents wiping the caret position while the user is typing).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const incoming = value || "";
    if (el.innerHTML !== incoming) {
      el.innerHTML = looksLikeHtml(incoming) ? incoming : incoming.replace(/\n/g, "<br>");
    }
  }, [value]);

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function exec(command: string, arg?: string) {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, arg);
    emit();
    ref.current?.focus();
  }

  /**
   * Undo/redo run through execCommand like every other button here, so they
   * share the one history the browser already keeps for typing and formatting.
   * A separate stack would fight native Ctrl+Z and undo twice per press.
   *
   * Focus first: the command applies to the focused editable, and clicking a
   * toolbar button does not move focus (see the onMouseDown handlers).
   */
  function history(command: "undo" | "redo") {
    ref.current?.focus();
    document.execCommand(command);
    emit();
  }

  // Inside a bullet/numbered list, Tab makes a sub-bullet (indent) and
  // Shift+Tab promotes it back out (outdent).
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const sel = window.getSelection();
    let node: Node | null = sel?.anchorNode ?? null;
    let inList = false;
    while (node && node !== ref.current) {
      if (node.nodeName === "LI") {
        inList = true;
        break;
      }
      node = node.parentNode;
    }
    if (!inList) return; // let Tab move focus normally when not in a list
    e.preventDefault();
    exec(e.shiftKey ? "outdent" : "indent");
  }

  return (
    <div className="rounded-md border border-gray-300 focus-within:ring-1 focus-within:ring-brand-500">
      {/* Static rather than sticky: these editors sit inline in a card and are
          only a few lines tall, so the toolbar never scrolls out of reach. */}
      <div className="flex flex-wrap items-center gap-1 rounded-t-md border-b border-gray-200 bg-gray-50 px-1 py-1">
        <button
          type="button"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => history("undo")}
          className={BTN}
        >
          ↶
        </button>
        <button
          type="button"
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => history("redo")}
          className={BTN}
        >
          ↷
        </button>
        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-gray-300" />
        <button type="button" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")} className={BTN}>
          <b>B</b>
        </button>
        <button type="button" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")} className={BTN}>
          <i>I</i>
        </button>
        <button type="button" title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")} className={BTN}>
          <u>U</u>
        </button>
        <button
          type="button"
          title="Highlight"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("hiliteColor", "#fde047")}
          className={BTN}
        >
          <span style={{ backgroundColor: "#fde047", padding: "0 2px", borderRadius: 2 }}>H</span>
        </button>
        <div className="relative">
          <button
            type="button"
            title="Text color"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowColors((s) => !s)}
            className={BTN}
          >
            <span className="border-b-2 border-red-500 font-semibold">A</span>
          </button>
          {showColors && (
            <div className="absolute left-0 top-full mt-1 z-30 flex gap-1 bg-white border border-gray-200 rounded-md shadow-lg p-1.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.name}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    exec("foreColor", c.value);
                    setShowColors(false);
                  }}
                  className="h-5 w-5 rounded-full border border-gray-200 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          )}
        </div>
        <button type="button" title="Bullet list" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertUnorderedList")} className={BTN}>
          •
        </button>
        <button type="button" title="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertOrderedList")} className={BTN}>
          1.
        </button>
        <button type="button" title="Outdent (Shift+Tab)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("outdent")} className={BTN}>
          ⇤
        </button>
        <button type="button" title="Indent (Tab)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("indent")} className={BTN}>
          ⇥
        </button>
        <button
          type="button"
          title="Clear formatting"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("removeFormat")}
          className={BTN + " text-xs"}
        >
          clear
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onKeyDown={onKeyDown}
        onBlur={() => onBlur && ref.current && onBlur(ref.current.innerHTML)}
        data-placeholder={placeholder}
        className="rte px-3 py-2 text-sm text-gray-800 focus:outline-none"
        style={{ minHeight }}
      />
    </div>
  );
}
