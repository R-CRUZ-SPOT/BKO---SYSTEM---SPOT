'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { moeda, nomeCompetencia } from '@/lib/ajuda-custo';
import { LancamentoFechado } from '@/components/ajuda-custo/lancamento-fechado';
import { cn } from '@/lib/utils';

interface Resumo {
  id: string;
  competencia: string;
  fechado_em: string;
  fechado_por: string | null;
  observacao: string | null;
  total: number;
  descontos: number;
  promotores: number;
}

export default function HistoricoPage() {
  const [lista, setLista] = useState<Resumo[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [lanc, itens] = await Promise.all([
      supabase.from('ajuda_custo_lancamentos').select('*').order('competencia', { ascending: false }),
      supabase.from('ajuda_custo_itens').select('lancamento_id, valor_pagar, descontos').limit(50000),
    ]);
    if (lanc.error || itens.error) {
      toast.error('Erro ao carregar histórico: ' + (lanc.error ?? itens.error)!.message);
      setLoading(false);
      return;
    }
    const soma = new Map<string, { total: number; descontos: number; promotores: number }>();
    (itens.data ?? []).forEach((i: any) => {
      const s = soma.get(i.lancamento_id) ?? { total: 0, descontos: 0, promotores: 0 };
      s.total += Number(i.valor_pagar);
      s.descontos += Number(i.descontos);
      s.promotores += 1;
      soma.set(i.lancamento_id, s);
    });
    const resumos = (lanc.data ?? []).map((l: any) => ({ ...l, ...(soma.get(l.id) ?? { total: 0, descontos: 0, promotores: 0 }) }));
    setLista(resumos);
    setSelecionada((atual) => (atual && resumos.some((r) => r.id === atual) ? atual : resumos[0]?.id ?? null));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const atual = lista.find((l) => l.id === selecionada);

  if (loading) return <p className="text-center py-20 text-zinc-400 text-sm">Carregando...</p>;
  if (lista.length === 0) {
    return <p className="text-center py-20 text-zinc-400 text-sm">Nenhum lançamento fechado ainda. Feche o primeiro em &quot;Cálculo do Mês&quot;.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {lista.map((l) => (
          <button
            key={l.id}
            onClick={() => setSelecionada(l.id)}
            className={cn(
              'shrink-0 text-left rounded-2xl border px-5 py-3 transition-colors',
              l.id === selecionada ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200 hover:border-zinc-400'
            )}
          >
            <p className="text-xs font-black uppercase tracking-wider">{nomeCompetencia(l.competencia)}</p>
            <p className="text-lg font-black tabular-nums">{moeda(l.total)}</p>
            <p className={cn('text-[10px]', l.id === selecionada ? 'text-zinc-400' : 'text-zinc-500')}>
              {l.promotores} promotores · descontos {moeda(l.descontos)}
            </p>
          </button>
        ))}
      </div>

      {atual && (
        <LancamentoFechado
          key={atual.id}
          lancamento={atual}
          podeReabrir={lista[0]?.id === atual.id}
          onReaberto={carregar}
        />
      )}
    </div>
  );
}
