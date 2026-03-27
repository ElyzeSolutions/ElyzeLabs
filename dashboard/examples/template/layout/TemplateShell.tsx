import { useState } from 'react';

import { TemplateMobileNav } from './TemplateMobileNav';
import { TemplateSidebar } from './TemplateSidebar';
import { TemplateTopbar } from './TemplateTopbar';
import type { TemplateShellProps } from './types';

export function TemplateShell({
  brand,
  title,
  subtitle,
  statusLabel,
  statusTone,
  navItems,
  activeNavId,
  onNavChange,
  topbarMeta,
  footerNote,
  children,
}: TemplateShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-950 text-slate-100">
      <div className="flex h-full w-full">
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity md:hidden ${
            sidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        <TemplateSidebar
          brand={brand}
          navItems={navItems}
          activeNavId={activeNavId}
          onNavChange={onNavChange}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          footerNote={footerNote}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TemplateTopbar
            title={title}
            subtitle={subtitle}
            statusLabel={statusLabel}
            statusTone={statusTone}
            meta={topbarMeta}
            onMenuToggle={() => setSidebarOpen((prev) => !prev)}
          />

          <main className="flex-1 overflow-y-auto px-4 py-5 pb-24 md:px-6 md:py-6 md:pb-6">{children}</main>

          <TemplateMobileNav navItems={navItems} activeNavId={activeNavId} onNavChange={onNavChange} />
        </div>
      </div>
    </div>
  );
}
