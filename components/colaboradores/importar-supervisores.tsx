'use client';

import { useMemo, useRef, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { parseRoteiroFile, type RoteiroEntry } from '@/lib/roteiro-parser';
import { type AcaoSupervisor, interpretarRoteiroSupervisores } from '@/lib/supervisor-import';
import { cn } from '@/lib/utils';

const ROTULO: Record<AcaoSupervisor, { texto: string; classe: string }> = {
  novo: { texto: 'Novo', classe: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  atualizar: { texto: 'Atualizar', classe: 'bg-sky-50 text-sky-700 border-sky-100' },
  manter_manual: { texto: 'Mantido (manual)', classe: 'bg-amber-50 text-amber-700 border-amber-100' },
  igual: { texto: 'Igual', classe: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
};

/** Importa o supervisor de cada promotor a partir da planilha de Roteiro e grava no cadastro do colaborador. */
export function ImportarSupervisores({ colaboradores, onImportado }: { colaboradores: any[]; onImportado: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<RoteiroEntry[] | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [substituirManuais, setSubstituirManuais] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    try {
      const lidas = await parseRoteiroFile(arquivo);
      if (lidas.length === 0) return toast.error('Nenhuma linha encontrada na planilha.');
      setNomeArquivo(arquivo.name);
      setSubstituirManuais(false);
      setEntries(lidas);
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível ler a planilha de Roteiro.');
    }
  }

  const resultado = useMemo(
    () =>
      entries
        ? interpretarRoteiroSupervisores(
            entries,
            colaboradores.map((c) => ({ id: c.id, nome: c.nome, matricula: c.matricula, status: c.status, supervisor: c.supervisor, supervisor_origem: c.supervisor_origem })),
            substituirManuais
          )
        : null,
    [entries, colaboradores, substituirManuais]
  );

  const contagem = useMemo(() => {
    const c: Record<AcaoSupervisor, number> = { novo: 0, atualizar: 0, manter_manual: 0, igual: 0 };
    resultado?.linhas.forEach((l) => (c[l.acao] += 1));
    return c;
  }, [resultado]);

  const aGravar = (resultado?.linhas ?? []).filter((l) => l.acao === 'novo' || l.acao === 'atualizar');
  const mudancas = (resultado?.linhas ?? []).filter((l) => l.acao !== 'igual');

  async function confirmar() {
    if (aGravar.length === 0) return;
    setSalvando(true);
    const agora = new Date().toISOString();
    for (let i = 0; i < aGravar.length; i += 200) {
      const lote = aGravar.slice(i, i + 200).map((l) => ({
        id: l.colaborador.id,
        matricula: l.colaborador.matricula,
        nome: l.colaborador.nome,
        supervisor: l.supervisorNovo,
        supervisor_origem: 'planilha',
        supervisor_atualizado_em: agora,
      }));
      const { error } = await supabase.from('colaboradores').upsert(lote, { onConflict: 'id' });
      if (error) {
        setSalvando(false);
        return toast.error('Erro ao gravar os supervisores: ' + error.message + ' (execute scripts/colaboradores-supervisor.sql no Supabase)');
      }
    }
    setSalvando(false);
    toast.success(`${aGravar.length} supervisor(es) gravado(s).`);
    setEntries(null);
    onImportado();
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={aoEscolherArquivo} />
      <Button variant="outline" className="rounded-xl border-zinc-200 hover:bg-zinc-50" onClick={() => inputRef.current?.click()} title="Importar o supervisor de cada promotor a partir da planilha de Roteiro">
        <UserCheck className="w-4 h-4 mr-2 text-zinc-500" />
        Supervisores
      </Button>

      <Dialog open={entries !== null} onOpenChange={(o) => !o && setEntries(null)}>
        <DialogContent className="sm:max-w-4xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-zinc-900">Importar supervisores</DialogTitle>
            <DialogDescription>{nomeArquivo} · o Roteiro casa com o cadastro pelo nome do promotor (sem diferenciar acentos ou maiúsculas).</DialogDescription>
          </DialogHeader>

          {resultado && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                {(['novo', 'atualizar', 'manter_manual', 'igual'] as AcaoSupervisor[]).map((a) => (
                  <span key={a} className={cn('rounded-full border px-3 py-1', ROTULO[a].classe)}>{contagem[a]} {ROTULO[a].texto.toLowerCase()}</span>
                ))}
                {resultado.naoEncontrados.length > 0 && <span className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-rose-700">{resultado.naoEncontrados.length} sem correspondência</span>}
                {resultado.ambiguos.length > 0 && <span className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-rose-700">{resultado.ambiguos.length} nome(s) repetido(s)</span>}
              </div>

              {contagem.manter_manual > 0 && (
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <input type="checkbox" className="mt-0.5" checked={substituirManuais} onChange={(e) => setSubstituirManuais(e.target.checked)} />
                  <span>
                    <strong>Substituir também os supervisores alterados manualmente.</strong> Por padrão, quem teve o supervisor editado em Gestão de Pessoas é mantido, mesmo que a planilha traga outro.
                  </span>
                </label>
              )}

              <div className="max-h-[40vh] overflow-auto rounded-xl border border-zinc-200">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Promotor</TableHead>
                      <TableHead>Supervisor atual</TableHead>
                      <TableHead>Na planilha</TableHead>
                      <TableHead>Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mudancas.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-zinc-400">Nada a alterar: os supervisores da planilha já estão iguais aos do cadastro.</TableCell></TableRow>
                    ) : (
                      mudancas.map((l) => (
                        <TableRow key={l.colaborador.id}>
                          <TableCell className="py-2">
                            <p className="text-sm font-bold text-zinc-900">{l.colaborador.nome}</p>
                            <p className="text-[10px] text-zinc-500">MAT: {l.colaborador.matricula}</p>
                          </TableCell>
                          <TableCell className="text-xs text-zinc-600">
                            {l.supervisorAtual || '—'}
                            {l.supervisorAtual && l.origemAtual && <span className="ml-1 text-[10px] text-zinc-400">({l.origemAtual})</span>}
                          </TableCell>
                          <TableCell className="text-xs font-bold text-zinc-900">
                            {l.supervisorNovo}
                            {l.supervisoresNaPlanilha.length > 1 && (
                              <span title={`A planilha traz ${l.supervisoresNaPlanilha.length} supervisores para este promotor: ${l.supervisoresNaPlanilha.join(', ')}. Vale o que mais aparece.`} className="ml-1 text-[10px] font-black text-amber-600">+{l.supervisoresNaPlanilha.length - 1}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider', ROTULO[l.acao].classe)}>{ROTULO[l.acao].texto}</span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {(resultado.naoEncontrados.length > 0 || resultado.ambiguos.length > 0) && (
                <details className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-700">
                  <summary className="cursor-pointer font-bold">Ver nomes não aplicados ({resultado.naoEncontrados.length + resultado.ambiguos.length})</summary>
                  {resultado.naoEncontrados.length > 0 && (
                    <p className="mt-2"><strong>Sem correspondência no cadastro:</strong> {resultado.naoEncontrados.join('; ')}</p>
                  )}
                  {resultado.ambiguos.length > 0 && (
                    <p className="mt-2"><strong>Nome repetido (mais de um colaborador):</strong> {resultado.ambiguos.join('; ')}. Defina o supervisor deles em Gestão de Pessoas.</p>
                  )}
                </details>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEntries(null)}>Cancelar</Button>
                <Button disabled={aGravar.length === 0 || salvando} onClick={confirmar} className="rounded-xl bg-emerald-600 hover:bg-emerald-700">
                  {salvando ? 'Gravando...' : `Gravar ${aGravar.length} supervisor(es)`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
