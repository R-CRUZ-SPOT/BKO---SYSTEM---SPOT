'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { expandirFeriados, feriadosNacionais, formatarData, diaSemana, DIAS_SEMANA, type FeriadoCadastrado } from '@/lib/ajuda-custo';
import { rotuloCampo } from '@/components/ajuda-custo/colab-picker';

interface Feriado extends FeriadoCadastrado {
  id: string;
}

interface Praca {
  id: string;
  nome: string;
}

export default function FeriadosPage() {
  const [ano, setAno] = useState(new Date().getFullYear() + 1);
  const [cadastrados, setCadastrados] = useState<Feriado[]>([]);
  const [pracas, setPracas] = useState<Praca[]>([]);
  const [membros, setMembros] = useState<Map<string, number>>(new Map());

  const [data, setData] = useState('');
  const [descricao, setDescricao] = useState('');
  const [pracaId, setPracaId] = useState(''); // '' = todos os promotores
  const [recorrente, setRecorrente] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const [f, p, v] = await Promise.all([
      supabase.from('ajuda_custo_feriados').select('id, data, descricao, praca_id, recorrente').order('data'),
      supabase.from('ajuda_custo_pracas').select('id, nome').order('nome'),
      supabase.from('ajuda_custo_promotor_praca').select('praca_id').limit(10000),
    ]);
    const erro = f.error ?? p.error ?? v.error;
    if (erro) toast.error('Erro ao carregar feriados: ' + erro.message + ' (execute scripts/ajuda-de-custo-pracas.sql no Supabase)');
    setCadastrados((f.data as Feriado[]) ?? []);
    setPracas((p.data as Praca[]) ?? []);
    const cont = new Map<string, number>();
    (v.data ?? []).forEach((x: any) => cont.set(x.praca_id, (cont.get(x.praca_id) ?? 0) + 1));
    setMembros(cont);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const { error } = await supabase
      .from('ajuda_custo_feriados')
      .insert({ data, descricao: descricao.trim(), praca_id: pracaId || null, recorrente });
    setSalvando(false);
    if (error) return toast.error(error.code === '23505' ? 'Essa data já está cadastrada para esse público.' : 'Erro ao salvar: ' + error.message);
    toast.success('Feriado cadastrado.');
    setData('');
    setDescricao('');
    setRecorrente(false);
    carregar();
  }

  async function remover(f: Feriado) {
    const aviso = f.recorrente
      ? `"${f.descricao}" se repete todo ano. Remover apaga o feriado de todos os anos (a partir de ${f.data.slice(0, 4)}). Continuar?`
      : `Remover o feriado "${f.descricao}" (${formatarData(f.data)})?`;
    if (!window.confirm(aviso)) return;
    const { error } = await supabase.from('ajuda_custo_feriados').delete().eq('id', f.id);
    if (error) return toast.error('Erro ao excluir: ' + error.message);
    carregar();
  }

  const nacionais = useMemo(() => [...feriadosNacionais(ano).entries()].sort(([a], [b]) => a.localeCompare(b)), [ano]);
  const nomePraca = useMemo(() => new Map(pracas.map((p) => [p.id, p.nome])), [pracas]);

  // feriados cadastrados que caem no ano exibido (considerando a recorrência)
  const doAno = useMemo(
    () =>
      cadastrados
        .map((f) => ({ f, dataNoAno: [...expandirFeriados([f], [ano]).keys()][0] }))
        .filter((x) => x.dataNoAno)
        .sort((a, b) => a.dataNoAno.localeCompare(b.dataNoAno)),
    [cadastrados, ano]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-none shadow-sm bg-white/50 h-fit">
        <CardHeader className="py-4 px-6 border-b border-zinc-100 flex flex-row items-center justify-between space-y-0">
          <h2 className="text-sm font-black uppercase tracking-tight text-zinc-900">Feriados nacionais</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAno(ano - 1)}>‹</Button>
            <span className="text-sm font-black tabular-nums w-12 text-center">{ano}</span>
            <Button variant="outline" size="sm" onClick={() => setAno(ano + 1)}>›</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-zinc-100">
          {nacionais.map(([d, nome]) => (
            <div key={d} className="flex items-center justify-between px-6 py-3">
              <span className="text-sm text-zinc-900">{nome}</span>
              <span className="text-xs text-zinc-500 tabular-nums">{DIAS_SEMANA[diaSemana(d)].slice(0, 3)} · {formatarData(d)}</span>
            </div>
          ))}
          <p className="px-6 py-3 text-[11px] text-zinc-400">
            Calculados automaticamente todo ano. Carnaval e Corpus Christi são ponto facultativo e não estão incluídos: se a empresa não paga nesses dias, cadastre ao lado.
          </p>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm bg-white/50 h-fit">
        <CardHeader className="py-4 px-6 border-b border-zinc-100 space-y-0">
          <h2 className="text-sm font-black uppercase tracking-tight text-zinc-900">Feriados adicionais</h2>
          <p className="text-[11px] text-zinc-500 mt-1">
            Para todos os promotores ou só para uma praça (cidade/estado). Feriado de um promotor específico: Ocorrências &gt; Feriado local.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={adicionar} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-6 border-b border-zinc-100">
            <div className="space-y-1">
              <label className={rotuloCampo}>Data</label>
              <Input type="date" required value={data} onChange={(e) => setData(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className={rotuloCampo}>Vale para</label>
              <select value={pracaId} onChange={(e) => setPracaId(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm">
                <option value="">Todos os promotores</option>
                {pracas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className={rotuloCampo}>Descrição</label>
              <Input required value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Independência da Bahia" className="h-11 rounded-xl" />
            </div>
            <label className="sm:col-span-2 flex items-start gap-2 text-xs text-zinc-700 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} />
              <span>
                <strong>Repete todo ano</strong> nesta mesma data (a partir de {data ? data.slice(0, 4) : 'o ano informado'}). Use só para feriados de data fixa; feriados móveis devem ser cadastrados a cada ano.
              </span>
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={salvando} className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
            </div>
          </form>

          <div className="divide-y divide-zinc-100">
            <p className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Em {ano}</p>
            {doAno.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-zinc-400">Nenhum feriado adicional em {ano}.</p>
            ) : (
              doAno.map(({ f, dataNoAno }) => (
                <div key={f.id} className="flex items-center justify-between gap-3 px-6 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-900">{f.descricao}</p>
                    <p className="text-xs text-zinc-500 tabular-nums">
                      {DIAS_SEMANA[diaSemana(dataNoAno)].slice(0, 3)} · {formatarData(dataNoAno)}
                      <span className="mx-1">·</span>
                      <span className="font-bold text-zinc-700">{f.praca_id ? nomePraca.get(f.praca_id) ?? 'Praça' : 'Todos os promotores'}</span>
                      {f.praca_id && (membros.get(f.praca_id) ?? 0) === 0 && <span className="ml-1 text-amber-600 font-bold">(praça sem promotores)</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {f.recorrente && (
                      <span title={`Repete todo ano desde ${f.data.slice(0, 4)}`} className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-1">
                        <Repeat className="w-3 h-3" /> todo ano
                      </span>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => remover(f)}><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
