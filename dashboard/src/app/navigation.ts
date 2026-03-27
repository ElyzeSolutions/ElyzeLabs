import type { ComponentType } from 'react';

import type { IconProps } from '@phosphor-icons/react';
import {
  Broom,
  Browsers,
  ChartLineUp,
  DotsThreeCircle,
  GearSix,
  GridFour,
  LockKey,
  Robot,
  RocketLaunch,
  Rows,
  CalendarDots,
  ShieldCheck,
  SlidersHorizontal,
  Toolbox,
  Waveform
} from '@phosphor-icons/react';

export type NavIcon = ComponentType<IconProps>;

export interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: NavIcon;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export interface RouteMeta {
  label: string;
  description: string;
  section: string;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        to: '/',
        label: 'Overview',
        description: 'Resume work, triage issues, and get the live digest.',
        icon: GridFour
      },
      {
        to: '/mission-control',
        label: 'Mission control',
        description: 'Inspect sessions, live terminals, and intervention states.',
        icon: Waveform
      },
      {
        to: '/office',
        label: 'Office',
        description: 'Watch presence, attention hotspots, and team activity.',
        icon: DotsThreeCircle
      }
    ]
  },
  {
    id: 'workforce',
    label: 'Workforce',
    items: [
      {
        to: '/backlog',
        label: 'Backlog',
        description: 'Scope delivery, track readiness, and move work forward.',
        icon: Rows
      },
      {
        to: '/agents',
        label: 'Agents',
        description: 'Shape profiles, harnesses, and execution defaults.',
        icon: Robot
      },
      {
        to: '/skills',
        label: 'Skills',
        description: 'Review capabilities, approvals, and install posture.',
        icon: ShieldCheck
      },
      {
        to: '/tools',
        label: 'Tools',
        description: 'Inspect integrations, binaries, and operational switches.',
        icon: Toolbox
      },
      {
        to: '/browser',
        label: 'Browser ops',
        description: 'Doctor the provider, run extracts, and review captured artifacts.',
        icon: Browsers
      },
      {
        to: '/schedules',
        label: 'Schedules',
        description: 'Control recurring jobs, routing, and execution history.',
        icon: CalendarDots
      }
    ]
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    items: [
      {
        to: '/llm',
        label: 'LLM routing',
        description: 'Budgets, limits, and runtime selection policy.',
        icon: ChartLineUp
      },
      {
        to: '/vault',
        label: 'Vault',
        description: 'Secrets, materials, and lock state.',
        icon: LockKey
      },
      {
        to: '/config',
        label: 'Control plane',
        description: 'Runtime adapters, queue policy, and transport settings.',
        icon: SlidersHorizontal
      },
      {
        to: '/housekeeping',
        label: 'Housekeeping',
        description: 'Maintenance routines, cleanup, and repair loops.',
        icon: Broom
      }
    ]
  }
];

export const FOOTER_NAV: NavItem[] = [
  {
    to: '/onboarding',
    label: 'Onboarding',
    description: 'Bootstrap the environment and validate readiness.',
    icon: RocketLaunch
  },
  {
    to: '/settings',
    label: 'Access',
    description: 'Dashboard auth, reconnect checks, and operator shortcuts.',
    icon: GearSix
  }
];

const ROUTE_META: Array<{ matches: (pathname: string) => boolean; meta: RouteMeta }> = [
  {
    matches: (pathname) => pathname === '/',
    meta: {
      label: 'Overview',
      description: 'The shortest path back to work that needs attention.',
      section: 'Operations'
    }
  },
  {
    matches: (pathname) => pathname === '/mission-control',
    meta: {
      label: 'Mission control',
      description: 'Live sessions, terminals, routing, and operator interventions.',
      section: 'Operations'
    }
  },
  {
    matches: (pathname) => pathname === '/office',
    meta: {
      label: 'Office',
      description: 'Presence, status, and where attention is pooling right now.',
      section: 'Operations'
    }
  },
  {
    matches: (pathname) => pathname === '/backlog',
    meta: {
      label: 'Backlog',
      description: 'Delivery scope, orchestration rules, and truth labels.',
      section: 'Workforce'
    }
  },
  {
    matches: (pathname) => pathname === '/agents',
    meta: {
      label: 'Agents',
      description: 'Profiles, runtimes, permissions, and harness posture.',
      section: 'Workforce'
    }
  },
  {
    matches: (pathname) => pathname === '/skills',
    meta: {
      label: 'Skills',
      description: 'Capability inventory, policy, and installation health.',
      section: 'Workforce'
    }
  },
  {
    matches: (pathname) => pathname === '/tools',
    meta: {
      label: 'Tools',
      description: 'Binary readiness, vendor bootstrap, and runtime policy.',
      section: 'Workforce'
    }
  },
  {
    matches: (pathname) => pathname === '/browser',
    meta: {
      label: 'Browser ops',
      description: 'Provider doctor, test captures, policy, and artifact history.',
      section: 'Workforce'
    }
  },
  {
    matches: (pathname) => pathname === '/schedules',
    meta: {
      label: 'Schedules',
      description: 'Recurring jobs, delivery targets, and execution history.',
      section: 'Workforce'
    }
  },
  {
    matches: (pathname) => pathname === '/llm',
    meta: {
      label: 'LLM routing',
      description: 'Spend limits, provider posture, and runtime fallback chains.',
      section: 'Infrastructure'
    }
  },
  {
    matches: (pathname) => pathname === '/vault',
    meta: {
      label: 'Vault',
      description: 'Secret inventory, master material, and lock state.',
      section: 'Infrastructure'
    }
  },
  {
    matches: (pathname) => pathname === '/config',
    meta: {
      label: 'Control plane',
      description: 'Runtime defaults, queue policy, and transport settings.',
      section: 'Infrastructure'
    }
  },
  {
    matches: (pathname) => pathname === '/housekeeping',
    meta: {
      label: 'Housekeeping',
      description: 'Repair loops, cleanup jobs, and maintenance feedback.',
      section: 'Infrastructure'
    }
  },
  {
    matches: (pathname) => pathname === '/onboarding',
    meta: {
      label: 'Onboarding',
      description: 'Bootstrapping, credentials, and smoke-run readiness.',
      section: 'Setup'
    }
  },
  {
    matches: (pathname) => pathname === '/settings',
    meta: {
      label: 'Access',
      description: 'Dashboard auth, reconnect checks, and local operator defaults.',
      section: 'Preferences'
    }
  }
];

export function getRouteMeta(pathname: string): RouteMeta {
  const match = ROUTE_META.find((entry) => entry.matches(pathname));
  if (match) {
    return match.meta;
  }

  return {
    label: 'Workspace',
    description: 'Monitor runtime state and continue from where you left off.',
    section: 'Operations'
  };
}
