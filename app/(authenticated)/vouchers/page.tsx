'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Upload, Plus, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp, Pencil, Trash2, MoreVertical, Ticket, Filter, CheckCircle2, Clock } from 'lucide-react';
import { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { dataCache } from '@/lib/data-cache';

export default function VouchersPage() {
  const [allData, setAllData] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CRUD States
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<any>(null);
  const [formData, setFormData] = useState({
    produto: '',
    valor: '',
    validade: '',
    codigo: '',
    matricula: '',
    status: 'disponível'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [voucherToDelete, setVoucherToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [sortColumn, setSortColumn] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadVouchers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadVouchers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select(`
          *,
          colaboradores (id, nome, matricula)
        `)
        .order(sortColumn, { ascending: sortDirection === 'asc' });

      if (error) {
        // Se houver erro de relação ou tabela inexistente, tenta um fallback simples
        console.error('Erro Supabase:', error);
        if (error.code === 'PGRST116' || error.message?.includes('colaboradores')) {
          const { data: simpleData, error: simpleError } = await supabase
            .from('vouchers')
            .select('*')
            .order(sortColumn, { ascending: sortDirection === 'asc' });
          
          if (simpleError) throw simpleError;
          setAllData(simpleData || []);
          return;
        }
        throw error;
      }
      setAllData(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar vouchers:', error);
      toast.error('Erro ao carregar vouchers: ' + (error.message || 'Verifique se a tabela foi criada no Supabase.'));
    } finally {
      setLoading(false);
    }
  }

  const processedData = useMemo(() => {
    let result = [...allData];
    if (search) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(item => {
        const searchStr = `${item.produto} ${item.codigo} ${item.matricula || ''} ${item.colaboradores?.nome || ''} ${item.status}`.toLowerCase();
        return searchStr.includes(lowerSearch);
      });
    }
    return result;
  }, [allData, search]);

  const vouchers = useMemo(() => {
    return processedData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  }, [processedData, currentPage]);

  const totalPages = Math.ceil(processedData.length / PAGE_SIZE) || 1;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        const binary = evt.target?.result;
        const wb = XLSX.read(binary, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // Manual conversion to handle potential semicolon or comma issues if needed
        // but sheet_to_json is generally smart. However, the user provided a semicolon-separated text.
        // Let's try to detect if it's a raw CSV text first.
        const rawContent = XLSX.utils.sheet_to_csv(ws, { FS: ';' });
        // sheet_to_json doesn't handle FS well, so we use its default behavior or convert back.
        // If the file is actually an Excel or properly formatted CSV, sheet_to_json works.
        const data = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          toast.error('Nenhum dado encontrado no arquivo.');
          return;
        }

        // Try to map columns regardless of case and slight variations
        const findKey = (row: any, ...keys: string[]) => {
          const rowKeys = Object.keys(row);
          for (const k of keys) {
            const found = rowKeys.find(rk => rk.toLowerCase().includes(k.toLowerCase()));
            if (found) return row[found];
          }
          return null;
        };

        toast.loading('Processando importação...', { id: 'import' });

        // Get all collaborators to link by matricula
        const { data: colabs } = await supabase.from('colaboradores').select('id, matricula');
        const colabMap = new Map(colabs?.map(c => [c.matricula, c.id]));

        const formattedVouchers = data.map((row: any) => {
          const produto = findKey(row, 'Produto', 'Product') || '';
          const valor = findKey(row, 'Valor', 'Value') || '';
          const validadeRaw = findKey(row, 'Validade', 'Valid');
          const codigo = findKey(row, 'Cdigo', 'Código', 'Code') || '';
          const matricula = findKey(row, 'Matricula', 'Registration')?.toString() || '';

          let validade = null;
          if (validadeRaw) {
            // Handle different date formats
            if (validadeRaw instanceof Date) {
              validade = validadeRaw.toISOString().split('T')[0];
            } else if (typeof validadeRaw === 'string') {
              const parts = validadeRaw.split('/');
              if (parts.length === 3) {
                // assume dd/mm/yyyy
                validade = `${parts[2]}-${parts[1]}-${parts[0]}`;
              } else {
                const date = new Date(validadeRaw);
                if (isValid(date)) validade = date.toISOString().split('T')[0];
              }
            }
          }

          const colaborador_id = matricula ? colabMap.get(matricula) : null;
          const status = colaborador_id ? 'utilizado' : 'disponível';

          return {
            produto,
            valor,
            validade,
            codigo,
            matricula: matricula || null,
            colaborador_id: colaborador_id || null,
            status
          };
        }).filter(v => v.produto && v.codigo);

        if (formattedVouchers.length === 0) {
          toast.error('Dados inválidos. Verifique as colunas: Produto, Valor, Validade, Código e Matricula.', { id: 'import' });
          return;
        }

        const { error } = await supabase.from('vouchers').insert(formattedVouchers);
        if (error) throw error;

        toast.success(`${formattedVouchers.length} vouchers importados com sucesso!`, { id: 'import' });
        loadVouchers();
      } catch (error: any) {
        console.error(error);
        toast.error('Erro ao processar importação: ' + error.message, { id: 'import' });
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openForm = (voucher: any = null) => {
    if (voucher) {
      setEditingVoucher(voucher);
      setFormData({
        produto: voucher.produto,
        valor: voucher.valor,
        validade: voucher.validade || '',
        codigo: voucher.codigo,
        matricula: voucher.matricula || '',
        status: voucher.status
      });
    } else {
      setEditingVoucher(null);
      setFormData({
        produto: '',
        valor: '',
        validade: '',
        codigo: '',
        matricula: '',
        status: 'disponível'
      });
    }
    setIsFormDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Find colab if matricula provided
      let colaborador_id = null;
      if (formData.matricula) {
        const { data } = await supabase.from('colaboradores').select('id').eq('matricula', formData.matricula).single();
        if (data) colaborador_id = data.id;
      }

      const payload = {
        ...formData,
        colaborador_id,
        status: colaborador_id ? 'utilizado' : formData.status,
        updated_at: new Date().toISOString()
      };

      if (editingVoucher) {
        const { error } = await supabase.from('vouchers').update(payload).eq('id', editingVoucher.id);
        if (error) throw error;
        toast.success('Voucher atualizado!');
      } else {
        const { error } = await supabase.from('vouchers').insert([payload]);
        if (error) throw error;
        toast.success('Voucher criado!');
      }

      setIsFormDialogOpen(false);
      loadVouchers();
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!voucherToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('vouchers').delete().eq('id', voucherToDelete.id);
      if (error) throw error;
      toast.success('Voucher excluído!');
      setIsDeleteDialogOpen(false);
      setVoucherToDelete(null);
      loadVouchers();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
            <Ticket className="w-6 h-6 text-emerald-600" />
            Gestão de Vouchers
          </h1>
          <p className="text-sm text-zinc-500">Controle de premiações e códigos promocionais.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Button 
            variant="outline" 
            className="rounded-xl border-zinc-200 hover:bg-zinc-50"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2 text-zinc-500" />
            Importar CSV
          </Button>
          <Button 
            variant="default" 
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
            onClick={() => openForm()}
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Voucher
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white/50 backdrop-blur-sm border-zinc-100 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Ticket className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Total Vouchers</p>
                <p className="text-2xl font-black text-zinc-900">{allData.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/50 backdrop-blur-sm border-zinc-100 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Disponíveis</p>
                <p className="text-2xl font-black text-zinc-900">
                  {allData.filter(v => v.status === 'disponível').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/50 backdrop-blur-sm border-zinc-100 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Utilizados</p>
                <p className="text-2xl font-black text-zinc-900">
                  {allData.filter(v => v.status === 'utilizado').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white/50 backdrop-blur-sm">
        <CardHeader className="py-4 px-6 border-b border-zinc-100 bg-white/80 flex flex-row items-center justify-between space-y-0">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Pesquisar vouchers..."
              className="pl-10 h-10 bg-zinc-50/50 border-zinc-200 rounded-xl focus:bg-white transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-zinc-500 h-10 px-4 rounded-xl hover:bg-zinc-100">
              <Filter className="w-4 h-4 mr-2" />
              Filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="py-4 px-6 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500" onClick={() => handleSort('produto')}>
                  Produto
                </TableHead>
                <TableHead className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Valor</TableHead>
                <TableHead className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500" onClick={() => handleSort('validade')}>Validade</TableHead>
                <TableHead className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Código/Senha</TableHead>
                <TableHead className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Dono/Matrícula</TableHead>
                <TableHead className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500 text-center">Status</TableHead>
                <TableHead className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
                  </TableCell>
                </TableRow>
              ) : vouchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20 text-zinc-400">Nenhum voucher encontrado.</TableCell>
                </TableRow>
              ) : (
                vouchers.map((voucher) => (
                  <TableRow key={voucher.id} className="group hover:bg-zinc-50/50 transition-colors">
                    <TableCell className="px-6 py-4 font-bold text-zinc-900">{voucher.produto}</TableCell>
                    <TableCell className="px-6 py-4 text-emerald-600 font-bold">{voucher.valor}</TableCell>
                    <TableCell className="px-6 py-4 text-xs">
                      {voucher.validade ? format(parseISO(voucher.validade), 'dd/MM/yyyy') : '-'}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <code className="text-[10px] bg-zinc-100 px-2 py-1 rounded border border-zinc-200 text-zinc-600">
                        {voucher.codigo}
                      </code>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      {voucher.colaboradores ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-zinc-900">{voucher.colaboradores.nome}</span>
                          <span className="text-[10px] text-zinc-500">MAT: {voucher.colaboradores.matricula}</span>
                        </div>
                      ) : voucher.matricula ? (
                        <span className="text-[10px] text-amber-600 font-bold">MAT: {voucher.matricula} (Pendente)</span>
                      ) : (
                        <span className="text-xs text-zinc-300 italic">Disponível</span>
                      )}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                        voucher.status === 'disponível' 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                          : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                      }`}>
                        {voucher.status}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white rounded-lg">
                            <MoreVertical className="w-4 h-4 text-zinc-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl shadow-xl w-40 border-zinc-100">
                          <DropdownMenuItem onClick={() => openForm(voucher)}>
                            <Pencil className="w-4 h-4 mr-2 text-zinc-500" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              setVoucherToDelete(voucher);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="p-4 border-t border-zinc-100 flex items-center justify-between">
               <span className="text-[10px] text-zinc-400 uppercase font-black tracking-widest font-mono">Página {currentPage} de {totalPages}</span>
               <div className="flex gap-2">
                 <Button 
                   variant="outline" 
                   size="sm" 
                   className="rounded-lg h-8 px-4"
                   disabled={currentPage === 1}
                   onClick={() => setCurrentPage(p => p - 1)}
                 >
                   Anterior
                 </Button>
                 <Button 
                   variant="outline" 
                   size="sm" 
                   className="rounded-lg h-8 px-4"
                   disabled={currentPage === totalPages}
                   onClick={() => setCurrentPage(p => p + 1)}
                 >
                   Próxima
                 </Button>
               </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-zinc-900 leading-none">
              {editingVoucher ? 'Editar Voucher' : 'Novo Voucher'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Produto</label>
              <Input 
                value={formData.produto}
                onChange={e => setFormData({...formData, produto: e.target.value})}
                placeholder="Ex: CARTÃO PRESENTE RENNER"
                required
                className="h-12 rounded-xl focus:ring-emerald-500/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Valor</label>
                <Input 
                  value={formData.valor}
                  onChange={e => setFormData({...formData, valor: e.target.value})}
                  placeholder="Ex: R$ 70,00"
                  required
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Validade</label>
                <Input 
                  type="date"
                  value={formData.validade}
                  onChange={e => setFormData({...formData, validade: e.target.value})}
                  className="h-12 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Código / Senha</label>
              <Input 
                value={formData.codigo}
                onChange={e => setFormData({...formData, codigo: e.target.value})}
                placeholder="Código e senha se houver"
                required
                className="h-12 rounded-xl font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Matrícula Colaborador (Opcional)</label>
              <Input 
                value={formData.matricula}
                onChange={e => setFormData({...formData, matricula: e.target.value})}
                placeholder="Vincular à matrícula..."
                className="h-12 rounded-xl"
              />
              <p className="text-[10px] text-zinc-400 italic">Ao informar uma matrícula, o status mudará para utilizado.</p>
            </div>
            {!formData.matricula && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Status</label>
                <select 
                  className="w-full h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none"
                  value={formData.status}
                  onChange={e => setFormData({...formData, status: e.target.value})}
                >
                  <option value="disponível">Disponível</option>
                  <option value="utilizado">Utilizado</option>
                </select>
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="ghost" className="flex-1 h-12 rounded-xl" onClick={() => setIsFormDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Confirmar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-rose-600">Excluir Voucher</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-zinc-500">Deseja realmente excluir este voucher? Esta ação é irreversível.</p>
            <div className="mt-4 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Voucher</p>
              <p className="text-xs font-bold text-zinc-800">{voucherToDelete?.produto}</p>
              <p className="text-[10px] font-mono text-zinc-500 mt-1">{voucherToDelete?.codigo}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1 h-12 rounded-xl" onClick={() => setIsDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" className="flex-1 h-12 rounded-xl" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
