'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { rotuloCampo, useColaboradoresAtivos } from '@/components/ajuda-custo/colab-picker';
import { cn } from '@/lib/utils';

interface Praca {
  id: string;
  nome: string;
}

export default function PracasPage() {
  const colaboradores = useColaboradoresAtivos();
  const [pracas, setPracas] = useState<Praca[]>([]);
  const [vinculos, setVinculos] = useState<Map<string, string>>(new Map()); // colaborador -> praça
  const [comValores, setComValores] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

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
    const [p, v, val] = await Promise.all([
      supabase.from('ajuda_custo_pracas').select('id, nome').order('nome'),
      supabase.from('ajuda_custo_promotor_praca').select('colaborador_id, praca_id').limit(10000),
      supabase.from('ajuda_custo_valores').select('colaborador_id').limit(10000),
    ]);
    const erro = p.error ?? v.error ?? val.error;
    if (erro) toast.error('Erro ao carregar praças: ' + erro.message + ' (execute scripts/ajuda-de-custo-pracas.sql no Supabase)');
    setPracas((p.data as Praca[]) ?? []);
    setVinculos(new Map((v.data ?? []).map((x: any) => [x.colaborador_id, x.praca_id])));
    setComValores(new Set((val.data ?? []).map((x: any) => x.colaborador_id)));
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

      {loading ? (
        <p className="text-center py-16 text-zinc-400 text-sm">Carregando...</p>
      ) : pracas.length === 0 ? (
        <p className="text-center py-16 text-zinc-400 text-sm">Nenhuma praça cadastrada ainda.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pracas.map((p) => (
            <Card key={p.id} className="border-zinc-100 shadow-sm bg-white/60">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><MapPin className="w-5 h-5" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-zinc-900 truncate">{p.nome}</p>
                      <p className="text-xs text-zinc-500">{contagem.get(p.id) ?? 0} promotor(es)</p>
                    </div>
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" title="Renomear" onClick={() => { setRenomeando(p); setNomeEdicao(p.nome); }}><Pencil className="w-4 h-4 text-zinc-500" /></Button>
                    <Button variant="ghost" size="icon" title="Excluir" onClick={() => excluir(p)}><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                  </div>
                </div>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => abrirGerenciar(p)}>
                  <Users className="w-4 h-4 mr-2" /> Gerenciar promotores
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
