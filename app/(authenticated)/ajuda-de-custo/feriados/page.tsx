'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { expandirFeriados, feriadosNacionais, formatarData, diaSemana, DIAS_SEMANA, separarPraca, type FeriadoCadastrado } from '@/lib/ajuda-custo';
import { rotuloCampo } from '@/components/ajuda-custo/colab-picker';

interface Feriado extends FeriadoCadastrado {
  id: string;
}

// Feriados iguais (mesma data e descrição) cadastrados para várias praças de uma vez
interface Grupo {
  dataNoAno: string;
  itens: Feriado[];
}

interface Praca {
  id: string;
  nome: string;
}

const SEM_UF = 'Outras';

// A UF não é um campo da praça: vem do sufixo do nome ("Salvador/BA", "Salvador - BA").
function ufDaPraca(nome: string): string {
  return separarPraca(nome).uf ?? SEM_UF;
}

export default function FeriadosPage() {
  const [ano, setAno] = useState(new Date().getFullYear() + 1);
  const [cadastrados, setCadastrados] = useState<Feriado[]>([]);
  const [pracas, setPracas] = useState<Praca[]>([]);
  const [membros, setMembros] = useState<Map<string, number>>(new Map());

  const [data, setData] = useState('');
  const [descricao, setDescricao] = useState('');
  const [especificas, setEspecificas] = useState(false); // false = todos os promotores
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
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
    const alvos: (string | null)[] = especificas ? [...selecionadas] : [null];
    if (alvos.length === 0) return toast.error('Selecione ao menos uma praça.');
    // a mesma data não pode repetir para o mesmo público (índice único data + praça)
    const jaTem = new Set(cadastrados.filter((f) => f.data === data).map((f) => f.praca_id ?? ''));
    const novos = alvos.filter((id) => !jaTem.has(id ?? ''));
    const puladas = alvos.length - novos.length;
    if (novos.length === 0) return toast.error('Essa data já está cadastrada para ' + (alvos.length > 1 ? 'todas as praças selecionadas.' : 'esse público.'));
    setSalvando(true);
    const { error } = await supabase
      .from('ajuda_custo_feriados')
      .insert(novos.map((praca_id) => ({ data, descricao: descricao.trim(), praca_id, recorrente })));
    setSalvando(false);
    if (error) return toast.error(error.code === '23505' ? 'Essa data já está cadastrada para esse público.' : 'Erro ao salvar: ' + error.message);
    toast.success(novos[0] === null ? 'Feriado cadastrado.' : `Feriado cadastrado em ${novos.length} praça${novos.length > 1 ? 's' : ''}.`);
    if (puladas > 0) toast.warning(`${puladas} praça${puladas > 1 ? 's já tinham' : ' já tinha'} feriado nessa data e ${puladas > 1 ? 'foram puladas' : 'foi pulada'}.`);
    setData('');
    setDescricao('');
    setRecorrente(false);
    setSelecionadas(new Set());
    setBusca('');
    carregar();
  }

  async function remover(g: Grupo) {
    const f = g.itens[0];
    const alvo = g.itens.length > 1 ? ` em ${g.itens.length} praças` : '';
    const aviso = f.recorrente
      ? `"${f.descricao}"${alvo} se repete todo ano. Remover apaga o feriado de todos os anos (a partir de ${f.data.slice(0, 4)}). Continuar?`
      : `Remover o feriado "${f.descricao}"${alvo} (${formatarData(f.data)})?`;
    if (!window.confirm(aviso)) return;
    const { error } = await supabase.from('ajuda_custo_feriados').delete().in('id', g.itens.map((x) => x.id));
    if (error) return toast.error('Erro ao excluir: ' + error.message);
    carregar();
  }

  const nacionais = useMemo(() => [...feriadosNacionais(ano).entries()].sort(([a], [b]) => a.localeCompare(b)), [ano]);
  const nomePraca = useMemo(() => new Map(pracas.map((p) => [p.id, p.nome])), [pracas]);

  // feriados cadastrados que caem no ano exibido (considerando a recorrência)
  const doAno = useMemo(() => {
    const grupos = new Map<string, Grupo>();
    cadastrados.forEach((f) => {
      const dataNoAno = [...expandirFeriados([f], [ano]).keys()][0];
      if (!dataNoAno) return;
      const chave = `${dataNoAno}|${f.descricao}|${f.recorrente}`;
      const g = grupos.get(chave);
      if (g) g.itens.push(f);
      else grupos.set(chave, { dataNoAno, itens: [f] });
    });
    return [...grupos.values()].sort((a, b) => a.dataNoAno.localeCompare(b.dataNoAno));
  }, [cadastrados, ano]);

  const ufs = useMemo(() => {
    const cont = new Map<string, number>();
    pracas.forEach((p) => {
      const uf = ufDaPraca(p.nome);
      cont.set(uf, (cont.get(uf) ?? 0) + 1);
    });
    return [...cont.entries()].sort(([a], [b]) => (a === SEM_UF ? 1 : b === SEM_UF ? -1 : a.localeCompare(b)));
  }, [pracas]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pracas.filter((p) => !q || p.nome.toLowerCase().includes(q));
  }, [pracas, busca]);

  function alternar(ids: string[], marcar: boolean) {
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      ids.forEach((id) => (marcar ? novo.add(id) : novo.delete(id)));
      return novo;
    });
  }

  function descreverPracas(itens: Feriado[]) {
    if (!itens[0].praca_id) return 'Todos os promotores';
    if (itens.length === 1) return nomePraca.get(itens[0].praca_id) ?? 'Praça';
    const grupoUfs = new Set(itens.map((i) => ufDaPraca(nomePraca.get(i.praca_id ?? '') ?? '')));
    return `${grupoUfs.size === 1 ? [...grupoUfs][0] + ' · ' : ''}${itens.length} praças`;
  }

  const filtrando = busca.trim() !== '';

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
            Para todos os promotores ou só para algumas praças (cidades/estados). Feriado de um promotor específico: Ocorrências &gt; Feriado local.
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
              <select value={especificas ? 'pracas' : 'todos'} onChange={(e) => setEspecificas(e.target.value === 'pracas')} className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm">
                <option value="todos">Todos os promotores</option>
                <option value="pracas">Praças específicas</option>
              </select>
            </div>
            {especificas && (
              <div className="sm:col-span-2 space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar praça ou UF (ex: SP, Campinas)..." className="h-10 rounded-lg" />
                <div className="flex flex-wrap gap-1.5">
                  {ufs.map(([uf, qtd]) => {
                    const ids = pracas.filter((p) => ufDaPraca(p.nome) === uf).map((p) => p.id);
                    const todas = ids.every((id) => selecionadas.has(id));
                    return (
                      <button
                        key={uf}
                        type="button"
                        onClick={() => alternar(ids, !todas)}
                        className={`text-[11px] font-black uppercase tracking-wider rounded-full border px-2.5 py-1 ${todas ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'}`}
                      >
                        {uf} ({qtd})
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>{selecionadas.size} de {pracas.length} selecionada{selecionadas.size === 1 ? '' : 's'}</span>
                  <span className="flex gap-3">
                    <button type="button" className="font-bold text-emerald-700 hover:underline" onClick={() => alternar(visiveis.map((p) => p.id), true)}>
                      Marcar {filtrando ? 'filtradas' : 'todas'}
                    </button>
                    <button type="button" className="font-bold text-zinc-600 hover:underline" onClick={() => alternar(filtrando ? visiveis.map((p) => p.id) : [...selecionadas], false)}>
                      Desmarcar {filtrando ? 'filtradas' : 'todas'}
                    </button>
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-zinc-100 rounded-lg border border-zinc-100">
                  {visiveis.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-zinc-400">Nenhuma praça encontrada.</p>
                  ) : (
                    visiveis.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-900 cursor-pointer hover:bg-zinc-50">
                        <input type="checkbox" checked={selecionadas.has(p.id)} onChange={(e) => alternar([p.id], e.target.checked)} />
                        {p.nome}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
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
              <Button type="submit" disabled={salvando} className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-1" /> {especificas && selecionadas.size > 0 ? `Adicionar em ${selecionadas.size} praça${selecionadas.size > 1 ? 's' : ''}` : 'Adicionar'}
              </Button>
            </div>
          </form>

          <div className="divide-y divide-zinc-100">
            <p className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Em {ano}</p>
            {doAno.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-zinc-400">Nenhum feriado adicional em {ano}.</p>
            ) : (
              doAno.map((g) => {
                const { dataNoAno, itens } = g;
                const f = itens[0];
                const semMembros = itens.filter((i) => i.praca_id && (membros.get(i.praca_id) ?? 0) === 0).length;
                const nomes = itens.map((i) => nomePraca.get(i.praca_id ?? '') ?? '').filter(Boolean).sort().join(', ');
                return (
                  <div key={f.id} className="flex items-center justify-between gap-3 px-6 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-900">{f.descricao}</p>
                      <p className="text-xs text-zinc-500 tabular-nums">
                        {DIAS_SEMANA[diaSemana(dataNoAno)].slice(0, 3)} · {formatarData(dataNoAno)}
                        <span className="mx-1">·</span>
                        <span className="font-bold text-zinc-700" title={nomes || undefined}>{descreverPracas(itens)}</span>
                        {semMembros > 0 && (
                          <span className="ml-1 text-amber-600 font-bold">
                            {itens.length === 1 ? '(praça sem promotores)' : `(${semMembros} sem promotores)`}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {f.recorrente && (
                        <span title={`Repete todo ano desde ${f.data.slice(0, 4)}`} className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-1">
                          <Repeat className="w-3 h-3" /> todo ano
                        </span>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => remover(g)}><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
