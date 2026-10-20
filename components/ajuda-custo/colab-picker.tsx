'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export interface ColaboradorOpcao {
  id: string;
  nome: string;
  matricula: string;
  cargo: string | null;
}

/** Hook compartilhado: colaboradores ativos, para os seletores e para exibir nomes. */
export function useColaboradoresAtivos() {
  const [lista, setLista] = useState<ColaboradorOpcao[]>([]);
  useEffect(() => {
    supabase
      .from('colaboradores')
      .select('id, nome, matricula, cargo')
      .eq('status', 'ativo')
      .order('nome')
      .limit(5000)
      .then(({ data }) => setLista((data as ColaboradorOpcao[]) ?? []));
  }, []);
  return lista;
}

export function ColabPicker({
  colaboradores,
  value,
  onChange,
  disabled,
}: {
  colaboradores: ColaboradorOpcao[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [busca, setBusca] = useState('');
  const selecionado = colaboradores.find((c) => c.id === value);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = q ? colaboradores.filter((c) => `${c.nome} ${c.matricula}`.toLowerCase().includes(q)) : colaboradores;
    return base.slice(0, 8);
  }, [busca, colaboradores]);

  if (selecionado && !busca) {
    return (
      <div className="flex items-center justify-between h-12 px-3 rounded-xl border border-zinc-200 bg-zinc-50">
        <div className="min-w-0">
          <p className="text-sm font-bold text-zinc-900 truncate">{selecionado.nome}</p>
          <p className="text-[10px] text-zinc-500">MAT: {selecionado.matricula}</p>
        </div>
        {!disabled && (
          <button type="button" className="text-xs font-bold text-emerald-600 hover:underline" onClick={() => onChange('')}>
            Trocar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome ou matrícula..."
        className="h-12 rounded-xl"
        autoComplete="off"
      />
      <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-3 text-xs text-zinc-400">Nenhum colaborador ativo encontrado.</p>
        ) : (
          filtrados.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => {
                onChange(c.id);
                setBusca('');
              }}
              className={cn('w-full text-left px-3 py-2 hover:bg-emerald-50 transition-colors', c.id === value && 'bg-emerald-50')}
            >
              <span className="text-sm font-bold text-zinc-900">{c.nome}</span>
              <span className="ml-2 text-[10px] text-zinc-500">MAT: {c.matricula}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export const rotuloCampo = 'block text-[10px] font-black uppercase tracking-widest text-zinc-400';
