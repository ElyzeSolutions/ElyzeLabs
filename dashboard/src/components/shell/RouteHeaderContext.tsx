import { createContext, useContext, useEffect, useMemo } from 'react';

import type { CardMetric } from '../../app/types';

type RouteHeaderMetricsSetter = (metrics: CardMetric[] | null) => void;

export const RouteHeaderMetricsContext = createContext<RouteHeaderMetricsSetter | null>(null);

export function useRouteHeaderMetrics(metrics: CardMetric[] | null): void {
  const setMetrics = useContext(RouteHeaderMetricsContext);
  const metricsSignature = useMemo(
    () =>
      metrics
        ? metrics
            .map((metric) => `${metric.id}:${metric.value}:${metric.displayValue ?? ''}:${metric.tone}`)
            .join('|')
        : '',
    [metrics]
  );

  useEffect(() => {
    if (!setMetrics) {
      return;
    }

    setMetrics(metrics);

    return () => {
      setMetrics(null);
    };
  }, [metricsSignature, setMetrics]);
}
