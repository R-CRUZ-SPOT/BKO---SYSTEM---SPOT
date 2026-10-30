'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, UserMinus } from 'lucide-react';
import { carregarDescontosPendentes, type DescontoPendente } from '@/lib/ajuda-custo-data';
import { type Desconto, ehTemporario, formatarData, moeda, nomeCompetencia, r2, somarDias } from '@/lib/ajuda-custo';
import { BadgeTmp } from './badge-tmp';

/** Agrupa os dias descontados em períodos (início a fim) por motivo; uma pausa de mais de 7 dias abre novo período. */
function periodos(descontos: Desconto[]): string {
  const grupos: { motivo: string; ini: string; fim: string }[] = [];
  for (const d of descontos) {
    const g = grupos[grupos.length - 1];
    if (g && g.motivo === d.motivo && d.data <= somarDias(g.fim, 7)) g.fim = d.data;
    else grupos.push({ motivo: d.motivo, ini: d.data, fim: d.data });
  }
  return grupos.map((g) => `${g.ini === g.fim ? formatarData(g.ini) : `${formatarData(g.ini)} a ${formatarData(g.fim)}`} (${g.motivo})`).join(' · ');
}

/**
 * Mês já fechado (pago): mostra o que passou a ser descontável depois do pagamento, por exemplo um desligamento
 * cadastrado durante o mês. O valor entra na folha seguinte; para desligados, é informação para a rescisão.
 */
export function DescontosPendentes({ competencia, lancamentoId }: { competencia: string; lancamentoId: string }) {
  const [linhas, setLinhas] = useState<DescontoPendente[] | null>(null);

  useEffect(() => {
    let ativo = true;
    carregarDescontosPendentes(lancamentoId, competencia)
      .then((r) => ativo && setLinhas(r))
      .catch((e) => {
        console.error(e);
        if (ativo) setLinhas([]);
      });
    return () => {
      ativo = false;
    };
  }, [lancamentoId, competencia]);

  if (!linhas || linhas.length === 0) return null;

  const total = r2(linhas.reduce((s, l) => s + l.total, 0));

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="flex gap-3 text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">
              {linhas.length} desligado(s) com dias já pagos em {nomeCompetencia(competencia)} — {moeda(-total)} a descontar na rescisão
            </p>
            <p>Dias pagos que ficaram dentro do desligamento. Sem folha seguinte, o valor deve ser acertado na rescisão.</p>
          </div>
        </div>
      </div>
      <div className="max-h-80 overflow-auto border-t border-amber-200 bg-white/70 rounded-b-2xl">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-amber-50 text-left text-[10px] uppercase tracking-wide text-amber-800">
            <tr>
              <th className="px-4 py-2">Promotor</th>
              <th className="px-3 py-2">Supervisor</th>
              <th className="px-3 py-2">Dias a descontar</th>
              <th className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.colaborador_id} className={`border-t border-amber-100 align-top ${l.desligado ? 'bg-rose-50/70' : ''}`}>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-zinc-800">{l.nome}</span>
                    {ehTemporario(l.empresa) && <BadgeTmp />}
                    {l.desligado && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <UserMinus className="w-3 h-3" /> Desligado — acertar na rescisão
                      </span>
                    )}
                    {!l.desligado && l.inativo && <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500">Inativo</span>}
                  </div>
                  <span className="text-zinc-400">{l.matricula}</span>
                </td>
                <td className="px-3 py-2 text-zinc-600">{l.supervisor ?? '—'}</td>
                <td className="px-3 py-2 text-zinc-600">
                  {periodos(l.descontos)}
                </td>
                <td className="px-3 py-2 text-right font-bold text-rose-700 whitespace-nowrap">{moeda(-l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
