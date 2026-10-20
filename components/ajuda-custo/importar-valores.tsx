'use client';

import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { colunasValor } from '@/lib/ajuda-custo-data';
import { competenciaPadrao, formatarData, moeda } from '@/lib/ajuda-custo';
import { interpretarPlanilha, type LinhaImport } from '@/lib/ajuda-custo-import';
import type { ColaboradorOpcao } from './colab-picker';

const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const ROTULO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function ImportarValores({ colaboradores, onImportado }: { colaboradores: ColaboradorOpcao[]; onImportado: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<LinhaImport[] | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [importando, setImportando] = useState(false);
  const [pracas, setPracas] = useState<{ id: string; nome: string }[]>([]);

  async function baixarModelo() {
    const XLSX = await import('xlsx');
    const vigencia = formatarData(`${competenciaPadrao()}-01`);
    const exemplo = [
      { Matrícula: '12345', Nome: 'NOME DO PROMOTOR (opcional)', Praça: 'Salvador/BA', Vigência: vigencia, Segunda: 15, Terça: 20, Quarta: 10, Quinta: 10, Sexta: 10, Sábado: '', Domingo: '' },
      { Matrícula: '67890', Nome: 'OUTRO PROMOTOR (opcional)', Praça: '', Vigência: '', Segunda: 12, Terça: 12, Quarta: 12, Quinta: 12, Sexta: 12, Sábado: 8, Domingo: '' },
    ];
    const ws = XLSX.utils.json_to_sheet(exemplo);
    ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 12 }, ...Array(7).fill({ wch: 10 })];
    const instrucoes = XLSX.utils.aoa_to_sheet([
      ['Como preencher'],
      ['Matrícula: obrigatória. Deve ser a de um colaborador ATIVO já cadastrado.'],
      ['Nome: opcional, só para sua referência (o sistema usa a matrícula).'],
      ['Praça: opcional. Cidade/estado do promotor (ex.: Salvador/BA), usada nos feriados regionais. Se a praça ainda não existir, ela é criada. Em branco = não altera a praça atual.'],
      ['Vigência: opcional (dd/mm/aaaa). Data a partir da qual os valores passam a valer. Em branco = dia 1º do mês seguinte.'],
      ['Segunda a Domingo: valor gasto de transporte em cada dia. Deixe em branco os dias em que o promotor não trabalha.'],
      ['Se o promotor já tem valores na mesma vigência, eles são substituídos. Em vigências diferentes, vira um novo registro no histórico.'],
      ['Apague as 2 linhas de exemplo antes de importar.'],
    ]);
    instrucoes['!cols'] = [{ wch: 120 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Valores');
    XLSX.utils.book_append_sheet(wb, instrucoes, 'Instruções');
    XLSX.writeFile(wb, 'modelo_importacao_valores_ajuda_de_custo.xlsx');
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await arquivo.arrayBuffer(), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (rows.length === 0) return toast.error('Nenhuma linha encontrada na planilha.');
      const resultado = interpretarPlanilha(
        rows,
        colaboradores.map((c) => ({ id: c.id, nome: c.nome, matricula: c.matricula })),
        `${competenciaPadrao()}-01`
      );
      const { data: pr } = await supabase.from('ajuda_custo_pracas').select('id, nome');
      setPracas((pr as { id: string; nome: string }[]) ?? []);
      setNomeArquivo(arquivo.name);
      setLinhas(resultado);
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível ler o arquivo. Use o modelo (.xlsx ou .csv).');
    }
  }

  const validas = linhas?.filter((l) => !l.erro) ?? [];
  const comErro = linhas?.filter((l) => l.erro) ?? [];

  async function confirmar() {
    if (validas.length === 0) return;
    setImportando(true);

    // praças novas citadas na planilha são criadas antes
    const porNome = new Map(pracas.map((p) => [p.nome.trim().toLowerCase(), p.id]));
    const novas = [...new Set(validas.filter((l) => l.praca && !porNome.has(l.praca.toLowerCase())).map((l) => l.praca!))];
    if (novas.length) {
      const { data: criadas, error: erroPraca } = await supabase.from('ajuda_custo_pracas').insert(novas.map((nome) => ({ nome }))).select('id, nome');
      if (erroPraca) {
        setImportando(false);
        return toast.error('Erro ao criar praças: ' + erroPraca.message);
      }
      (criadas ?? []).forEach((p: any) => porNome.set(p.nome.trim().toLowerCase(), p.id));
    }

    const payload = validas.map((l) => {
      const p: Record<string, any> = { colaborador_id: l.colaborador!.id, vigencia_inicio: l.vigencia };
      colunasValor.forEach((col, i) => (p[col] = l.valores[i]));
      return p;
    });
    const { error } = await supabase.from('ajuda_custo_valores').upsert(payload, { onConflict: 'colaborador_id,vigencia_inicio' });
    if (error) {
      setImportando(false);
      return toast.error('Erro ao importar: ' + error.message);
    }
    const vinculos = validas.filter((l) => l.praca).map((l) => ({ colaborador_id: l.colaborador!.id, praca_id: porNome.get(l.praca!.toLowerCase()) }));
    if (vinculos.length) {
      const { error: erroVinculo } = await supabase.from('ajuda_custo_promotor_praca').upsert(vinculos, { onConflict: 'colaborador_id' });
      if (erroVinculo) toast.error('Valores importados, mas houve erro ao vincular as praças: ' + erroVinculo.message);
    }
    setImportando(false);
    toast.success(`${validas.length} promotor(es) importado(s)${comErro.length ? `; ${comErro.length} linha(s) ignorada(s)` : ''}.`);
    setLinhas(null);
    onImportado();
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={aoEscolherArquivo} />
      <Button variant="outline" className="rounded-xl" onClick={baixarModelo}>
        <Download className="w-4 h-4 mr-2" /> Modelo
      </Button>
      <Button variant="outline" className="rounded-xl" onClick={() => inputRef.current?.click()}>
        <Upload className="w-4 h-4 mr-2" /> Importar
      </Button>

      <Dialog open={linhas !== null} onOpenChange={(o) => !o && setLinhas(null)}>
        <DialogContent className="sm:max-w-[min(1200px,96vw)] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-zinc-900">Conferir importação</DialogTitle>
            <DialogDescription>
              {nomeArquivo} · <span className="text-emerald-700 font-bold">{validas.length} válida(s)</span>
              {comErro.length > 0 && <> · <span className="text-rose-600 font-bold">{comErro.length} com erro (serão ignoradas)</span></>}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto rounded-xl border border-zinc-200">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10" />
                  <TableHead>Linha</TableHead>
                  <TableHead>Promotor</TableHead>
                  <TableHead>Praça</TableHead>
                  <TableHead>Vigência</TableHead>
                  {ORDEM.map((i) => <TableHead key={i} className="text-right">{ROTULO[i].slice(0, 3)}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas?.map((l) => (
                  <TableRow key={l.linha} className={l.erro ? 'bg-rose-50/60' : undefined}>
                    <TableCell>{l.erro ? <AlertCircle className="w-4 h-4 text-rose-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}</TableCell>
                    <TableCell className="text-xs tabular-nums">{l.linha}</TableCell>
                    <TableCell>
                      <p className="text-sm font-bold text-zinc-900">{l.colaborador?.nome ?? (l.nomePlanilha || '—')}</p>
                      <p className="text-[10px] text-zinc-500">MAT: {l.matricula || '—'}</p>
                      {l.erro && <p className="text-[11px] font-bold text-rose-600">{l.erro}</p>}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {l.praca ? (
                        <>
                          {l.praca}
                          {!pracas.some((p) => p.nome.trim().toLowerCase() === l.praca!.toLowerCase()) && <span className="ml-1 text-[10px] font-bold text-amber-600">(nova)</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{l.vigencia ? formatarData(l.vigencia) : '—'}</TableCell>
                    {ORDEM.map((i) => (
                      <TableCell key={i} className="text-right text-xs tabular-nums">{l.valores[i] ? moeda(l.valores[i]) : '—'}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setLinhas(null)}>Cancelar</Button>
            <Button disabled={validas.length === 0 || importando} onClick={confirmar} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">
              {importando ? 'Importando...' : `Importar ${validas.length} promotor(es)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
