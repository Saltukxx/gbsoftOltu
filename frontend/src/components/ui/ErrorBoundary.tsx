import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate unique error ID for tracking
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      errorInfo,
    });

    // Log error details
    console.error('Error Boundary caught an error:', {
      error: error.message,
      stack: error.stack,
      errorInfo,
      errorId: this.state.errorId,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Report error to monitoring service (e.g., Sentry, LogRocket)
    this.reportError(error, errorInfo);
  }

  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    // In production, send to error monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error, { extra: errorInfo });
      
      // For now, we'll log to console and could send to our backend
      fetch('/api/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          errorId: this.state.errorId,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        }),
      }).catch((reportingError) => {
        console.error('Failed to report error:', reportingError);
      });
    }
  };

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });
  };

  private handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  private handleReload = () => {
    window.location.reload();
  };

  private getErrorCategory = (error: Error): string => {
    if (error.message.includes('ChunkLoadError') || error.message.includes('Loading chunk')) {
      return 'chunk_load';
    }
    if (error.message.includes('Network Error') || error.message.includes('fetch')) {
      return 'network';
    }
    if (error.message.includes('Permission') || error.message.includes('Unauthorized')) {
      return 'permission';
    }
    if (error.name === 'TypeError') {
      return 'type_error';
    }
    return 'unknown';
  };

  private getErrorSuggestion = (category: string): string => {
    switch (category) {
      case 'chunk_load':
        return 'Bu genellikle uygulama güncellendiğinde oluşur. Sayfayı yenileyin.';
      case 'network':
        return 'İnternet bağlantınızı kontrol edin ve tekrar deneyin.';
      case 'permission':
        return 'Bu işlem için yetkiniz bulunmuyor. Oturum açın veya yöneticinizle iletişime geçin.';
      case 'type_error':
        return 'Beklenmedik bir veri hatası oluştu. Lütfen sayfayı yenileyin.';
      default:
        return 'Beklenmedik bir hata oluştu. Sorun devam ederse lütfen destek ekibi ile iletişime geçin.';
    }
  };

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorCategory = this.getErrorCategory(this.state.error);
      const suggestion = this.getErrorSuggestion(errorCategory);
      const isDevelopment = process.env.NODE_ENV === 'development';

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            <div className="bg-white rounded-lg shadow-lg p-8">
              {/* Error Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
              </div>

              {/* Error Title */}
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Bir Hata Oluştu
                </h1>
                <p className="text-gray-600">
                  {suggestion}
                </p>
              </div>

              {/* Error Details (Development) */}
              {isDevelopment && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <details>
                    <summary className="cursor-pointer font-medium text-gray-700 mb-2">
                      <Bug className="w-4 h-4 inline mr-1" />
                      Teknik Detaylar (Geliştirme)
                    </summary>
                    <div className="mt-2 space-y-2 text-sm">
                      <div>
                        <strong>Hata ID:</strong> {this.state.errorId}
                      </div>
                      <div>
                        <strong>Mesaj:</strong> {this.state.error.message}
                      </div>
                      <div>
                        <strong>Kategori:</strong> {errorCategory}
                      </div>
                      {this.state.error.stack && (
                        <div>
                          <strong>Stack Trace:</strong>
                          <pre className="mt-1 p-2 bg-white rounded text-xs overflow-x-auto">
                            {this.state.error.stack}
                          </pre>
                        </div>
                      )}
                      {this.state.errorInfo?.componentStack && (
                        <div>
                          <strong>Component Stack:</strong>
                          <pre className="mt-1 p-2 bg-white rounded text-xs overflow-x-auto">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              )}

              {/* Error ID for Production */}
              {!isDevelopment && (
                <div className="mb-6 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    <strong>Hata ID:</strong> {this.state.errorId}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Destek ekibi ile iletişime geçerken bu ID'yi paylaşın.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={this.handleRetry}
                  className="btn btn-primary"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Tekrar Dene
                </button>
                
                <button
                  onClick={this.handleReload}
                  className="btn btn-secondary"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sayfayı Yenile
                </button>
                
                <button
                  onClick={this.handleGoHome}
                  className="btn btn-secondary"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Ana Sayfaya Dön
                </button>
              </div>

              {/* Help Text */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-500">
                  Sorun devam ediyorsa, lütfen{' '}
                  <a 
                    href="mailto:destek@oltubelediyesi.gov.tr" 
                    className="text-blue-600 hover:text-blue-700"
                  >
                    destek@oltubelediyesi.gov.tr
                  </a>
                  {' '}adresinden bizimle iletişime geçin.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easier usage
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Partial<Props>
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

// Hook for error reporting in functional components
export const useErrorHandler = () => {
  const reportError = React.useCallback((error: Error, errorInfo?: any) => {
    console.error('Manual error report:', {
      error: error.message,
      stack: error.stack,
      errorInfo,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    });

    // Report to monitoring service
    if (process.env.NODE_ENV === 'production') {
      fetch('/api/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          errorInfo,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        }),
      }).catch((reportingError) => {
        console.error('Failed to report error:', reportingError);
      });
    }
  }, []);

  return { reportError };
};