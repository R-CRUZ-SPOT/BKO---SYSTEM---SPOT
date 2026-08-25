'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

export interface BulkColaboradorItem {
  id: string;
  nome: string;
  supervisor?: string;
  uf?: string;
}

interface BulkColaboradorPickerProps {
  items: BulkColaboradorItem[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
  emptyMessage?: string;
}

const ALL_VALUE = '__all__';

export function BulkColaboradorPicker({ items, selectedIds, onChange, emptyMessage }: BulkColaboradorPickerProps) {
  const [search, setSearch] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState(ALL_VALUE);
  const [ufFilter, setUfFilter] = useState(ALL_VALUE);

  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const supervisores = useMemo(() => {
    return Array.from(new Set(items.map(i => i.supervisor).filter((s): s is string => !!s))).sort();
  }, [items]);

  const ufs = useMemo(() => {
    return Array.from(new Set(items.map(i => i.uf).filter((u): u is string => !!u))).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return items.filter(i => {
      if (term && !i.nome.toLowerCase().includes(term)) return false;
      if (supervisorFilter !== ALL_VALUE && i.supervisor !== supervisorFilter) return false;
      if (ufFilter !== ALL_VALUE && i.uf !== ufFilter) return false;
      return true;
    });
  }, [items, search, supervisorFilter, ufFilter]);

  const filteredIds = useMemo(() => filtered.map(i => i.id), [filtered]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));
  const someFilteredSelected = filteredIds.some(id => selectedIds.has(id));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
    }
  }, [someFilteredSelected, allFilteredSelected]);

  const toggleAllFiltered = (checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      filteredIds.forEach(id => next.add(id));
    } else {
      filteredIds.forEach(id => next.delete(id));
    }
    onChange(next);
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <Input
          placeholder="Buscar colaborador..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-10 bg-zinc-50/50 border-zinc-200"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select value={supervisorFilter} onValueChange={(v: string | null) => v && setSupervisorFilter(v)}>
          <SelectTrigger className="h-10 bg-zinc-50/50 border-zinc-200">
            <SelectValue placeholder="Supervisor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos os supervisores</SelectItem>
            {supervisores.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ufFilter} onValueChange={(v: string | null) => v && setUfFilter(v)}>
          <SelectTrigger className="h-10 bg-zinc-50/50 border-zinc-200">
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todas as UFs</SelectItem>
            {ufs.map(u => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border border-zinc-200 rounded-xl bg-white max-h-[320px] overflow-y-auto custom-scrollbar">
        {filtered.length === 0 ? (
          <p className="text-xs text-zinc-400 italic text-center py-8">
            {emptyMessage || 'Nenhum colaborador encontrado.'}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 bg-zinc-50 sticky top-0">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                checked={allFilteredSelected}
                onChange={e => toggleAllFiltered(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-bold text-zinc-600 uppercase">
                Selecionar todos filtrados ({filteredIds.length})
              </span>
            </div>
            {filtered.map(item => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 transition-colors border-b border-zinc-100 last:border-b-0">
                <input
                  type="checkbox"
                  id={`bulk-colab-${item.id}`}
                  checked={selectedIds.has(item.id)}
                  onChange={e => toggleOne(item.id, e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor={`bulk-colab-${item.id}`} className="text-sm font-medium text-zinc-700 cursor-pointer flex-1 flex items-center justify-between gap-2">
                  <span>{item.nome}</span>
                  <span className="text-[10px] text-zinc-400 font-normal">
                    {[item.supervisor, item.uf].filter(Boolean).join(' · ')}
                  </span>
                </label>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg text-center">
        {selectedIds.size} colaborador{selectedIds.size !== 1 ? 'es' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
