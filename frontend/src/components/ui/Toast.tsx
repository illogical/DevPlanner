import { useEffect, useSyncExternalStore } from 'react';

interface Toast {
  id: number;
  message: string;
}

let nextId = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(l => l());
}

export function showToast(message: string, durationMs = 2500) {
  const id = ++nextId;
  toasts = [...toasts, { id, message }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    notify();
  }, durationMs);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return toasts;
}

export function ToastContainer() {
  const items = useSyncExternalStore(subscribe, getSnapshot);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
      {items.map(t => (
        <div
          key={t.id}
          className="bg-gray-800 border border-gray-600 text-gray-100 text-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
