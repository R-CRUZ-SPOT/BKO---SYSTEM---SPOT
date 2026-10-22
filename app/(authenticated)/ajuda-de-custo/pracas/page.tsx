'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitMerge, MapPin, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { rotuloCampo, useColaboradoresAtivos } from '@/components/ajuda-custo/colab-picker';
import { cn } from '@/lib/utils';
import { normalizarTexto, separarPraca } from '@/lib/ajuda-custo';

interface Praca {
  id: string;
  nome: string;
}

const SEM_UF = 'Sem UF';

export default function PracasPage() {
  const colaboradores = useColaboradoresAtivos();
  const [pracas, setPracas] = useState<Praca[]>([]);
  const [vinculos, setVinculos] = useState<Map<string, string>>(new Map()); // colaborador -> praça
  const [comValores, setComValores] = useState<Set<string>>(new Set());
  const [feriadosPorPraca, setFeriadosPorPraca] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const [filtro, setFiltro] = useState('');
  const [ufFiltro, setUfFiltro] = useState<string | null>(null);
  const [soDuplicadas, setSoDuplicadas] = useState(false);
  const [soSemPromotores, setSoSemPromotores] = useState(false);

  const [mesclando, setMesclando] = useState<Praca | null>(null);
  const [destinoId, setDestinoId] = useState('');
  const [mesclandoSalvando, setMesclandoSalvando] = useState(false);

  const [novoNome, setNovoNome] = useState('');
  const [renomeando, setRenomeando] = useState<Praca | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState('');

  const [gerenciando, setGerenciando] = useState<Praca | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [soComValores, setSoComValores] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [p, v, val, fer] = await Promise.all([
      supabase.from('ajuda_custo_pracas').select('id, nome').order('nome'),
      supabase.from('ajuda_custo_promotor_praca').select('colaborador_id, praca_id').limit(10000),
      supabase.from('ajuda_custo_valores').select('colaborador_id').limit(10000),
      supabase.from('ajuda_custo_feriados').select('praca_id').not('praca_id', 'is', null).limit(10000),
    ]);
    const erro = p.error ?? v.error ?? val.error ?? fer.error;
    if (erro) toast.error('Erro ao carregar praças: ' + erro.message + ' (execute scripts/ajuda-de-custo-pracas.sql no Supabase)');
    setPracas((p.data as Praca[]) ?? []);
    setVinculos(new Map((v.data ?? []).map((x: any) => [x.colaborador_id, x.praca_id])));
    setComValores(new Set((val.data ?? []).map((x: any) => x.colaborador_id)));
    const cont = new Map<string, number>();
    (fer.data ?? []).forEach((x: any) => cont.set(x.praca_id, (cont.get(x.praca_id) ?? 0) + 1));
    setFeriadosPorPraca(cont);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const nomePraca = useMemo(() => new Map(pracas.map((p) => [p.id, p.nome])), [pracas]);
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    vinculos.forEach((pid) => m.set(pid, (m.get(pid) ?? 0) + 1));
    return m;
  }, [vinculos]);
  const semPraca = useMemo(() => [...comValores].filter((id) => !vinculos.has(id)).length, [comValores, vinculos]);

  // Cidade/UF e chave de agrupamento de cada praça. Praças com a mesma cidade (sem acento, maiúscula ou
  // sufixo de UF) são possíveis duplicadas, a menos que sejam de UFs diferentes.
  const info = useMemo(() => {
    const itens = pracas.map((p) => {
      const { cidade, uf } = separarPraca(p.nome);
      return { praca: p, uf, cidadeNorm: normalizarTexto(cidade), nomeNorm: normalizarTexto(p.nome) };
    });
    const ufsPorCidade = new Map<string, Set<string>>();
    itens.forEach((i) => {
      if (i.uf) ufsPorCidade.set(i.cidadeNorm, (ufsPorCidade.get(i.cidadeNorm) ?? new Set()).add(i.uf));
    });
    const chave = (i: (typeof itens)[number]) => {
      const ufs = ufsPorCidade.get(i.cidadeNorm);
      // sem UF nenhuma ambiguidade: a praça sem UF junta com a única UF existente da cidade
      return !i.uf && ufs && ufs.size === 1 ? `${i.cidadeNorm}|${[...ufs][0]}` : `${i.cidadeNorm}|${i.uf ?? ''}`;
    };
    const grupos = new Map<string, Praca[]>();
    const chaves = new Map<string, string>();
    itens.forEach((i) => {
      const k = chave(i);
      chaves.set(i.praca.id, k);
      grupos.set(k, [...(grupos.get(k) ?? []), i.praca]);
    });
    return { itens, grupos, chaves };
  }, [pracas]);

  const duplicadasDe = (p: Praca) => info.grupos.get(info.chaves.get(p.id) ?? '') ?? [p];
  const ehDuplicada = (p: Praca) => duplicadasDe(p).length > 1;

  const totalDuplicadas = useMemo(() => pracas.filter(ehDuplicada).length, [pracas, info]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalSemPromotores = useMemo(() => pracas.filter((p) => !contagem.get(p.id)).length, [pracas, contagem]);

  const ufsDisponiveis = useMemo(() => {
    const cont = new Map<string, number>();
    info.itens.forEach((i) => cont.set(i.uf ?? SEM_UF, (cont.get(i.uf ?? SEM_UF) ?? 0) + 1));
    return [...cont.entries()].sort(([a], [b]) => (a === SEM_UF ? 1 : b === SEM_UF ? -1 : a.localeCompare(b)));
  }, [info]);

  const visiveis = useMemo(() => {
    const q = normalizarTexto(filtro);
    return info.itens
      .filter((i) => !q || i.nomeNorm.includes(q))
      .filter((i) => !ufFiltro || (i.uf ?? SEM_UF) === ufFiltro)
      .filter((i) => !soDuplicadas || ehDuplicada(i.praca))
      .filter((i) => !soSemPromotores || !contagem.get(i.praca.id))
      .sort((a, b) => info.chaves.get(a.praca.id)!.localeCompare(info.chaves.get(b.praca.id)!) || a.nomeNorm.localeCompare(b.nomeNorm))
      .map((i) => i.praca);
  }, [info, filtro, ufFiltro, soDuplicadas, soSemPromotores, contagem]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirMesclar(p: Praca) {
    const outras = duplicadasDe(p).filter((x) => x.id !== p.id);
    // sugere como destino a que tem mais promotores
    const melhor = [...outras].sort((a, b) => (contagem.get(b.id) ?? 0) - (contagem.get(a.id) ?? 0))[0];
    setMesclando(p);
    setDestinoId(melhor?.id ?? '');
  }

  async function mesclar(e: React.FormEvent) {
    e.preventDefault();
    if (!mesclando || !destinoId) return;
    setMesclandoSalvando(true);
    try {
      const falha = (etapa: string, error: { message: string }) => {
        toast.error(`Erro ao ${etapa}: ${error.message}. Nada foi excluído; confira e tente de novo.`);
        carregar();
      };
      const { error: eMembros } = await supabase.from('ajuda_custo_promotor_praca').update({ praca_id: destinoId }).eq('praca_id', mesclando.id);
      if (eMembros) return falha('mover os promotores', eMembros);

      // feriado na mesma data que o destino já tem é redundante: descarta; os demais passam para o destino
      const [{ data: daOrigem, error: e1 }, { data: doDestino, error: e2 }] = await Promise.all([
        supabase.from('ajuda_custo_feriados').select('id, data').eq('praca_id', mesclando.id),
        supabase.from('ajuda_custo_feriados').select('data').eq('praca_id', destinoId),
      ]);
      if (e1 ?? e2) return falha('ler os feriados', (e1 ?? e2)!);
      const datasDestino = new Set((doDestino ?? []).map((f: any) => f.data));
      const repetidos = (daOrigem ?? []).filter((f: any) => datasDestino.has(f.data)).map((f: any) => f.id);
      const mover = (daOrigem ?? []).filter((f: any) => !datasDestino.has(f.data)).map((f: any) => f.id);
      if (repetidos.length) {
        const { error } = await supabase.from('ajuda_custo_feriados').delete().in('id', repetidos);
        if (error) return falha('remover feriados repetidos', error);
      }
      if (mover.length) {
        const { error } = await supabase.from('ajuda_custo_feriados').update({ praca_id: destinoId }).in('id', mover);
        if (error) return falha('mover os feriados', error);
      }

      const { error: eDel } = await supabase.from('ajuda_custo_pracas').delete().eq('id', mesclando.id);
      if (eDel) return falha('excluir a praça', eDel);
      toast.success(`"${mesclando.nome}" mesclada em "${nomePraca.get(destinoId)}".`);
      setMesclando(null);
      carregar();
    } finally {
      setMesclandoSalvando(false);
    }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    const { error } = await supabase.from('ajuda_custo_pracas').insert({ nome });
    if (error) return toast.error(error.code === '23505' ? 'Já existe uma praça com esse nome.' : 'Erro ao criar: ' + error.message);
    setNovoNome('');
    carregar();
  }

  async function renomear(e: React.FormEvent) {
    e.preventDefault();
    if (!renomeando || !nomeEdicao.trim()) return;
    const { error } = await supabase.from('ajuda_custo_pracas').update({ nome: nomeEdicao.trim() }).eq('id', renomeando.id);
    if (error) return toast.error(error.code === '23505' ? 'Já existe uma praça com esse nome.' : 'Erro ao renomear: ' + error.message);
    setRenomeando(null);
    carregar();
  }

  async function excluir(p: Praca) {
    if (!window.confirm(`Excluir a praça "${p.nome}"? Os promotores ficarão sem praça.`)) return;
    const { error } = await supabase.from('ajuda_custo_pracas').delete().eq('id', p.id);
    if (error) {
      return toast.error(error.code === '23503' ? 'Esta praça tem feriados cadastrados. Remova os feriados dela primeiro.' : 'Erro ao excluir: ' + error.message);
    }
    toast.success('Praça excluída.');
    carregar();
  }

  function abrirGerenciar(p: Praca) {
    setGerenciando(p);
    setBusca('');
    setMarcados(new Set([...vinculos].filter(([, pid]) => pid === p.id).map(([cid]) => cid)));
  }

  const listaGerenciar = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return colaboradores
      .filter((c) => marcados.has(c.id) || !soComValores || comValores.has(c.id))
      .filter((c) => !q || `${c.nome} ${c.matricula}`.toLowerCase().includes(q))
      .slice(0, 100);
  }, [colaboradores, busca, soComValores, comValores, marcados]);

  async function salvarMembros() {
    if (!gerenciando) return;
    setSalvando(true);
    const originais = new Set([...vinculos].filter(([, pid]) => pid === gerenciando.id).map(([cid]) => cid));
    const adicionar = [...marcados].filter((id) => !originais.has(id)).map((id) => ({ colaborador_id: id, praca_id: gerenciando.id }));
    const remover = [...originais].filter((id) => !marcados.has(id));

    if (adicionar.length) {
      const { error } = await supabase.from('ajuda_custo_promotor_praca').upsert(adicionar, { onConflict: 'colaborador_id' });
      if (error) {
        setSalvando(false);
        return toast.error('Erro ao salvar: ' + error.message);
      }
    }
    if (remover.length) {
      const { error } = await supabase.from('ajuda_custo_promotor_praca').delete().in('colaborador_id', remover);
      if (error) {
        setSalvando(false);
        return toast.error('Erro ao salvar: ' + error.message);
      }
    }
    setSalvando(false);
    toast.success('Promotores da praça atualizados.');
    setGerenciando(null);
    carregar();
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 max-w-3xl">
        Praça é a cidade/estado onde o promotor atua (ex.: &quot;Salvador/BA&quot;). Os feriados regionais são lançados uma vez na aba Feriados e valem automaticamente para todos os promotores da praça.
        Cada promotor pertence a uma única praça.
      </p>

      {!loading && comValores.size > 0 && semPraca > 0 && pracas.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">
          {semPraca} promotor(es) com valores cadastrados ainda estão sem praça e não são afetados por feriados regionais.
        </div>
      )}

      <form onSubmit={criar} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className={rotuloCampo}>Nova praça</label>
          <Input required value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: Salvador/BA" className="h-11 w-64 rounded-xl bg-white" />
        </div>
        <Button type="submit" className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 mr-1" /> Criar praça</Button>
      </form>

      {!loading && pracas.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-zinc-100 bg-white/60 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar praças (ex: SP, são paulo)..." className="h-10 rounded-xl bg-white pl-9" />
            </div>
            <button
              type="button"
              onClick={() => setSoDuplicadas((v) => !v)}
              className={cn('text-[11px] font-black uppercase tracking-wider rounded-full border px-3 py-1.5', soDuplicadas ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50')}
            >
              Possíveis duplicadas ({totalDuplicadas})
            </button>
            <button
              type="button"
              onClick={() => setSoSemPromotores((v) => !v)}
              className={cn('text-[11px] font-black uppercase tracking-wider rounded-full border px-3 py-1.5', soSemPromotores ? 'bg-zinc-800 text-white border-zinc-800' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50')}
            >
              Sem promotores ({totalSemPromotores})
            </button>
            <span className="ml-auto text-xs text-zinc-500">Mostrando {visiveis.length} de {pracas.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setUfFiltro(null)}
              className={cn('text-[11px] font-black uppercase tracking-wider rounded-full border px-2.5 py-1', !ufFiltro ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50')}
            >
              Todas
            </button>
            {ufsDisponiveis.map(([uf, qtd]) => (
              <button
                key={uf}
                type="button"
                onClick={() => setUfFiltro(ufFiltro === uf ? null : uf)}
                className={cn('text-[11px] font-black uppercase tracking-wider rounded-full border px-2.5 py-1', ufFiltro === uf ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50')}
              >
                {uf} ({qtd})
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center py-16 text-zinc-400 text-sm">Carregando...</p>
      ) : pracas.length === 0 ? (
        <p className="text-center py-16 text-zinc-400 text-sm">Nenhuma praça cadastrada ainda.</p>
      ) : visiveis.length === 0 ? (
        <p className="text-center py-16 text-zinc-400 text-sm">Nenhuma praça corresponde aos filtros.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visiveis.map((p) => {
            const dup = ehDuplicada(p);
            return (
              <Card key={p.id} className={cn('border-zinc-100 shadow-sm bg-white/60', dup && 'border-amber-200 bg-amber-50/40')}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><MapPin className="w-5 h-5" /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-zinc-900 truncate" title={p.nome}>{p.nome}</p>
                        <p className="text-xs text-zinc-500">
                          {contagem.get(p.id) ?? 0} promotor(es)
                          {(feriadosPorPraca.get(p.id) ?? 0) > 0 && <> · {feriadosPorPraca.get(p.id)} feriado(s)</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0">
                      <Button variant="ghost" size="icon" title="Renomear" onClick={() => { setRenomeando(p); setNomeEdicao(p.nome); }}><Pencil className="w-4 h-4 text-zinc-500" /></Button>
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => excluir(p)}><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                    </div>
                  </div>
                  {dup && <p className="text-[11px] font-bold text-amber-700">Possível duplicada de: {duplicadasDe(p).filter((x) => x.id !== p.id).map((x) => x.nome).join(', ')}</p>}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => abrirGerenciar(p)}>
                      <Users className="w-4 h-4 mr-2" /> Gerenciar promotores
                    </Button>
                    {dup && (
                      <Button variant="outline" className="rounded-xl border-amber-300 text-amber-800 hover:bg-amber-50" title="Mesclar com a duplicada" onClick={() => abrirMesclar(p)}>
                        <GitMerge className="w-4 h-4 mr-1" /> Mesclar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!mesclando} onOpenChange={(o) => !o && setMesclando(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-zinc-900">Mesclar praça</DialogTitle>
            <DialogDescription>
              Move os promotores e os feriados de &quot;{mesclando?.nome}&quot; para a praça escolhida e depois exclui &quot;{mesclando?.nome}&quot;. Feriados na mesma data que o destino já tem são descartados.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={mesclar} className="space-y-4">
            <div className="space-y-1">
              <label className={rotuloCampo}>Manter a praça</label>
              <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm">
                {(mesclando ? duplicadasDe(mesclando).filter((x) => x.id !== mesclando.id) : []).map((x) => (
                  <option key={x.id} value={x.id}>{x.nome} ({contagem.get(x.id) ?? 0} promotor(es))</option>
                ))}
              </select>
            </div>
            {mesclando && (
              <p className="text-xs text-zinc-600">
                Serão movidos {contagem.get(mesclando.id) ?? 0} promotor(es) e {feriadosPorPraca.get(mesclando.id) ?? 0} feriado(s). Não dá para desfazer; se o nome a manter estiver errado, renomeie-o depois.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setMesclando(null)}>Cancelar</Button>
              <Button type="submit" disabled={mesclandoSalvando || !destinoId} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">{mesclandoSalvando ? 'Mesclando...' : 'Mesclar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renomeando} onOpenChange={(o) => !o && setRenomeando(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black uppercase tracking-tight text-zinc-900">Renomear praça</DialogTitle></DialogHeader>
          <form onSubmit={renomear} className="space-y-4">
            <Input required value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} className="h-12 rounded-xl" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRenomeando(null)}>Cancelar</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!gerenciando} onOpenChange={(o) => !o && setGerenciando(null)}>
        <DialogContent className="sm:max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-zinc-900">Promotores de {gerenciando?.nome}</DialogTitle>
            <DialogDescription>{marcados.size} selecionado(s). Quem já está em outra praça será movido para esta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou matrícula..." className="h-11 rounded-xl" />
            <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
              <input type="checkbox" checked={soComValores} onChange={(e) => setSoComValores(e.target.checked)} />
              Mostrar só promotores com valores por dia cadastrados
            </label>
            <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-zinc-200 divide-y divide-zinc-100">
              {listaGerenciar.length === 0 ? (
                <p className="p-4 text-xs text-zinc-400">Nenhum colaborador encontrado.</p>
              ) : (
                listaGerenciar.map((c) => {
                  const outra = vinculos.get(c.id);
                  const emOutra = outra && outra !== gerenciando?.id ? nomePraca.get(outra) : null;
                  return (
                    <label key={c.id} className={cn('flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-emerald-50/60', marcados.has(c.id) && 'bg-emerald-50')}>
                      <input
                        type="checkbox"
                        checked={marcados.has(c.id)}
                        onChange={() =>
                          setMarcados((s) => {
                            const n = new Set(s);
                            if (n.has(c.id)) n.delete(c.id);
                            else n.add(c.id);
                            return n;
                          })
                        }
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-zinc-900 truncate">{c.nome}</span>
                        <span className="block text-[10px] text-zinc-500">MAT: {c.matricula}</span>
                      </span>
                      {emOutra && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">hoje em {emOutra}</span>}
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setGerenciando(null)}>Cancelar</Button>
            <Button disabled={salvando} onClick={salvarMembros} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">{salvando ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
