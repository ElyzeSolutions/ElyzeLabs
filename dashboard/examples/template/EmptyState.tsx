interface EmptyStateProps {
  title: string;
  message: string;
}

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-600/70 bg-slate-900/30 p-4 text-center">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      <p className="mt-1 text-xs text-slate-400">{message}</p>
    </div>
  );
}
