import React from 'react';
import TopBar from '../components/layout/TopBar';
import Sidebar from '../components/layout/Sidebar';
import EmployeeConnectionBanner from '../components/common/EmployeeConnectionBanner';

interface MainLayoutProps {
  onAddAccount: () => void;
  children: React.ReactNode;
}

export default function MainLayout({ onAddAccount, children }: MainLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-gray-900 overflow-hidden">
      <TopBar />
      <EmployeeConnectionBanner />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar onAddAccount={onAddAccount} />

        <div className="flex flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
