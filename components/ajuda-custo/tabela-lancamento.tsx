'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BadgeTmp } from './badge-tmp';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type Avulso, DIAS_SEMANA, ehTemporario, type ResultadoColaborador, diaSemana, formatarData, moeda, nomeCompetencia, r2, saldoDevedorFinal, valorTotalLancar } from '@/lib/ajuda-custo';
import { cn } from '@/lib/utils';

export interface LinhaLancamento {
  id: string;
  nome: string;
  matricula: string;
  /** tipo de contratação (EMPRESA); TMP = temporário */
  empresa: string | null;
  dias: number;
  uteis: number;
  descontados: number;
  bruto: number;
  descontos: number;
  saldoAnterior: number;
  /** ajuda de custo calculada (antes dos avulsos) */
  valorAjuda: number;
  internet: number;
  difAjc: number;
  /** lançamento à parte: não soma ao valor a lançar */
  alimentacao: number;
  observacaoAvulso: string | null;
  difDiasCount: number;
  /** valor a lançar = ajuda + internet + DIF - AJC */
  valorPagar: number;
  saldoDevedor: number;
  porDiaSemana: { dow: number; quantidade: number; subtotal: number }[];
  pagos: { data: string; valor: number }[];
  excluidos: { data: string; valor: number; motivo?: string }[];
  listaDescontos: { data: string; valor: number; motivo: string; estimado?: boolean }[];
}

export function linhaDeResultado(r: ResultadoColaborador, av?: Avulso): LinhaLancamento {
  return {
    id: r.colaborador.id,
    nome: r.colaborador.nome,
    matricula: r.colaborador.matricula ?? '',
    empresa: r.colaborador.empresa ?? null,
    dias: r.diasTrabalhados,
    uteis: r.dias.filter((d) => !d.motivo?.startsWith('Feriado')).length,
    descontados: r.descontos.length,
    bruto: r.bruto,
    descontos: r.totalDescontos,
    saldoAnterior: r.saldoAnterior,
    valorAjuda: r.valorPagar,
    internet: av?.internet ?? 0,
    difAjc: av?.dif_ajc ?? 0,
    alimentacao: av?.alimentacao ?? 0,
    observacaoAvulso: av?.observacao ?? null,
    difDiasCount: av?.dif_dias.length ?? 0,
    valorPagar: valorTotalLancar(r.valorPagar, av),
    saldoDevedor: saldoDevedorFinal(r.valorPagar, r.saldoDevedor, av),
    porDiaSemana: r.porDiaSemana,
    pagos: r.diasPagos.map((d) => ({ data: d.data, valor: d.valor })),
    excluidos: r.dias.filter((d) => !d.pago).map((d) => ({ data: d.data, valor: d.valor, motivo: d.motivo })),
    listaDescontos: r.descontos,
  };
}

export function linhaDeItemSalvo(item: any): LinhaLancamento {
  const det = item.detalhes ?? {};
  const internet = Number(item.internet ?? 0);
  const difAjc = Number(item.dif_ajc ?? 0);
  return {
    id: item.colaborador_id,
    nome: item.colaboradores?.nome ?? '—',
    matricula: item.colaboradores?.matricula ?? '',
    empresa: null, // preenchida depois (carregarEmpresas)
    dias: item.dias_trabalhados,
    uteis: item.dias_trabalhados + (det.dias_excluidos ?? []).filter((d: any) => !String(d.motivo ?? '').startsWith('Feriado')).length,
    descontados: (det.descontos ?? []).length,
    bruto: Number(item.bruto),
    descontos: Number(item.descontos),
    saldoAnterior: Number(item.saldo_anterior),
    valorAjuda: Math.max(0, r2(Number(item.valor_pagar) - internet - difAjc)),
    internet,
    difAjc,
    alimentacao: Number(item.alimentacao ?? 0),
    observacaoAvulso: det.avulsos?.observacao ?? null,
    difDiasCount: (det.avulsos?.dif_dias ?? []).length,
    valorPagar: Number(item.valor_pagar),
    saldoDevedor: Number(item.saldo_devedor),
    porDiaSemana: det.por_dia_semana ?? [],
    pagos: det.dias_pagos ?? [],
    excluidos: det.dias_excluidos ?? [],
    listaDescontos: det.descontos ?? [],
  };
}

const TH = 'text-[10px] font-bold uppercase tracking-wide text-zinc-500';
const SEM_EMPRESA = '__sem__';

/** Número com 2 casas, sem o "R$" (a tabela é toda em reais; economiza largura). */
const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Divide o valor em 2 pagamentos de 50%; se sobrar 1 centavo, ele fica no 1º pagamento. */
function dividirEmDois(valor: number): [number, number] {
  const centavos = Math.round(valor * 100);
  const primeiro = Math.ceil(centavos / 2);
  return [primeiro / 100, (centavos - primeiro) / 100];
}

export function TabelaLancamento({
  linhas: todas,
  competencia,
  onEditarAvulsos,
}: {
  linhas: LinhaLancamento[];
  competencia: string;
  /** quando informado, a tabela permite editar os lançamentos avulsos de cada promotor */
  onEditarAvulsos?: (linhaId: string) => void;
}) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [contratacao, setContratacao] = useState(''); // '' = todas, SEM = sem informação, ou o valor de EMPRESA

  const empresasDisponiveis = useMemo(() => [...new Set(todas.map((l) => l.empresa?.trim()).filter((e): e is string => !!e))].sort(), [todas]);
  const temSemEmpresa = todas.some((l) => !l.empresa?.trim());

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todas.filter((l) => {
      if (q && !`${l.nome} ${l.matricula}`.toLowerCase().includes(q)) return false;
      if (contratacao === SEM_EMPRESA) return !l.empresa?.trim();
      if (contratacao) return (l.empresa?.trim() ?? '') === contratacao;
      return true;
    });
  }, [todas, busca, contratacao]);
  const filtrado = linhas.length !== todas.length;

  const totais = useMemo(
    () => ({
      pagar: linhas.reduce((s, l) => s + l.valorPagar, 0),
      bruto: linhas.reduce((s, l) => s + l.bruto, 0),
      descontos: linhas.reduce((s, l) => s + l.descontos, 0),
      saldo: linhas.reduce((s, l) => s + l.saldoDevedor, 0),
      alimentacao: linhas.reduce((s, l) => s + l.alimentacao, 0),
    }),
    [linhas]
  );

  const mostrarParcelas = todas.some((l) => ehTemporario(l.empresa));
  const mostrarAvulsos = !!onEditarAvulsos || todas.some((l) => l.internet || l.difAjc || l.alimentacao);
  const nColunas = 9 + (mostrarAvulsos ? 2 : 0) + (mostrarParcelas ? 1 : 0) + (onEditarAvulsos ? 1 : 0);

  function alternar(id: string) {
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function exportar() {
    try {
      const XLSX = await import('xlsx');
      const resumo = linhas.map((l) => ({
        Matrícula: l.matricula,
        Promotor: l.nome,
        Empresa: l.empresa ?? '',
        'Dias pagos': l.dias,
        Bruto: l.bruto,
        Descontos: l.descontos,
        'Saldo devedor anterior': l.saldoAnterior,
        'Ajuda de custo': l.valorAjuda,
        Internet: l.internet,
        'DIF - AJC': l.difAjc,
        'Valor a lançar': l.valorPagar,
        '1º pagamento (TMP, 50%)': ehTemporario(l.empresa) ? dividirEmDois(l.valorPagar)[0] : '',
        '2º pagamento (TMP, 50%)': ehTemporario(l.empresa) ? dividirEmDois(l.valorPagar)[1] : '',
        'Alimentação (lançamento à parte)': l.alimentacao,
        'Saldo devedor p/ próximo mês': l.saldoDevedor,
        Observação: l.observacaoAvulso ?? '',
      }));
      const descontos = linhas.flatMap((l) =>
        l.listaDescontos.map((d) => ({ Matrícula: l.matricula, Promotor: l.nome, Data: formatarData(d.data), Valor: d.valor, Motivo: d.motivo }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Lançamento');
      if (descontos.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(descontos), 'Descontos');
      XLSX.writeFile(wb, `ajuda-de-custo_${competencia}.xlsx`);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao exportar.');
    }
  }

  const resumoCards = [
    { rotulo: filtrado ? 'A lançar (filtro)' : 'A lançar', valor: moeda(totais.pagar), destaque: true },
    { rotulo: 'Bruto', valor: moeda(totais.bruto) },
    { rotulo: 'Descontos', valor: moeda(totais.descontos) },
    { rotulo: 'Saldo devedor', valor: moeda(totais.saldo) },
    ...(totais.alimentacao > 0 ? [{ rotulo: 'Alimentação (à parte)', valor: moeda(totais.alimentacao) }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className={cn('grid grid-cols-2 gap-4', resumoCards.length > 4 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        {resumoCards.map((c) => (
          <Card key={c.rotulo} className={cn('border-zinc-100 shadow-sm', c.destaque ? 'bg-emerald-600 text-white' : 'bg-white/50')}>
            <CardContent className="p-5">
              <p className={cn('text-[10px] font-black uppercase tracking-widest', c.destaque ? 'text-emerald-100' : 'text-zinc-400')}>{c.rotulo}</p>
              <p className="text-2xl font-black tabular-nums mt-1">{c.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white/50">
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-100 bg-white/80">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou matrícula..." className="h-9 w-64 rounded-xl bg-white pl-9" />
            </div>
            <select
              value={contratacao}
              onChange={(e) => setContratacao(e.target.value)}
              title="Tipo de contratação (coluna Empresa)"
              className="h-9 rounded-xl border border-input bg-white px-3 text-xs"
            >
              <option value="">Todas as contratações</option>
              {empresasDisponiveis.map((e) => <option key={e} value={e}>{e}{ehTemporario(e) ? ' (temporários)' : ''}</option>)}
              {temSemEmpresa && empresasDisponiveis.length > 0 && <option value={SEM_EMPRESA}>Sem informação</option>}
            </select>
            {filtrado && (
              <button type="button" onClick={() => { setBusca(''); setContratacao(''); }} className="text-[11px] font-bold text-emerald-700 hover:underline">Limpar filtros</button>
            )}
            <p className="text-xs text-zinc-500">
              {filtrado ? `${linhas.length} de ${todas.length}` : linhas.length} {todas.length === 1 && !filtrado ? 'promotor' : 'promotores'} · {nomeCompetencia(competencia)} · valores em R$
            </p>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={exportar}>
            <Download className="w-4 h-4 mr-2" /> Exportar Excel
          </Button>
        </div>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-6 px-1" />
                <TableHead className={cn(TH, 'px-2')}>Promotor</TableHead>
                <TableHead title="Dias com valor no mês, sem feriados" className={cn(TH, 'px-2 text-center')}>Úteis</TableHead>
                <TableHead title="Dias que serão pagos (úteis menos férias, atestados e faltas)" className={cn(TH, 'px-2 text-center')}>Trab.</TableHead>
                <TableHead title="Dias já pagos em meses anteriores que estão sendo descontados" className={cn(TH, 'px-2 text-center')}>Desc.</TableHead>
                <TableHead className={cn(TH, 'px-2 text-right')}>Bruto</TableHead>
                <TableHead className={cn(TH, 'px-2 text-right')}>Descontos</TableHead>
                <TableHead className={cn(TH, 'px-2 text-right')}>Saldo ant.</TableHead>
                {mostrarAvulsos && (
                  <>
                    <TableHead title="Internet + DIF - AJC: somam ao valor a lançar" className={cn(TH, 'px-2 text-right')}>Avulsos</TableHead>
                    <TableHead title="Lançamento à parte: não soma ao valor a lançar" className={cn(TH, 'px-2 text-right')}>Alim.</TableHead>
                  </>
                )}
                <TableHead className={cn(TH, 'px-3 text-right')}>A lançar</TableHead>
                {mostrarParcelas && (
                  <TableHead title="Promotores temporários (TMP): valor dividido em 2 pagamentos de 50%" className={cn(TH, 'px-2 pr-3 text-right')}>50% (TMP)</TableHead>
                )}
                {onEditarAvulsos && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.length === 0 ? (
                <TableRow><TableCell colSpan={nColunas} className="text-center py-16 text-zinc-400">Nenhum promotor com valores cadastrados.</TableCell></TableRow>
              ) : (
                linhas.map((l) => {
                  const aberto = abertos.has(l.id);
                  const extras = r2(l.internet + l.difAjc);
                  const tmp = ehTemporario(l.empresa);
                  return (
                    <Fragment key={l.id}>
                      <TableRow className={cn('cursor-pointer hover:bg-zinc-50/60', tmp && 'bg-amber-200 hover:bg-amber-300/80 shadow-[inset_5px_0_0_0_#d97706]')} onClick={() => alternar(l.id)}>
                        <TableCell className="pl-3 pr-0">{aberto ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}</TableCell>
                        <TableCell className="px-2 py-3 max-w-[190px] whitespace-normal">
                          <p className="text-sm font-bold text-zinc-900">{l.nome}</p>
                          <p className="text-[10px] text-zinc-500">{tmp && <BadgeTmp className="ml-0 mr-1.5" />}MAT: {l.matricula}{l.empresa && !tmp ? ` · ${l.empresa}` : ''}</p>
                        </TableCell>
                        <TableCell className="px-2 text-center text-sm tabular-nums text-zinc-500">{l.uteis}</TableCell>
                        <TableCell className="px-2 text-center text-sm tabular-nums font-bold">{l.dias}</TableCell>
                        <TableCell className={cn('px-2 text-center text-sm tabular-nums', l.descontados > 0 ? 'text-rose-600 font-bold' : 'text-zinc-300')}>{l.descontados > 0 ? l.descontados : '—'}{l.listaDescontos.some((d) => d.estimado) && <span title="Inclui desconto estimado: o mês anterior não está fechado no sistema" className="ml-0.5 text-[9px] font-black text-amber-600">est.</span>}</TableCell>
                        <TableCell className="px-2 text-right text-sm tabular-nums">{n2(l.bruto)}</TableCell>
                        <TableCell className={cn('px-2 text-right text-sm tabular-nums', l.descontos > 0 && 'text-rose-600 font-bold')}>{l.descontos > 0 ? `− ${n2(l.descontos)}` : '—'}</TableCell>
                        <TableCell className={cn('px-2 text-right text-sm tabular-nums', l.saldoAnterior > 0 && 'text-rose-600 font-bold')}>{l.saldoAnterior > 0 ? `− ${n2(l.saldoAnterior)}` : '—'}</TableCell>
                        {mostrarAvulsos && (
                          <>
                            <TableCell className={cn('px-2 text-right text-sm tabular-nums', extras === 0 ? 'text-zinc-300' : extras > 0 ? 'font-bold text-zinc-900' : 'font-bold text-rose-600')}>
                              {extras === 0 ? '—' : `${extras > 0 ? '+ ' : '− '}${n2(Math.abs(extras))}`}
                            </TableCell>
                            <TableCell className={cn('px-2 text-right text-sm tabular-nums', l.alimentacao > 0 ? 'font-bold text-sky-700' : 'text-zinc-300')}>
                              {l.alimentacao > 0 ? n2(l.alimentacao) : '—'}
                            </TableCell>
                          </>
                        )}
                        <TableCell className="px-3 text-right">
                          <p className="text-base font-black tabular-nums text-emerald-700">{moeda(l.valorPagar)}</p>
                          {l.saldoDevedor > 0 && <p className="text-[10px] font-bold text-amber-600">fica devendo {moeda(l.saldoDevedor)}</p>}
                        </TableCell>
                        {mostrarParcelas && (
                          <TableCell className="px-2 pr-3 text-right whitespace-nowrap">
                            {tmp ? (
                              (() => {
                                const [p1, p2] = dividirEmDois(l.valorPagar);
                                return (
                                  <div className="text-xs font-bold text-amber-900">
                                    <span className="tabular-nums">{moeda(p1)}</span>
                                    <span className="mx-1 text-amber-600">{p1 === p2 ? '×2' : '+'}</span>
                                    {p1 !== p2 && <span className="tabular-nums">{moeda(p2)}</span>}
                                  </div>
                                );
                              })()
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
                          </TableCell>
                        )}
                        {onEditarAvulsos && (
                          <TableCell className="pr-3" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" title="Lançamentos avulsos (Internet, DIF - AJC, Alimentação)" onClick={() => onEditarAvulsos(l.id)}>
                              <SlidersHorizontal className="w-4 h-4 text-zinc-500" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                      {aberto && (
                        <TableRow className="bg-zinc-50/70 hover:bg-zinc-50/70">
                          <TableCell />
                          <TableCell colSpan={nColunas - 1} className="py-4 pr-6">
                            <DetalheLinha linha={l} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function DetalheLinha({ linha }: { linha: LinhaLancamento }) {
  const temAvulsos = linha.internet !== 0 || linha.difAjc !== 0 || linha.alimentacao !== 0 || !!linha.observacaoAvulso;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 text-xs">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Dias pagos neste mês ({linha.pagos.length})</p>
        {linha.pagos.length === 0 ? (
          <p className="text-zinc-400">Nenhum dia pago.</p>
        ) : (
          <ul className="space-y-1">
            {linha.pagos.map((d) => (
              <li key={d.data} className="flex justify-between gap-4">
                <span><span className="tabular-nums">{formatarData(d.data)}</span> · <span className="text-zinc-500">{DIAS_SEMANA[diaSemana(d.data)]}</span></span>
                <span className="tabular-nums font-bold">{moeda(d.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Como chegou no bruto</p>
        {linha.porDiaSemana.length === 0 ? (
          <p className="text-zinc-400">Nenhum dia pago.</p>
        ) : (
          <ul className="space-y-1">
            {linha.porDiaSemana.map((d) => (
              <li key={d.dow} className="flex justify-between gap-4">
                <span>{d.quantidade}× {DIAS_SEMANA[d.dow]}</span>
                <span className="tabular-nums font-bold">{moeda(d.subtotal)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Dias não pagos neste mês ({linha.excluidos.length})</p>
        {linha.excluidos.length === 0 ? (
          <p className="text-zinc-400">Nenhum.</p>
        ) : (
          <ul className="space-y-1">
            {linha.excluidos.map((d) => (
              <li key={d.data} className="flex justify-between gap-4">
                <span className="tabular-nums">{formatarData(d.data)}</span>
                <span className="text-zinc-500 text-right">{d.motivo}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Descontos ({linha.listaDescontos.length} {linha.listaDescontos.length === 1 ? 'dia já pago' : 'dias já pagos'})</p>
          {linha.listaDescontos.length === 0 ? (
            <p className="text-zinc-400">Nenhum.</p>
          ) : (
            <ul className="space-y-1">
              {linha.listaDescontos.map((d) => (
                <li key={d.data} className="flex justify-between gap-4">
                  <span><span className="tabular-nums">{formatarData(d.data)}</span> · <span className="text-zinc-500">{d.motivo}</span></span>
                  <span className="tabular-nums font-bold text-rose-600">− {moeda(d.valor)}</span>
                </li>
              ))}
            </ul>
          )}
          {linha.saldoAnterior > 0 && <p className="mt-2 text-amber-700">Saldo devedor do mês anterior: − {moeda(linha.saldoAnterior)}</p>}
        </div>

        {temAvulsos && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Lançamentos avulsos</p>
            <ul className="space-y-1">
              <li className="flex justify-between gap-4"><span>Ajuda de custo calculada</span><span className="tabular-nums font-bold">{moeda(linha.valorAjuda)}</span></li>
              {linha.internet !== 0 && <li className="flex justify-between gap-4"><span>Internet</span><span className="tabular-nums font-bold">+ {moeda(linha.internet)}</span></li>}
              {linha.difAjc !== 0 && (
                <li className="flex justify-between gap-4">
                  <span>DIF - AJC{linha.difDiasCount > 0 && <span className="text-zinc-500"> ({linha.difDiasCount} {linha.difDiasCount === 1 ? 'dia acertado' : 'dias acertados'})</span>}</span>
                  <span className={cn('tabular-nums font-bold', linha.difAjc < 0 && 'text-rose-600')}>{linha.difAjc > 0 ? '+ ' : '− '}{moeda(Math.abs(linha.difAjc))}</span>
                </li>
              )}
              <li className="flex justify-between gap-4 border-t border-zinc-200 pt-1"><span className="font-bold">Valor a lançar</span><span className="tabular-nums font-black text-emerald-700">{moeda(linha.valorPagar)}</span></li>
              {linha.alimentacao > 0 && (
                <li className="flex justify-between gap-4 pt-1 text-sky-700"><span>Alimentação (lançamento à parte)</span><span className="tabular-nums font-bold">{moeda(linha.alimentacao)}</span></li>
              )}
            </ul>
            {linha.observacaoAvulso && <p className="mt-2 text-zinc-500">Obs.: {linha.observacaoAvulso}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
