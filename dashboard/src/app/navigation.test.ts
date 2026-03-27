import { describe, expect, it } from 'vitest';

import { FOOTER_NAV, NAV_SECTIONS, getRouteMeta } from './navigation';

describe('dashboard navigation contracts', () => {
  it('keeps primary route targets unique across sections', () => {
    const targets = [...NAV_SECTIONS.flatMap((section) => section.items), ...FOOTER_NAV].map((item) => item.to);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('resolves known route metadata and falls back for unknown routes', () => {
    expect(getRouteMeta('/browser')).toEqual({
      label: 'Browser ops',
      description: 'Provider doctor, test captures, policy, and artifact history.',
      section: 'Workforce'
    });

    expect(getRouteMeta('/not-a-real-route')).toEqual({
      label: 'Workspace',
      description: 'Monitor runtime state and continue from where you left off.',
      section: 'Operations'
    });
  });
});
