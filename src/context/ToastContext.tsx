import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, title?: string) => void;
  toast: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const removeToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Success/info disappear after 6s (paused while hovered or focused); errors stay until closed (WCAG 2.2.1)
  const scheduleDismiss = useCallback((id: string) => {
    timers.current.set(id, setTimeout(() => removeToast(id), 6000));
  }, [removeToast]);

  const pauseDismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const showToast = useCallback((type: ToastType, message: string, title?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message, title }]);
    if (type !== 'error') scheduleDismiss(id);
  }, [scheduleDismiss]);

  const success = useCallback((msg: string, title?: string) => showToast('success', msg, title || 'Sucesso'), [showToast]);
  const error = useCallback((msg: string, title?: string) => showToast('error', msg, title || 'Erro'), [showToast]);
  const info = useCallback((msg: string, title?: string) => showToast('info', msg, title || 'Informação'), [showToast]);
  const toast = useMemo(() => ({ success, error, info }), [success, error, info]);
  const value = useMemo(() => ({ showToast, toast }), [showToast, toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast viewport */}
      <div 
        role="region" 
        aria-label="Notificações" 
        data-modal-keep
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
          {toasts.map((item) => (
            <div
              key={item.id}
              role={item.type === 'error' ? 'alert' : 'status'}
              onMouseEnter={() => item.type !== 'error' && pauseDismiss(item.id)}
              onMouseLeave={() => item.type !== 'error' && scheduleDismiss(item.id)}
              onFocus={() => item.type !== 'error' && pauseDismiss(item.id)}
              onBlur={() => item.type !== 'error' && scheduleDismiss(item.id)}
              className="pointer-events-auto animate-scale-in bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-xl flex items-start gap-3 text-sm"
            >
              {item.type === 'success' && (
                <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-xl shrink-0">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                </div>
              )}
              {item.type === 'error' && (
                <div className="p-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 rounded-xl shrink-0">
                  <AlertCircle className="w-4 h-4" aria-hidden="true" />
                </div>
              )}
              {item.type === 'info' && (
                <div className="p-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
                  <Info className="w-4 h-4" aria-hidden="true" />
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-0.5">
                {item.title && (
                  <p className="font-bold text-gray-900 dark:text-white font-sans text-sm">
                    {item.title}
                  </p>
                )}
                <p className="text-gray-600 dark:text-gray-300 break-words leading-relaxed">
                  {item.message}
                </p>
              </div>

              <button
                onClick={() => removeToast(item.id)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-2 -mr-1.5 -mt-1.5 rounded-lg transition-colors cursor-pointer"
                aria-label="Fechar notificação"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de um ToastProvider');
  }
  return context;
};
