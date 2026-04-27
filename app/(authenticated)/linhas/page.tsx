'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, Plus, Search, Phone, MoreVertical, ChevronLeft, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp, Pencil, Trash2, Download } from 'lucide-react';
import { useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { dataCache } from '@/lib/data-cache';

export default function LinhasPage() {
  const [allData, setAllData] = useState<any[]>([]);
  const [colaboradoresAtivos, setColaboradoresAtivos] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedLinha, setSelectedLinha] = useState<any>(null);
  const [searchColabDialog, setSearchColabDialog] = useState('');

  // Dialog states for Create
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newNumero, setNewNumero] = useState('');
  const [newDdd, setNewDdd] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Dialog states for Edit
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingLinha, setEditingLinha] = useState<any>(null);
  const [editNumero, setEditNumero] = useState('');
  const [editDdd, setEditDdd] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Dialog states for Delete
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [linhaToDelete, setLinhaToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  // Sorting states
  const [sortColumn, setSortColumn] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadLinhas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadColaboradoresAtivos();
  }, []);

  async function loadColaboradoresAtivos() {
    try {
      const { data } = await supabase.from('colaboradores').select('id, nome, matricula').eq('status', 'ativo');
      if (data) setColaboradoresAtivos(data);
    } catch {
      // erro silencioso
    }
  }

  async function loadLinhas() {
    const cached = dataCache.get<any[]>('linhas');
    if (cached) {
      setAllData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase.from('linhas').select(`
        *,
        colaboradores (
          id, nome, matricula
        )
      `);
      
      if (error) throw error;
      setAllData(data || []);
      dataCache.set('linhas', data || []);
    } catch (error: any) {
      console.error(error);
      toast.error('Erro ao carregar linhas: ' + (error.message || 'Desconhecido'));
    } finally {
      setLoading(false);
    }
  }

  const processedData = useMemo(() => {
    let result = [...allData];
    if (search) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(item => {
        const statusStr = item.colaborador_id ? 'em uso' : 'disponível';
        const searchStr = `${item.numero || ''} ${item.ddd || ''} ${statusStr} ${item.colaboradores?.nome || ''} ${item.colaboradores?.matricula || ''}`.toLowerCase();
        return searchStr.includes(lowerSearch);
      });
    }
    result.sort((a, b) => {
      let valA, valB;
      if (sortColumn === 'status') {
        valA = a.colaborador_id ? 1 : 0;
        valB = b.colaborador_id ? 1 : 0;
      } else if (sortColumn === 'colaborador') {
        valA = a.colaboradores?.nome || '';
        valB = b.colaboradores?.nome || '';
      } else {
        valA = a[sortColumn] || '';
        valB = b[sortColumn] || '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [allData, search, sortColumn, sortDirection]);

  const totalCount = processedData.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const linhas = processedData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc'); // Default when changing column
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-2 w-4 h-4 inline-block text-gray-400" />;
    return sortDirection === 'asc' ? <ArrowUp className="ml-2 w-4 h-4 inline-block" /> : <ArrowDown className="ml-2 w-4 h-4 inline-block" />;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        // Estrutura: DDD, LINHA TELEFONICA, MATRICULA (opcional)
        const toInsert: any[] = [];

        // Para lidar com matriculas, precisamos buscar os IDs dos colaboradores
        const matriculasPresentes = data.map((r:any) => r.MATRICULA?.toString()).filter(Boolean);
        let mapColaboradores: Record<string, string> = {};
        
        if (matriculasPresentes.length > 0) {
           const { data: cols } = await supabase.from('colaboradores').select('id, matricula').in('matricula', matriculasPresentes);
           if (cols) {
             mapColaboradores = cols.reduce((acc, c) => ({ ...acc, [c.matricula]: c.id }), {});
           }
        }

        for (const row of data as any[]) {
          if (!row['LINHA TELEFONICA']) continue;
          
          let colabId = null;
          if (row.MATRICULA && mapColaboradores[row.MATRICULA.toString()]) {
             colabId = mapColaboradores[row.MATRICULA.toString()];
          }

          toInsert.push({
            numero: row['LINHA TELEFONICA'].toString(),
            ddd: row.DDD?.toString() || '',
            colaborador_id: colabId
          });
        }

        if (toInsert.length === 0) {
          toast.error('Nenhum dado válido encontrado.');
          return;
        }

        const { error } = await supabase
          .from('linhas')
          .upsert(toInsert, { onConflict: 'numero', ignoreDuplicates: true });

        if (error) throw error;
        
        toast.success(`${toInsert.length} linhas processadas.`);
        dataCache.invalidate('linhas');
        dataCache.invalidate('dashboard_stats');
        loadLinhas();
      } catch (error: any) {
        console.error(error);
        toast.error('Erro ao processar arquivo: ' + error.message);
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const vincularLinha = async (colaboradorId: string) => {
    if (!selectedLinha) return;
    try {
      setLoading(true);
      // Atualiza a linha
      const { error } = await supabase
        .from('linhas')
        .update({ colaborador_id: colaboradorId })
        .eq('id', selectedLinha.id);

      if (error) throw error;

      // Cria histórico
      await supabase.from('vinculos').insert({
        colaborador_id: colaboradorId,
        linha_id: selectedLinha.id,
        data_inicio: new Date().toISOString()
      });

      toast.success('Linha vinculada com sucesso!');
      setLinkDialogOpen(false);
      setSelectedLinha(null);
      dataCache.invalidate('linhas');
      dataCache.invalidate('colaboradores');
      loadLinhas();
    } catch (error: any) {
      toast.error('Erro ao vincular: ' + error.message);
      setLoading(false);
    }
  };

  const desvincularLinha = async (linha: any) => {
    if (!linha.colaborador_id) return;
    try {
      setLoading(true);
      // Atualiza a linha
      const { error } = await supabase
        .from('linhas')
        .update({ colaborador_id: null })
        .eq('id', linha.id);

      if (error) throw error;

      // Finaliza histórico
      await supabase.from('vinculos')
        .update({ data_fim: new Date().toISOString() })
        .eq('linha_id', linha.id)
        .eq('colaborador_id', linha.colaborador_id)
        .is('data_fim', null);

      toast.success('Linha desvinculada com sucesso!');
      dataCache.invalidate('linhas');
      dataCache.invalidate('colaboradores');
      loadLinhas();
    } catch (error: any) {
      toast.error('Erro ao desvincular: ' + error.message);
      setLoading(false);
    }
  };

  const openLinkDialog = (linha: any) => {
    setSelectedLinha(linha);
    setSearchColabDialog('');
    setLinkDialogOpen(true);
  };

  const handleCreateLinha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumero || !newDdd) {
      toast.error('Preencha o Número e o DDD.');
      return;
    }
    
    setIsCreating(true);
    try {
      const { error } = await supabase
        .from('linhas')
        .insert([{ numero: newNumero, ddd: newDdd }]);
        
      if (error) {
        if (error.code === '23505') {
           throw new Error('Já existe uma linha com este número cadastrada.');
        }
        throw error;
      }
      
      toast.success('Linha cadastrada com sucesso!');
      setIsCreateDialogOpen(false);
      setNewNumero('');
      setNewDdd('');
      dataCache.invalidate('linhas');
      dataCache.invalidate('dashboard_stats');
      loadLinhas();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao cadastrar linha.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateLinha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLinha) return;
    if (!editNumero || !editDdd) {
      toast.error('Preencha o Número e o DDD.');
      return;
    }
    
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('linhas')
        .update({ numero: editNumero, ddd: editDdd })
        .eq('id', editingLinha.id);
        
      if (error) {
        if (error.code === '23505') {
           throw new Error('Já existe uma linha cadastrada com este número.');
        }
        throw error;
      }
      
      toast.success('Linha atualizada com sucesso!');
      setIsEditDialogOpen(false);
      setEditingLinha(null);
      dataCache.invalidate('linhas');
      loadLinhas();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar linha.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteLinha = (linha: any) => {
    setLinhaToDelete(linha);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteLinha = async () => {
    if (!linhaToDelete) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('linhas')
        .delete()
        .eq('id', linhaToDelete.id);

      if (error) {
        if (error.code === '23503') {
           throw new Error('Não é possível excluir esta linha pois ela possui registros históricos de vínculos.');
        }
        throw error;
      }

      toast.success('Linha excluída com sucesso!');
      setIsDeleteDialogOpen(false);
      setLinhaToDelete(null);
      dataCache.invalidate('linhas');
      dataCache.invalidate('dashboard_stats');
      loadLinhas();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditDialog = (linha: any) => {
    setEditingLinha(linha);
    setEditNumero(linha.numero);
    setEditDdd(linha.ddd);
    setIsEditDialogOpen(true);
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const exportData = processedData.map(l => ({
        'DDD': l.ddd,
        'Número': l.numero,
        'Status': l.colaborador_id ? 'EM USO' : 'DISPONÍVEL',
        'Colaborador': l.colaboradores?.nome || '',
        'Matrícula': l.colaboradores?.matricula || ''
      }));
      
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Linhas');
      
      XLSX.writeFile(wb, `Linhas_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Relatório gerado com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar excel.');
    }
  };

  const colabsFiltrados = colaboradoresAtivos.filter(c => 
    c.nome.toLowerCase().includes(searchColabDialog.toLowerCase()) || 
    c.matricula.toLowerCase().includes(searchColabDialog.toLowerCase())
  ).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Linhas Telefônicas</h1>
          <p className="text-sm text-zinc-500">Controle de chips e planos corporativos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Button variant="outline" className="rounded-xl border-zinc-200 hover:bg-zinc-50" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2 text-zinc-500" />
            Importar
          </Button>
          <Button variant="outline" className="rounded-xl border-zinc-200 hover:bg-zinc-50" onClick={handleExportExcel}>
            <Download className="w-4 h-4 mr-2 text-zinc-500" />
            Excel
          </Button>
          <Button variant="default" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Linha
          </Button>
        </div>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Linha Telefônica</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateLinha} className="space-y-4 pt-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2 col-span-1">
                <label className="text-sm font-medium">DDD</label>
                <Input 
                  value={newDdd} 
                  onChange={e => setNewDdd(e.target.value)} 
                  placeholder="Ex: 11" 
                  maxLength={2}
                  required 
                />
              </div>
              <div className="space-y-2 col-span-3">
                <label className="text-sm font-medium">Número</label>
                <Input 
                  value={newNumero} 
                  onChange={e => setNewNumero(e.target.value)} 
                  placeholder="Ex: 99999-9999" 
                  required 
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? 'Salvando...' : 'Salvar Linha'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Linha Telefônica</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateLinha} className="space-y-4 pt-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2 col-span-1">
                <label className="text-sm font-medium">DDD</label>
                <Input 
                  value={editDdd} 
                  onChange={e => setEditDdd(e.target.value)} 
                  placeholder="Ex: 11" 
                  maxLength={2}
                  required 
                />
              </div>
              <div className="space-y-2 col-span-3">
                <label className="text-sm font-medium">Número</label>
                <Input 
                  value={editNumero} 
                  onChange={e => setEditNumero(e.target.value)} 
                  placeholder="Ex: 99999-9999" 
                  required 
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isUpdating}>
                {isUpdating ? 'Atualizando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-500">
              Deseja realmente excluir a linha telefônica <strong>({linhaToDelete?.ddd}) {linhaToDelete?.numero}</strong>?
            </p>
            <p className="text-xs text-red-500 mt-2 italic">
              Esta ação não pode ser desfeita e removerá os registros desta linha de qualquer histórico.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteLinha} disabled={isDeleting}>
              {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-none shadow-sm overflow-hidden bg-white/50 backdrop-blur-sm">
        <CardHeader className="py-4 px-6 border-b border-zinc-100 bg-white/80">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Pesquisar por número, DDD ou colaborador..."
              className="pl-10 h-10 bg-zinc-50/50 border-zinc-200 rounded-xl focus:bg-white transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table
            containerClassName="max-h-[calc(100vh-320px)] overflow-auto custom-scrollbar"
            className="min-w-[1000px] border-separate border-spacing-0 relative"
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('ddd')}>
                  <div className="flex items-center gap-1">DDD <SortIcon column="ddd" /></div>
                </TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('numero')}>
                  <div className="flex items-center gap-1">Número <SortIcon column="numero" /></div>
                </TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">Status <SortIcon column="status" /></div>
                </TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('colaborador')}>
                  <div className="flex items-center gap-1">Ocupado por <SortIcon column="colaborador" /></div>
                </TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500 text-right border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20">
                      <div className="flex flex-col items-center gap-3">
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                        <span className="text-xs font-medium text-zinc-500">Carregando linhas...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : linhas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-zinc-400 text-sm">
                      Nenhuma linha registrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  linhas.map((linha, idx) => (
                    <motion.tr 
                      key={linha.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors"
                    >
                      <TableCell className="px-6 py-4 font-mono text-xs text-zinc-500">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-400">({linha.ddd})</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="font-bold text-zinc-900 text-sm">{linha.numero}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${
                          !linha.colaborador_id ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}>
                          <span className={`w-1 h-1 rounded-full mr-1.5 ${!linha.colaborador_id ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                          {!linha.colaborador_id ? 'DISPONÍVEL' : 'EM USO'}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {linha.colaboradores ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-zinc-700">{linha.colaboradores.nome}</span>
                            <span className="text-[10px] text-zinc-400">MATRÍCULA: {linha.colaboradores.matricula}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">Nenhum</span>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                         <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                             <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-zinc-100 rounded-lg">
                               <MoreVertical className="w-4 h-4 text-zinc-400"/>
                             </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end" className="rounded-xl shadow-xl border-zinc-100">
                             <DropdownMenuItem onClick={() => openEditDialog(linha)} className="cursor-pointer">
                               <Pencil className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                               Editar Linha
                             </DropdownMenuItem>
                             {!linha.colaborador_id ? (
                               <DropdownMenuItem onClick={() => openLinkDialog(linha)} className="cursor-pointer">
                                 Vincular Colaborador
                               </DropdownMenuItem>
                             ) : (
                               <DropdownMenuItem className="text-rose-600 cursor-pointer" onClick={() => desvincularLinha(linha)}>
                                 Desvincular Linha
                               </DropdownMenuItem>
                             )}
                             <div className="h-px bg-zinc-100 my-1" />
                             <DropdownMenuItem className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer" onClick={() => handleDeleteLinha(linha)}>
                               <Trash2 className="w-3.5 h-3.5 mr-2" />
                               Excluir Registro
                             </DropdownMenuItem>
                           </DropdownMenuContent>
                         </DropdownMenu>
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>

          {!loading && totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-zinc-50/30 border-t border-zinc-100">
              <span className="text-xs font-medium text-zinc-500">
                Mostrando <span className="text-zinc-900">{(currentPage - 1) * PAGE_SIZE + 1}</span> a <span className="text-zinc-900">{Math.min(currentPage * PAGE_SIZE, totalCount)}</span> de <span className="text-zinc-900 font-bold">{totalCount}</span> linhas
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-xl border-zinc-200 h-9"
                  disabled={currentPage === 1} 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>
                <div className="flex items-center gap-1 mx-2">
                  <span className="text-xs font-bold bg-white border border-zinc-200 w-8 h-8 rounded-lg flex items-center justify-center shadow-sm">{currentPage}</span>
                  <span className="text-xs text-zinc-400 px-1">de</span>
                  <span className="text-xs font-medium text-zinc-600">{totalPages}</span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-xl border-zinc-200 h-9"
                  disabled={currentPage === totalPages} 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                >
                  Próxima
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="rounded-2xl border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-zinc-900 text-white">
            <DialogTitle className="text-xl">Vincular Linha</DialogTitle>
            <p className="text-xs text-zinc-400 mt-1">Selecione o colaborador que receberá a linha ({selectedLinha?.ddd}) {selectedLinha?.numero}</p>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Pesquisar por nome ou matrícula..."
                className="pl-10 h-10 bg-zinc-50 border-zinc-200 rounded-xl"
                value={searchColabDialog}
                onChange={(e) => setSearchColabDialog(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
              {colabsFiltrados.map((c) => (
                <motion.div 
                  key={c.id} 
                  whileHover={{ x: 5 }}
                  className="flex items-center justify-between p-3 border border-zinc-100 rounded-xl hover:bg-emerald-50 hover:border-emerald-100 transition-all cursor-pointer group"
                  onClick={() => vincularLinha(c.id)}
                >
                  <div>
                    <p className="font-bold text-sm text-zinc-900 group-hover:text-emerald-700">{c.nome}</p>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Matrícula: {c.matricula}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/50">
                    Selecionar
                  </Button>
                </motion.div>
              ))}
              {colabsFiltrados.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 opacity-50">
                   <Search className="w-8 h-8 text-zinc-300 mb-2" />
                   <p className="text-xs font-medium text-zinc-500">Nenhum colaborador encontrado.</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
