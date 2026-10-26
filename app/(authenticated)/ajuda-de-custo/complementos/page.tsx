'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Download, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/lib/auth-context';
import { DIAS_SEMANA, type DiferencaDia, diaSemana, diferencasNoMes, ehTemporario, formatarData, moeda, nomeCompetencia, r2, somarMeses } from '@/lib/ajuda-custo';
import { carregarEmpresas, carregarEntrada, type CarregamentoCalculo } from '@/lib/ajuda-custo-data';
import { BadgeTmp } from '@/components/ajuda-custo/badge-tmp';
import { supabase } from '@/lib/supabase';
import { rotuloCampo } from '@/components/ajuda-custo/colab-picker';
import { avisarAcertosMudaram } from '@/hooks/use-acertos-pendentes';
import { cn } from '@/lib/utils';

interface Complemento {
  id: string;
  colaborador_id: string;
  competencia: string;
  valor: number;
  dias: { data: string; pago: number; novo: number }[];
  observacao: string | null;
  criado_por: string | null;
  created_at: string;
  lancado_em: string | null;
  colaboradores?: { nome: string; matricula: string } | null;
}

interface Pendencia {
  id: string;
  nome: string;
  matricula: string;
  empresa: string | null;
  supervisor: string | null;
  /** dias com acréscimo: pagos agora */
  dif: DiferencaDia[];
  total: number;
  /** dias com redução: descontados na próxima folha */
  reducao: DiferencaDia[];
  totalReducao: number;
}

const TH = 'text-[11px] font-bold uppercase tracking-wider text-zinc-500';

export default function ComplementosPage() {
  const { user } = useAuth();
  const [mes, setMes] = useState(new Date().toLocaleDateString('sv-SE').slice(0, 7));
  const [dados, setDados] = useState<CarregamentoCalculo | null>(null);
  const [lista, setLista] = useState<Complemento[]>([]);
  const [loading, setLoading] = useState(true);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [observacao, setObservacao] = useState('');
  const [empresas, setEmpresas] = useState<Map<string, string | null>>(new Map());
  const [registrando, setRegistrando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      // a entrada é carregada na competência seguinte ao mês, para enxergar o que já foi pago nele
      const [entrada, comps, emp] = await Promise.all([
        carregarEntrada(somarMeses(mes, 1)),
        supabase.from('ajuda_custo_complementos').select('*, colaboradores(nome, matricula)').order('created_at', { ascending: false }).limit(500),
        carregarEmpresas(),
      ]);
      setEmpresas(emp);
      if (comps.error) throw comps.error;
      setDados(entrada);
      setLista((comps.data ?? []).map((c: any) => ({ ...c, valor: Number(c.valor) })));
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar: ' + (e.message || 'verifique se scripts/ajuda-de-custo-complementos.sql foi executado no Supabase.'));
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // promotores com diferença de valor no mês (já descontando o que foi acertado)
  const analise = useMemo<Pendencia[]>(() => {
    if (!dados) return [];
    return dados.entrada.colaboradores
      .map((c) => {
        const todas = diferencasNoMes(c, dados.entrada, mes);
        const dif = todas.filter((d) => d.diferenca > 0);
        const reducao = todas.filter((d) => d.diferenca < 0);
        return {
          id: c.id,
          nome: c.nome,
          matricula: c.matricula ?? '',
          empresa: c.empresa ?? null,
          supervisor: c.supervisor ?? null,
          dif,
          total: r2(dif.reduce((s, d) => s + d.diferenca, 0)),
          reducao,
          totalReducao: r2(reducao.reduce((s, d) => s + d.diferenca, 0)),
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dados, mes]);

  // acréscimos: pagos na hora (acerto imediato). Reduções: só podem ser descontadas na próxima folha.
  const pendencias = useMemo(() => analise.filter((p) => p.dif.length > 0), [analise]);
  const reducoes = useMemo(() => analise.filter((p) => p.reducao.length > 0), [analise]);
  const totalPendencias = r2(pendencias.reduce((s, p) => s + p.total, 0));
  const totalReducoes = r2(reducoes.reduce((s, p) => s + p.totalReducao, 0));
  const doMes = lista.filter((c) => c.competencia === mes);
  const totalDoMes = r2(doMes.reduce((s, c) => s + c.valor, 0));
  const aLancar = lista.filter((c) => !c.lancado_em); // só acertos antigos: os novos já nascem lançados

  async function registrar(alvo: Pendencia[]) {
    if (alvo.length === 0) return;
    if (alvo.length > 1) {
      const ok = window.confirm(`Registrar ${alvo.length} acertos, num total de ${moeda(r2(alvo.reduce((s, p) => s + p.total, 0)))}?`);
      if (!ok) return;
    }
    setRegistrando(true);
    const { error } = await supabase.from('ajuda_custo_complementos').insert(
      alvo.map((p) => ({
        colaborador_id: p.id,
        competencia: mes,
        valor: p.total,
        dias: p.dif.map((d) => ({ data: d.data, pago: d.pago, novo: d.novo })),
        observacao: observacao.trim() || null,
        criado_por: user?.email ?? null,
        lancado_em: new Date().toISOString(), // registrar já conta como lançado
      }))
    );
    setRegistrando(false);
    if (error) return toast.error('Erro ao registrar: ' + error.message);
    toast.success(alvo.length === 1 ? `Acerto de ${moeda(alvo[0].total)} registrado e lançado para ${alvo[0].nome}.` : `${alvo.length} acertos registrados e lançados.`);
    avisarAcertosMudaram();
    carregar();
  }

  async function alternarLancado(c: Complemento) {
    const { error } = await supabase.from('ajuda_custo_complementos').update({ lancado_em: c.lancado_em ? null : new Date().toISOString() }).eq('id', c.id);
    if (error) return toast.error('Erro ao atualizar: ' + error.message);
    carregar();
  }

  async function excluir(c: Complemento) {
    const ok = window.confirm(
      `Excluir o acerto de ${moeda(c.valor)} de ${c.colaboradores?.nome ?? 'promotor'}?\n\nOs dias voltam a ter a diferença em aberto. Se o pagamento já foi feito, ele não é desfeito.`
    );
    if (!ok) return;
    const { error } = await supabase.from('ajuda_custo_complementos').delete().eq('id', c.id);
    if (error) return toast.error('Erro ao excluir: ' + error.message);
    avisarAcertosMudaram();
    carregar();
  }

  async function exportarAcertos() {
    const XLSX = await import('xlsx');
    const linhas = lista.map((c) => ({
      'Registrado em': new Date(c.created_at).toLocaleString('pt-BR'),
      Matrícula: c.colaboradores?.matricula ?? '',
      Promotor: c.colaboradores?.nome ?? '',
      Empresa: empresas.get(c.colaborador_id) ?? '',
      'Mês de referência': nomeCompetencia(c.competencia),
      Dias: c.dias.length,
      Valor: c.valor,
      Situação: c.lancado_em ? `lançado em ${new Date(c.lancado_em).toLocaleDateString('pt-BR')}` : 'a lançar',
      Observação: c.observacao ?? '',
    }));
    XLSX.writeFile({ SheetNames: ['Acertos'], Sheets: { Acertos: XLSX.utils.json_to_sheet(linhas) } }, 'acertos-imediatos.xlsx');
  }

  function alternar(chave: string) {
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 max-w-3xl">
        Quando o valor diário de um promotor muda <strong>durante o mês</strong>, o sistema detecta a diferença dos dias a partir da nova vigência (inclusive os que ainda serão
        trabalhados) e lista aqui para você pagar na hora. Mudanças com vigência em meses futuros não aparecem: a folha daquele mês já sai com o valor certo. Depois de registrado,
        o acerto não é cobrado nem pago de novo no fechamento. Ao registrar, o acerto já fica marcado como <strong>lançado</strong>: o pagamento é feito por você na hora; se
        precisar, desmarque na lista de registrados.
      </p>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <label className={rotuloCampo}>Mês de referência</label>
          <Input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="h-11 w-48 rounded-xl bg-white" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className={cn('border-zinc-100 shadow-sm', pendencias.length > 0 ? 'bg-rose-600 text-white' : 'bg-white/50')}>
          <CardContent className="p-5">
            <p className={cn('text-[10px] font-black uppercase tracking-widest', pendencias.length > 0 ? 'text-rose-100' : 'text-zinc-400')}>Pendentes de acerto</p>
            <p className="text-2xl font-black tabular-nums mt-1">{pendencias.length}</p>
            <p className={cn('text-[11px] mt-1', pendencias.length > 0 ? 'text-rose-100' : 'text-zinc-500')}>{pendencias.length > 0 ? `Total ${moeda(totalPendencias)}` : 'Nenhuma diferença em aberto'}</p>
          </CardContent>
        </Card>
        <Card className={cn('border-zinc-100 shadow-sm', reducoes.length > 0 ? 'bg-amber-500 text-white' : 'bg-white/50')}>
          <CardContent className="p-5">
            <p className={cn('text-[10px] font-black uppercase tracking-widest', reducoes.length > 0 ? 'text-amber-100' : 'text-zinc-400')}>Reduções p/ próxima folha</p>
            <p className="text-2xl font-black tabular-nums mt-1">{reducoes.length}</p>
            <p className={cn('text-[11px] mt-1', reducoes.length > 0 ? 'text-amber-100' : 'text-zinc-500')}>{reducoes.length > 0 ? `Total ${moeda(totalReducoes)}` : 'Nenhuma redução de valor'}</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-100 shadow-sm bg-emerald-600 text-white">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100">Acertos de {nomeCompetencia(mes)}</p>
            <p className="text-2xl font-black tabular-nums mt-1">{moeda(totalDoMes)}</p>
            <p className="text-[11px] text-emerald-100 mt-1">{doMes.length} acerto(s) registrado(s){aLancar.length > 0 ? ` · ${aLancar.length} ainda a lançar` : ''}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white/50">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-zinc-100 bg-white/80">
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight text-zinc-900">Diferenças a acertar em {nomeCompetencia(mes)}</h3>
            <p className="text-[11px] text-zinc-500">Promotores cujo valor diário mudou no mês</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação (opcional)" className="h-9 w-56 rounded-xl bg-white" />
            <Button disabled={pendencias.length < 2 || registrando} onClick={() => registrar(pendencias)} className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700">
              Registrar todos ({pendencias.length})
            </Button>
          </div>
        </div>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8" />
                <TableHead className={TH}>Promotor</TableHead>
                <TableHead className={cn(TH, 'text-center')}>Dias</TableHead>
                <TableHead className={cn(TH, 'text-right')}>Diferença</TableHead>
                <TableHead className={cn(TH, 'px-6 text-right')}>Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-12 text-zinc-400">Calculando...</TableCell></TableRow>
              ) : pendencias.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-12 text-zinc-400">Nenhuma diferença pendente em {nomeCompetencia(mes)}.</TableCell></TableRow>
              ) : (
                pendencias.map((p) => {
                  const chave = `p-${p.id}`;
                  const aberto = abertos.has(chave);
                  return (
                    <Fragment key={p.id}>
                      <TableRow className={cn('cursor-pointer hover:bg-zinc-50/60', ehTemporario(p.empresa) && 'bg-amber-200 hover:bg-amber-300/80 shadow-[inset_5px_0_0_0_#d97706]')} onClick={() => alternar(chave)}>
                        <TableCell className="pl-4">{aberto ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}</TableCell>
                        <TableCell className="py-3">
                          <p className="text-sm font-bold text-zinc-900">{p.nome}{ehTemporario(p.empresa) && <BadgeTmp />}</p>
                          <p className="text-[10px] text-zinc-500">MAT: {p.matricula}{p.supervisor ? ' · SUP: ' + p.supervisor : ''}</p>
                        </TableCell>
                        <TableCell className="text-center text-xs tabular-nums">{p.dif.length}</TableCell>
                        <TableCell className={cn('text-right text-sm font-black tabular-nums', p.total < 0 ? 'text-rose-600' : 'text-emerald-700')}>{moeda(p.total)}</TableCell>
                        <TableCell className="px-6 text-right" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" disabled={registrando} onClick={() => registrar([p])} className="rounded-xl bg-emerald-600 hover:bg-emerald-700">Registrar acerto</Button>
                        </TableCell>
                      </TableRow>
                      {aberto && (
                        <TableRow className="bg-zinc-50/70 hover:bg-zinc-50/70">
                          <TableCell />
                          <TableCell colSpan={4} className="py-4 pr-6">
                            {p.dif.some((d) => d.estimado) && (
                              <p className="mb-2 text-xs font-bold text-amber-800">
                                {nomeCompetencia(mes)} não está fechado no sistema: o valor já pago foi presumido pelos valores em vigor no 1º dia do mês. Confira com o que foi realmente lançado.
                              </p>
                            )}
                            <ul className="space-y-1 text-xs max-w-xl">
                              {p.dif.map((d) => (
                                <li key={d.data} className="flex justify-between gap-4">
                                  <span><span className="tabular-nums">{formatarData(d.data)}</span> · <span className="text-zinc-500">{DIAS_SEMANA[diaSemana(d.data)]}</span></span>
                                  <span className="tabular-nums">{moeda(d.pago)} → {moeda(d.novo)} <strong className={cn('ml-2', d.diferenca < 0 && 'text-rose-600')}>{d.diferenca >= 0 ? '+ ' : '− '}{moeda(Math.abs(d.diferenca))}</strong></span>
                                </li>
                              ))}
                            </ul>
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

      {reducoes.length > 0 && (
        <Card className="border-none shadow-sm overflow-hidden bg-white/50">
          <div className="px-6 py-3 border-b border-amber-100 bg-amber-50">
            <h3 className="text-sm font-black uppercase tracking-tight text-amber-900">Reduções de valor: descontar na próxima folha</h3>
            <p className="text-[11px] text-amber-800">
              O valor diário diminuiu depois do pagamento, então o promotor recebeu a mais. Isso não vira acerto imediato: entra como desconto (DIF - AJC negativo) no fechamento
              do mês seguinte, e o Cálculo do Mês avisa e aplica com um clique.
            </p>
          </div>
          <CardContent className="p-0 divide-y divide-zinc-100">
            {reducoes.map((p) => (
              <div key={p.id} className="px-6 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-zinc-900">{p.nome}{ehTemporario(p.empresa) && <BadgeTmp />}</p>
                    <p className="text-[10px] text-zinc-500">MAT: {p.matricula} · {p.reducao.length} {p.reducao.length === 1 ? 'dia' : 'dias'}</p>
                  </div>
                  <p className="text-sm font-black tabular-nums text-rose-600">− {moeda(Math.abs(p.totalReducao))}</p>
                </div>
                <ul className="mt-2 space-y-1 text-xs max-w-xl">
                  {p.reducao.map((d) => (
                    <li key={d.data} className="flex justify-between gap-4 text-zinc-600">
                      <span><span className="tabular-nums">{formatarData(d.data)}</span> · {DIAS_SEMANA[diaSemana(d.data)]}</span>
                      <span className="tabular-nums">{moeda(d.pago)} → {moeda(d.novo)} <strong className="ml-2 text-rose-600">− {moeda(Math.abs(d.diferenca))}</strong></span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-none shadow-sm overflow-hidden bg-white/50">
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-100 bg-white/80">
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight text-zinc-900">Acertos registrados</h3>
            <p className="text-[11px] text-zinc-500">{lista.length} acerto(s)</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={exportarAcertos} disabled={lista.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Exportar acertos
          </Button>
        </div>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8" />
                <TableHead className={TH}>Registrado em</TableHead>
                <TableHead className={TH}>Promotor</TableHead>
                <TableHead className={TH}>Mês</TableHead>
                <TableHead className={cn(TH, 'text-center')}>Dias</TableHead>
                <TableHead className={cn(TH, 'text-right')}>Valor</TableHead>
                <TableHead className={TH}>Situação</TableHead>
                <TableHead className={cn(TH, 'px-6 text-right')}>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-zinc-400">Carregando...</TableCell></TableRow>
              ) : lista.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-zinc-400">Nenhum acerto registrado.</TableCell></TableRow>
              ) : (
                lista.map((c) => {
                  const chave = `c-${c.id}`;
                  const aberto = abertos.has(chave);
                  return (
                    <Fragment key={c.id}>
                      <TableRow className={cn('cursor-pointer hover:bg-zinc-50/60', ehTemporario(empresas.get(c.colaborador_id)) && 'bg-amber-200 hover:bg-amber-300/80 shadow-[inset_5px_0_0_0_#d97706]')} onClick={() => alternar(chave)}>
                        <TableCell className="pl-4">{aberto ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}</TableCell>
                        <TableCell className="text-xs tabular-nums whitespace-nowrap">{new Date(c.created_at).toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="py-3">
                          <p className="text-sm font-bold text-zinc-900">{c.colaboradores?.nome ?? '—'}{ehTemporario(empresas.get(c.colaborador_id)) && <BadgeTmp />}</p>
                          <p className="text-[10px] text-zinc-500">MAT: {c.colaboradores?.matricula}</p>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{nomeCompetencia(c.competencia)}</TableCell>
                        <TableCell className="text-center text-xs tabular-nums">{c.dias.length}</TableCell>
                        <TableCell className={cn('text-right text-sm font-black tabular-nums', c.valor < 0 ? 'text-rose-600' : 'text-emerald-700')}>{moeda(c.valor)}</TableCell>
                        <TableCell>
                          {c.lancado_em ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-1">
                              <CheckCircle2 className="w-3 h-3" /> lançado {new Date(c.lancado_em).toLocaleDateString('pt-BR')}
                            </span>
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-1">a lançar</span>
                          )}
                        </TableCell>
                        <TableCell className="px-6 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" title={c.lancado_em ? 'Desmarcar como lançado' : 'Marcar como lançado'} onClick={() => alternarLancado(c)}>
                            {c.lancado_em ? <Undo2 className="w-4 h-4 text-zinc-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                          </Button>
                          <Button variant="ghost" size="icon" title="Excluir acerto" onClick={() => excluir(c)}><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                        </TableCell>
                      </TableRow>
                      {aberto && (
                        <TableRow className="bg-zinc-50/70 hover:bg-zinc-50/70">
                          <TableCell />
                          <TableCell colSpan={7} className="py-4 pr-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                              <ul className="space-y-1">
                                {c.dias.map((d) => (
                                  <li key={d.data} className="flex justify-between gap-4">
                                    <span><span className="tabular-nums">{formatarData(d.data)}</span> · <span className="text-zinc-500">{DIAS_SEMANA[diaSemana(d.data)]}</span></span>
                                    <span className="tabular-nums">{moeda(d.pago)} → {moeda(d.novo)} <strong className="ml-2">{d.novo - d.pago >= 0 ? '+ ' : '− '}{moeda(Math.abs(d.novo - d.pago))}</strong></span>
                                  </li>
                                ))}
                              </ul>
                              <div className="text-zinc-500 space-y-1">
                                {c.observacao && <p>Obs.: {c.observacao}</p>}
                                {c.criado_por && <p>Registrado por {c.criado_por}</p>}
                              </div>
                            </div>
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
