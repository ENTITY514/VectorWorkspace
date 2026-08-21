import { useEffect, useState } from "react";

/* Кастомный фрейм окна (Tauri). Область drag-region перетаскивает окно,
 * кнопки управления — no-drag и вызывают нативные API окна.
 * Вне рантайма Tauri (браузер) кнопки управления окном скрываются,
 * чтобы не создавать «мёртвых» элементов. */

export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

async function windowAction(action: "minimize" | "toggleMaximize" | "close") {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    if (action === "minimize") await w.minimize();
    else if (action === "toggleMaximize") await w.toggleMaximize();
    else await w.close();
  } catch (err) {
    /* Чаще всего — отсутствие разрешения в capability-файле Tauri. */
    console.error(`[Titlebar] window.${action} failed:`, err);
  }
}

export function Titlebar() {
  const [title, setTitle] = useState("VectorWorkspace");
  const [tauri] = useState(isTauri);

  useEffect(() => {
    if (!tauri) return;
    let cancelled = false;
    import("@tauri-apps/api/window")
      .then((m) => m.getCurrentWindow().label)
      .then((label) => {
        if (!cancelled && label) setTitle("VectorWorkspace");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tauri]);

  return (
    <div className="titlebar">
      <div className="titlebar-drag" data-tauri-drag-region>
        <strong>{title}</strong>
      </div>
      {tauri && (
        <div className="titlebar-controls no-drag">
          <button type="button" title="Свернуть" aria-label="Свернуть" onClick={() => windowAction("minimize")}>
            —
          </button>
          <button type="button" title="Развернуть" aria-label="Развернуть" onClick={() => windowAction("toggleMaximize")}>
            ▢
          </button>
          <button type="button" className="close" title="Закрыть" aria-label="Закрыть" onClick={() => windowAction("close")}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
