import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, copied: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  private handleCopy = () => {
    const errorText = `Error: ${this.state.error?.message}\n\nStack:\n${this.state.error?.stack || ''}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ''}`;
    navigator.clipboard.writeText(errorText).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gray-950 p-6 text-gray-200 overflow-auto font-sans select-text">
          <div className="w-full max-w-2xl bg-gray-900 border border-red-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-500">
              <span className="text-3xl">⚠️</span>
              <h2 className="text-lg font-bold">Đã xảy ra lỗi hệ thống (Application Crash)</h2>
            </div>
            
            <p className="text-xs text-gray-400">
              Giao diện người dùng đã gặp lỗi nghiêm trọng và không thể tiếp tục kết xuất. Hãy chụp màn hình hoặc sao chép mã lỗi để gửi kỹ thuật hỗ trợ.
            </p>

            {this.state.error && (
              <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-4 text-sm font-semibold text-red-400">
                Lỗi: {this.state.error.message}
              </div>
            )}

            {this.state.error?.stack && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stack Trace</div>
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 text-[10px] font-mono text-gray-400 overflow-x-auto whitespace-pre-wrap max-h-40 erp-scroll-y">
                  {this.state.error.stack}
                </div>
              </div>
            )}

            {this.state.errorInfo?.componentStack && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Component Stack</div>
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 text-[10px] font-mono text-gray-400 overflow-x-auto whitespace-pre-wrap max-h-32 erp-scroll-y">
                  {this.state.errorInfo.componentStack}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Tải lại ứng dụng (Reload)
              </button>
              <button
                type="button"
                onClick={this.handleCopy}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${this.state.copied ? 'bg-green-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
              >
                {this.state.copied ? '✓ Đã sao chép!' : 'Sao chép mã lỗi'}
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 rounded-xl text-xs font-semibold transition-colors"
              >
                Xóa cache & Tải lại
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
