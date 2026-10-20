'use client';

import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { type Avulso, DIAS_SEMANA, type DiferencaDia, diaSemana, formatarData, moeda, nomeCompetencia, r2 } from '@/lib/ajuda-custo';
import { rotuloCampo } from './colab-picker';
import { cn } from '@/lib/utils';

interface Props {
  promotor: { id: string; nome: string; matricula: string };
  competencia: string;
  avulso?: Avulso;
  /** diferenças de valor detectadas nos dias já pagos (ver diferencasDeValor) */
  diferencas: DiferencaDia[];
  onFechar: () => void;
  onSalvo: () => void;
}

const texto = (n: number | undefined) => (n ? String(n) : '');
const numero = (s: string) => Number((s || '0').replace(',', '.'));

export function AvulsosDialog({ promotor, competencia, avulso, diferencas, onFechar, onSalvo }: Props) {
  const [internet, setInternet] = useState(texto(avulso?.internet));
  const [dif, setDif] = useState(texto(avulso?.dif_ajc));
  const [alimentacao, setAlimentacao] = useState(texto(avulso?.alimentacao));
  const [observacao, setObservacao] = useState(avulso?.observacao ?? '');
  const [difDias, setDifDias] = useState(avulso?.dif_dias ?? []);
  const [painelDif, setPainelDif] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const totalDif = r2(diferencas.reduce((s, d) => s + d.diferenca, 0));

  function usarDiferenca() {
    setDif(String(totalDif));
    setDifDias(diferencas.map((d) => ({ id: d.diaPagoId, data: d.data, pago: d.pago, novo: d.novo })));
    setPainelDif(false);
    toast.success(`DIF - AJC preenchido com ${moeda(totalDif)}.`);
  }

  function aoEditarDif(valor: string) {
    setDif(valor);
    // se o valor deixou de ser o calculado, os dias não devem ser marcados como acertados
    if (difDias.length > 0 && numero(valor) !== r2(difDias.reduce((s, d) => s + (d.novo - d.pago), 0))) setDifDias([]);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const v = { internet: numero(internet), dif_ajc: numero(dif), alimentacao: numero(alimentacao) };
    if ([v.internet, v.dif_ajc, v.alimentacao].some((n) => Number.isNaN(n))) return toast.error('Valores inválidos.');
    if (v.internet < 0 || v.alimentacao < 0) return toast.error('Internet e Alimentação não podem ser negativos. Use o DIF - AJC para descontos.');

    setSalvando(true);
    const vazio = v.internet === 0 && v.dif_ajc === 0 && v.alimentacao === 0 && !observacao.trim();
    const { error } = vazio
      ? await supabase.from('ajuda_custo_avulsos').delete().eq('competencia', competencia).eq('colaborador_id', promotor.id)
      : await supabase.from('ajuda_custo_avulsos').upsert(
          {
            competencia,
            colaborador_id: promotor.id,
            ...v,
            observacao: observacao.trim() || null,
            dif_dias: v.dif_ajc === 0 ? [] : difDias,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'competencia,colaborador_id' }
        );
    setSalvando(false);
    if (error) return toast.error('Erro ao salvar: ' + error.message + ' (execute scripts/ajuda-de-custo-avulsos.sql no Supabase)');
    toast.success('Lançamentos avulsos salvos.');
    onSalvo();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight text-zinc-900">Lançamentos avulsos</DialogTitle>
          <DialogDescription>
            {promotor.nome} · MAT {promotor.matricula} · {nomeCompetencia(competencia)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={rotuloCampo}>Internet</label>
              <Input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" value={internet} onChange={(e) => setInternet(e.target.value)} className="h-12 rounded-xl" />
              <p className="text-[11px] text-zinc-500">Soma ao valor a lançar.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className={rotuloCampo}>DIF - AJC</label>
                {numero(dif) !== 0 && (
                  <button type="button" onClick={() => { setDif(''); setDifDias([]); }} className="text-[11px] font-bold text-rose-600 hover:underline mr-3 ml-auto">
                    Limpar
                  </button>
                )}
                <button type="button" onClick={() => setPainelDif((p) => !p)} className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
                  <Calculator className="w-3 h-3" /> Calcular diferença
                </button>
              </div>
              <Input type="number" step="0.01" inputMode="decimal" placeholder="0,00" value={dif} onChange={(e) => aoEditarDif(e.target.value)} className="h-12 rounded-xl" />
              <p className="text-[11px] text-zinc-500">
                Diferença de ajuda de custo. Soma ao valor a lançar; use valor negativo para descontar.
                {difDias.length > 0 && <strong className="text-emerald-700"> {difDias.length} dia(s) serão marcados como acertados ao fechar.</strong>}
              </p>
            </div>
          </div>

          {painelDif && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3">
              {diferencas.length === 0 ? (
                <p className="text-xs text-zinc-600">
                  Nenhuma diferença encontrada. O cálculo compara o valor pago com o valor cadastrado em cada dia do <strong>mês anterior</strong> a {nomeCompetencia(competencia)}:
                  se a mudança de valor foi em outubro, abra a competência de novembro. Confira também se a vigência do novo valor (em Valores por Dia) é a data real da mudança.
                </p>
              ) : (
                <>
                  <p className="text-xs text-zinc-700">
                    Dias já pagos em que o valor atual é diferente do valor pago (dias com falta, atestado ou feriado não entram: viram desconto).
                    {diferencas.some((d) => d.estimado) && (
                      <strong className="block mt-1 text-amber-800">
                        O mês anterior não foi fechado no sistema: o valor pago foi presumido pelos valores em vigor no 1º dia do mês. Confira com o que foi realmente lançado.
                      </strong>
                    )}
                  </p>
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Dia</TableHead>
                          <TableHead className="text-right">Pago</TableHead>
                          <TableHead className="text-right">Valor atual</TableHead>
                          <TableHead className="text-right">Diferença</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {diferencas.map((d) => (
                          <TableRow key={d.data}>
                            <TableCell className="text-xs"><span className="tabular-nums">{formatarData(d.data)}</span> · <span className="text-zinc-500">{DIAS_SEMANA[diaSemana(d.data)]}</span></TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{moeda(d.pago)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{moeda(d.novo)}</TableCell>
                            <TableCell className={cn('text-right text-xs tabular-nums font-bold', d.diferenca < 0 && 'text-rose-600')}>{d.diferenca > 0 ? '+ ' : '− '}{moeda(Math.abs(d.diferenca))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black">Total: <span className={cn('tabular-nums', totalDif < 0 && 'text-rose-600')}>{totalDif > 0 ? '+ ' : totalDif < 0 ? '− ' : ''}{moeda(Math.abs(totalDif))}</span></p>
                    <Button type="button" size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={usarDiferenca}>Usar no DIF - AJC</Button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className={rotuloCampo}>Alimentação</label>
            <Input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" value={alimentacao} onChange={(e) => setAlimentacao(e.target.value)} className="h-12 rounded-xl sm:w-1/2" />
            <p className="text-[11px] text-sky-700 font-bold">Lançamento à parte: NÃO soma ao valor a lançar da ajuda de custo.</p>
          </div>

          <div className="space-y-1">
            <label className={rotuloCampo}>Observação (opcional)</label>
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex: mudança de roteiro em 15/10" className="h-12 rounded-xl" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvando} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">{salvando ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
