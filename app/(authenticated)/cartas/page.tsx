'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { FileUp, Printer, FileText, Search, User, ChevronDown, Check, PackageCheck, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { BulkColaboradorPicker, type BulkColaboradorItem } from '@/components/ui/bulk-colaborador-picker';
import { parseRoteiroFile, matchColaboradorRows, buildSupervisorUfIndex, type RoteiroEntry } from '@/lib/roteiro-parser';
import { generatePdfZip, slugify } from '@/lib/pdf-batch';

interface Colaborador {
  id: string;
  matricula: string;
  nome: string;
  cpf: string;
  rg: string;
  ctps: string;
  serie_ctps: string;
}

interface Loja {
  id: string;
  rede: string;
  nomFantasia: string;
  logradouro: string;
}

function dedupeLojas(rows: RoteiroEntry[]): Loja[] {
  const uniqueLojas = new Map<string, Loja>();
  rows.forEach(r => {
    const rede = r.rede || '';
    const fantasia = r.nom_fantasia || '';
    const end = r.end_logradouro || '';
    const key = `${rede}-${fantasia}-${end}`;

    if (key.trim() !== '--' && !uniqueLojas.has(key)) {
      uniqueLojas.set(key, {
        id: key,
        rede: rede,
        nomFantasia: fantasia,
        logradouro: end
      });
    }
  });
  return Array.from(uniqueLojas.values());
}

function CartaLetter({
  loja,
  colaborador,
  formattedDate,
  pageBreak,
  animated = true,
}: {
  loja: Loja;
  colaborador: Colaborador | undefined;
  formattedDate: string;
  pageBreak: boolean;
  animated?: boolean;
}) {
  return (
    <motion.div
      initial={animated ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-white w-[210mm] min-h-[297mm] shadow-xl p-[40px] md:p-[80px] print:w-full print:shadow-none print:p-[15mm] print:m-0 font-sans text-black relative",
        pageBreak && "page-break"
      )}
    >

      {/* Header: Date and Logo */}
      <div className="flex justify-between items-start mb-16">
        <div className="pt-8">
          <p className="text-[14px]">São Paulo, {formattedDate}</p>
        </div>

        {/* SPOT Logo */}
        <img src="/logo-spot.png" alt="SPOT" className="h-16 w-auto" />
      </div>

      {/* Addressee */}
      <div className="mb-8 font-bold text-[14px] space-y-1">
        <p>{loja.nomFantasia || '«NOME_LOJA»'}</p>
        <p>{loja.logradouro || '«ENDERECO»'}</p>
      </div>

      {/* Body Text */}
      <p className="text-[14px] leading-[1.6] text-justify mb-5">
        Apresentamos <strong>{colaborador?.nome || '«PROMOTOR»'}</strong>, portador do <strong>RG: {colaborador?.rg || '«RG»'}</strong> e do <strong>CPF: {colaborador?.cpf || '«CPF»'}</strong> irá realizar atividades ligadas à de produtos da empresa <strong>EPSON DO BRASIL IND E COM LTDA</strong> no setor de informática de sua loja, no período indeterminado em dias alternados entre 09:00 as 18:00 hs. Informamos que ele não possui vínculo empregatício com vosso estabelecimento, cabendo a nós a responsabilidade por qualquer custo empregatício ou securitário. Abaixo para o seu conhecimento, a sua atividade:
      </p>

      <div className="pl-8 mb-5 text-[14px]">
        <p>1. Atendimento ao cliente</p>
      </div>

      <p className="text-[14px] leading-[1.6] text-justify mb-10">
        Serão de nossa inteira responsabilidade todos os atos praticados por ele em seu estabelecimento bem como ressarcimento de eventuais prejuízos por ele ocasionados. Esclarecendo que o promotor já foi orientado no sentido de observar e cumprir todas as normas internas da loja. Solicitamos que qualquer problema com o funcionário, seja comunicado a Sra. MARIA CINELANDIA NEVES, pelo telefone 11 99153-7144 RAMAL 3174, para sejam tomadas as devidas providências. Outro assim cumpre-nos estabelecer que toda a responsabilidade civil e código do consumidor ficarão o nosso encargo.
      </p>

      <p className="text-[14px] mb-8">Atenciosamente,</p>

      {/* Signatures and Stamp */}
      <div className="flex justify-between mt-32 relative">

        {/* Left block (Stamp + Signature) */}
        <div className="w-[300px] relative">
           {/* Fake Signature inside the stamp area */}
           <div className="absolute bottom-[30px] left-10 opacity-40 w-32 h-20 text-[#606fa6] pointer-events-none z-0">
             <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
               <path d="M 20,80 Q 40,0 60,60 T 90,20 M 35,50 L 50,50 M 45,90 C 20,40 80,10 90,80" />
             </svg>
          </div>

          {/* Outlined Stamp Box */}
          <div className="absolute bottom-[30px] border border-zinc-400 p-2 text-center transform -rotate-2 w-[240px] z-10 bg-white/50 opacity-70 flex flex-col justify-center items-center h-[100px] left-1/2 -translate-x-1/2">
            {/* Stamp Corners manually drawn */}
            <div className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t border-l border-zinc-600 bg-transparent"></div>
            <div className="absolute -top-[1px] -right-[1px] w-4 h-4 border-t border-r border-zinc-600 bg-transparent"></div>
            <div className="absolute -bottom-[1px] -left-[1px] w-4 h-4 border-b border-l border-zinc-600 bg-transparent"></div>
            <div className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b border-r border-zinc-600 bg-transparent"></div>

            <p className="text-[13px] font-black tracking-tighter text-zinc-600 m-0 leading-none">01.402.786/0001-08</p>
            <p className="text-[9px] font-bold text-zinc-500 mt-1 uppercase leading-tight tracking-tight">SPOT PROMOÇÕES EVENTOS E</p>
            <p className="text-[8px] font-bold text-zinc-500 uppercase leading-tight tracking-tight mb-1">MERCHANDISING LTDA.</p>

            <p className="text-[7.5px] font-medium text-zinc-500 leading-tight">R. Joaquim Floriano, 100 - 6º Andar</p>
            <p className="text-[7.5px] font-medium text-zinc-500 leading-tight mb-2">Itaim Bibi - CEP 04534-000</p>

            <div className="border-t border-zinc-400 w-16 pt-0.5 mt-0.5"></div>
            <p className="text-[8px] font-bold text-zinc-500">SÃO PAULO - SP</p>
          </div>

          <div className="w-full border-t border-black pt-2 text-center relative z-10 flex flex-col h-[50px]">
            <p className="text-[10px] font-bold text-black uppercase mt-1">SPOT PROMOÇÕES EVENTOS E MERCHANDISING</p>
          </div>
        </div>

        {/* Right block (Ciente Promotor) */}
        <div className="w-[250px] relative">
          <div className="w-full border-t border-black pt-2 text-center flex flex-col h-[50px] justify-between">
            <p className="text-[12px] text-center">CIENTE</p>
            <p className="text-[12px] font-bold text-center uppercase">{colaborador?.nome || 'PROMOTOR'}</p>
          </div>
        </div>
      </div>

    </motion.div>
  );
}

export default function CartasPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [roteiro, setRoteiro] = useState<RoteiroEntry[]>([]);
  const [selectedColaboradorId, setSelectedColaboradorId] = useState<string>('');
  const [selectedLojaIds, setSelectedLojaIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileName, setFileName] = useState('');

  const [lojasVinculadas, setLojasVinculadas] = useState<Loja[]>([]);
  const [lojasExtras, setLojasExtras] = useState<Loja[]>([]);
  const [lojaSearchTerm, setLojaSearchTerm] = useState('');
  const [cartaGerada, setCartaGerada] = useState(false);

  const [modo, setModo] = useState<'individual' | 'massa'>('individual');
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [isGeneratingZip, setIsGeneratingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState({ done: 0, total: 0 });
  const [batchColaborador, setBatchColaborador] = useState<Colaborador | null>(null);
  const [batchLojas, setBatchLojas] = useState<Loja[]>([]);
  const batchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchColaboradores();
  }, []);

  const fetchColaboradores = async () => {
    try {
      const { data, error } = await supabase
        .from('colaboradores')
        .select('id, matricula, nome, cpf, rg, ctps, serie_ctps')
        .eq('status', 'ativo')
        .order('nome');

      if (error) throw error;
      setColaboradores(data || []);
    } catch (err) {
      console.error('Erro ao buscar colaboradores:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setCartaGerada(false);
    setSelectedColaboradorId('');
    setSelectedLojaIds([]);
    setBulkSelectedIds(new Set());
    setLojasExtras([]);
    setLojaSearchTerm('');

    try {
      const entries = await parseRoteiroFile(file);
      setRoteiro(entries);
    } catch (err) {
      console.error("Erro ao ler o arquivo:", err);
      alert("Erro ao ler o arquivo. Verifique se o formato está correto.");
    }
  };

  useEffect(() => {
    if (selectedColaboradorId && roteiro.length > 0) {
      const c = colaboradores.find(c => c.id === selectedColaboradorId);
      if (!c) {
        setLojasVinculadas([]);
        return;
      }

      setLojasVinculadas(dedupeLojas(matchColaboradorRows(roteiro, c.nome)));
      setSelectedLojaIds([]);
      setLojasExtras([]);
      setLojaSearchTerm('');
      setCartaGerada(false);
    } else {
      setLojasVinculadas([]);
      setSelectedLojaIds([]);
      setLojasExtras([]);
      setLojaSearchTerm('');
      setCartaGerada(false);
    }
  }, [selectedColaboradorId, roteiro, colaboradores]);

  const allLojas = useMemo(() => dedupeLojas(roteiro), [roteiro]);
  const lojasDisponiveis = useMemo(() => [...lojasVinculadas, ...lojasExtras], [lojasVinculadas, lojasExtras]);

  const lojaSearchResults = useMemo(() => {
    const term = lojaSearchTerm.trim().toLowerCase();
    if (!term) return [];
    const jaDisponiveis = new Set(lojasDisponiveis.map(l => l.id));
    return allLojas
      .filter(l => !jaDisponiveis.has(l.id) && (l.nomFantasia.toLowerCase().includes(term) || l.rede.toLowerCase().includes(term)))
      .slice(0, 8);
  }, [lojaSearchTerm, allLojas, lojasDisponiveis]);

  const handleAddExtraLoja = (loja: Loja) => {
    setLojasExtras(prev => [...prev, loja]);
    setSelectedLojaIds(prev => [...prev, loja.id]);
    setLojaSearchTerm('');
  };

  const handleRemoveExtraLoja = (lojaId: string) => {
    setLojasExtras(prev => prev.filter(l => l.id !== lojaId));
    setSelectedLojaIds(prev => prev.filter(id => id !== lojaId));
  };

  const handleGerarCarta = () => {
    if (!selectedColaboradorId || selectedLojaIds.length === 0) {
      alert("Por favor selecione um colaborador e ao menos uma loja.");
      return;
    }
    setCartaGerada(true);
  };

  const selectedColab = colaboradores.find(c => c.id === selectedColaboradorId);
  const selectedLojas = lojasDisponiveis.filter(l => selectedLojaIds.includes(l.id));

  const getFormatDate = () => {
    const months = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const d = new Date();
    return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  };

  const handlePrint = () => {
    try {
      // Trying to access window.top might throw an error in some cross-origin iframes.
      const isIframe = window !== window.parent;
      if (isIframe) {
        alert("Atenção: A impressão ou geração de PDF pode ser bloqueada na janela de pré-visualização.\n\nSe a página de impressão não abrir, por favor, clique no botão 'Abrir em nova aba' (canto superior direito da tela) e tente novamente, ou pressione Ctrl+P / Cmd+P.");
      }
      setTimeout(() => {
        window.print();
      }, 100);
    } catch (e) {
      console.error(e);
      // Fallback
      window.print();
    }
  };

  const supervisorUfIndex = useMemo(() => buildSupervisorUfIndex(roteiro), [roteiro]);

  const colaboradoresBulkItems: BulkColaboradorItem[] = useMemo(() => {
    return colaboradores.map(c => {
      const info = supervisorUfIndex.get(c.nome.toLowerCase().trim());
      return { id: c.id, nome: c.nome, supervisor: info?.supervisor, uf: info?.uf };
    });
  }, [colaboradores, supervisorUfIndex]);

  const handleGerarZip = async () => {
    const selected = colaboradores.filter(c => bulkSelectedIds.has(c.id));
    if (selected.length === 0) {
      toast.error('Selecione ao menos um colaborador.');
      return;
    }

    const withLojas = selected
      .map(c => ({ colaborador: c, lojas: dedupeLojas(matchColaboradorRows(roteiro, c.nome)) }))
      .filter(x => x.lojas.length > 0);

    const skipped = selected.length - withLojas.length;
    if (withLojas.length === 0) {
      toast.error('Nenhum colaborador selecionado possui loja correspondente no roteiro.');
      return;
    }

    setIsGeneratingZip(true);
    setZipProgress({ done: 0, total: withLojas.length });
    try {
      const dateStamp = format(new Date(), 'yyyyMMdd');
      const usedSlugs = new Map<string, number>();

      await generatePdfZip({
        items: withLojas,
        renderContainerRef: batchContainerRef,
        renderItem: (item) => {
          setBatchColaborador(item.colaborador);
          setBatchLojas(item.lojas);
        },
        waitForRender: () => new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60)));
        }),
        getFilename: (item) => {
          const base = slugify(item.colaborador.nome) || 'colaborador';
          const count = usedSlugs.get(base) || 0;
          usedSlugs.set(base, count + 1);
          const suffix = count > 0 ? `-${item.colaborador.matricula || count}` : '';
          return `${base}${suffix}_carta-apresentacao_${dateStamp}.pdf`;
        },
        zipFilename: `cartas-apresentacao_${dateStamp}.zip`,
        onProgress: (done, total) => setZipProgress({ done, total }),
      });

      if (skipped > 0) {
        toast.warning(`${skipped} colaborador(es) ignorado(s) por não ter loja correspondente no roteiro.`);
      }
      toast.success(`${withLojas.length} carta(s) gerada(s) com sucesso.`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar as cartas em massa.');
    } finally {
      setIsGeneratingZip(false);
      setBatchColaborador(null);
      setBatchLojas([]);
    }
  };

  return (
    <div className="flex flex-col h-full print:bg-white">
      {/* Header Area */}
      <div className="mb-8 print:hidden">
        <h1 className="text-2xl font-black uppercase tracking-tight text-zinc-900 mb-2">Cartas de Apresentação</h1>
        <p className="text-sm text-zinc-500 font-medium max-w-2xl">
          Gere cartas de apresentação para os promotores, individualmente ou em massa. Faça o upload do roteiro e selecione a loja desejada.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 print:block">

        {/* Controls - Left Side */}
        <div className="col-span-1 lg:col-span-4 space-y-6 print:hidden">
          {/* File Upload Box */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
              <FileUp className="w-4 h-4" /> 1. Upload Roteiro
            </h2>
            <div className="relative">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="border-2 border-dashed border-zinc-200 rounded-xl p-8 text-center bg-zinc-50 hover:bg-zinc-100 transition-colors">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mx-auto mb-3">
                  <FileText className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-zinc-700 mb-1">
                  {fileName ? 'Arquivo selecionado' : 'Clique ou arraste a planilha aqui'}
                </p>
                <p className="text-xs text-zinc-500">
                  {fileName ? fileName : 'Formatos: Excel ou CSV'}
                </p>
              </div>
            </div>
            {roteiro.length > 0 && (
              <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
                <Check className="w-4 h-4" /> Planilha processada ({roteiro.length} linhas)
              </div>
            )}
          </div>

          {/* Mode toggle */}
          <div className={`grid grid-cols-2 gap-1 p-1 bg-zinc-100 rounded-xl transition-opacity duration-300 ${roteiro.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <button
              type="button"
              onClick={() => setModo('individual')}
              className={cn(
                "h-9 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors",
                modo === 'individual' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => setModo('massa')}
              className={cn(
                "h-9 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors",
                modo === 'massa' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              Em Massa
            </button>
          </div>

          {/* Selection Box */}
          <div className={`bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm transition-opacity duration-300 ${roteiro.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
              <User className="w-4 h-4" /> 2. Seleção de Dados
            </h2>

            {modo === 'individual' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase tracking-tighter mb-2">
                    Colaborador (Promotor)
                  </label>
                  <div className="relative">
                    <select
                      value={selectedColaboradorId}
                      onChange={(e) => setSelectedColaboradorId(e.target.value)}
                      className="w-full h-11 pl-4 pr-10 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none"
                      disabled={loading}
                    >
                      <option value="">Selecione na lista...</option>
                      {colaboradores.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase tracking-tighter mb-2 flex justify-between items-center">
                    <span>Lojas (Roteiro)</span>
                    {lojasDisponiveis.length > 0 && (
                      <span className="text-[10px] text-emerald-600 font-bold px-2 py-0.5 bg-emerald-50 rounded-full">
                        {lojasDisponiveis.length} encontradas
                      </span>
                    )}
                  </label>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar border border-zinc-200 rounded-xl p-3 bg-zinc-50">
                    {!selectedColaboradorId ? (
                      <p className="text-xs text-zinc-400 italic">Selecione um promotor primeiro...</p>
                    ) : lojasDisponiveis.length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">Nenhuma loja encontrada</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 pb-2 mb-2 border-b border-zinc-200">
                          <input
                            type="checkbox"
                            id="select-all-lojas"
                            checked={selectedLojaIds.length === lojasDisponiveis.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLojaIds(lojasDisponiveis.map(l => l.id));
                              } else {
                                setSelectedLojaIds([]);
                              }
                            }}
                            className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <label htmlFor="select-all-lojas" className="text-xs font-bold text-zinc-600 uppercase cursor-pointer">
                            Selecionar Todas
                          </label>
                        </div>
                        {lojasDisponiveis.map(l => {
                          const isExtra = lojasExtras.some(e => e.id === l.id);
                          return (
                            <div key={l.id} className="flex items-center gap-2 hover:bg-zinc-100 p-1 rounded transition-colors">
                              <input
                                type="checkbox"
                                id={`loja-${l.id}`}
                                checked={selectedLojaIds.includes(l.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedLojaIds([...selectedLojaIds, l.id]);
                                  } else {
                                    setSelectedLojaIds(selectedLojaIds.filter(id => id !== l.id));
                                  }
                                }}
                                className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                              />
                              <label htmlFor={`loja-${l.id}`} className="text-sm font-medium text-zinc-700 cursor-pointer flex-1 line-clamp-1">
                                {l.rede} - {l.nomFantasia}
                              </label>
                              {isExtra && (
                                <>
                                  <span className="text-[9px] text-amber-600 font-bold uppercase bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                                    Fora da base
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveExtraLoja(l.id)}
                                    className="text-zinc-400 hover:text-rose-500 shrink-0"
                                    title="Remover loja"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>

                  {selectedColaboradorId && lojasVinculadas.length === 0 && lojasExtras.length === 0 && (
                    <p className="text-[10px] text-rose-500 mt-2 font-medium">
                      As colunas NOME ou NOM_PESSOA_COMPLETO para os registros deste promotor podem não ser equivalentes ao seu nome no sistema ou ele não possui roteiro na planilha enviada.
                    </p>
                  )}

                  {selectedColaboradorId && (
                    <div className="mt-3 relative">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-tighter mb-1.5">
                        Adicionar loja de outro promotor (exceção)
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                        <input
                          type="text"
                          value={lojaSearchTerm}
                          onChange={(e) => setLojaSearchTerm(e.target.value)}
                          placeholder="Buscar por rede ou nome da loja..."
                          className="w-full h-9 pl-8 pr-3 bg-white border border-zinc-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      </div>
                      {lojaSearchTerm.trim() && (
                        <div className="mt-1 border border-zinc-200 rounded-lg bg-white shadow-sm max-h-[180px] overflow-y-auto custom-scrollbar">
                          {lojaSearchResults.length === 0 ? (
                            <p className="text-xs text-zinc-400 italic text-center py-4">Nenhuma loja encontrada na planilha.</p>
                          ) : (
                            lojaSearchResults.map(l => (
                              <button
                                type="button"
                                key={l.id}
                                onClick={() => handleAddExtraLoja(l)}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-emerald-50 transition-colors border-b border-zinc-100 last:border-b-0"
                              >
                                <span className="text-xs font-medium text-zinc-700 line-clamp-1">{l.rede} - {l.nomFantasia}</span>
                                <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-zinc-100">
                  <Button
                    onClick={handleGerarCarta}
                    disabled={!selectedColaboradorId || selectedLojaIds.length === 0}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-11 rounded-xl uppercase tracking-wider text-xs"
                  >
                    Gerar {selectedLojaIds.length > 1 ? `${selectedLojaIds.length} Cartas` : 'Carta'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <BulkColaboradorPicker
                  items={colaboradoresBulkItems}
                  selectedIds={bulkSelectedIds}
                  onChange={setBulkSelectedIds}
                  emptyMessage="Nenhum colaborador ativo cadastrado."
                />
                <p className="text-[11px] text-zinc-400">
                  Todas as lojas encontradas no roteiro para cada colaborador selecionado entrarão na carta dele.
                </p>
                <div className="pt-4 border-t border-zinc-100">
                  <Button
                    onClick={handleGerarZip}
                    disabled={bulkSelectedIds.size === 0 || isGeneratingZip}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-11 rounded-xl uppercase tracking-wider text-xs gap-2"
                  >
                    <PackageCheck className="w-4 h-4" />
                    {isGeneratingZip
                      ? `Gerando ${zipProgress.done}/${zipProgress.total}...`
                      : `Gerar ZIP (${bulkSelectedIds.size} carta${bulkSelectedIds.size !== 1 ? 's' : ''})`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview / Print Area - Right Side */}
        <div className="col-span-1 lg:col-span-8 print:w-full print:block">
          <div className={`bg-white border border-zinc-200 shadow-sm rounded-2xl overflow-hidden transition-all duration-500 min-h-[800px] flex flex-col relative print:border-none print:shadow-none print:min-h-0 print:p-0`}>

            {/* Header / Actions for Preview */}
            <div className="px-6 py-4 border-b border-zinc-200 flex justify-between items-center bg-zinc-50/50 print:hidden">
              <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Search className="w-4 h-4" /> 3. Visualização
              </h2>
              {modo === 'individual' && cartaGerada && (
                <div className="flex gap-2">
                  <Button onClick={handlePrint} className="h-9 font-bold bg-emerald-500 hover:bg-emerald-600 text-white gap-2">
                    <Printer className="w-4 h-4" />
                    Imprimir / Salvar PDF
                  </Button>
                </div>
              )}
            </div>

            {/* Letter Preview Content */}
            <div className="flex-1 bg-zinc-100/50 p-8 flex justify-center items-start print:p-0 print:m-0 print:bg-white overflow-auto custom-scrollbar">

              {modo === 'massa' ? (
                <div className="text-center mt-32 opacity-40 select-none print:hidden">
                  <PackageCheck className="w-20 h-20 mx-auto text-zinc-300 mb-4" />
                  <p className="text-lg font-bold text-zinc-400">Modo em massa</p>
                  <p className="text-sm font-medium text-zinc-400 mt-1">As cartas serão geradas individualmente e baixadas em um único arquivo .zip.</p>
                </div>
              ) : !cartaGerada ? (
                <div className="text-center mt-32 opacity-40 select-none print:hidden">
                  <FileText className="w-20 h-20 mx-auto text-zinc-300 mb-4" />
                  <p className="text-lg font-bold text-zinc-400">Nenhuma carta gerada</p>
                  <p className="text-sm font-medium text-zinc-400 mt-1">Preencha os dados e clique em &quot;Gerar Carta&quot; para ver a prévia.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-8 print:gap-0 print:block">
                  {selectedLojas.map((loja, index) => (
                    <CartaLetter
                      key={loja.id}
                      loja={loja}
                      colaborador={selectedColab}
                      formattedDate={getFormatDate()}
                      pageBreak={index > 0}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* Hidden off-screen container used to capture each colaborador's PDF during batch generation */}
      <div className="print:hidden" style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1 }}>
        <div ref={batchContainerRef} className="bg-white">
          {batchColaborador && batchLojas.map((loja, index) => (
            <CartaLetter
              key={loja.id}
              loja={loja}
              colaborador={batchColaborador}
              formattedDate={getFormatDate()}
              pageBreak={index > 0}
              animated={false}
            />
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: portrait; margin: 0; }
          html, body {
            background-color: white !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .page-break {
            break-before: page;
            page-break-before: always;
          }
        }
      `}} />
    </div>
  );
}
