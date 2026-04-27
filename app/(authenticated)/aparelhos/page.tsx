'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, Plus, Search, Smartphone, MoreVertical, ChevronLeft, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp, Pencil, Trash2, Download } from 'lucide-react';
import { useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { dataCache } from '@/lib/data-cache';

export default function AparelhosPage() {
  const [allData, setAllData] = useState<any[]>([]);
  const [colaboradoresAtivos, setColaboradoresAtivos] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedAparelho, setSelectedAparelho] = useState<any>(null);
  const [searchColabDialog, setSearchColabDialog] = useState('');

  // Dialog states for Create
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newImei, setNewImei] = useState('');
  const [newModelo, setNewModelo] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Dialog states for Edit
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAparelho, setEditingAparelho] = useState<any>(null);
  const [editImei, setEditImei] = useState('');
  const [editModelo, setEditModelo] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Dialog states for Delete
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [aparelhoToDelete, setAparelhoToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  // Sorting states
  const [sortColumn, setSortColumn] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadAparelhos();
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

  async function loadAparelhos() {
    const cached = dataCache.get<any[]>('aparelhos');
    if (cached) {
      setAllData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase.from('aparelhos').select(`
        *,
        colaboradores (
          id, nome, matricula
        )
      `);
      
      if (error) throw error;
      setAllData(data || []);
      dataCache.set('aparelhos', data || []);
    } catch (error: any) {
      console.error(error);
      toast.error('Erro ao carregar aparelhos: ' + (error.message || 'Desconhecido'));
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
        const searchStr = `${item.imei || ''} ${item.modelo || ''} ${statusStr} ${item.colaboradores?.nome || ''} ${item.colaboradores?.matricula || ''}`.toLowerCase();
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
  const aparelhos = processedData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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

        // Estrutura: MODELO, IMEI, MATRICULA (opcional)
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
          if (!row.IMEI) continue;
          
          let colabId = null;
          if (row.MATRICULA && mapColaboradores[row.MATRICULA.toString()]) {
             colabId = mapColaboradores[row.MATRICULA.toString()];
          }

          toInsert.push({
            imei: row.IMEI.toString(),
            modelo: row.MODELO || 'Desconhecido',
            colaborador_id: colabId
          });
        }

        if (toInsert.length === 0) {
          toast.error('Nenhum dado válido encontrado.');
          return;
        }

        const { error } = await supabase
          .from('aparelhos')
          .upsert(toInsert, { onConflict: 'imei', ignoreDuplicates: true });

        if (error) throw error;
        
        toast.success(`${toInsert.length} aparelhos processados.`);
        dataCache.invalidate('aparelhos');
        dataCache.invalidate('dashboard_stats');
        loadAparelhos();
      } catch (error: any) {
        console.error(error);
        toast.error('Erro ao processar arquivo: ' + error.message);
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const vincularAparelho = async (colaboradorId: string) => {
    if (!selectedAparelho) return;
    try {
      setLoading(true);
      // Atualiza o aparelho
      const { error } = await supabase
        .from('aparelhos')
        .update({ colaborador_id: colaboradorId })
        .eq('id', selectedAparelho.id);

      if (error) throw error;

      // Cria histórico
      await supabase.from('vinculos').insert({
        colaborador_id: colaboradorId,
        aparelho_id: selectedAparelho.id,
        data_inicio: new Date().toISOString()
      });

      toast.success('Aparelho vinculado com sucesso!');
      setLinkDialogOpen(false);
      setSelectedAparelho(null);
      dataCache.invalidate('aparelhos');
      dataCache.invalidate('colaboradores');
      loadAparelhos();
    } catch (error: any) {
      toast.error('Erro ao vincular: ' + error.message);
      setLoading(false);
    }
  };

  const desvincularAparelho = async (aparelho: any) => {
    if (!aparelho.colaborador_id) return;
    try {
      setLoading(true);
      // Atualiza o aparelho
      const { error } = await supabase
        .from('aparelhos')
        .update({ colaborador_id: null })
        .eq('id', aparelho.id);

      if (error) throw error;

      // Finaliza histórico
      await supabase.from('vinculos')
        .update({ data_fim: new Date().toISOString() })
        .eq('aparelho_id', aparelho.id)
        .eq('colaborador_id', aparelho.colaborador_id)
        .is('data_fim', null);

      toast.success('Aparelho desvinculado com sucesso!');
      dataCache.invalidate('aparelhos');
      dataCache.invalidate('colaboradores');
      loadAparelhos();
    } catch (error: any) {
      toast.error('Erro ao desvincular: ' + error.message);
      setLoading(false);
    }
  };

  const openLinkDialog = (aparelho: any) => {
    setSelectedAparelho(aparelho);
    setSearchColabDialog('');
    setLinkDialogOpen(true);
  };

  const handleCreateAparelho = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newImei || !newModelo) {
      toast.error('Preencha o IMEI e o Modelo.');
      return;
    }
    
    setIsCreating(true);
    try {
      const { error } = await supabase
        .from('aparelhos')
        .insert([{ imei: newImei, modelo: newModelo }]);
        
      if (error) {
        if (error.code === '23505') {
           throw new Error('Já existe um aparelho cadastrado com este IMEI.');
        }
        throw error;
      }
      
      toast.success('Aparelho cadastrado com sucesso!');
      setIsCreateDialogOpen(false);
      setNewImei('');
      setNewModelo('');
      dataCache.invalidate('aparelhos');
      dataCache.invalidate('dashboard_stats');
      loadAparelhos();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao cadastrar aparelho.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateAparelho = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAparelho) return;
    if (!editImei || !editModelo) {
      toast.error('Preencha o IMEI e o Modelo.');
      return;
    }
    
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('aparelhos')
        .update({ imei: editImei, modelo: editModelo })
        .eq('id', editingAparelho.id);
        
      if (error) {
        if (error.code === '23505') {
           throw new Error('Já existe um aparelho cadastrado com este IMEI.');
        }
        throw error;
      }
      
      toast.success('Aparelho atualizado com sucesso!');
      setIsEditDialogOpen(false);
      setEditingAparelho(null);
      dataCache.invalidate('aparelhos');
      loadAparelhos();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar aparelho.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAparelho = (aparelho: any) => {
    setAparelhoToDelete(aparelho);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteAparelho = async () => {
    if (!aparelhoToDelete) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('aparelhos')
        .delete()
        .eq('id', aparelhoToDelete.id);

      if (error) {
        if (error.code === '23503') {
           throw new Error('Não é possível excluir este aparelho pois ele possui registros históricos de vínculos.');
        }
        throw error;
      }

      toast.success('Aparelho excluído com sucesso!');
      setIsDeleteDialogOpen(false);
      setAparelhoToDelete(null);
      dataCache.invalidate('aparelhos');
      dataCache.invalidate('dashboard_stats');
      loadAparelhos();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditDialog = (aparelho: any) => {
    setEditingAparelho(aparelho);
    setEditImei(aparelho.imei);
    setEditModelo(aparelho.modelo);
    setIsEditDialogOpen(true);
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const exportData = processedData.map(ap => ({
        'IMEI': ap.imei,
        'Modelo': ap.modelo,
        'Status': ap.colaborador_id ? 'EM USO' : 'DISPONÍVEL',
        'Colaborador': ap.colaboradores?.nome || '',
        'Matrícula': ap.colaboradores?.matricula || ''
      }));
      
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Aparelhos');
      
      XLSX.writeFile(wb, `Aparelhos_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Relatório gerado com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar excel.');
    }
  };

  const colabsFiltrados = colaboradoresAtivos.filter(c => 
    c.nome.toLowerCase().includes(searchColabDialog.toLowerCase()) || 
    c.matricula.toLowerCase().includes(searchColabDialog.toLowerCase())
  ).slice(0, 5); // Limitar sugestões na tela

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Inventário de Aparelhos</h1>
          <p className="text-sm text-zinc-500">Controle e vinculação de dispositivos móveis.</p>
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
            Novo Aparelho
          </Button>
        </div>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Aparelho</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAparelho} className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">IMEI</label>
              <Input 
                value={newImei} 
                onChange={e => setNewImei(e.target.value)} 
                placeholder="Ex: 351000000000000" 
                required 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Modelo</label>
              <Input 
                value={newModelo} 
                onChange={e => setNewModelo(e.target.value)} 
                placeholder="Ex: iPhone 13, Moto G..." 
                required 
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? 'Salvando...' : 'Salvar Aparelho'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Aparelho</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateAparelho} className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">IMEI</label>
              <Input 
                value={editImei} 
                onChange={e => setEditImei(e.target.value)} 
                placeholder="Ex: 351000000000000" 
                required 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Modelo</label>
              <Input 
                value={editModelo} 
                onChange={e => setEditModelo(e.target.value)} 
                placeholder="Ex: iPhone 13, Moto G..." 
                required 
              />
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
              Deseja realmente excluir o aparelho <strong>{aparelhoToDelete?.modelo}</strong> (IMEI: {aparelhoToDelete?.imei})?
            </p>
            <p className="text-xs text-red-500 mt-2 italic">
              Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteAparelho} disabled={isDeleting}>
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
              placeholder="Pesquisar por IMEI, modelo ou colaborador..."
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
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('imei')}>
                  <div className="flex items-center gap-1">IMEI <SortIcon column="imei" /></div>
                </TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('modelo')}>
                  <div className="flex items-center gap-1">Modelo <SortIcon column="modelo" /></div>
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
                        <span className="text-xs font-medium text-zinc-500">Carregando dispositivos...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : aparelhos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-zinc-400 text-sm">
                      Nenhum dispositivo registrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  aparelhos.map((aparelho, idx) => (
                    <motion.tr 
                      key={aparelho.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors"
                    >
                      <TableCell className="px-6 py-4 font-mono text-xs text-zinc-500">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-3.5 h-3.5 text-zinc-400" />
                          {aparelho.imei}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <span className="font-bold text-zinc-900 text-sm">{aparelho.modelo}</span>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${
                          !aparelho.colaborador_id ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}>
                          <span className={`w-1 h-1 rounded-full mr-1.5 ${!aparelho.colaborador_id ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                          {!aparelho.colaborador_id ? 'DISPONÍVEL' : 'EM USO'}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {aparelho.colaboradores ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-zinc-700">{aparelho.colaboradores.nome}</span>
                            <span className="text-[10px] text-zinc-400">MATRÍCULA: {aparelho.colaboradores.matricula}</span>
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
                             <DropdownMenuItem onClick={() => openEditDialog(aparelho)} className="cursor-pointer">
                               <Pencil className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                               Editar Detalhes
                             </DropdownMenuItem>
                             {!aparelho.colaborador_id ? (
                               <DropdownMenuItem onClick={() => openLinkDialog(aparelho)} className="cursor-pointer">
                                 Vincular Colaborador
                               </DropdownMenuItem>
                             ) : (
                               <DropdownMenuItem className="text-rose-600 cursor-pointer" onClick={() => desvincularAparelho(aparelho)}>
                                 Desvincular Ativo
                               </DropdownMenuItem>
                             )}
                             <div className="h-px bg-zinc-100 my-1" />
                             <DropdownMenuItem className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer" onClick={() => handleDeleteAparelho(aparelho)}>
                               <Trash2 className="w-3.5 h-3.5 mr-2" />
                               Remover do Inventário
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
                Mostrando <span className="text-zinc-900">{(currentPage - 1) * PAGE_SIZE + 1}</span> a <span className="text-zinc-900">{Math.min(currentPage * PAGE_SIZE, totalCount)}</span> de <span className="text-zinc-900 font-bold">{totalCount}</span> aparelhos
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
            <DialogTitle className="text-xl">Vincular Ativo</DialogTitle>
            <p className="text-xs text-zinc-400 mt-1">Selecione o colaborador que receberá o dispositivo {selectedAparelho?.modelo} (IMEI {selectedAparelho?.imei})</p>
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
                  onClick={() => vincularAparelho(c.id)}
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
