// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RouteHeaderMetricsContext, useRouteHeaderMetrics } from './RouteHeaderContext';

function Harness({ metrics }: { metrics: Array<{ id: string; label: string; value: number; displayValue: string; tone: 'neutral' }> | null }) {
  useRouteHeaderMetrics(metrics);
  return null;
}

describe('RouteHeaderMetricsContext', () => {
  it('publishes route metrics on mount and clears them on unmount', () => {
    const setMetrics = vi.fn();
    const metrics = [
      {
        id: 'runs',
        label: 'Runs',
        value: 4,
        displayValue: '4',
        tone: 'neutral' as const
      }
    ];

    const view = render(
      <RouteHeaderMetricsContext.Provider value={setMetrics}>
        <Harness metrics={metrics} />
      </RouteHeaderMetricsContext.Provider>
    );

    expect(setMetrics).toHaveBeenCalledWith(metrics);

    view.unmount();

    expect(setMetrics).toHaveBeenLastCalledWith(null);
  });

  it('does not republish equivalent metrics when only array identity changes', () => {
    const setMetrics = vi.fn();
    const metrics = [
      {
        id: 'runs',
        label: 'Runs',
        value: 4,
        displayValue: '4',
        tone: 'neutral' as const
      }
    ];

    const view = render(
      <RouteHeaderMetricsContext.Provider value={setMetrics}>
        <Harness metrics={metrics} />
      </RouteHeaderMetricsContext.Provider>
    );

    expect(setMetrics).toHaveBeenCalledTimes(1);

    view.rerender(
      <RouteHeaderMetricsContext.Provider value={setMetrics}>
        <Harness
          metrics={[
            {
              id: 'runs',
              label: 'Runs',
              value: 4,
              displayValue: '4',
              tone: 'neutral'
            }
          ]}
        />
      </RouteHeaderMetricsContext.Provider>
    );

    expect(setMetrics).toHaveBeenCalledTimes(1);
  });
});
