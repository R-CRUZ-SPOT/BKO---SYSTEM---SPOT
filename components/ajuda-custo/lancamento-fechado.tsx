'use client';

import { useEffect, useState } from 'react';
import { Lock, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { buscarTudo, carregarEmpresas, reabrirLancamento } from '@/lib/ajuda-custo-data';
import { nomeCompetencia } from '@/lib/ajuda-custo';
import { TabelaLancamento, linhaDeItemSalvo, type LinhaLancamento } from './tabela-lancamento';

export function LancamentoFechado({
  lancamento,
  podeReabrir,
  onReaberto,
}: {
  lancamento: { id: string; competencia: string; fechado_em: string; fechado_por: string | null; observacao: string | null };
  podeReabrir: boolean;
  onReaberto: () => void;
}) {
  const [linhas, setLinhas] = useState<LinhaLancamento[] | null>(null);

  useEffect(() => {
    supabase
      .from('ajuda_custo_itens')
      .select('*, colaboradores(nome, matricula)')
      .eq('lancamento_id', lancamento.id)
      .then(async ({ data, error }) => {
        if (error) return toast.error('Erro ao carregar lançamento: ' + error.message);
        const itens = data ?? [];
        // lançamentos antigos não guardavam a lista de dias pagos no detalhe: busca no snapshot
        const faltando = itens.filter((i: any) => i.dias_trabalhados > 0 && !i.detalhes?.dias_pagos);
        if (faltando.length > 0) {
          try {
            const ids = faltando.map((i: any) => i.id);
            const dias = await buscarTudo<any>((from, to) =>
              supabase.from('ajuda_custo_dias').select('item_id, data, valor').in('item_id', ids).order('data').range(from, to)
            );
            faltando.forEach((i: any) => {
              i.detalhes = { ...(i.detalhes ?? {}), dias_pagos: dias.filter((d) => d.item_id === i.id).map((d) => ({ data: d.data, valor: Number(d.valor) })) };
            });
          } catch (e) {
            console.error(e);
          }
        }
        const empresas = await carregarEmpresas();
        setLinhas(itens.map(linhaDeItemSalvo).map((l) => ({ ...l, empresa: empresas.get(l.id) ?? null })).sort((a, b) => a.nome.localeCompare(b.nome)));
      });
  }, [lancamento.id]);

  async function reabrir() {
    const ok = window.confirm(
      `Reabrir ${nomeCompetencia(lancamento.competencia)}?\n\nO lançamento fechado será apagado e os descontos aplicados por ele voltam a ficar pendentes. Depois é só recalcular e fechar de novo.`
    );
    if (!ok) return;
    try {
      await reabrirLancamento(lancamento.id);
      toast.success('Lançamento reaberto.');
      onReaberto();
    } catch (e: any) {
      toast.error('Erro ao reabrir: ' + e.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-3">
        <div className="flex items-center gap-3 text-emerald-800">
          <Lock className="w-4 h-4" />
          <p className="text-xs font-bold">
            {nomeCompetencia(lancamento.competencia)} fechado em {new Date(lancamento.fechado_em).toLocaleString('pt-BR')}
            {lancamento.fechado_por && ` por ${lancamento.fechado_por}`}
          </p>
        </div>
        {podeReabrir && (
          <Button variant="outline" size="sm" className="rounded-xl bg-white" onClick={reabrir}>
            <Undo2 className="w-4 h-4 mr-2" /> Reabrir
          </Button>
        )}
      </div>
      {linhas === null ? (
        <p className="text-center py-16 text-zinc-400 text-sm">Carregando...</p>
      ) : (
        <TabelaLancamento linhas={linhas} competencia={lancamento.competencia} />
      )}
    </div>
  );
}
