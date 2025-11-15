import React from 'react';
import { Loader2, AlertCircle, CheckCircle2, Clock, Wifi, WifiOff } from 'lucide-react';
import { clsx } from 'clsx';

// Loading spinner component
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: 'primary' | 'secondary' | 'white';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className,
  color = 'primary'
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  const colorClasses = {
    primary: 'text-blue-600',
    secondary: 'text-gray-600',
    white: 'text-white',
  };

  return (
    <Loader2 
      className={clsx(
        'animate-spin',
        sizeClasses[size],
        colorClasses[color],
        className
      )} 
    />
  );
};

// Page loading overlay
interface PageLoadingProps {
  message?: string;
  progress?: number;
  showProgress?: boolean;
}

export const PageLoading: React.FC<PageLoadingProps> = ({ 
  message = 'Yükleniyor...', 
  progress,
  showProgress = false
}) => {
  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-4 max-w-sm mx-auto px-6">
        <div className="relative">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            <LoadingSpinner size="lg" />
          </div>
          {showProgress && typeof progress === 'number' && (
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
              <div className="bg-white rounded-full px-2 py-1 text-xs font-medium text-blue-600 border shadow-sm">
                %{Math.round(progress)}
              </div>
            </div>
          )}
        </div>
        
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">{message}</h3>
          {showProgress && typeof progress === 'number' && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Skeleton loading components
interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse'
}) => {
  const variantClasses = {
    text: 'h-4 rounded',
    rectangular: 'rounded',
    circular: 'rounded-full',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]',
    none: '',
  };

  const style = {
    width: width,
    height: height,
  };

  return (
    <div
      className={clsx(
        'bg-gray-200',
        variantClasses[variant],
        animationClasses[animation],
        className
      )}
      style={style}
    />
  );
};

// Card skeleton
export const CardSkeleton: React.FC = () => (
  <div className="card p-6">
    <div className="flex items-center space-x-4 mb-4">
      <Skeleton variant="circular" width={40} height={40} />
      <div className="space-y-2 flex-1">
        <Skeleton width="60%" height={20} />
        <Skeleton width="40%" height={16} />
      </div>
    </div>
    <div className="space-y-2">
      <Skeleton width="100%" height={16} />
      <Skeleton width="80%" height={16} />
      <Skeleton width="60%" height={16} />
    </div>
  </div>
);

// Table skeleton
export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({ 
  rows = 5, 
  columns = 4 
}) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="flex space-x-4">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Skeleton 
            key={colIndex} 
            className="flex-1" 
            height={16}
          />
        ))}
      </div>
    ))}
  </div>
);

// Button loading state
interface LoadingButtonProps {
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  loading = false,
  disabled = false,
  children,
  variant = 'primary',
  size = 'md',
  className,
  onClick,
  type = 'button'
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900 focus:ring-gray-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {loading && (
        <LoadingSpinner 
          size="sm" 
          color={variant === 'secondary' ? 'secondary' : 'white'}
          className="mr-2" 
        />
      )}
      {children}
    </button>
  );
};

// Connection status indicator
interface ConnectionStatusProps {
  status: 'online' | 'offline' | 'connecting' | 'error';
  showText?: boolean;
  className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  showText = true,
  className
}) => {
  const statusConfig = {
    online: {
      icon: Wifi,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      text: 'Çevrimiçi',
      pulse: false,
    },
    offline: {
      icon: WifiOff,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      text: 'Çevrimdışı',
      pulse: false,
    },
    connecting: {
      icon: Wifi,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      text: 'Bağlanıyor...',
      pulse: true,
    },
    error: {
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      text: 'Bağlantı Hatası',
      pulse: false,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={clsx('flex items-center space-x-2', className)}>
      <div className={clsx(
        'p-1.5 rounded-full',
        config.bgColor,
        config.pulse && 'animate-pulse'
      )}>
        <Icon className={clsx('w-4 h-4', config.color)} />
      </div>
      {showText && (
        <span className={clsx('text-sm font-medium', config.color)}>
          {config.text}
        </span>
      )}
    </div>
  );
};

// Progress bar component
interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'success' | 'warning' | 'danger';
  showValue?: boolean;
  label?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  size = 'md',
  color = 'primary',
  showValue = true,
  label,
  className
}) => {
  const percentage = Math.round((value / max) * 100);
  
  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  const colorClasses = {
    primary: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    danger: 'bg-red-600',
  };

  return (
    <div className={clsx('space-y-1', className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center text-sm">
          {label && <span className="font-medium text-gray-700">{label}</span>}
          {showValue && <span className="text-gray-500">%{percentage}</span>}
        </div>
      )}
      <div className={clsx('w-full bg-gray-200 rounded-full overflow-hidden', sizeClasses[size])}>
        <div
          className={clsx(
            'h-full transition-all duration-300 ease-out',
            colorClasses[color]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// Loading state provider and hook
interface LoadingState {
  [key: string]: boolean;
}

interface LoadingContextType {
  loadingStates: LoadingState;
  setLoading: (key: string, loading: boolean) => void;
  isLoading: (key: string) => boolean;
  isAnyLoading: () => boolean;
}

const LoadingContext = React.createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loadingStates, setLoadingStates] = React.useState<LoadingState>({});

  const setLoading = React.useCallback((key: string, loading: boolean) => {
    setLoadingStates(prev => ({ ...prev, [key]: loading }));
  }, []);

  const isLoading = React.useCallback((key: string) => {
    return Boolean(loadingStates[key]);
  }, [loadingStates]);

  const isAnyLoading = React.useCallback(() => {
    return Object.values(loadingStates).some(Boolean);
  }, [loadingStates]);

  const value = React.useMemo(
    () => ({
      loadingStates,
      setLoading,
      isLoading,
      isAnyLoading,
    }),
    [loadingStates, setLoading, isLoading, isAnyLoading]
  );

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = React.useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};

// Async operation hook with loading state
export const useAsyncOperation = () => {
  const { setLoading } = useLoading();

  const executeAsync = React.useCallback(<T,>(
    operation: () => Promise<T>,
    loadingKey: string
  ): Promise<T> => {
    const runner = async () => {
      try {
        setLoading(loadingKey, true);
        const result = await operation();
        return result;
      } finally {
        setLoading(loadingKey, false);
      }
    };

    return runner();
  }, [setLoading]);

  return { executeAsync };
};
