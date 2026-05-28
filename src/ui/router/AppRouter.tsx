import React, { Suspense } from 'react';
import SkeletonLoader from '../components/common/SkeletonLoader';
import ErrorBoundary from '../components/common/ErrorBoundary';

// Lazy loading page chunks
const ChatPage = React.lazy(() => import('../pages/ChatPage'));
const Settings = React.lazy(() => import('../components/settings/Settings'));
const CRMPage = React.lazy(() => import('../pages/CRMPage'));
const WorkflowPage = React.lazy(() => import('../pages/WorkflowPage'));
const IntegrationPage = React.lazy(() => import('../components/integration/IntegrationPage'));
const AnalyticsPage = React.lazy(() => import('../components/analytics/AnalyticsPage'));
const ErpPage = React.lazy(() => import('../features/erp/ErpPage'));
const Dashboard = React.lazy(() => import('../components/dashboard/Dashboard'));

interface AppRouterProps {
  view: string;
}

export default function AppRouter({ view }: AppRouterProps) {
  // Determine skeleton type based on target view
  const getFallbackSkeleton = () => {
    if (view === 'chat') return <SkeletonLoader type="chat" />;
    if (view === 'dashboard' || view === 'crm') return <SkeletonLoader type="grid" />;
    return <SkeletonLoader type="page" />;
  };

  const wrapPage = (Component: React.ComponentType) => (
    <ErrorBoundary>
      <Suspense fallback={getFallbackSkeleton()}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );

  return (
    <>
      {(() => {
        switch (view) {
          case 'chat':
            return wrapPage(ChatPage);
          case 'settings':
            return (
              <div className="flex-1 h-full overflow-hidden">
                {wrapPage(Settings)}
              </div>
            );
          case 'crm':
            return (
              <div className="flex-1 h-full overflow-hidden">
                {wrapPage(CRMPage)}
              </div>
            );
          case 'workflow':
            return (
              <div className="flex-1 h-full overflow-hidden">
                {wrapPage(WorkflowPage)}
              </div>
            );
          case 'integration':
            return (
              <div className="flex-1 h-full overflow-hidden">
                {wrapPage(IntegrationPage)}
              </div>
            );
          case 'analytics':
            return (
              <div className="flex-1 h-full overflow-hidden">
                {wrapPage(AnalyticsPage)}
              </div>
            );
          case 'erp':
            return (
              <div className="flex-1 h-full overflow-hidden">
                {wrapPage(ErpPage)}
              </div>
            );
          case 'dashboard':
            return wrapPage(Dashboard);
          default:
            return wrapPage(ChatPage);
        }
      })()}
    </>
  );
}
