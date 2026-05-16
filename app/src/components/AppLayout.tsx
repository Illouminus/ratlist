/**
 * `<AppLayout>` — chrome wrapper for every authenticated, onboarded
 * screen. Pulls the page-level nav out of individual screens so they
 * only have to render their own content.
 *
 * Layout:
 *   desktop ≥ 768px →   [ Sidebar | Main ]
 *   mobile  < 768px →   [ MobileTopBar / Main / BottomTabBar ]
 *
 * The actual grid + responsive switching lives in global.css under the
 * `.app-layout` selector — see `--bp-tablet` for the breakpoint.
 */
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomTabBar } from './BottomTabBar';
import { MobileTopBar } from './MobileTopBar';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <MobileTopBar />
      <main className="app-main">{children}</main>
      <BottomTabBar />
    </div>
  );
}
