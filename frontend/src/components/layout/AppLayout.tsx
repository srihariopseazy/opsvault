import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { OfflineBanner } from '../ui/OfflineBanner';
import { PwaInstallBanner } from '../ui/PwaInstallBanner';
import { usePolicyEnforcement } from '../../hooks/usePolicyEnforcement';

export function AppLayout() {
  usePolicyEnforcement();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <OfflineBanner />
      <PwaInstallBanner />
      <TopNav onMobileMenuToggle={() => setMobileSidebarOpen((p) => !p)} />
      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile overlay */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 sm:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
        <main className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
