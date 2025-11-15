import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  XCircle, 
  X, 
  AlertTriangle,
  Clock,
  Wifi,
  WifiOff
} from 'lucide-react';
import { clsx } from 'clsx';

// Toast types
export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'offline';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  persistent?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
  metadata?: Record<string, any>;
}

// Toast configuration
const TOAST_CONFIG = {
  success: {
    icon: CheckCircle2,
    bgColor: 'bg-green-50 border-green-200',
    iconColor: 'text-green-600',
    titleColor: 'text-green-800',
    messageColor: 'text-green-700',
    defaultDuration: 4000,
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-red-50 border-red-200',
    iconColor: 'text-red-600',
    titleColor: 'text-red-800',
    messageColor: 'text-red-700',
    defaultDuration: 6000,
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-50 border-yellow-200',
    iconColor: 'text-yellow-600',
    titleColor: 'text-yellow-800',
    messageColor: 'text-yellow-700',
    defaultDuration: 5000,
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50 border-blue-200',
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-800',
    messageColor: 'text-blue-700',
    defaultDuration: 4000,
  },
  loading: {
    icon: Clock,
    bgColor: 'bg-gray-50 border-gray-200',
    iconColor: 'text-gray-600',
    titleColor: 'text-gray-800',
    messageColor: 'text-gray-700',
    defaultDuration: 0, // Persistent by default
  },
  offline: {
    icon: WifiOff,
    bgColor: 'bg-orange-50 border-orange-200',
    iconColor: 'text-orange-600',
    titleColor: 'text-orange-800',
    messageColor: 'text-orange-700',
    defaultDuration: 0, // Persistent by default
  },
} as const;

// Toast context
interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  updateToast: (id: string, updates: Partial<Toast>) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Toast item component
interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [progress, setProgress] = useState(100);

  const config = TOAST_CONFIG[toast.type];
  const Icon = config.icon;

  // Auto-dismiss timer
  useEffect(() => {
    if (toast.persistent || toast.duration === 0) return;

    const duration = toast.duration || config.defaultDuration;
    const interval = 100;
    const decrementAmount = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev - decrementAmount;
        if (newProgress <= 0) {
          clearInterval(timer);
          handleRemove();
          return 0;
        }
        return newProgress;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [toast.persistent, toast.duration, config.defaultDuration]);

  // Show animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleRemove = () => {
    if (isRemoving) return;
    
    setIsRemoving(true);
    setIsVisible(false);
    
    setTimeout(() => {
      onRemove(toast.id);
    }, 200);
  };

  const handleMouseEnter = () => {
    if (!toast.persistent) {
      setProgress(100);
    }
  };

  const handleMouseLeave = () => {
    if (!toast.persistent && toast.duration !== 0) {
      // Resume countdown
    }
  };

  return (
    <div
      className={clsx(
        'toast-item transform transition-all duration-200 ease-out mb-2',
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
        isRemoving && 'scale-95'
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={clsx(
        'relative max-w-sm w-full rounded-lg border shadow-lg pointer-events-auto overflow-hidden',
        config.bgColor
      )}>
        {/* Progress bar */}
        {!toast.persistent && toast.duration !== 0 && (
          <div className="absolute top-0 left-0 h-1 bg-black/10">
            <div 
              className="h-full bg-black/20 transition-all duration-100 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {toast.type === 'loading' ? (
                <div className="animate-spin">
                  <Icon className={clsx('w-5 h-5', config.iconColor)} />
                </div>
              ) : (
                <Icon className={clsx('w-5 h-5', config.iconColor)} />
              )}
            </div>
            
            <div className="ml-3 flex-1 pt-0.5">
              <p className={clsx('text-sm font-medium', config.titleColor)}>
                {toast.title}
              </p>
              {toast.message && (
                <p className={clsx('mt-1 text-sm', config.messageColor)}>
                  {toast.message}
                </p>
              )}
              
              {toast.action && (
                <div className="mt-3">
                  <button
                    onClick={toast.action.onClick}
                    className={clsx(
                      'text-sm font-medium transition-colors',
                      config.titleColor,
                      'hover:opacity-75'
                    )}
                  >
                    {toast.action.label}
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex-shrink-0 ml-4">
              <button
                onClick={handleRemove}
                className={clsx(
                  'inline-flex rounded-md p-1.5 transition-colors',
                  'hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-black/10'
                )}
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Toast container component
interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-50">
      <div className="absolute top-4 right-4 max-h-screen overflow-hidden">
        <div className="flex flex-col space-y-2">
          {toasts.map(toast => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onRemove={onRemove}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

// Toast provider component
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toastData: Omit<Toast, 'id'>): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newToast: Toast = {
      ...toastData,
      id,
    };

    setToasts(prev => {
      // Remove existing toast of same type if loading or offline
      if (newToast.type === 'loading' || newToast.type === 'offline') {
        const filtered = prev.filter(t => t.type !== newToast.type);
        return [...filtered, newToast];
      }
      
      // Limit total toasts to prevent overflow
      const maxToasts = 5;
      const updated = [newToast, ...prev.slice(0, maxToasts - 1)];
      return updated;
    });

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
    setToasts(prev => prev.map(toast => 
      toast.id === id ? { ...toast, ...updates } : toast
    ));
  }, []);

  const value = {
    toasts,
    addToast,
    removeToast,
    clearToasts,
    updateToast,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

// Toast hook
export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  const { addToast, removeToast, clearToasts, updateToast } = context;

  // Helper methods for different toast types
  const success = useCallback((title: string, message?: string, options?: Partial<Toast>) => {
    return addToast({ ...options, type: 'success', title, message });
  }, [addToast]);

  const error = useCallback((title: string, message?: string, options?: Partial<Toast>) => {
    return addToast({ ...options, type: 'error', title, message });
  }, [addToast]);

  const warning = useCallback((title: string, message?: string, options?: Partial<Toast>) => {
    return addToast({ ...options, type: 'warning', title, message });
  }, [addToast]);

  const info = useCallback((title: string, message?: string, options?: Partial<Toast>) => {
    return addToast({ ...options, type: 'info', title, message });
  }, [addToast]);

  const loading = useCallback((title: string, message?: string, options?: Partial<Toast>) => {
    return addToast({ 
      ...options, 
      type: 'loading', 
      title, 
      message,
      persistent: true 
    });
  }, [addToast]);

  const offline = useCallback((message?: string) => {
    return addToast({
      type: 'offline',
      title: 'İnternet Bağlantısı Yok',
      message: message || 'İnternet bağlantınızı kontrol edin',
      persistent: true,
    });
  }, [addToast]);

  // Generic promise handler - extracted to avoid JSX parsing issues with inline generics
  const promise = useCallback(
    function promiseHandler<T>(
      promiseFunc: Promise<T> | (() => Promise<T>),
      options: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((error: any) => string);
      }
    ): Promise<T> {
      const runner = async () => {
        const loadingId = loading(options.loading);

        try {
          const promise = typeof promiseFunc === 'function' ? promiseFunc() : promiseFunc;
          const data = await promise;
          
          removeToast(loadingId);
          
          const successMessage = typeof options.success === 'function' 
            ? options.success(data) 
            : options.success;
          success(successMessage);
          
          return data;
        } catch (err) {
          removeToast(loadingId);
          
          const errorMessage = typeof options.error === 'function' 
            ? options.error(err) 
            : options.error;
          error(errorMessage);
          
          throw err;
        }
      };

      return runner();
    },
    [loading, success, error, removeToast]
  );

  return {
    success,
    error,
    warning,
    info,
    loading,
    offline,
    promise,
    remove: removeToast,
    clear: clearToasts,
    update: updateToast,
  };
};

// Network status hook with toast integration
export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const toast = useToast();

  useEffect(() => {
    let offlineToastId: string | null = null;

    const handleOnline = () => {
      setIsOnline(true);
      if (offlineToastId) {
        toast.remove(offlineToastId);
        offlineToastId = null;
      }
      toast.success('İnternet Bağlantısı Restore Edildi');
    };

    const handleOffline = () => {
      setIsOnline(false);
      offlineToastId = toast.offline();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  return { isOnline };
};

// Auto-save hook with toast feedback
export const useAutoSave = <T,>(
  data: T,
  saveFunction: (data: T) => Promise<void>,
  delay = 2000
) => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const toast = useToast();

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!data) return;

      try {
        setIsSaving(true);
        await saveFunction(data);
        setLastSaved(new Date());
        toast.success('Otomatik kaydedildi', '', { duration: 2000 });
      } catch (error) {
        toast.error('Otomatik kaydetme başarısız', 'Değişiklikleriniz kaybolabilir');
      } finally {
        setIsSaving(false);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [data, saveFunction, delay, toast]);

  return { isSaving, lastSaved };
};
