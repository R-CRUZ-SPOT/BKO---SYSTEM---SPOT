import { cn } from '@/lib/utils';

/** Selo para promotores temporários (EMPRESA = TMP). */
export function BadgeTmp({ className }: { className?: string }) {
  return (
    <span
      title="Promotor temporário (TMP)"
      className={cn('ml-2 inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-black uppercase tracking-wider text-amber-800', className)}
    >
      TMP
    </span>
  );
}
