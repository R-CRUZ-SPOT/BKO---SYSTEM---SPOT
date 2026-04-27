'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { format, addMonths, subMonths, isSameDay, parseISO, differenceInMonths, setYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Cake, ChevronLeft, ChevronRight, Mail, Sparkles, PartyPopper, Gift, Search, CalendarDays, Ticket, CheckCircle2, Clock, Smartphone } from 'lucide-react';
import { dataCache } from '@/lib/data-cache';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import Image from 'next/image';

export default function AniversariantesPage() {
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [search, setSearch] = useState('');

  // Voucher Link States
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [selectedColab, setSelectedColab] = useState<any>(null);
  const [availableVouchers, setAvailableVouchers] = useState<any[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Invalida cache antigo para garantir que novos campos (linhas, codigo) sejam carregados
    dataCache.invalidate('aniversariantes_active');
    loadColaboradores();
  }, []);

  async function loadColaboradores() {
    const cached = dataCache.get<any[]>('aniversariantes_active');
    if (cached) {
      setColaboradores(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      let { data, error } = await supabase
        .from('colaboradores')
        .select('*, vouchers(id, produto, status, codigo, data_atribuicao), linhas(numero, ddd)')
        .eq('status', 'ativo')
        .not('data_nascimento', 'is', null);

      if (error) {
        // Fallback se a coluna data_atribuicao não existir
        if (error.message?.includes('data_atribuicao')) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('colaboradores')
            .select('*, vouchers(id, produto, status, codigo), linhas(numero, ddd)')
            .eq('status', 'ativo')
            .not('data_nascimento', 'is', null);
          
          if (fallbackError) throw fallbackError;
          data = fallbackData;
        } 
        // Fallback se a tabela vouchers ainda não existir
        else if (error.message?.includes('vouchers')) {
           const { data: simpleData, error: simpleError } = await supabase
            .from('colaboradores')
            .select('*')
            .eq('status', 'ativo')
            .not('data_nascimento', 'is', null);
           
           if (simpleError) throw simpleError;
           setColaboradores(simpleData || []);
           return;
        } else {
          throw error;
        }
      };
      setColaboradores(data || []);
      dataCache.set('aniversariantes_active', data || []);
    } catch (error) {
      console.error('Erro ao carregar aniversariantes:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableVouchers() {
    setLoadingVouchers(true);
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select('*')
        .eq('status', 'disponível');
      
      if (error) throw error;
      setAvailableVouchers(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar vouchers disponíveis');
    } finally {
      setLoadingVouchers(false);
    }
  }

  const handleOpenVoucherDialog = (colab: any) => {
    setSelectedColab(colab);
    setIsVoucherDialogOpen(true);
    loadAvailableVouchers();
  };

  const handleLinkVoucher = async (voucher: any) => {
    if (!selectedColab || !voucher) return;
    setIsLinking(true);
    const updateData: any = {
      colaborador_id: selectedColab.id,
      matricula: selectedColab.matricula,
      status: 'utilizado',
      updated_at: new Date().toISOString()
    };

    try {
      // Regra de segurança: verifica novamente se o colaborador é elegível
      const { eligible, alreadyReceivedThisYear } = checkEligibility(
        selectedColab.data_admissao, 
        selectedColab.data_nascimento, 
        selectedColab.vouchers
      );

      if (!eligible && !alreadyReceivedThisYear) {
        toast.error('Este colaborador não é elegível para premiação.');
        return;
      }

      if (alreadyReceivedThisYear) {
        toast.error('Este colaborador já recebeu um voucher este ano.');
        return;
      }

      // Tenta atualizar com a data de atribuição
      const { error } = await supabase
        .from('vouchers')
        .update({
          ...updateData,
          data_atribuicao: new Date().toISOString()
        })
        .eq('id', voucher.id);

      if (error) {
        // Se o erro for de coluna inexistente, tenta sem ela
        if (error.message?.includes('data_atribuicao')) {
          const { error: fallbackError } = await supabase
            .from('vouchers')
            .update(updateData)
            .eq('id', voucher.id);
          
          if (fallbackError) throw fallbackError;
        } else {
          throw error;
        }
      }

      toast.success(`Voucher ${voucher.produto} vinculado a ${selectedColab.nome}!`);
      setIsVoucherDialogOpen(false);
      loadColaboradores();
    } catch (error: any) {
      toast.error('Erro ao vincular voucher: ' + error.message);
    } finally {
      setIsLinking(false);
    }
  };

  const changeMonth = (offset: number) => {
    setCurrentDate(prev => offset > 0 ? addMonths(prev, offset) : subMonths(prev, Math.abs(offset)));
  };

  const currentMonth = currentDate.getMonth();
  
  const checkEligibility = (admissionDate: string, birthDate: string, vouchers: any[] = []) => {
    if (!admissionDate || !birthDate) return { eligible: false, months: 0, alreadyReceivedThisYear: false };
    
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Verifica se já recebeu um voucher de aniversário este ano
    const receivedThisYear = (vouchers || []).some(v => {
      const attributionDate = v.data_atribuicao ? parseISO(v.data_atribuicao) : null;
      return attributionDate && attributionDate.getFullYear() === currentYear;
    });

    const admission = parseISO(admissionDate);
    const birth = parseISO(birthDate);
    const bdayThisYear = setYear(birth, currentYear);
    const months = differenceInMonths(bdayThisYear, admission);
    
    return { 
      eligible: months >= 6 && !receivedThisYear, 
      months,
      alreadyReceivedThisYear: receivedThisYear
    };
  };

  const aniversariantesDoMes = useMemo(() => {
    let filtered = colaboradores.filter(c => {
      if (!c.data_nascimento) return false;
      const birthDate = parseISO(c.data_nascimento);
      return birthDate.getMonth() === currentMonth;
    });

    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter(c => c.nome.toLowerCase().includes(lowerSearch));
    }

    return filtered.sort((a, b) => {
      const dayA = parseISO(a.data_nascimento).getDate();
      const dayB = parseISO(b.data_nascimento).getDate();
      return dayA - dayB;
    });
  }, [colaboradores, currentMonth, search]);

  const aniversariantesHoje = useMemo(() => {
    const today = new Date();
    return colaboradores.filter(c => {
      const birthDate = parseISO(c.data_nascimento);
      return birthDate.getDate() === today.getDate() && birthDate.getMonth() === today.getMonth();
    });
  }, [colaboradores]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 -mt-4 lg:-mt-8 -mx-4 lg:-mx-8 px-4 lg:px-8 pb-12 pt-0 relative border-t-0">
      {/* Soft Ethereal Background Splashes - Clipped here */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-emerald-100/40 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-amber-100/30 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-8">
        {/* Editorial Header - Sticky with Backdrop Blur */}
        <div className="sticky top-0 z-40 -mx-4 lg:-mx-8 px-4 lg:px-8 bg-zinc-50/90 backdrop-blur-xl border-b border-zinc-200/80 pb-6 pt-4 lg:pt-8 mb-8 shadow-sm">
          <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 xl:gap-12">
          <div className="space-y-4">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 text-emerald-600 hidden md:flex"
            >
              <div className="p-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                <PartyPopper className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-[0.5em]">BKO SYSTEM • Management</span>
            </motion.div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-emerald-600">
                <div className="p-2 bg-white rounded-lg border border-zinc-200 shadow-sm hidden sm:block">
                  <Cake className="w-5 h-5" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter italic text-zinc-900 leading-none">
                  Aniversariantes
                </h1>
              </div>
              <p className="text-zinc-500 font-medium text-sm sm:text-base max-w-xl">
                Valorizando talentos e construindo futuros.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Redesigned Search */}
            <div className="relative w-full sm:w-80 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
              <Input 
                placeholder="PROCURAR POR NOME..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-12 rounded-xl border-zinc-200 bg-white focus:bg-white focus:ring-2 focus:ring-emerald-500/20 transition-all h-12 uppercase font-black text-[9px] tracking-[0.15em] shadow-sm"
              />
            </div>

            {/* Contemporary Month Navigation */}
            <div className="flex items-center gap-1 bg-zinc-900 text-white p-1.5 rounded-2xl shadow-lg shadow-zinc-200 w-full sm:w-auto justify-between">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => changeMonth(-1)}
                className="rounded-xl hover:bg-white/10 h-9 w-9 text-white"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              
              <div className="px-6 py-1 min-w-[160px] text-center">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] font-mono">
                  {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                </span>
              </div>

              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => changeMonth(1)}
                className="rounded-xl hover:bg-white/10 h-9 w-9 text-white"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </header>
        </div>

        {/* TODAY HIGHLIGHT - Vibrant Light Mode Cards */}
        <AnimatePresence mode="wait">
          {aniversariantesHoje.length > 0 && (
            <section className="space-y-8">
              <div className="flex items-center gap-4">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h2 className="text-xs font-black uppercase tracking-[0.6em] text-zinc-400">Comemorando Agora</h2>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-zinc-200 to-transparent" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {aniversariantesHoje.map((colab, idx) => (
                  <motion.div
                    key={colab.id}
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1, type: "spring", damping: 15 }}
                    className="relative group lg:h-[260px]"
                  >
                    {/* Glowing Accent Shadow */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/10 to-amber-400/10 rounded-[2.5rem] blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                    
                    <div className="relative h-full w-full bg-white border border-zinc-100 rounded-[2.5rem] p-6 lg:p-8 overflow-hidden flex flex-col justify-between shadow-xl shadow-zinc-200/50 transition-all duration-500 group-hover:shadow-emerald-200/40">
                      {/* Eligibility Check */}
                      {(() => {
                            const { eligible, alreadyReceivedThisYear, months } = checkEligibility(colab.data_admissao, colab.data_nascimento, colab.vouchers);
                            
                            if (alreadyReceivedThisYear) {
                               return (
                                 <div className="absolute top-0 left-0 right-0 bg-blue-500 text-white py-1.5 px-10 text-center transform -rotate-1 shadow-lg z-20">
                                   <span className="text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                                      <Ticket className="w-3 h-3" />
                                      Já Premiado este Ano
                                      <Ticket className="w-3 h-3" />
                                   </span>
                                 </div>
                               );
                            }
                            
                            if (!eligible) {
                               return (
                                 <div className="absolute top-0 left-0 right-0 bg-zinc-400 text-white py-1.5 px-10 text-center transform -rotate-1 shadow-lg z-20">
                                   <span className="text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                                      <Clock className="w-3 h-3" />
                                      Em Período de Experiência ({months}m)
                                      <Clock className="w-3 h-3" />
                                   </span>
                                 </div>
                               );
                            }
                            
                            if (colab.vouchers && colab.vouchers.length > 0) {
                               return (
                                 <div className="absolute top-0 left-0 right-0 bg-emerald-600 text-white py-1.5 px-10 text-center transform -rotate-1 shadow-lg z-20">
                                   <span className="text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                                      <Sparkles className="w-3 h-3" />
                                      Voucher de Aniversário Garantido
                                      <Sparkles className="w-3 h-3" />
                                   </span>
                                 </div>
                               );
                            }
                            return null;
                          })()}

                      <div className="relative flex justify-between items-start mt-4">
                        <div className="flex items-center gap-6">
                          <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="w-16 h-16 rounded-[1.5rem] bg-zinc-900 border-2 border-emerald-400 shadow-lg relative overflow-hidden"
                          >
                            <Image
                               src={colab.foto_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(colab.nome || 'X')}&background=18181b&color=34d399&size=128&bold=true&rounded=false`}
                               alt={colab.nome || 'Avatar'}
                               width={64}
                               height={64}
                               className="w-full h-full object-cover"
                               referrerPolicy="no-referrer"
                            />
                            <motion.div 
                              animate={{ scale: [1, 1.2, 1] }} 
                              transition={{ repeat: Infinity, duration: 2 }}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-400 rounded-full border-4 border-white z-10"
                            />
                          </motion.div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">Destaque do Dia</span>
                            <h3 className="text-2xl font-black text-zinc-900 italic tracking-tighter uppercase leading-none group-hover:text-emerald-600 transition-colors truncate max-w-[200px] sm:max-w-none">
                              {colab.nome}
                            </h3>
                            <p className="text-zinc-500 font-bold uppercase tracking-[0.1em] text-[10px]">{colab.cargo || 'Membro do Time'}</p>
                          </div>
                        </div>

                        <div className="text-right z-10">
                          <span className="block text-5xl font-black text-zinc-300 italic group-hover:text-emerald-200 transition-colors leading-none tracking-tighter">
                            {format(new Date(), 'dd')}
                          </span>
                          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">{format(new Date(), 'MMMM', { locale: ptBR })}</span>
                        </div>
                      </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-6 border-t border-zinc-50">
                          <div className="flex items-start flex-col gap-1">
                            <div className="flex items-center gap-3">
                              <div className="flex -space-x-2">
                                {[1, 2, 3].map(i => (
                                  <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-zinc-100 flex items-center justify-center text-[8px] font-bold text-zinc-400">
                                    {String.fromCharCode(64 + i)}
                                  </div>
                                ))}
                              </div>
                              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest italic group-hover:text-emerald-500 transition-colors">BKO SYSTEM Management</span>
                            </div>
                            {colab.vouchers && colab.vouchers.length > 0 ? (
                              <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-200 mt-2 shadow-sm animate-pulse">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Presente Entregue</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-zinc-400 bg-zinc-50 px-3 py-1 rounded-full border border-zinc-100 mt-2">
                                <Clock className="w-3 h-3" />
                                <span className="text-[8px] font-bold uppercase tracking-widest italic">Aguardando Premiação</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                             {(() => {
                               const { eligible, alreadyReceivedThisYear } = checkEligibility(colab.data_admissao, colab.data_nascimento, colab.vouchers);
                               const hasVoucher = colab.vouchers?.length > 0;
                               
                               return (
                                 <Button 
                                   variant={hasVoucher || alreadyReceivedThisYear ? "secondary" : "outline"}
                                   disabled={!eligible && !hasVoucher}
                                   className={`rounded-xl h-10 px-4 border-zinc-200 font-bold uppercase text-[9px] tracking-widest transition-all ${(hasVoucher || alreadyReceivedThisYear) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'hover:bg-zinc-50 text-zinc-600'}`}
                                   onClick={() => handleOpenVoucherDialog(colab)}
                                 >
                                   <Gift className={`w-3 h-3 mr-1.5 ${(hasVoucher || alreadyReceivedThisYear) ? 'text-emerald-600' : eligible ? 'text-emerald-500' : 'text-zinc-300'}`} />
                                   {alreadyReceivedThisYear ? 'Já Premiado' : hasVoucher ? 'Ver Voucher' : eligible ? 'Voucher' : 'Inelegível'}
                                 </Button>
                               );
                             })()}

                             {(() => {
                               const { alreadyReceivedThisYear } = checkEligibility(colab.data_admissao, colab.data_nascimento, colab.vouchers);
                               
                               // Encontra o voucher deste ano
                               const currentYear = new Date().getFullYear();
                               const voucherThisYear = colab.vouchers?.find((v: any) => {
                                 const attrDate = v.data_atribuicao ? parseISO(v.data_atribuicao) : null;
                                 return attrDate && attrDate.getFullYear() === currentYear;
                               });

                               // Pega o número de telefone (primeira linha vinculada)
                               const phone = colab.linhas?.[0] ? `${colab.linhas[0].ddd}${colab.linhas[0].numero}`.replace(/\D/g, '') : null;

                               // Se tem telefone, prioriza WhatsApp mesmo como fallback de Parabéns
                               if (phone) {
                                 const message = voucherThisYear 
                                   ? `Olá ${colab.nome.split(' ')[0]}! Feliz aniversário! \u{1F382} Aqui está seu presente do BKO SYSTEM: seu voucher ${voucherThisYear.produto} código: ${voucherThisYear.codigo || 'N/A'}. Aproveite seu dia!`
                                   : `Olá ${colab.nome.split(' ')[0]}! Feliz aniversário! \u{1F382} Aproveite muito o seu dia!`;
                                 
                                 const encodedMessage = encodeURIComponent(message);
                                 
                                 return (
                                   <Button 
                                     key={`wa-btn-highlight-${colab.id}`}
                                     className="bg-emerald-500 text-white rounded-xl h-10 px-4 font-black uppercase text-[9px] tracking-widest hover:bg-emerald-600 transition-all shadow-md"
                                     asChild
                                   >
                                     <a 
                                       href={`https://wa.me/55${phone}?text=${encodedMessage}`}
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       onClick={(e) => e.stopPropagation()}
                                     >
                                       <Smartphone className="w-3.5 h-3.5 mr-1.5" />
                                       Enviar Parabéns
                                     </a>
                                   </Button>
                                 );
                               }

                               // Caso contrário, não exibe botão de contato
                               return null;
                             })()}
                          </div>
                        </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}
        </AnimatePresence>

        {/* MONTH GRID - Clean Grid Mosaic */}
        <section className="space-y-10">
          <div className="flex items-center gap-4">
            <Gift className="w-5 h-5 text-zinc-300" />
            <h2 className="text-xs font-black uppercase tracking-[0.6em] text-zinc-400">Próximos Celebrantes</h2>
            <div className="h-[1px] flex-1 bg-gradient-to-r from-zinc-200 to-transparent" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-48 rounded-[2rem] bg-white animate-pulse border border-zinc-100 shadow-sm" />
              ))
            ) : aniversariantesDoMes.length === 0 ? (
              <div className="col-span-full py-24 text-center space-y-6">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-inner border border-zinc-50">
                  <CalendarDays className="w-8 h-8 text-zinc-200" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-zinc-400 font-black uppercase tracking-[0.3em] text-[10px]">Registro Silencioso</h3>
                  <p className="text-zinc-300 text-[10px] max-w-xs mx-auto font-medium">Nenhum evento festivo mapeado para este período.</p>
                </div>
              </div>
            ) : (
              aniversariantesDoMes.map((colab, idx) => {
                const bDay = parseISO(colab.data_nascimento);
                const isToday = isSameDay(bDay, new Date());
                
                return (
                  <motion.div
                    key={colab.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    whileHover={{ scale: 1.02 }}
                    className="relative"
                  >
                    {(() => {
                      const { eligible, months, alreadyReceivedThisYear } = checkEligibility(colab.data_admissao, colab.data_nascimento, colab.vouchers);
                      const hasVoucher = colab.vouchers?.length > 0;
                      
                      return (
                        <Card className={`group relative h-44 border-none rounded-[1.5rem] overflow-hidden transition-all duration-700 shadow-sm hover:shadow-xl ${isToday ? 'bg-zinc-900 shadow-xl shadow-emerald-500/10' : 'bg-white hover:shadow-zinc-200'}`}>
                          {/* Status indicator bar */}
                          <div className={`absolute top-0 left-0 w-1 h-full ${hasVoucher || alreadyReceivedThisYear ? 'bg-emerald-500' : !eligible ? 'bg-zinc-300' : isToday ? 'bg-amber-500' : 'bg-zinc-100 group-hover:bg-emerald-200'}`} />

                          <div className="p-6 h-full flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                              <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center font-black text-[10px] transition-all transform group-hover:rotate-6 shadow-sm overflow-hidden border-2 ${isToday ? 'border-emerald-500/30' : 'border-zinc-100'}`}>
                                <Image
                                  src={colab.foto_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(colab.nome || 'X')}&background=${isToday ? '18181b' : 'f4f4f5'}&color=${isToday ? 'ffffff' : '18181b'}&size=128&bold=true&rounded=false`}
                                  alt={colab.nome || 'Avatar'}
                                  width={40}
                                  height={40}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="flex flex-col items-end">
                                <span className={`text-3xl font-black italic transition-colors leading-none tracking-tighter ${isToday ? 'text-zinc-800' : 'text-zinc-300 group-hover:text-emerald-200'}`}>
                                  {bDay.getDate()}
                                </span>
                                <span className={`text-[8px] font-black uppercase tracking-widest ${isToday ? 'text-zinc-600' : 'text-zinc-400'}`}>
                                  {format(bDay, 'EEE', { locale: ptBR })}
                                </span>
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className={`text-sm font-black uppercase tracking-tight truncate leading-tight italic ${isToday ? 'text-white' : 'text-zinc-900 transition-colors group-hover:text-emerald-600'}`}>
                                  {colab.nome}
                                </h4>
                                {!eligible && !alreadyReceivedThisYear && (
                                  <span className="text-[6px] font-black bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-200 uppercase tracking-tighter">Experiência</span>
                                )}
                                {alreadyReceivedThisYear && (
                                  <span className="text-[6px] font-black bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded border border-blue-200 uppercase tracking-tighter">Já Premiado</span>
                                )}
                              </div>
                              <p className={`text-[7px] font-bold uppercase tracking-[0.1em] mt-1 ${isToday ? 'text-zinc-500' : 'text-zinc-400 group-hover:text-zinc-500'}`}>
                                 {colab.cargo || colab.job || 'Colaborador'}
                              </p>
                            </div>

                            <div className={`mt-3 pt-3 border-t flex items-center justify-between transition-colors ${isToday ? 'border-zinc-800' : 'border-zinc-50 group-hover:border-emerald-50'}`}>
                              <div className="flex items-center gap-2">
                                 {hasVoucher || alreadyReceivedThisYear ? (
                                   <div className="flex items-center gap-1">
                                     <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                     <span className="text-[7px] font-black uppercase tracking-widest text-emerald-600">Premiado</span>
                                   </div>
                                 ) : !eligible ? (
                                   <div className="flex items-center gap-1">
                                     <div className="w-1 h-1 rounded-full bg-zinc-300" />
                                     <span className="text-[7px] font-black uppercase tracking-widest text-zinc-400">Inelegível</span>
                                   </div>
                                 ) : (
                                   <div className="flex items-center gap-1">
                                     <div className={`w-1 h-1 rounded-full ${isToday ? 'bg-amber-500 animate-ping' : 'bg-zinc-200 group-hover:bg-zinc-300'}`} />
                                     <span className="text-[7px] font-black uppercase tracking-widest text-zinc-400">Pendente</span>
                                   </div>
                                 )}
                              </div>

                              <div className="flex items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  disabled={!eligible && !hasVoucher}
                                  className={`h-7 w-7 rounded-xl transition-all ${hasVoucher || alreadyReceivedThisYear ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : !eligible ? 'text-zinc-200' : isToday ? 'hover:bg-white/10 text-emerald-400' : 'hover:bg-emerald-50 text-zinc-300 hover:text-emerald-500'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenVoucherDialog(colab);
                                  }}
                                >
                                  {hasVoucher || alreadyReceivedThisYear ? <Ticket className="w-3 h-3" /> : <Gift className={`w-3 h-3 ${!eligible ? 'opacity-20' : ''}`} />}
                                </Button>

                                {(() => {
                                  const { alreadyReceivedThisYear } = checkEligibility(colab.data_admissao, colab.data_nascimento, colab.vouchers);
                                  const phone = colab.linhas?.[0] ? `${colab.linhas[0].ddd}${colab.linhas[0].numero}`.replace(/\D/g, '') : null;
                                  
                                  if (phone) {
                                    const currentYear = new Date().getFullYear();
                                    const voucherThisYear = colab.vouchers?.find((v: any) => {
                                      const attrDate = v.data_atribuicao ? parseISO(v.data_atribuicao) : null;
                                      return attrDate && attrDate.getFullYear() === currentYear;
                                    });

                                    const message = voucherThisYear 
                                      ? `Olá ${colab.nome.split(' ')[0]}! Feliz aniversário! \u{1F382} Aqui está seu presente do BKO SYSTEM: seu voucher ${voucherThisYear.produto} código: ${voucherThisYear.codigo || 'N/A'}. Aproveite seu dia!`
                                      : `Olá ${colab.nome.split(' ')[0]}! Feliz aniversário! \u{1F382} Aproveite muito o seu dia!`;
                                    
                                    const encodedMessage = encodeURIComponent(message);
                                    
                                    return (
                                      <Button 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-7 w-7 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
                                        asChild
                                      >
                                        <a 
                                          href={`https://wa.me/55${phone}?text=${encodedMessage}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Smartphone className="w-3 h-3" />
                                        </a>
                                      </Button>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })()}
                    
                    {(colab.vouchers && colab.vouchers.length > 0) || (checkEligibility(colab.data_admissao, colab.data_nascimento, colab.vouchers).alreadyReceivedThisYear) ? (
                      <div className="absolute -top-1.5 -right-1.5 z-20 transform scale-90">
                         <div className="flex items-center justify-center w-8 h-8 bg-emerald-500 text-white rounded-full shadow-lg border-2 border-white">
                           <CheckCircle2 className="w-4 h-4" />
                         </div>
                      </div>
                    ) : null}
                  </motion.div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Floating Cultural Marks */}
      <div className="absolute top-[20%] right-[-5%] opacity-[0.03] rotate-12 pointer-events-none select-none">
        <Cake className="w-[400px] h-[400px] text-zinc-900" />
      </div>

      {/* Signature Boutique Footer */}
      <footer className="relative z-10 pt-32 pb-16 flex flex-col items-center gap-10">
        <div className="flex items-center gap-8 w-full max-w-5xl px-8">
          <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
          <motion.div 
            whileHover={{ rotate: 180 }}
            transition={{ duration: 1 }}
            className="p-5 bg-white border border-zinc-100 rounded-[2rem] shadow-xl shadow-zinc-200/50 cursor-crosshair"
          >
            <Sparkles className="w-7 h-7 text-emerald-500" />
          </motion.div>
          <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-zinc-200 to-transparent" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-[12px] font-black uppercase tracking-[1em] text-zinc-300 italic">
            BKO SYSTEM <span className="text-zinc-900 opacity-20">BACKOFFICE EXPERIENCE</span>
          </p>
          <p className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">© 2026 Crafted with Intent</p>
        </div>
      </footer>

      {/* Voucher Selection Dialog */}
      <Dialog open={isVoucherDialogOpen} onOpenChange={setIsVoucherDialogOpen}>
        <DialogContent className="max-w-md rounded-[2rem] border-none shadow-2xl">
          <DialogHeader className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Gift className="w-6 h-6" />
            </div>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic text-zinc-900 leading-none">
              Premiação de Aniversário
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-sm">
              {(() => {
                const { alreadyReceivedThisYear } = checkEligibility(selectedColab?.data_admissao, selectedColab?.data_nascimento, selectedColab?.vouchers);
                if (alreadyReceivedThisYear) {
                  return <span className="text-blue-600 font-black uppercase tracking-widest">Este colaborador já foi premiado em {new Date().getFullYear()}.</span>;
                }
                return <>Selecione um voucher disponível para presentear <strong>{selectedColab?.nome}</strong>.</>;
              })()}
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 min-h-[300px]">
            {(() => {
              const { alreadyReceivedThisYear } = checkEligibility(selectedColab?.data_admissao, selectedColab?.data_nascimento, selectedColab?.vouchers);
              
              if (alreadyReceivedThisYear) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
                      <Ticket className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black uppercase text-zinc-900">Limite Anual Atingido</h4>
                      <p className="text-[10px] font-medium text-zinc-500 max-w-[250px] mx-auto">
                        De acordo com as políticas do BKO SYSTEM, cada colaborador tem direito a um voucher por ano civil.
                      </p>
                    </div>
                  </div>
                );
              }

              if (loadingVouchers) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Buscando Presentes...</span>
                  </div>
                );
              }
              
              if (availableVouchers.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                    <Ticket className="w-12 h-12 text-zinc-100" />
                    <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest max-w-[200px]">
                      Nenhum voucher disponível no estoque no momento.
                    </p>
                    <Button variant="outline" className="rounded-xl h-10 px-6 border-zinc-200 text-[10px] font-black uppercase tracking-widest" onClick={() => router.push('/vouchers')}>
                      Abastecer Estoque
                    </Button>
                  </div>
                );
              }

              return (
                <div className="space-y-3 max-h-[400px] overflow-y-auto px-1 custom-scrollbar">
                  {availableVouchers.map((voucher) => (
                    <motion.div
                      key={voucher.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="p-4 bg-zinc-50 hover:bg-emerald-50 border border-zinc-100 hover:border-emerald-200 rounded-2xl cursor-pointer transition-all group"
                      onClick={() => handleLinkVoucher(voucher)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{voucher.produto}</span>
                          <p className="text-lg font-black text-zinc-900 tracking-tight leading-none italic">{voucher.valor}</p>
                          {voucher.validade && (
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.1em]">Expira em: {format(parseISO(voucher.validade), 'dd/MM/yyyy')}</p>
                          )}
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white border border-zinc-200 flex items-center justify-center group-hover:bg-emerald-500 group-hover:border-emerald-500 transition-all">
                          <Ticket className="w-5 h-5 text-zinc-300 group-hover:text-white" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="ghost" className="rounded-xl h-12 px-8 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:text-zinc-600" onClick={() => setIsVoucherDialogOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
