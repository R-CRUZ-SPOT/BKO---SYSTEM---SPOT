'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, History, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { colunasValor, linhaParaTarifa } from '@/lib/ajuda-custo-data';
import { DIAS_SEMANA, formatarData, competenciaPadrao, moeda } from '@/lib/ajuda-custo';
import { avisarAcertosMudaram } from '@/hooks/use-acertos-pendentes';
import { ImportarValores } from '@/components/ajuda-custo/importar-valores';
import { ColabPicker, rotuloCampo, useColaboradoresAtivos, useColaboradoresPorIds } from '@/components/ajuda-custo/colab-picker';

// Ordem de exibição: segunda a domingo (índice do array de valores: 0=dom ... 6=sab)
const ORDEM = [1, 2, 3, 4, 5, 6, 0];

interface LinhaValor {
  id: string;
  colaborador_id: string;
  vigencia_inicio: string;
  valores: number[];
  criado_em?: string;
}

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

interface GrupoVigencia {
  vigencia: string;
  ids: string[]; // registros que podem ser removidos
  protegidos: number; // registros que são a única vigência do promotor (mantidos)
  criado: string;
}

export default function ValoresPage() {
  const colaboradores = useColaboradoresAtivos();
  const [linhas, setLinhas] = useState<LinhaValor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [ocultarInativos, setOcultarInativos] = useState(false);
  const [remocaoAberta, setRemocaoAberta] = useState(false);
  const [removendo, setRemovendo] = useState(false);

  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [colabId, setColabId] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [valoresForm, setValoresForm] = useState<string[]>(Array(7).fill(''));
  const [salvando, setSalvando] = useState(false);

  const [pracaDoColab, setPracaDoColab] = useState<Map<string, string>>(new Map());

  const [historicoDe, setHistoricoDe] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase.from('ajuda_custo_valores').select('*').order('vigencia_inicio', { ascending: false });
    if (error) {
      toast.error('Erro ao carregar valores: ' + error.message);
    } else {
      setLinhas((data ?? []).map((r: any) => ({ id: r.id, criado_em: r.created_at, ...linhaParaTarifa(r) })));
    }
    const [pr, vin] = await Promise.all([
      supabase.from('ajuda_custo_pracas').select('id, nome'),
      supabase.from('ajuda_custo_promotor_praca').select('colaborador_id, praca_id').limit(10000),
    ]);
    if (!pr.error && !vin.error) {
      const nomes = new Map((pr.data ?? []).map((p: any) => [p.id, p.nome as string]));
      setPracaDoColab(new Map((vin.data ?? []).map((v: any) => [v.colaborador_id, nomes.get(v.praca_id) ?? ''])));
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, []);

  // nomes de TODOS os promotores com valores, inclusive os inativados em Gestão de Pessoas
  const idsComValores = useMemo(() => [...new Set(linhas.map((l) => l.colaborador_id))], [linhas]);
  const nomePorId = useColaboradoresPorIds(idsComValores);

  // Tarifa em vigor hoje de cada promotor (se ainda não há nenhuma em vigor, a próxima agendada)
  const atuais = useMemo(() => {
    const hoje = new Date().toLocaleDateString('sv-SE');
    const mapa = new Map<string, LinhaValor>();
    linhas.forEach((l) => {
      const atual = mapa.get(l.colaborador_id);
      if (!atual) {
        mapa.set(l.colaborador_id, l);
        return;
      }
      const novaVigente = l.vigencia_inicio <= hoje;
      const atualVigente = atual.vigencia_inicio <= hoje;
      if (novaVigente && (!atualVigente || l.vigencia_inicio > atual.vigencia_inicio)) mapa.set(l.colaborador_id, l);
      else if (!novaVigente && !atualVigente && l.vigencia_inicio < atual.vigencia_inicio) mapa.set(l.colaborador_id, l);
    });
    return [...mapa.values()]
      .filter((l) => {
        const c = nomePorId.get(l.colaborador_id);
        if (ocultarInativos && c?.status === 'inativo') return false;
        if (!busca) return true;
        return `${c?.nome ?? ''} ${c?.matricula ?? ''}`.toLowerCase().includes(busca.toLowerCase());
      })
      .sort((a, b) => (nomePorId.get(a.colaborador_id)?.nome ?? '').localeCompare(nomePorId.get(b.colaborador_id)?.nome ?? ''));
  }, [linhas, nomePorId, busca, ocultarInativos]);

  // Com `base`, edita aquele registro (inclusive a data de vigência); sem, cadastra novos valores.
  function abrirForm(base?: LinhaValor) {
    setEditandoId(base?.id ?? null);
    setColabId(base?.colaborador_id ?? '');
    setVigencia(base?.vigencia_inicio ?? `${competenciaPadrao()}-01`);
    setValoresForm(base ? base.valores.map((v) => (v ? String(v) : '')) : Array(7).fill(''));
    setFormAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!colabId) return toast.error('Selecione o promotor.');
    const numeros = valoresForm.map((v) => Number((v || '0').replace(',', '.')));
    if (numeros.some((n) => Number.isNaN(n) || n < 0)) return toast.error('Valores inválidos.');
    if (numeros.every((n) => n === 0)) return toast.error('Informe pelo menos um valor diário.');

    setSalvando(true);
    const payload: Record<string, any> = { colaborador_id: colabId, vigencia_inicio: vigencia };
    colunasValor.forEach((col, i) => (payload[col] = numeros[i]));
    const { error } = editandoId
      ? await supabase.from('ajuda_custo_valores').update(payload).eq('id', editandoId)
      : await supabase.from('ajuda_custo_valores').upsert(payload, { onConflict: 'colaborador_id,vigencia_inicio' });
    setSalvando(false);
    if (error) return toast.error(error.code === '23505' ? 'Esse promotor já tem valores cadastrados nessa vigência.' : 'Erro ao salvar: ' + error.message);
    toast.success('Valores salvos.');
    setFormAberto(false);
    avisarAcertosMudaram();
    carregar();
  }

  async function excluir(id: string) {
    const { error } = await supabase.from('ajuda_custo_valores').delete().eq('id', id);
    if (error) return toast.error('Erro ao excluir: ' + error.message);
    toast.success('Vigência removida.');
    avisarAcertosMudaram();
    carregar();
  }

  // vigências cadastradas, para remover em lote (ex.: importação feita por engano)
  const grupos = useMemo<GrupoVigencia[]>(() => {
    const porColab = new Map<string, number>();
    linhas.forEach((l) => porColab.set(l.colaborador_id, (porColab.get(l.colaborador_id) ?? 0) + 1));
    const mapa = new Map<string, GrupoVigencia>();
    linhas.forEach((l) => {
      const g = mapa.get(l.vigencia_inicio) ?? { vigencia: l.vigencia_inicio, ids: [], protegidos: 0, criado: '' };
      if ((porColab.get(l.colaborador_id) ?? 0) > 1) g.ids.push(l.id);
      else g.protegidos += 1;
      const dia = (l.criado_em ?? '').slice(0, 10);
      if (dia > g.criado) g.criado = dia;
      mapa.set(l.vigencia_inicio, g);
    });
    return [...mapa.values()].sort((a, b) => b.vigencia.localeCompare(a.vigencia));
  }, [linhas]);

  async function removerGrupo(g: GrupoVigencia) {
    const ok = window.confirm(
      `Remover ${g.ids.length} registro(s) com vigência em ${formatarData(g.vigencia)}?\n\nOs promotores continuam com as outras vigências deles. Esta ação não tem volta.`
    );
    if (!ok) return;
    setRemovendo(true);
    for (let i = 0; i < g.ids.length; i += 100) {
      const { error } = await supabase.from('ajuda_custo_valores').delete().in('id', g.ids.slice(i, i + 100));
      if (error) {
        setRemovendo(false);
        return toast.error('Erro ao remover: ' + error.message);
      }
    }
    setRemovendo(false);
    toast.success(`${g.ids.length} registro(s) removido(s).`);
    avisarAcertosMudaram();
    carregar();
  }

  const historico = linhas.filter((l) => l.colaborador_id === historicoDe);

  return (
    <div className="space-y-4">
      <Card className="border-none shadow-sm overflow-hidden bg-white/50">
        <CardHeader className="py-4 px-6 border-b border-zinc-100 bg-white/80 flex flex-row items-center justify-between space-y-0 gap-4">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input placeholder="Pesquisar promotor..." className="pl-10 h-10 rounded-xl" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
              <input type="checkbox" checked={ocultarInativos} onChange={(e) => setOcultarInativos(e.target.checked)} /> Ocultar inativos
            </label>
            <Button variant="outline" className="rounded-xl" title="Remover todas as linhas de uma vigência (ex.: importação feita por engano)" onClick={() => setRemocaoAberta(true)}>
              <Trash2 className="mr-2 h-4 w-4" /> Remover vigência
            </Button>
            <ImportarValores colaboradores={colaboradores} onImportado={() => { avisarAcertosMudaram(); carregar(); }} />
            <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => abrirForm()}>
              <Plus className="w-4 h-4 mr-2" /> Novo promotor
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 pr-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Promotor</TableHead>
                <TableHead className="px-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Praça</TableHead>
                {ORDEM.map((i) => (
                  <TableHead key={i} title="Valores em R$" className="px-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500 text-right">{DIAS_SEMANA[i].slice(0, 3)}</TableHead>
                ))}
                <TableHead className="px-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Vigência</TableHead>
                <TableHead className="pl-2 pr-4 text-right text-[11px] font-bold uppercase tracking-wider text-zinc-500">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-16 text-zinc-400">Carregando...</TableCell></TableRow>
              ) : atuais.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-16 text-zinc-400">Nenhum promotor com valores cadastrados. Clique em &quot;Novo promotor&quot;.</TableCell></TableRow>
              ) : (
                atuais.map((l) => {
                  const c = nomePorId.get(l.colaborador_id);
                  return (
                    <TableRow key={l.id} className={c?.status === 'inativo' ? 'opacity-60' : undefined}>
                      <TableCell className="pl-5 pr-2 py-3 min-w-[170px]">
                        <p className="text-sm font-bold text-zinc-900">{c?.nome ?? 'Colaborador não encontrado'}{c?.status === 'inativo' && <span className="ml-2 rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 align-middle text-[9px] font-black uppercase tracking-wider text-zinc-500">inativo</span>}</p>
                        <p className="text-[10px] text-zinc-500">MAT: {c?.matricula}</p>
                      </TableCell>
                      <TableCell className="px-2 text-xs text-zinc-600 max-w-[130px]">{pracaDoColab.get(l.colaborador_id) || <span className="text-zinc-300">sem praça</span>}</TableCell>
                      {ORDEM.map((i) => (
                        <TableCell key={i} className={`px-1.5 text-right text-xs tabular-nums ${l.valores[i] ? 'font-bold text-zinc-900' : 'text-zinc-300'}`}>
                          {l.valores[i] ? l.valores[i].toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
                        </TableCell>
                      ))}
                      <TableCell className="px-2 text-xs text-zinc-600">
                        {l.vigencia_inicio > new Date().toLocaleDateString('sv-SE') ? (
                          <span className="font-bold text-amber-600">a partir de {dataCurta(l.vigencia_inicio)}</span>
                        ) : (
                          <>desde {dataCurta(l.vigencia_inicio)}</>
                        )}
                        {l.vigencia_inicio <= new Date().toLocaleDateString('sv-SE') && linhas.some((x) => x.colaborador_id === l.colaborador_id && x.vigencia_inicio > l.vigencia_inicio) && (
                          <span className="block text-[10px] text-amber-600">há reajuste agendado</span>
                        )}
                      </TableCell>
                      <TableCell className="pl-2 pr-3 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" title="Alterar valores" onClick={() => abrirForm(l)}><Pencil className="w-4 h-4 text-zinc-500" /></Button>
                        <Button variant="ghost" size="icon" title="Histórico de valores" onClick={() => setHistoricoDe(l.colaborador_id)}><History className="w-4 h-4 text-zinc-500" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-zinc-500">
        Valores em R$. Dias sem valor (— ou 0) não são pagos. Ao alterar valores, o novo valor passa a valer a partir da data de vigência; o que já foi lançado não é recalculado.
      </p>

      <Dialog open={formAberto} onOpenChange={setFormAberto}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-zinc-900">{editandoId ? 'Editar valores' : 'Valores por dia trabalhado'}</DialogTitle>
            <DialogDescription>
              {editandoId
                ? 'Corrige este registro, inclusive a data de vigência. Para um reajuste que preserve o histórico, use "Novo promotor" com o mesmo promotor e outra vigência.'
                : 'Quanto o promotor gasta de transporte em cada dia da semana.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={salvar} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className={rotuloCampo}>Promotor</label>
              <ColabPicker
                colaboradores={editandoId && nomePorId.get(colabId) && !colaboradores.some((c) => c.id === colabId) ? [...colaboradores, nomePorId.get(colabId)!] : colaboradores}
                value={colabId}
                onChange={setColabId}
                disabled={!!editandoId}
              />
            </div>
            <div className="space-y-2">
              <label className={rotuloCampo}>Vale a partir de</label>
              <Input type="date" required value={vigencia} onChange={(e) => setVigencia(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ORDEM.map((i) => (
                <div key={i} className="space-y-1">
                  <label className={rotuloCampo}>{DIAS_SEMANA[i]}</label>
                  <Input
                    type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00"
                    value={valoresForm[i]}
                    onChange={(e) => setValoresForm((v) => v.map((x, k) => (k === i ? e.target.value : x)))}
                    className="h-11 rounded-xl"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setFormAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvando} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">{salvando ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={remocaoAberta} onOpenChange={setRemocaoAberta}>
        <DialogContent className="sm:max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-zinc-900">Remover vigência</DialogTitle>
            <DialogDescription>
              Apaga de uma vez todos os valores de uma data de vigência, por exemplo os criados por uma importação feita por engano. Promotores que só têm essa vigência são mantidos.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200">
            {grupos.length === 0 ? (
              <p className="p-4 text-sm text-zinc-400">Nenhuma vigência cadastrada.</p>
            ) : (
              grupos.map((g) => (
                <div key={g.vigencia} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-zinc-900">Vigência {formatarData(g.vigencia)}</p>
                    <p className="text-[11px] text-zinc-500">
                      {g.ids.length + g.protegidos} registro(s){g.criado && ` · último cadastro em ${formatarData(g.criado)}`}
                      {g.protegidos > 0 && ` · ${g.protegidos} é a única vigência do promotor (mantido)`}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={g.ids.length === 0 || removendo} onClick={() => removerGrupo(g)} className="rounded-xl text-rose-600 hover:bg-rose-50">
                    Remover {g.ids.length}
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historicoDe} onOpenChange={(o) => !o && setHistoricoDe(null)}>
        <DialogContent className="sm:max-w-3xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-zinc-900">Histórico de valores</DialogTitle>
            <DialogDescription>{nomePorId.get(historicoDe ?? '')?.nome}</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vigência</TableHead>
                  {ORDEM.map((i) => <TableHead key={i} className="text-right">{DIAS_SEMANA[i].slice(0, 3)}</TableHead>)}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs font-bold">{formatarData(l.vigencia_inicio)}</TableCell>
                    {ORDEM.map((i) => <TableCell key={i} className="text-right text-xs tabular-nums">{l.valores[i] ? moeda(l.valores[i]) : '—'}</TableCell>)}
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" title="Editar esta vigência" onClick={() => { setHistoricoDe(null); abrirForm(l); }}><Pencil className="w-4 h-4 text-zinc-500" /></Button>
                      {historico.length > 1 && (
                        <Button variant="ghost" size="icon" title="Remover esta vigência" onClick={() => excluir(l.id)}><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
