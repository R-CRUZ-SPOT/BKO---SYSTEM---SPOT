'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Plus, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp, Pencil, Trash2, MoreVertical, Download, Smartphone, Phone, Cake, Filter } from 'lucide-react';
import { useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { dataCache } from '@/lib/data-cache';

import { ImageCropperDialog } from '@/components/ui/image-cropper-dialog';
import Image from 'next/image';

export default function ColaboradoresPage() {
  const [allData, setAllData] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create Colaborador states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newMatricula, setNewMatricula] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCargo, setNewCargo] = useState('');
  const [newJob, setNewJob] = useState('');
  const [newDataNascimento, setNewDataNascimento] = useState('');
  const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
  const [newAvatarPreview, setNewAvatarPreview] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Dialog states for Edit
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingColaborador, setEditingColaborador] = useState<any>(null);
  const [editNome, setEditNome] = useState('');
  const [editMatricula, setEditMatricula] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [editJob, setEditJob] = useState('');
  const [editDataNascimento, setEditDataNascimento] = useState('');
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Dialog states for Delete
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [colaboradorToDelete, setColaboradorToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  // Sorting states
  const [sortColumn, setSortColumn] = useState('nome');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Filtering states
  const [filterAtivos, setFilterAtivos] = useState<'all' | 'with' | 'without'>('all');

  // Cropper states
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [activeCropMode, setActiveCropMode] = useState<'create' | 'edit' | null>(null);

  useEffect(() => {
    loadColaboradores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadColaboradores() {
    const cached = dataCache.get<any[]>('colaboradores');
    if (cached) {
      setAllData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase.from('colaboradores').select(`
        *,
        aparelhos (id, imei, modelo),
        linhas (id, numero, ddd)
      `);
      
      if (error) throw error;
      setAllData(data || []);
      dataCache.set('colaboradores', data || []);
    } catch (error: any) {
      console.error(error);
      toast.error('Erro ao carregar colaboradores: ' + (error.message || 'Desconhecido'));
    } finally {
      setLoading(false);
    }
  }

  const processedData = useMemo(() => {
    let result = [...allData];

    if (filterAtivos !== 'all') {
      result = result.filter(item => {
        const hasAparelhos = item.aparelhos && item.aparelhos.length > 0;
        const hasLinhas = item.linhas && item.linhas.length > 0;
        const hasAnyAtivo = hasAparelhos || hasLinhas;
        
        if (filterAtivos === 'with') return hasAnyAtivo;
        if (filterAtivos === 'without') return !hasAnyAtivo;
        return true;
      });
    }

    if (search) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(item => {
        const searchStr = `${item.nome || ''} ${item.matricula || ''} ${item.email || ''} ${item.cargo || ''} ${item.job || ''} ${item.status || ''} ${item.aparelhos?.map((a:any)=>`${a.modelo} ${a.imei}`).join(' ') || ''} ${item.linhas?.map((l:any)=>l.numero).join(' ') || ''}`.toLowerCase();
        return searchStr.includes(lowerSearch);
      });
    }
    result.sort((a, b) => {
      let valA, valB;
      if (sortColumn === 'aparelho') {
        valA = (a.aparelhos?.length || 0) + (a.linhas?.length || 0);
        valB = (b.aparelhos?.length || 0) + (b.linhas?.length || 0);
      } else if (sortColumn === 'linha') {
        valA = a.linhas?.length || 0;
        valB = b.linhas?.length || 0;
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
  }, [allData, search, sortColumn, sortDirection, filterAtivos]);

  const totalCount = processedData.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const colaboradores = processedData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, sortColumn, sortDirection, filterAtivos]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
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
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        // Helper para lidar com diferentes formatos de data que podem vir do Excel
        const parseImportDate = (val: any) => {
          if (!val) return null;
          if (val instanceof Date) {
            if (isNaN(val.getTime())) return null;
            return val.toISOString().split('T')[0];
          }
          if (typeof val === 'string') {
            const ptbrMatch = val.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
            if (ptbrMatch) {
              const [_, d, m, y] = ptbrMatch;
              return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            const d = new Date(val);
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
          }
          if (typeof val === 'number') {
            const d = new Date(Math.round((val - 25569) * 86400 * 1000));
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
          }
          return null;
        };

        // Validar e formatar dados
        const formattedData = data.map((row: any) => ({
          matricula: row.MATRICULA?.toString(),
          nome: row.NOME,
          email: row.EMAIL || null,
          data_admissao: parseImportDate(row.ADMISSAO),
          job: row.JOB || null,
          cargo: row.CARGO || null,
          data_nascimento: parseImportDate(row['DATA NASCIMENTO']),
        })).filter(row => row.matricula && row.nome); // Campos obrigatórios

        if (formattedData.length === 0) {
          toast.error('Nenhum dado válido encontrado.');
          return;
        }

        // Tenta fazer o insert on conflict ignore (como o Supabase data API não suporta ignore nativo, vamos fazer upsert)
        const { error } = await supabase
          .from('colaboradores')
          .upsert(formattedData, { onConflict: 'matricula', ignoreDuplicates: true });

        if (error) throw error;
        
        toast.success(`${formattedData.length} colaboradores processados.`);
        loadColaboradores();
      } catch (error: any) {
        console.error(error);
        toast.error('Erro ao processar arquivo: ' + error.message);
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleStatus = async (colab: any) => {
    try {
      setLoading(true);
      const newStatus = colab.status === 'ativo' ? 'inativo' : 'ativo';
      const inativacaoData = newStatus === 'inativo' ? new Date().toISOString() : null;

      const { error } = await supabase
        .from('colaboradores')
        .update({ status: newStatus, data_inativacao: inativacaoData })
        .eq('id', colab.id);

      if (error) throw error;

      if (newStatus === 'inativo') {
        // Desvincular aparelhos
        await supabase.from('aparelhos').update({ colaborador_id: null }).eq('colaborador_id', colab.id);
        
        // Desvincular linhas
        await supabase.from('linhas').update({ colaborador_id: null }).eq('colaborador_id', colab.id);

        // Atualizar histórico de vínculos fechando-os
        await supabase.from('vinculos')
          .update({ data_fim: new Date().toISOString() })
          .eq('colaborador_id', colab.id)
          .is('data_fim', null);
      }

      toast.success(`Colaborador ${newStatus === 'ativo' ? 'ativado' : 'inativado'} com sucesso!`);
      dataCache.invalidate('colaboradores');
      dataCache.invalidate('dashboard_stats');
      loadColaboradores();
    } catch (error: any) {
      toast.error('Erro ao atualizar status: ' + error.message);
      setLoading(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file);

    if (uploadError) {
      throw new Error('Erro ao fazer upload da imagem.');
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleCreateColaborador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNome || !newMatricula) {
      toast.error('Preencha o Nome e Matrícula.');
      return;
    }
    
    setIsCreating(true);
    try {
      let fotoUrl = null;
      if (newAvatarFile) {
        fotoUrl = await uploadAvatar(newAvatarFile);
      }

      const { error } = await supabase
        .from('colaboradores')
        .insert([{ 
           nome: newNome, 
           matricula: newMatricula, 
           email: newEmail || null, 
           cargo: newCargo || null, 
           job: newJob || null,
           data_nascimento: newDataNascimento || null,
           foto_url: fotoUrl
        }]);
        
      if (error) {
        if (error.code === '23505') {
           throw new Error('Já existe um colaborador com esta matrícula.');
        }
        throw error;
      }
      
      toast.success('Colaborador cadastrado com sucesso!');
      setIsCreateDialogOpen(false);
      setNewNome('');
      setNewMatricula('');
      setNewEmail('');
      setNewCargo('');
      setNewJob('');
      setNewDataNascimento('');
      setNewAvatarFile(null);
      setNewAvatarPreview(null);
      dataCache.invalidate('colaboradores');
      dataCache.invalidate('dashboard_stats');
      loadColaboradores();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao cadastrar.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateColaborador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingColaborador) return;
    if (!editNome || !editMatricula) {
      toast.error('Preencha o Nome e a Matrícula.');
      return;
    }
    
    setIsUpdating(true);
    try {
      let fotoUrl = editingColaborador.foto_url;
      if (editAvatarFile) {
        fotoUrl = await uploadAvatar(editAvatarFile);
      }

      const { error } = await supabase
        .from('colaboradores')
        .update({ 
          nome: editNome, 
          matricula: editMatricula,
          email: editEmail || null,
          cargo: editCargo || null,
          job: editJob || null,
          data_nascimento: editDataNascimento || null,
          foto_url: fotoUrl
        })
        .eq('id', editingColaborador.id);
        
      if (error) {
        if (error.code === '23505') {
           throw new Error('Já existe um colaborador cadastrado com esta matrícula.');
        }
        throw error;
      }
      
      toast.success('Colaborador atualizado com sucesso!');
      setIsEditDialogOpen(false);
      setEditingColaborador(null);
      dataCache.invalidate('colaboradores');
      loadColaboradores();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar colaborador.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteColaborador = (colaborador: any) => {
    setColaboradorToDelete(colaborador);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteColaborador = async () => {
    if (!colaboradorToDelete) return;

    setIsDeleting(true);
    try {
      // O Supabase cuidará da deleção se as FKs estiverem como CASCADE ou set null, 
      // mas vamos garantir a limpeza se necessário. 
      const { error } = await supabase
        .from('colaboradores')
        .delete()
        .eq('id', colaboradorToDelete.id);

      if (error) throw error;
      
      toast.success('Colaborador excluído com sucesso!');
      setIsDeleteDialogOpen(false);
      setColaboradorToDelete(null);
      dataCache.invalidate('colaboradores');
      dataCache.invalidate('dashboard_stats');
      loadColaboradores();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditDialog = (colaborador: any) => {
    setEditingColaborador(colaborador);
    setEditNome(colaborador.nome);
    setEditMatricula(colaborador.matricula);
    setEditEmail(colaborador.email || '');
    setEditCargo(colaborador.cargo || '');
    setEditJob(colaborador.job || '');
    setEditDataNascimento(colaborador.data_nascimento || '');
    setEditAvatarFile(null);
    setEditAvatarPreview(colaborador.foto_url || null);
    setIsEditDialogOpen(true);
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      
      const exportData = processedData.map(colab => ({
        'Matrícula': colab.matricula,
        'Nome': colab.nome,
        'E-mail': colab.email || '',
        'Cargo': colab.cargo || '',
        'Job': colab.job || '',
        'Status': colab.status.toUpperCase(),
        'Aparelhos': colab.aparelhos?.map((a: any) => `${a.modelo} (${a.imei})`).join('; ') || '',
        'Linhas': colab.linhas?.map((l: any) => `(${l.ddd}) ${l.numero}`).join('; ') || '',
        'Data Admissão': colab.data_admissao ? format(new Date(colab.data_admissao), 'dd/MM/yyyy') : ''
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
      
      XLSX.writeFile(wb, `Colaboradores_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('Relatório gerado com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar excel.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Gestão de Pessoas</h1>
          <p className="text-sm text-zinc-500">Gerencie colaboradores e seus vínculos de ativos.</p>
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
            Adicionar Colaborador
          </Button>
        </div>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Colaborador</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateColaborador} className="space-y-4 pt-4">
            <div className="flex justify-center mb-4">
              <label htmlFor="new-avatar" className="cursor-pointer relative group">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-100 border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center group-hover:border-emerald-500 transition-colors">
                  {newAvatarPreview ? (
                    <img src={newAvatarPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
                      <span className="text-[9px] text-zinc-400 font-medium mt-1 group-hover:text-emerald-500">Avatar</span>
                    </>
                  )}
                </div>
                <input 
                  id="new-avatar" 
                  type="file" 
                  accept="image/jpeg, image/png, image/webp" 
                  className="hidden" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCropImageSrc(URL.createObjectURL(file));
                      setActiveCropMode('create');
                      setCropDialogOpen(true);
                      e.target.value = ''; // reset to allow picking same file again
                    }
                  }} 
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Matrícula</label>
                <Input 
                  value={newMatricula} 
                  onChange={e => setNewMatricula(e.target.value)} 
                  placeholder="Ex: 123456" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome</label>
                <Input 
                  value={newNome} 
                  onChange={e => setNewNome(e.target.value)} 
                  placeholder="Ex: João da Silva" 
                  required 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">E-mail</label>
              <Input 
                type="email"
                value={newEmail} 
                onChange={e => setNewEmail(e.target.value)} 
                placeholder="exemplo@empresa.com" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Cargo</label>
                <Input 
                  value={newCargo} 
                  onChange={e => setNewCargo(e.target.value)} 
                  placeholder="Ex: Analista" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Job</label>
                <Input 
                  value={newJob} 
                  onChange={e => setNewJob(e.target.value)} 
                  placeholder="Ex: TI" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Data de Nascimento</label>
              <Input 
                type="date"
                value={newDataNascimento} 
                onChange={e => setNewDataNascimento(e.target.value)} 
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? 'Salvando...' : 'Salvar Colaborador'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Colaborador</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateColaborador} className="space-y-4 pt-4">
            <div className="flex justify-center mb-4">
              <label htmlFor="edit-avatar" className="cursor-pointer relative group">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-100 border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center group-hover:border-emerald-500 transition-colors">
                  {editAvatarPreview ? (
                    <img src={editAvatarPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
                      <span className="text-[9px] text-zinc-400 font-medium mt-1 group-hover:text-emerald-500">Avatar</span>
                    </>
                  )}
                </div>
                <input 
                  id="edit-avatar" 
                  type="file" 
                  accept="image/jpeg, image/png, image/webp" 
                  className="hidden" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCropImageSrc(URL.createObjectURL(file));
                      setActiveCropMode('edit');
                      setCropDialogOpen(true);
                      e.target.value = ''; // reset to allow picking same file again
                    }
                  }} 
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Matrícula</label>
                <Input 
                  value={editMatricula} 
                  onChange={e => setEditMatricula(e.target.value)} 
                  placeholder="Ex: 123456" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome</label>
                <Input 
                  value={editNome} 
                  onChange={e => setEditNome(e.target.value)} 
                  placeholder="Ex: João da Silva" 
                  required 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">E-mail</label>
              <Input 
                type="email"
                value={editEmail} 
                onChange={e => setEditEmail(e.target.value)} 
                placeholder="exemplo@empresa.com" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Cargo</label>
                <Input 
                  value={editCargo} 
                  onChange={e => setEditCargo(e.target.value)} 
                  placeholder="Ex: Analista" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Job</label>
                <Input 
                  value={editJob} 
                  onChange={e => setEditJob(e.target.value)} 
                  placeholder="Ex: TI" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Data de Nascimento</label>
              <Input 
                type="date"
                value={editDataNascimento} 
                onChange={e => setEditDataNascimento(e.target.value)} 
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
              Deseja realmente excluir o colaborador <strong>{colaboradorToDelete?.nome}</strong> (Matrícula: {colaboradorToDelete?.matricula})?
            </p>
            <p className="text-xs text-red-500 mt-2 italic">
              Esta ação removerá permanentemente o colaborador e encerrará todos os vínculos ativos de aparelhos e linhas.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteColaborador} disabled={isDeleting}>
              {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-none shadow-sm overflow-hidden bg-white/50 backdrop-blur-sm">
        <CardHeader className="py-4 px-6 border-b border-zinc-100 bg-white/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Pesquisar por nome, matrícula, e-mail..."
              className="pl-10 h-10 bg-zinc-50/50 border-zinc-200 rounded-xl focus:bg-white transition-all w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-400 font-bold" />
            <Select value={filterAtivos} onValueChange={(val: any) => setFilterAtivos(val)}>
              <SelectTrigger className="w-[200px] h-10 rounded-xl bg-zinc-50/50 border-zinc-200 text-xs font-medium">
                <SelectValue placeholder="Filtrar por Vínculos" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-zinc-200 shadow-xl">
                <SelectItem value="all" className="text-xs cursor-pointer rounded-lg focus:bg-zinc-100">Todos os Colaboradores</SelectItem>
                <SelectItem value="with" className="text-xs cursor-pointer rounded-lg focus:bg-emerald-50 focus:text-emerald-700">Com Ativos Vinculados</SelectItem>
                <SelectItem value="without" className="text-xs cursor-pointer rounded-lg focus:bg-amber-50 focus:text-amber-700">Sem Ativos Vinculados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table
            containerClassName="max-h-[calc(100vh-320px)] overflow-auto custom-scrollbar"
            className="min-w-[1000px] border-separate border-spacing-0 relative"
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('matricula')}>
                  <div className="flex items-center gap-1">Matrícula <SortIcon column="matricula" /></div>
                </TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('nome')}>
                  <div className="flex items-center gap-1">Colaborador <SortIcon column="nome" /></div>
                </TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('cargo')}>
                  <div className="flex items-center gap-1">Cargo/Área <SortIcon column="cargo" /></div>
                </TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">Status <SortIcon column="status" /></div>
                </TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('aparelho')}>
                  <div className="flex items-center gap-1">Ativos Vinculados <SortIcon column="aparelho" /></div>
                </TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500 text-right border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-20">
                      <div className="flex flex-col items-center gap-3">
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                        <span className="text-xs font-medium text-zinc-500">Carregando dados...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : colaboradores.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-20 text-zinc-400 text-sm">
                      Nenhum registro encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  colaboradores.map((colab, idx) => (
                    <motion.tr 
                      key={colab.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors"
                    >
                      <TableCell className="px-6 py-4 font-mono text-xs text-zinc-500">#{colab.matricula}</TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <Image
                              src={colab.foto_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(colab.nome || 'X')}&background=random&color=fff&size=128&bold=true&rounded=true`}
                              alt={colab.nome || 'Avatar'}
                              width={36}
                              height={36}
                              className="rounded-full shadow-sm ring-2 ring-white object-cover aspect-square"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-zinc-900 text-sm group-hover:text-emerald-600 transition-colors">{colab.nome}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-zinc-500">{colab.email || 'Nenhum e-mail'}</span>
                              {colab.data_nascimento && (
                                <>
                                  <span className="text-zinc-300">•</span>
                                  <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-medium">
                                    <Cake className="w-2.5 h-2.5" />
                                    {format(parseISO(colab.data_nascimento), 'dd/MM')}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-zinc-700">{colab.cargo || '-'}</span>
                          <span className="text-[10px] font-bold uppercase tracking-tighter text-zinc-400">{colab.job || 'OUTROS'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${
                          colab.status === 'ativo' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                        }`}>
                          <span className={`w-1 h-1 rounded-full mr-1.5 ${colab.status === 'ativo' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {colab.status.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {colab.aparelhos?.map((ap: any) => (
                            <div key={ap.id} className="flex flex-col items-start bg-zinc-100 px-2.5 py-1.5 rounded-lg border border-zinc-200/50 min-w-[120px]">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-700 uppercase tracking-tighter">
                                <Smartphone className="w-3 h-3 text-emerald-600" />
                                <span className="truncate max-w-[100px]">{ap.modelo}</span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5 ml-[18px]">
                                <span className="text-[8px] font-mono text-zinc-400 tracking-wider">IMEI: {ap.imei || 'N/A'}</span>
                              </div>
                            </div>
                          ))}
                          {colab.linhas?.map((l: any) => (
                            <div key={l.id} className="flex flex-col justify-center items-start bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100/50 h-full">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-700 uppercase tracking-tighter">
                                <Phone className="w-3 h-3" />
                                ({l.ddd}) {l.numero}
                              </div>
                            </div>
                          ))}
                          {(!colab.aparelhos?.length && !colab.linhas?.length) && (
                            <span className="text-xs text-zinc-400 italic">Sem vínculos</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                         <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                             <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-zinc-100 rounded-lg">
                               <MoreVertical className="w-4 h-4 text-zinc-400"/>
                             </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end" className="rounded-xl shadow-xl border-zinc-100">
                             <DropdownMenuItem onClick={() => openEditDialog(colab)} className="cursor-pointer">
                               <Pencil className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                               Editar
                             </DropdownMenuItem>
                             <DropdownMenuItem onClick={() => toggleStatus(colab)} className="cursor-pointer">
                               {colab.status === 'ativo' ? 'Inativar Colaborador' : 'Reativar Colaborador'}
                             </DropdownMenuItem>
                             <div className="h-px bg-zinc-100 my-1" />
                             <DropdownMenuItem className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer" onClick={() => handleDeleteColaborador(colab)}>
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
                Mostrando <span className="text-zinc-900">{(currentPage - 1) * PAGE_SIZE + 1}</span> a <span className="text-zinc-900">{Math.min(currentPage * PAGE_SIZE, totalCount)}</span> de <span className="text-zinc-900 font-bold">{totalCount}</span> registros
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

      {/* Cropper Modal */}
      <ImageCropperDialog
        open={cropDialogOpen}
        onOpenChange={setCropDialogOpen}
        imageSrc={cropImageSrc}
        onCropComplete={(croppedBlob) => {
          const file = new File([croppedBlob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
          if (activeCropMode === 'create') {
            setNewAvatarFile(file);
            setNewAvatarPreview(URL.createObjectURL(croppedBlob));
          } else {
             setEditAvatarFile(file);
             setEditAvatarPreview(URL.createObjectURL(croppedBlob));
          }
        }}
      />
    </div>
  );
}
