'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ehCltOuMkt, ehTemporario, moeda, nomeCompetencia } from '@/lib/ajuda-custo';
import type { ItemDash } from '@/lib/ajuda-custo-dashboard';
import { FAIXAS_SALARIO, ROTULO_FAIXA, type FaixaSalario, faixaDoPercentual, percentualDoSalario } from '@/lib/salario';
import { CartaoGrafico } from './graficos';
import { cn } from '@/lib/utils';

const pct1 = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const TH = 'text-[11px] font-bold uppercase tracking-wider text-zinc-500';
const ORDEM: FaixaSalario[] = [...FAIXAS_SALARIO.map((f) => f.id), 'sem'];

/** Distribuição do percentual do bruto sobre o salário no último mês fechado, com lista por faixa. */
export function AjudaSobreSalario({ itens, competencia }: { itens: ItemDash[]; competencia: string }) {
  const [faixa, setFaixa] = useState<FaixaSalario>('50+');

  const linhas = useMemo(
    () =>
      itens.map((i) => {
        const p = percentualDoSalario(i.bruto, i.salario);
        return { ...i, p, faixa: faixaDoPercentual(p) };
      }),
    [itens]
  );

  const porFaixa = useMemo(
    () =>
      ORDEM.map((id) => {
        const doGrupo = linhas.filter((l) => l.faixa === id);
        return { id, rotulo: ROTULO_FAIXA[id], n: doGrupo.length, bruto: doGrupo.reduce((s, l) => s + l.bruto, 0) };
      }),
    [linhas]
  );
  const maxN = Math.max(1, ...porFaixa.map((f) => f.n));

  const medias = useMemo(() => {
    const grupos: [string, (e?: string | null) => boolean][] = [
      ['CLT + MKT', ehCltOuMkt],
      ['TMP', ehTemporario],
      ['Outros', (e) => !ehCltOuMkt(e) && !ehTemporario(e)],
    ];
    return grupos.map(([rotulo, regra]) => {
      const com = linhas.filter((l) => regra(l.empresa) && l.p !== null);
      return { rotulo, n: com.length, media: com.length ? com.reduce((s, l) => s + (l.p as number), 0) / com.length : null };
    });
  }, [linhas]);

  const lista = useMemo(() => linhas.filter((l) => l.faixa === faixa).sort((a, b) => (b.p ?? 0) - (a.p ?? 0) || a.nome.localeCompare(b.nome)), [linhas, faixa]);
  const comSalario = linhas.filter((l) => l.p !== null).length;

  async function exportar() {
    try {
      const XLSX = await import('xlsx');
      const rows = [...linhas]
        .sort((a, b) => (b.p ?? -1) - (a.p ?? -1))
        .map((l) => ({
          Matrícula: l.matricula,
          Promotor: l.nome,
          Empresa: l.empresa ?? '',
          Supervisor: l.supervisor ?? '',
          Praça: l.praca ?? '',
          Salário: l.salario ?? '',
          Bruto: l.bruto,
          '% do bruto sobre o salário': l.p === null ? '' : Math.round(l.p * 10) / 10,
          Faixa: ROTULO_FAIXA[l.faixa],
          'Mês parcial (ausência)': l.parcial ? 'sim' : '',
        }));
      XLSX.writeFile({ SheetNames: ['Ajuda x salário'], Sheets: { 'Ajuda x salário': XLSX.utils.json_to_sheet(rows) } }, `ajuda-sobre-salario_${competencia}.xlsx`);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao exportar.');
    }
  }

  if (comSalario === 0) {
    return (
      <CartaoGrafico titulo="Ajuda de custo × salário" subtitulo={nomeCompetencia(competencia)}>
        <p className="py-6 text-center text-sm text-zinc-400">
          Nenhum promotor com salário cadastrado. Execute <strong>scripts/colaboradores-salario.sql</strong> no Supabase e reimporte a planilha de colaboradores.
        </p>
      </CartaoGrafico>
    );
  }

  return (
    <CartaoGrafico titulo="Ajuda de custo × salário" subtitulo={`${nomeCompetencia(competencia)} · bruto do mês sobre o salário · ${comSalario} de ${linhas.length} promotores com salário`}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-1.5 xl:col-span-2">
          {porFaixa.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFaixa(f.id)}
              className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors', faixa === f.id ? 'bg-zinc-100' : 'hover:bg-zinc-50')}
            >
              <span className="w-28 shrink-0 text-xs font-bold text-zinc-700">{f.rotulo}</span>
              <span className="h-4 flex-1 rounded bg-zinc-100">
                <span className={cn('block h-4 rounded', f.id === '50+' ? 'bg-rose-500' : f.id === 'sem' ? 'bg-zinc-300' : 'bg-sky-500')} style={{ width: `${(f.n / maxN) * 100}%` }} />
              </span>
              <span className="w-40 shrink-0 text-right text-[11px] tabular-nums text-zinc-600">
                <strong>{f.n}</strong> {f.n === 1 ? 'promotor' : 'promotores'}
                {f.n > 0 ? ` · ${moeda(f.bruto)}` : ''}
              </span>
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Percentual médio por contratação</p>
          {medias.map((m) => (
            <div key={m.rotulo} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2">
              <span className="text-xs font-bold text-zinc-700">{m.rotulo}</span>
              <span className="text-sm font-black tabular-nums">
                {m.media === null ? '—' : pct1(m.media)} <span className="text-[10px] font-normal text-zinc-400">({m.n})</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
        <h4 className="text-sm font-black uppercase tracking-tight text-zinc-900">
          {ROTULO_FAIXA[faixa]} do salário · {lista.length}
        </h4>
        <Button variant="outline" size="sm" className="rounded-xl" onClick={exportar}>
          <Download className="mr-2 h-4 w-4" /> Excel (todos)
        </Button>
      </div>
      <div className="mt-2 max-h-96 overflow-auto">
        {lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">Ninguém nesta faixa.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={TH}>Promotor</TableHead>
                <TableHead className={TH}>Supervisor</TableHead>
                <TableHead className={TH}>Praça</TableHead>
                <TableHead className={cn(TH, 'text-right')}>Salário</TableHead>
                <TableHead className={cn(TH, 'text-right')}>Bruto</TableHead>
                <TableHead className={cn(TH, 'text-right')}>%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((l) => (
                <TableRow key={l.colaborador_id}>
                  <TableCell className="py-2">
                    <p className="text-sm font-bold text-zinc-900">{l.nome}</p>
                    <p className="text-[10px] text-zinc-500">
                      MAT: {l.matricula}
                      {l.empresa ? ` · ${l.empresa}` : ''}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-600">{l.supervisor ?? '—'}</TableCell>
                  <TableCell className="text-xs text-zinc-600">{l.praca ?? '—'}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{l.salario ? moeda(l.salario) : '—'}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{moeda(l.bruto)}</TableCell>
                  <TableCell className="text-right text-sm font-black tabular-nums" title={l.parcial ? 'Mês com ausência (férias, atestado, falta): percentual menor que o cheio' : undefined}>
                    {l.p === null ? '—' : pct1(l.p)}
                    {l.parcial ? '*' : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">* mês com ausência (férias, atestado, falta ou desligamento): o bruto é menor e o percentual fica abaixo do cheio.</p>
    </CartaoGrafico>
  );
}
