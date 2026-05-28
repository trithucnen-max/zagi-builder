import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught page error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex-1 h-full min-h-[400px] flex items-center justify-center p-6 bg-gray-900 text-gray-200">
          <div className="max-w-md w-full bg-gray-800 border border-gray-700/80 rounded-2xl shadow-2xl p-8 text-center flex flex-col items-center">
            {/* Warning icon with micro-animation */}
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-5 animate-pulse">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>

            <h3 className="text-lg font-semibold text-white mb-2">Đã xảy ra lỗi tải trang</h3>
            <p className="text-sm text-gray-400 mb-6 leading-relaxed">
              Trang này tạm thời không khả dụng hoặc đã gặp sự cố không mong muốn trong khi kết xuất.
            </p>

            {this.state.error?.message && (
              <div className="w-full text-left bg-gray-900/60 border border-gray-700 rounded-lg p-3.5 mb-6 overflow-x-auto max-h-[120px]">
                <code className="text-xs font-mono text-red-400 break-all">{this.state.error.message}</code>
              </div>
            )}

            <div className="flex gap-3 w-full">
              <button
                onClick={this.handleRetry}
                className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all transform active:scale-95 shadow-lg shadow-blue-600/25 flex items-center justify-center gap-1.5"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                <span>Thử lại</span>
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-650 text-gray-200 font-medium transition-all transform active:scale-95 border border-gray-600 flex items-center justify-center gap-1.5"
              >
                Tải lại ứng dụng
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
