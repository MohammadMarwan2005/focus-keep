"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastAction = { label: string; onClick: () => void };
type ToastItem = { id: number; message: string; action?: ToastAction; duration: number };
type ToastApi = { show: (message: string, opts?: { action?: ToastAction; duration?: number }) => void };

const ToastContext = createContext<ToastApi>({ show: () => {} });
export const useToast = () => useContext(ToastContext);

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastApi["show"]>(
    (message, opts = {}) => {
      const id = ++idRef.current;
      const duration = opts.duration ?? 2500;
      setToasts((t) => [...t, { id, message, action: opts.action, duration }]);
      setTimeout(() => remove(id), duration);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-xl bg-ink text-bg shadow-pop ps-4 pe-2 py-1 text-sm max-w-[92vw]"
          >
            <span className="min-w-0 py-1.5" dir="auto">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  remove(t.id);
                }}
                className="shrink-0 inline-flex items-center min-h-11 px-3 rounded-lg font-medium text-accent hover:bg-white/10 transition"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
