'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import { FileUp, Printer, FileText, Search, User, MapPin, Building, ChevronDown, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Colaborador {
  id: string;
  matricula: string;
  nome: string;
  cpf: string;
  rg: string;
  ctps: string;
  serie_ctps: string;
}

interface RoteiroEntry {
  nome?: string;
  nom_pessoa_completo?: string;
  rede?: string;
  nom_fantasia?: string;
  end_logradouro?: string;
}

interface Loja {
  id: string;
  rede: string;
  nomFantasia: string;
  logradouro: string;
}

export default function CartasPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [roteiro, setRoteiro] = useState<RoteiroEntry[]>([]);
  const [selectedColaboradorId, setSelectedColaboradorId] = useState<string>('');
  const [selectedLojaIds, setSelectedLojaIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileName, setFileName] = useState('');
  
  const [lojasVinculadas, setLojasVinculadas] = useState<Loja[]>([]);
  const [cartaGerada, setCartaGerada] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setCartaGerada(false);
    setSelectedColaboradorId('');
    setSelectedLojaIds([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetNameBase = workbook.SheetNames.find(s => s.trim().toUpperCase() === 'BASE');
        const sheetName = sheetNameBase || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert array to json
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as any[];
        
        // Normalize keys
        const normalizedData: RoteiroEntry[] = jsonData.map(row => {
          const newRow: any = {};
          for (const key in row) {
            const normalizedKey = key.trim().toUpperCase();
            if (normalizedKey === 'NOME') newRow.nome = row[key];
            if (normalizedKey === 'NOM_PESSOA_COMPLETO') newRow.nom_pessoa_completo = row[key];
            if (normalizedKey === 'REDE') newRow.rede = row[key];
            if (normalizedKey === 'NOM_FANTASIA') newRow.nom_fantasia = row[key];
            if (normalizedKey === 'END_LOGRADOURO') newRow.end_logradouro = row[key];
          }
          return newRow as RoteiroEntry;
        });

        setRoteiro(normalizedData);
      } catch (err) {
        console.error("Erro ao ler o arquivo:", err);
        alert("Erro ao ler o arquivo. Verifique se o formato está correto.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  useEffect(() => {
    if (selectedColaboradorId && roteiro.length > 0) {
      const c = colaboradores.find(c => c.id === selectedColaboradorId);
      if (!c) {
        setLojasVinculadas([]);
        return;
      }

      // Filter roteiro where employee name matches
      const colabName = c.nome.toLowerCase().trim();
      const filtered = roteiro.filter(r => {
        const n1 = (r.nome || '').toLowerCase().trim();
        const n2 = (r.nom_pessoa_completo || '').toLowerCase().trim();
        return n1 === colabName || n2 === colabName;
      });

      // Deduplicate lojas
      const uniqueLojas = new Map<string, Loja>();
      filtered.forEach(r => {
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

      setLojasVinculadas(Array.from(uniqueLojas.values()));
      setSelectedLojaIds([]);
      setCartaGerada(false);
    } else {
      setLojasVinculadas([]);
      setSelectedLojaIds([]);
      setCartaGerada(false);
    }
  }, [selectedColaboradorId, roteiro, colaboradores]);

  const handleGerarCarta = () => {
    if (!selectedColaboradorId || selectedLojaIds.length === 0) {
      alert("Por favor selecione um colaborador e ao menos uma loja.");
      return;
    }
    setCartaGerada(true);
  };

  const selectedColab = colaboradores.find(c => c.id === selectedColaboradorId);
  const selectedLojas = lojasVinculadas.filter(l => selectedLojaIds.includes(l.id));

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

  return (
    <div className="flex flex-col h-full print:bg-white">
      {/* Header Area */}
      <div className="mb-8 print:hidden">
        <h1 className="text-2xl font-black uppercase tracking-tight text-zinc-900 mb-2">Cartas de Apresentação</h1>
        <p className="text-sm text-zinc-500 font-medium max-w-2xl">
          Gere cartas de apresentação para os promotores. Faça o upload do roteiro e selecione a loja desejada.
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

          {/* Selection Box */}
          <div className={`bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm transition-opacity duration-300 ${roteiro.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
              <User className="w-4 h-4" /> 2. Seleção de Dados
            </h2>
            
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
                  {lojasVinculadas.length > 0 && (
                    <span className="text-[10px] text-emerald-600 font-bold px-2 py-0.5 bg-emerald-50 rounded-full">
                      {lojasVinculadas.length} encontradas
                    </span>
                  )}
                </label>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar border border-zinc-200 rounded-xl p-3 bg-zinc-50">
                  {!selectedColaboradorId ? (
                    <p className="text-xs text-zinc-400 italic">Selecione um promotor primeiro...</p>
                  ) : lojasVinculadas.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">Nenhuma loja encontrada</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 pb-2 mb-2 border-b border-zinc-200">
                        <input
                          type="checkbox"
                          id="select-all-lojas"
                          checked={selectedLojaIds.length === lojasVinculadas.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLojaIds(lojasVinculadas.map(l => l.id));
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
                      {lojasVinculadas.map(l => (
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
                        </div>
                      ))}
                    </>
                  )}
                </div>
                
                {selectedColaboradorId && lojasVinculadas.length === 0 && (
                  <p className="text-[10px] text-rose-500 mt-2 font-medium">
                    As colunas NOME ou NOM_PESSOA_COMPLETO para os registros deste promotor podem não ser equivalentes ao seu nome no sistema ou ele não possui roteiro na planilha enviada.
                  </p>
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
              {cartaGerada && (
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
              
              {!cartaGerada ? (
                <div className="text-center mt-32 opacity-40 select-none print:hidden">
                  <FileText className="w-20 h-20 mx-auto text-zinc-300 mb-4" />
                  <p className="text-lg font-bold text-zinc-400">Nenhuma carta gerada</p>
                  <p className="text-sm font-medium text-zinc-400 mt-1">Preencha os dados e clique em &quot;Gerar Carta&quot; para ver a prévia.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-8 print:gap-0 print:block">
                  {selectedLojas.map((loja, index) => (
                    <motion.div 
                      key={loja.id}
                      id={`print-section-${index}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-white w-[210mm] min-h-[297mm] shadow-xl p-[40px] md:p-[80px] print:w-full print:shadow-none print:p-[15mm] print:m-0 font-sans text-black relative ${index > 0 ? 'page-break' : ''}`}
                    >
                      
                      {/* Header: Date and Logo */}
                      <div className="flex justify-between items-start mb-16">
                        <div className="pt-8">
                          <p className="text-[14px]">São Paulo, {getFormatDate()}</p>
                        </div>
                        
                        {/* SPOT Logo Simulator */}
                        <div className="grid grid-cols-4 gap-[6px]">
                          {/* Row 1 */}
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-sm border border-zinc-700"></div>
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-sm border border-zinc-700"></div>
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-sm border border-zinc-700"></div>
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-sm border border-zinc-700"></div>
                          
                          {/* Row 2 */}
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-sm border border-zinc-700 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-white leading-none">S</span>
                          </div>
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-sm border border-zinc-700 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-white leading-none">P</span>
                          </div>
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-red-600 to-red-800 shadow-sm border border-red-900 flex items-center justify-center">
                            {/* Red circle */}
                          </div>
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-sm border border-zinc-700 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-white leading-none">T</span>
                          </div>
                          
                          {/* Row 3 */}
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-sm border border-zinc-700"></div>
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-sm border border-zinc-700"></div>
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-sm border border-zinc-700"></div>
                          <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-sm border border-zinc-700"></div>
                        </div>
                      </div>

                      {/* Addressee */}
                      <div className="mb-8 font-bold text-[14px] space-y-1">
                        <p>{loja.nomFantasia || '«NOME_LOJA»'}</p>
                        <p>{loja.logradouro || '«ENDERECO»'}</p>
                      </div>

                      {/* Body Text */}
                      <p className="text-[14px] leading-[1.6] text-justify mb-5">
                        Apresentamos <strong>{selectedColab?.nome || '«PROMOTOR»'}</strong>, portador do <strong>RG: {selectedColab?.rg || '«RG»'}</strong> e do <strong>CPF: {selectedColab?.cpf || '«CPF»'}</strong> irá realizar atividades ligadas à de produtos da empresa <strong>EPSON DO BRASIL IND E COM LTDA</strong> no setor de informática de sua loja, no período indeterminado em dias alternados entre 09:00 as 18:00 hs. Informamos que ele não possui vínculo empregatício com vosso estabelecimento, cabendo a nós a responsabilidade por qualquer custo empregatício ou securitário. Abaixo para o seu conhecimento, a sua atividade:
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
                            <p className="text-[12px] font-bold text-center uppercase">{selectedColab?.nome || 'PROMOTOR'}</p>
                          </div>
                        </div>
                      </div>

                    </motion.div>
                  ))}
                </div>
              )}
            </div>

          </div>
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
