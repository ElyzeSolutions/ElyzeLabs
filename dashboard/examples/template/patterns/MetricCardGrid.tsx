import { KpiCard } from '../KpiCard';

interface MetricItem {
  id: string;
  label: string;
  value: string | number;
  detail?: string;
  accent?: string;
}

interface MetricCardGridProps {
  metrics: MetricItem[];
  columnsClassName?: string;
}

export function MetricCardGrid({
  metrics,
  columnsClassName = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4',
}: MetricCardGridProps) {
  return (
    <div className={columnsClassName}>
      {metrics.map((metric) => (
        <KpiCard
          key={metric.id}
          label={metric.label}
          value={metric.value}
          detail={metric.detail}
          accent={metric.accent}
        />
      ))}
    </div>
  );
}
