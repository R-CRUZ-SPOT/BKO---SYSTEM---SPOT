'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Printer, Plus, Trash2, FileText, Search, Smartphone } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Produto {
  produto: string;
  valor: number;
  quantidade: number;
  idItem: string;
}

interface Colaborador {
  id: string;
  nome: string;
  cpf: string;
}

export default function TermosPage() {
  const [tipoTermo, setTipoTermo] = useState<'recebimento' | 'devolucao'>('recebimento');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedColaboradorId, setSelectedColaboradorId] = useState<string>('');
  const [produtos, setProdutos] = useState<Produto[]>([]);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newProduto, setNewProduto] = useState('');
  const [newValor, setNewValor] = useState('');
  const [newQuantidade, setNewQuantidade] = useState('1');
  const [newIdItem, setNewIdItem] = useState('');
  
  const [termoGerado, setTermoGerado] = useState(false);

  const loadColaboradores = useCallback(async () => {
    const { data } = await supabase
      .from('colaboradores')
      .select('id, nome, cpf')
      .eq('status', 'ativo')
      .order('nome');
    
    if (data) {
      setColaboradores(data);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
    loadColaboradores();
  }, [loadColaboradores]);

  const selectedColaborador = colaboradores.find(c => c.id === selectedColaboradorId);

  const totalValue = produtos.reduce((acc, curr) => acc + (curr.valor * curr.quantidade), 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const [isLoadingIMEI, setIsLoadingIMEI] = useState(false);

  const handleCarregarIMEI = async () => {
    if (!selectedColaboradorId) {
      alert("Por favor, selecione um colaborador primeiro.");
      return;
    }
    setIsLoadingIMEI(true);
    try {
      const { data, error } = await supabase
        .from('aparelhos')
        .select('modelo, imei')
        .eq('colaborador_id', selectedColaboradorId)
        .limit(1)
        .single();
      
      if (error || !data) {
        alert("Nenhum aparelho celular vinculado encontrado para este colaborador.");
      } else {
        setNewProduto(data.modelo || '');
        setNewIdItem(data.imei || '');
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao buscar aparelho.");
    } finally {
      setIsLoadingIMEI(false);
    }
  };

  const handleAddProduto = () => {
    if (!newProduto || !newValor || !newQuantidade) return;
    
    const parsedValor = parseFloat(newValor.replace(',', '.'));
    
    setProdutos([...produtos, {
      produto: newProduto,
      valor: isNaN(parsedValor) ? 0 : parsedValor,
      quantidade: parseInt(newQuantidade) || 1,
      idItem: newIdItem
    }]);

    setNewProduto('');
    setNewValor('');
    setNewQuantidade('1');
    setNewIdItem('');
    setIsDialogOpen(false);
    setTermoGerado(false); // reset preview
  };

  const handleRemoveProduto = (index: number) => {
    setProdutos(produtos.filter((_, i) => i !== index));
    setTermoGerado(false); // reset preview
  };

  const handleGerarTermo = () => {
    if (!selectedColaboradorId) {
      alert("Por favor selecione um colaborador.");
      return;
    }
    setTermoGerado(true);
  };

  const handlePrint = () => {
    try {
      const isIframe = window !== window.parent;
      if (isIframe) {
        alert("Atenção: A impressão ou geração de PDF pode ser bloqueada na janela de pré-visualização.\n\nSe a página de impressão não abrir, por favor, clique no botão 'Abrir em nova aba' (canto superior direito da tela) e tente novamente, ou pressione Ctrl+P / Cmd+P.");
      }
      setTimeout(() => {
        window.print();
      }, 100);
    } catch (e) {
      console.error(e);
      window.print();
    }
  };

  const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="flex flex-col h-full print:bg-white p-8">
      {/* Header Area */}
      <div className="mb-8 print:hidden">
        <h1 className="text-3xl font-black text-zinc-900 tracking-tight flex items-center gap-3 w-full">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-indigo-600" />
          </div>
          Termos & Recibos
        </h1>
        <p className="text-zinc-500 mt-2">Gere termos de recebimento ou devolução de equipamentos.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 print:block">
        
        {/* Controls - Left Side */}
        <div className="col-span-1 xl:col-span-5 space-y-6 print:hidden">
          <Card className="border-0 shadow-xl shadow-zinc-200/50 rounded-3xl overflow-hidden bg-white/80 backdrop-blur-xl">
            <CardContent className="p-6 space-y-6">
              
              <div className="space-y-3">
                <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Tipo de Termo</Label>
                <Select 
                  value={tipoTermo} 
                  onValueChange={(v: "recebimento" | "devolucao" | null) => { 
                    if (v) {
                      setTipoTermo(v);
                      setTermoGerado(false);
                    }
                  }}
                >
                  <SelectTrigger className="h-12 bg-zinc-50/50 border-zinc-200">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recebimento">Termo de Recebimento</SelectItem>
                    <SelectItem value="devolucao">Termo de Devolução</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Colaborador</Label>
                <Select 
                  value={selectedColaboradorId} 
                  onValueChange={(v: string | null) => { 
                    if (v) {
                      setSelectedColaboradorId(v);
                      setTermoGerado(false);
                    }
                  }}
                >
                  <SelectTrigger className="h-12 bg-zinc-50/50 border-zinc-200">
                    <SelectValue>{selectedColaborador?.nome || "Selecione o colaborador"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {colaboradores.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Itens do Termo</Label>
                  <Button onClick={() => setIsDialogOpen(true)} variant="outline" size="sm" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Adicionar Item
                  </Button>
                </div>

                <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-[300px] overflow-y-auto custom-scrollbar">
                  <Table className="text-xs sm:text-sm">
                    <TableHeader className="bg-zinc-50">
                      <TableRow>
                        <TableHead className="font-bold text-zinc-600 px-2 py-3 w-10">QTD</TableHead>
                        <TableHead className="font-bold text-zinc-600 px-2 py-3 w-auto">PRODUTO</TableHead>
                        <TableHead className="font-bold text-zinc-600 px-2 py-3 w-24">VALOR</TableHead>
                        <TableHead className="font-bold text-zinc-600 px-2 py-3 w-20">ID</TableHead>
                        <TableHead className="px-2 py-3 w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {produtos.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-zinc-400">Nenhum item adicionado.</TableCell>
                        </TableRow>
                      ) : (
                        produtos.map((p, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="px-2 py-2">{p.quantidade}</TableCell>
                            <TableCell className="font-medium px-2 py-2 break-all">{p.produto}</TableCell>
                            <TableCell className="px-2 py-2 whitespace-nowrap">{formatCurrency(p.valor)}</TableCell>
                            <TableCell className="px-2 py-2 break-all text-xs text-zinc-500" title={p.idItem}>{p.idItem || '-'}</TableCell>
                            <TableCell className="px-1 py-2 text-right">
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveProduto(idx)} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 h-7 w-7">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {produtos.length > 0 && (
                  <div className="text-right text-sm font-bold text-zinc-900 mt-2">
                    TOTAL: {formatCurrency(totalValue)}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-zinc-100">
                <Button 
                  onClick={handleGerarTermo}
                  disabled={!selectedColaboradorId}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-11 rounded-xl uppercase tracking-wider text-xs"
                >
                  Visualizar Termo
                </Button>
              </div>

            </CardContent>
          </Card>
        </div>

        {/* Preview / Print Area - Right Side */}
        <div className="col-span-1 xl:col-span-7 print:w-full print:block">
          <div className={`bg-white border border-zinc-200 shadow-sm rounded-2xl overflow-hidden transition-all duration-500 min-h-[800px] flex flex-col relative print:border-none print:shadow-none print:min-h-0 print:p-0`}>
            
            {/* Header / Actions for Preview */}
            <div className="px-6 py-4 border-b border-zinc-200 flex justify-between items-center bg-zinc-50/50 print:hidden">
              <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Search className="w-4 h-4" /> Visualização
              </h2>
              {termoGerado && (
                <div className="flex gap-2">
                  <Button onClick={handlePrint} className="h-9 font-bold bg-emerald-500 hover:bg-emerald-600 text-white gap-2">
                    <Printer className="w-4 h-4" />
                    Imprimir / Salvar PDF
                  </Button>
                </div>
              )}
            </div>

            {/* Preview Content */}
            <div className="flex-1 bg-zinc-100/50 p-8 flex justify-center items-start print:p-0 print:m-0 print:bg-white overflow-auto custom-scrollbar">
              
              {!termoGerado ? (
                <div className="text-center mt-32 opacity-40 select-none print:hidden">
                  <FileText className="w-20 h-20 mx-auto text-zinc-300 mb-4" />
                  <p className="text-lg font-bold text-zinc-400">Nenhum termo visualizado</p>
                  <p className="text-sm font-medium text-zinc-400 mt-1">Preencha os dados e clique em &quot;Visualizar Termo&quot; para ver a prévia.</p>
                </div>
              ) : (
                <div className="bg-white p-10 max-w-[210mm] w-full shadow-xl print:shadow-none font-sans text-black text-sm relative">
                  <div className="flex justify-end mb-8">
                    <div className="text-right">
                      <h2 className="text-2xl font-bold tracking-widest uppercase">SPOT</h2>
                      <div className="flex gap-1 justify-end mt-1">
                        <div className="w-6 h-6 rounded-full bg-zinc-500 font-bold text-white flex items-center justify-center text-xs">S</div>
                        <div className="w-6 h-6 rounded-full bg-zinc-500 font-bold text-white flex items-center justify-center text-xs">P</div>
                        <div className="w-6 h-6 rounded-full bg-rose-600 font-bold text-white flex items-center justify-center text-xs">O</div>
                        <div className="w-6 h-6 rounded-full bg-zinc-500 font-bold text-white flex items-center justify-center text-xs">T</div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center font-bold mb-10 text-base uppercase">
                    {tipoTermo === 'recebimento' ? 'TERMO DE RECEBIMENTO' : 'TERMO DE DEVOLUÇÃO DE EQUIPAMENTO/MATERIAL'}
                  </div>

                  <div className="text-justify mb-8 leading-relaxed">
                    {tipoTermo === 'recebimento' ? (
                      <p>
                        Pelo presente, eu <strong>{selectedColaborador?.nome || '___________________________'}</strong>, 
                        portador(a) do CPF: <strong>{selectedColaborador?.cpf || '_________________'}</strong> declaro estar 
                        recebendo da SPOT PROMOÇÕES EVENTOS E MERCHANDISING LTDA os equipamentos/materiais abaixo relacionado, 
                        e com o presente termo, ciente da responsabilidade inerente à utilização do referido.
                      </p>
                    ) : (
                      <p>
                        Pelo presente, eu <strong>{selectedColaborador?.nome || '___________________________'}</strong>, 
                        portador do CPF: <strong>{selectedColaborador?.cpf || '_________________'}</strong> declaro ter 
                        devolvido para a empresa SPOT PROMOÇÕES EVENTOS E MERCHANDISING LTDA os equipamentos/materiais abaixo relacionado, 
                        e com o presente termo, ciente da responsabilidade inerente à utilização do referido.
                      </p>
                    )}
                  </div>

                  <table className="w-full border-collapse border border-black mb-8 text-center text-sm">
                    <thead>
                      <tr className="border-[1px] border-black bg-zinc-50 font-bold">
                        <th className="border-[1px] border-black p-2 w-16">QTD</th>
                        <th className="border-[1px] border-black p-2">PRODUTO</th>
                        <th className="border-[1px] border-black p-2">VALOR</th>
                        <th className="border-[1px] border-black p-2">ID(IMEI/SERIAL)</th>
                        <th className="border-[1px] border-black p-2 w-24">VISTO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {produtos.length > 0 ? (
                        produtos.map((p, idx) => (
                          <tr key={idx} className="border-[1px] border-black h-8">
                            <td className="border-[1px] border-black p-2">( {p.quantidade} )</td>
                            <td className="border-[1px] border-black p-2">{p.produto}</td>
                            <td className="border-[1px] border-black p-2">{formatCurrency(p.valor)}</td>
                            <td className="border-[1px] border-black p-2">{p.idItem}</td>
                            <td className="border-[1px] border-black p-2"></td>
                          </tr>
                        ))
                      ) : (
                        <>
                          <tr className="border-[1px] border-black h-8">
                            <td className="border-[1px] border-black p-2">( )</td>
                            <td className="border-[1px] border-black p-2"></td>
                            <td className="border-[1px] border-black p-2"></td>
                            <td className="border-[1px] border-black p-2"></td>
                            <td className="border-[1px] border-black p-2"></td>
                          </tr>
                          <tr className="border-[1px] border-black h-8">
                            <td className="border-[1px] border-black p-2">( )</td>
                            <td className="border-[1px] border-black p-2"></td>
                            <td className="border-[1px] border-black p-2"></td>
                            <td className="border-[1px] border-black p-2"></td>
                            <td className="border-[1px] border-black p-2"></td>
                          </tr>
                          <tr className="border-[1px] border-black h-8">
                            <td className="border-[1px] border-black p-2">( )</td>
                            <td className="border-[1px] border-black p-2"></td>
                            <td className="border-[1px] border-black p-2"></td>
                            <td className="border-[1px] border-black p-2"></td>
                            <td className="border-[1px] border-black p-2"></td>
                          </tr>
                        </>
                      )}
                      
                    </tbody>
                  </table>

                  {tipoTermo === 'recebimento' ? (
                    <>
                      <p className="text-justify mb-4 leading-relaxed">
                        Declaro estar ciente sobre a necessidade de conservação dele no exercício do trabalho, bem como 
                        comprometo devolvê-lo ao término de meu contrato de trabalho e/ou quando solicitado. Caso aconteça 
                        alguma ocorrência fora do período de trabalho e/ou a devolução do aparelho não ocorra, tenho ciência e 
                        autorizo que a empresa efetue o desconto de <strong>{formatCurrency(totalValue)}</strong> dos meus vencimentos ou relativo às minhas verbas rescisórias.
                      </p>
                      <p className="text-justify mb-8 leading-relaxed">
                        Declaro estar ciente também de que o equipamento/material NÃO possui nenhum tipo de cobertura 
                        (seguro) bem como nunca deverá ser fornecido ou emprestado para terceiros, ficando ciente que é motivo 
                        para rescisão justificada à entrega para terceiros utilizar.
                      </p>
                      
                      <div className="border border-black p-4 text-xs mb-8">
                        <p className="font-bold underline mb-2">AVISO:</p>
                        <p className="mb-2">
                          Em caso de perda, deverá ser feito o Boletim de Ocorrência e será emitido um termo de ciência de desconto em folha de pagamento.
                        </p>
                        <p className="mb-2">
                          Em caso de roubo ou furto, deverá ser feito o Boletim de Ocorrência em delegacia, com a presença do Supervisor ou responsável da 
                          coligada. Caso seja constatado falta de responsabilidade por parte do promotor no ato do roubo ou furto, haverá o desconto em 
                          folha de pagamento.
                        </p>
                        <p className="underline">
                          Dica: O aparelho é uma ferramenta de trabalho, zelem para que ele esteja em segurança. Não utilizem em transporte público ou até 
                          mesmo na rua.
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-justify mb-16 leading-relaxed">
                      Declaro está devolvendo os aparelhos acima relacionados em perfeitas condições e com todos os 
                      equipamentos completos, caso não estejam de acordo com a descrição, declaro estar ciente dos descontos 
                      em folha.
                    </p>
                  )}

                  <div className="mt-12 space-y-12">
                    <p>{today}.</p>
                    
                    <div className="w-80 space-y-2">
                      <div className="border-b border-black"></div>
                      <p className="font-bold">{selectedColaborador?.nome || '______________________________________'}</p>
                    </div>
                  </div>

                  <div className="text-center text-xs mt-24">
                    <p>SPOTPROMO - Rua Joaquim Floriano, 100 6o. Andar - Itaim Bibi - São Paulo – SP</p>
                    <p>www.spotpromo.com.br</p>
                  </div>

                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Dialog for Adding Product */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Adicionar Item</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {selectedColaboradorId ? (
              <Button 
                type="button"
                variant="outline" 
                className="w-full gap-2 border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-800 transition-colors" 
                onClick={handleCarregarIMEI}
                disabled={isLoadingIMEI}
              >
                <Smartphone className="w-4 h-4" />
                {isLoadingIMEI ? "Carregando..." : "Carregar Aparelho Vinculado"}
              </Button>
            ) : (
               <div className="text-xs text-amber-600 bg-amber-50 p-2 text-center rounded border border-amber-200">
                 Selecione um colaborador primeiro para carregar o IMEI automaticamente.
               </div>
            )}
            <div className="space-y-2">
              <Label>Produto</Label>
              <Input 
                placeholder="Ex: iPhone 13" 
                value={newProduto} 
                onChange={e => setNewProduto(e.target.value)} 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input 
                  placeholder="0,00" 
                  value={newValor} 
                  onChange={e => setNewValor(e.target.value)} 
                  type="number"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input 
                  type="number" 
                  min="1"
                  value={newQuantidade} 
                  onChange={e => setNewQuantidade(e.target.value)} 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>ID (IMEI/SERIAL) - Opcional</Label>
              <Input 
                placeholder="Ex: 123456789012345" 
                value={newIdItem} 
                onChange={e => setNewIdItem(e.target.value)} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddProduto} className="bg-indigo-600 hover:bg-indigo-700">Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
