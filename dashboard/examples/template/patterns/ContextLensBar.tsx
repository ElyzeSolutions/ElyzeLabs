type LensTone = 'cyan' | 'amber' | 'emerald' | 'slate';

export interface LensOption {
  id: string;
  label: string;
  shortLabel?: string;
  hint?: string;
  disabled?: boolean;
  tone?: LensTone;
}

interface ContextLensBarProps {
  signalOptions: LensOption[];
  selectedSignalIds: string[];
  onToggleSignal: (id: string) => void;
  onSelectAllSignals: () => void;
  ledgerOptions: LensOption[];
  activeLedgerId: string;
  onSelectLedger: (id: string) => void;
  contextCount: number;
  contextLabel: string;
}

const ACTIVE_TONE_CLASS: Record<LensTone, string> = {
  cyan: 'border-cyan-300/40 bg-cyan-500/15 text-cyan-100',
  amber: 'border-amber-300/40 bg-amber-500/15 text-amber-100',
  emerald: 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100',
  slate: 'border-slate-500/60 bg-slate-700/70 text-slate-100',
};

function chipClass(isActive: boolean, disabled?: boolean, tone: LensTone = 'cyan'): string {
  if (disabled) return 'cursor-not-allowed border-white/10 bg-white/[0.02] text-white/35';
  if (isActive) return ACTIVE_TONE_CLASS[tone];
  return 'border-white/15 bg-white/[0.02] text-white/70 hover:bg-white/[0.06]';
}

export function ContextLensBar({
  signalOptions,
  selectedSignalIds,
  onToggleSignal,
  onSelectAllSignals,
  ledgerOptions,
  activeLedgerId,
  onSelectLedger,
  contextCount,
  contextLabel,
}: ContextLensBarProps) {
  const allSignalsSelected = signalOptions.length > 0 && selectedSignalIds.length === signalOptions.length;

  return (
    <section className="rounded-xl border border-white/8 bg-card/60 px-3 py-2">
      <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-0.5">
        <span className="inline-flex items-center text-[10px] uppercase tracking-[0.12em] text-muted-foreground/65">
          Lens
        </span>
        <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/65">Signal</span>
        <button
          type="button"
          onClick={onSelectAllSignals}
          className={`inline-flex h-7 items-center rounded-md border px-2 text-[10px] uppercase tracking-[0.11em] transition-colors ${chipClass(allSignalsSelected, false, 'cyan')}`}
        >
          All
        </button>
        {signalOptions.map((option) => {
          const isActive = selectedSignalIds.includes(option.id);
          return (
            <button
              key={`signal-${option.id}`}
              type="button"
              onClick={() => onToggleSignal(option.id)}
              disabled={option.disabled}
              title={option.hint}
              className={`inline-flex h-7 items-center rounded-md border px-2 text-[10px] uppercase tracking-[0.11em] transition-colors ${chipClass(isActive, option.disabled, option.tone ?? 'cyan')}`}
            >
              {option.shortLabel ?? option.label}
            </button>
          );
        })}
        <span className="mx-0.5 text-muted-foreground/35">|</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/65">Ledger</span>
        {ledgerOptions.map((option) => {
          const isActive = option.id === activeLedgerId;
          return (
            <button
              key={`ledger-${option.id}`}
              type="button"
              onClick={() => {
                if (!option.disabled) onSelectLedger(option.id);
              }}
              disabled={option.disabled}
              title={option.hint}
              className={`inline-flex h-7 items-center rounded-md border px-2 text-[10px] uppercase tracking-[0.11em] transition-colors ${chipClass(isActive, option.disabled, option.tone ?? 'amber')}`}
            >
              {option.shortLabel ?? option.label}
            </button>
          );
        })}
        <span className="ml-2 rounded-md border border-white/15 bg-white/[0.03] px-2 py-1 text-[10px] font-mono text-slate-200">
          {contextCount} active
        </span>
        <span className="ml-1 text-[10px] font-mono text-muted-foreground/70">{contextLabel}</span>
      </div>
    </section>
  );
}
