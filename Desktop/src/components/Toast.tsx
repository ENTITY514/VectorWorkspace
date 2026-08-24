import { useEffect, useState } from "react";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

let toastCounter = 0;
const listeners: ((toasts: Toast[]) => void)[] = [];
let toastsState: Toast[] = [];

function notifyListeners() {
  listeners.forEach(l => l([...toastsState]));
}

export function showToast(message: string, type: Toast["type"] = "info") {
  const id = String(++toastCounter);
  toastsState = [...toastsState, { id, message, type }];
  notifyListeners();
  setTimeout(() => {
    toastsState = toastsState.filter(t => t.id !== id);
    notifyListeners();
  }, 3000);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>(toastsState);

  useEffect(() => {
    listeners.push(setToasts);
    return () => {
      const idx = listeners.indexOf(setToasts);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => {
            toastsState = toastsState.filter(x => x.id !== t.id);
            notifyListeners();
          }}>×</button>
        </div>
      ))}
    </div>
  );
}
