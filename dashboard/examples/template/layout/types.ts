import type { ReactNode } from 'react';

export interface TemplateNavItem {
  id: string;
  label: string;
  shortLabel?: string;
  section?: string;
  badge?: number;
}

export interface TemplateShellProps {
  brand: string;
  title: string;
  subtitle?: string;
  statusLabel?: string;
  statusTone?: 'ok' | 'warn' | 'error';
  navItems: TemplateNavItem[];
  activeNavId: string;
  onNavChange: (id: string) => void;
  topbarMeta?: ReactNode;
  footerNote?: string;
  children: ReactNode;
}
