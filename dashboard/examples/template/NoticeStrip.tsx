interface NoticeStripProps {
  kind: 'info' | 'warning' | 'error';
  message: string;
}

const TONE: Record<NoticeStripProps['kind'], string> = {
  info: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
  warning: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
  error: 'border-rose-400/40 bg-rose-500/10 text-rose-200',
};

export function NoticeStrip({ kind, message }: NoticeStripProps) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${TONE[kind]}`}>
      {message}
    </div>
  );
}
