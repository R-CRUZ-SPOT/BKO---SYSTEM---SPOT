'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { TIPO_LABEL, type TipoOcorrencia, formatarData } from '@/lib/ajuda-custo';
import { avisarAcertosMudaram } from '@/hooks/use-acertos-pendentes';
import { ColabPicker, rotuloCampo, useColaboradoresAtivos } from '@/components/ajuda-custo/colab-picker';
import { cn } from '@/lib/utils';

const TIPOS = Object.keys(TIPO_LABEL) as TipoOcorrencia[];

const COR: Record<TipoOcorrencia, string> = {
  ferias: 'bg-sky-50 text-sky-700 border-sky-100',
  atestado: 'bg-amber-50 text-amber-700 border-amber-100',
  falta: 'bg-rose-50 text-rose-700 border-rose-100',
  feriado_local: 'bg-purple-50 text-purple-700 border-purple-100',
};

const AJUDA: Record<TipoOcorrencia, string> = {
  ferias: 'Dias de férias não entram no cálculo. No retorno, só contam os dias trabalhados.',
  atestado: 'Dias já pagos no mês corrente são descontados; dias do mês seguinte não são pagos.',
  falta: 'Dia pago e não trabalhado: é descontado no próximo lançamento.',
  feriado_local: 'Feriado de um promotor específico. Feriado de cidade/estado deve ser lançado em Feriados, por praça (vale para todos e pode repetir todo ano).',
};

interface Ocorrencia {
  id: string;
  colaborador_id: string;
  tipo: TipoOcorrencia;
  data_inicio: string;
  data_fim: string;
  observacao: string | null;
}

const contarDias = (ini: string, fim: string) => Math.round((Date.parse(fim) - Date.parse(ini)) / 86400000) + 1;

export default function OcorrenciasPage() {
  const colaboradores = useColaboradoresAtivos();
  const [lista, setLista] = useState<Ocorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<TipoOcorrencia | 'todos'>('todos');
  const [busca, setBusca] = useState('');

  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Ocorrencia | null>(null);
  const [form, setForm] = useState({ colaborador_id: '', tipo: 'atestado' as TipoOcorrencia, data_inicio: '', data_fim: '', observacao: '' });
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase.from('ajuda_custo_ocorrencias').select('*').order('data_inicio', { ascending: false }).limit(2000);
    if (error) toast.error('Erro ao carregar ocorrências: ' + error.message);
    else setLista((data as Ocorrencia[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, []);

  const nomePorId = useMemo(() => new Map(colaboradores.map((c) => [c.id, c])), [colaboradores]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((o) => {
      if (filtro !== 'todos' && o.tipo !== filtro) return false;
      if (!q) return true;
      const c = nomePorId.get(o.colaborador_id);
      return `${c?.nome ?? ''} ${c?.matricula ?? ''}`.toLowerCase().includes(q);
    });
  }, [lista, filtro, busca, nomePorId]);

  function abrirForm(o?: Ocorrencia) {
    setEditando(o ?? null);
    setForm(
      o
        ? { colaborador_id: o.colaborador_id, tipo: o.tipo, data_inicio: o.data_inicio, data_fim: o.data_fim, observacao: o.observacao ?? '' }
        : { colaborador_id: '', tipo: filtro === 'todos' ? 'atestado' : filtro, data_inicio: '', data_fim: '', observacao: '' }
    );
    setFormAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.colaborador_id) return toast.error('Selecione o promotor.');
    if (form.data_fim < form.data_inicio) return toast.error('A data final não pode ser anterior à inicial.');

    setSalvando(true);
    const payload = { ...form, observacao: form.observacao.trim() || null };
    const { error } = editando
      ? await supabase.from('ajuda_custo_ocorrencias').update(payload).eq('id', editando.id)
      : await supabase.from('ajuda_custo_ocorrencias').insert(payload);
    setSalvando(false);
    if (error) return toast.error('Erro ao salvar: ' + error.message);
    toast.success('Ocorrência salva.');
    setFormAberto(false);
    avisarAcertosMudaram();
    carregar();
  }

  async function excluir(o: Ocorrencia) {
    if (!window.confirm(`Excluir ${TIPO_LABEL[o.tipo].toLowerCase()} de ${nomePorId.get(o.colaborador_id)?.nome ?? 'promotor'}?`)) return;
    const { error } = await supabase.from('ajuda_custo_ocorrencias').delete().eq('id', o.id);
    if (error) return toast.error('Erro ao excluir: ' + error.message);
    toast.success('Ocorrência excluída.');
    avisarAcertosMudaram();
    carregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['todos', ...TIPOS] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFiltro(t)}
            className={cn(
              'px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border transition-colors',
              filtro === t ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:text-zinc-900'
            )}
          >
            {t === 'todos' ? 'Todas' : TIPO_LABEL[t]}
          </button>
        ))}
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white/50">
        <CardHeader className="py-4 px-6 border-b border-zinc-100 bg-white/80 flex flex-row items-center justify-between space-y-0 gap-4">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input placeholder="Pesquisar promotor..." className="pl-10 h-10 rounded-xl" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => abrirForm()}>
            <Plus className="w-4 h-4 mr-2" /> Nova ocorrência
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Promotor</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Tipo</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Período</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 text-center">Dias</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Observação</TableHead>
                <TableHead className="px-6 text-right text-[11px] font-bold uppercase tracking-wider text-zinc-500">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-16 text-zinc-400">Carregando...</TableCell></TableRow>
              ) : visiveis.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-16 text-zinc-400">Nenhuma ocorrência encontrada.</TableCell></TableRow>
              ) : (
                visiveis.map((o) => {
                  const c = nomePorId.get(o.colaborador_id);
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="px-6 py-3">
                        <p className="text-sm font-bold text-zinc-900">{c?.nome ?? '—'}</p>
                        <p className="text-[10px] text-zinc-500">MAT: {c?.matricula}</p>
                      </TableCell>
                      <TableCell>
                        <span className={cn('inline-flex px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border', COR[o.tipo])}>{TIPO_LABEL[o.tipo]}</span>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-700 whitespace-nowrap">
                        {formatarData(o.data_inicio)}{o.data_fim !== o.data_inicio && ` a ${formatarData(o.data_fim)}`}
                      </TableCell>
                      <TableCell className="text-center text-xs font-bold">{contarDias(o.data_inicio, o.data_fim)}</TableCell>
                      <TableCell className="text-xs text-zinc-500 max-w-xs truncate">{o.observacao ?? ''}</TableCell>
                      <TableCell className="px-6 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => abrirForm(o)}><Pencil className="w-4 h-4 text-zinc-500" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => excluir(o)}><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={formAberto} onOpenChange={setFormAberto}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-zinc-900">{editando ? 'Editar ocorrência' : 'Nova ocorrência'}</DialogTitle>
            <DialogDescription>{AJUDA[form.tipo]}</DialogDescription>
          </DialogHeader>
          <form onSubmit={salvar} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className={rotuloCampo}>Promotor</label>
              <ColabPicker colaboradores={colaboradores} value={form.colaborador_id} onChange={(id) => setForm({ ...form, colaborador_id: id })} />
            </div>
            <div className="space-y-2">
              <label className={rotuloCampo}>Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS.map((t) => (
                  <button
                    type="button" key={t}
                    onClick={() => setForm({ ...form, tipo: t })}
                    className={cn('h-10 rounded-xl border text-xs font-bold uppercase tracking-wider', form.tipo === t ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200')}
                  >
                    {TIPO_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className={rotuloCampo}>Primeiro dia</label>
                <Input
                  type="date" required value={form.data_inicio} className="h-12 rounded-xl"
                  onChange={(e) => setForm({ ...form, data_inicio: e.target.value, data_fim: form.data_fim && form.data_fim >= e.target.value ? form.data_fim : e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className={rotuloCampo}>Último dia</label>
                <Input type="date" required min={form.data_inicio} value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} className="h-12 rounded-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <label className={rotuloCampo}>Observação (opcional)</label>
              <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Ex: CID, cidade do feriado..." className="h-12 rounded-xl" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setFormAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvando} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">{salvando ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
