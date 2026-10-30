'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { carregarPendentesPosFechamento, registrarPagamentoPosFechamento, type PendentePosFechamento } from '@/lib/ajuda-custo-data';
import { ehTemporario, formatarData, moeda, nomeCompetencia, valorTotalLancar } from '@/lib/ajuda-custo';
import { BadgeTmp } from './badge-tmp';

/**
 * Mês fechado: promotores que têm valores cadastrados para o mês mas ficaram fora do fechamento (ex.: entraram depois).
 * "Registrar pagamento" inclui o promotor na folha do mês, marcado como pago após o fechamento.
 */
export function PendentesPosFechamento({ competencia, lancamentoId, onRegistrado }: { competencia: string; lancamentoId: string; onRegistrado: () => void }) {
  const { user } = useAuth();
  const [pendentes, setPendentes] = useState<PendentePosFechamento[] | null>(null);
  const [registrando, setRegistrando] = useState<string | null>(null);

  const carregar = useCallback(() => {
    carregarPendentesPosFechamento(lancamentoId, competencia)
      .then(setPendentes)
      .catch((e) => {
        console.error(e);
        setPendentes([]);
      });
  }, [lancamentoId, competencia]);

  useEffect(carregar, [carregar]);

  if (!pendentes || pendentes.length === 0) return null;

  async function registrar(p: PendentePosFechamento) {
    const valor = valorTotalLancar(p.resultado.valorPagar, p.avulso);
    const ok = window.confirm(
      `Registrar o pagamento de ${p.resultado.colaborador.nome}?\n\nValor a lançar: ${moeda(valor)} (${p.resultado.diasTrabalhados} dia(s) em ${nomeCompetencia(competencia)}).\n\nEle entra na folha de ${nomeCompetencia(competencia)} marcado como "pago após o fechamento". Confirme só depois de realizar o pagamento.`
    );
    if (!ok) return;
    setRegistrando(p.resultado.colaborador.id);
    try {
      await registrarPagamentoPosFechamento(lancamentoId, p, user?.email ?? null);
      toast.success('Pagamento registrado na folha.');
      onRegistrado();
      carregar();
    } catch (e: any) {
      toast.error('Erro ao registrar: ' + e.message);
    } finally {
      setRegistrando(null);
    }
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60">
      <div className="flex gap-3 px-5 py-4 text-indigo-900">
        <UserPlus className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-bold">{pendentes.length} promotor(es) com valores em {nomeCompetencia(competencia)} que ficaram fora do fechamento</p>
          <p>Provavelmente entraram depois do fechamento. Realize o pagamento e clique em <strong>Registrar pagamento</strong>: o valor passa a constar na folha do mês, sinalizado como pago após o fechamento.</p>
        </div>
      </div>
      <div className="border-t border-indigo-200 bg-white/70 rounded-b-2xl">
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wide text-indigo-800">
            <tr>
              <th className="px-4 py-2">Promotor</th>
              <th className="px-3 py-2">Período</th>
              <th className="px-3 py-2 text-center">Dias</th>
              <th className="px-3 py-2 text-right">A lançar</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {pendentes.map((p) => {
              const r = p.resultado;
              const pagos = r.diasPagos;
              return (
                <tr key={r.colaborador.id} className="border-t border-indigo-100">
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-zinc-800">{r.colaborador.nome}</span>
                      {ehTemporario(r.colaborador.empresa) && <BadgeTmp />}
                    </div>
                    <span className="text-zinc-400">{r.colaborador.matricula}</span>
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{pagos.length > 0 ? `${formatarData(pagos[0].data)} a ${formatarData(pagos[pagos.length - 1].data)}` : '—'}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.diasTrabalhados}</td>
                  <td className="px-3 py-2 text-right font-bold text-zinc-800 whitespace-nowrap">{moeda(valorTotalLancar(r.valorPagar, p.avulso))}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" className="rounded-xl" disabled={registrando !== null} onClick={() => registrar(p)}>
                      {registrando === r.colaborador.id ? 'Registrando...' : 'Registrar pagamento'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
