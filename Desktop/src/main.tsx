import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

/* Tauri: глушим нативное контекстное меню (оставляем для полей ввода,
 * чтобы работал вставка/выделение). */
if ("__TAURI_INTERNALS__" in window) {
  document.addEventListener("contextmenu", (e) => {
    const t = e.target as HTMLElement | null;
    const editable =
      !!t &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable);
    if (!editable) e.preventDefault();
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
