'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TIPO_LABEL, formatarData, moeda, nomeCompetencia } from '@/lib/ajuda-custo';
import { carregarDashboard, type DadosDashboard } from '@/lib/ajuda-custo-data';
import {
  afastadosHoje,
  descontosPorMotivo,
  diasOcorrenciaPorMes,
  porPraca,
  porSupervisor,
  rankingPromotores,
  resumirPorMes,
  variacao,
} from '@/lib/ajuda-custo-dashboard';
import { BarrasEmpilhadas, BarrasHorizontais, CartaoGrafico, COR, COR_TIPO, Indicador, LinhaEvolucao, rotuloMes } from '@/components/ajuda-custo/graficos';
import { cn } from '@/lib/utils';

const PERIODOS = [6, 12, 24];
type Ordem = 'pago' | 'descontos' | 'pct';

const pct = (n: number) => `${(n * 100).toFixed(1).replace('.', ',')}%`;

export default function DashboardPage() {
  const [meses, setMeses] = useState(12);
  const [dados, setDados] = useState<DadosDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [ordem, setOrdem] = useState<Ordem>('descontos');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setDados(await carregarDashboard(meses));
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar o dashboard: ' + (e.message || 'verifique os scripts SQL do módulo.'));
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [meses]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const analise = useMemo(() => {
    if (!dados || dados.competencias.length === 0) return null;
    const porMes = resumirPorMes(dados.itens);
    const ultima = porMes[porMes.length - 1];
    const anterior = porMes[porMes.length - 2];
    const itensUltimo = dados.itens.filter((i) => i.competencia === ultima.competencia);
    return {
      porMes,
      ultima,
      anterior,
      motivos: descontosPorMotivo(dados.itens),
      pracas: porPraca(dados.itens, ultima.competencia),
      supervisores: porSupervisor(dados.itens, ultima.competencia),
      ausencias: diasOcorrenciaPorMes(dados.ocorrencias, dados.competencias),
      ranking: rankingPromotores(dados.itens),
      comSaldo: itensUltimo.filter((i) => i.saldo_devedor > 0).length,
      totalDescontos: porMes.reduce((s, m) => s + m.descontos, 0),
      totalPago: porMes.reduce((s, m) => s + m.pago, 0),
    };
  }, [dados]);

  const hoje = new Date().toLocaleDateString('sv-SE');
  const afastados = useMemo(() => (dados ? afastadosHoje(dados.ocorrencias, hoje) : []), [dados, hoje]);

  const ranking = useMemo(() => {
    if (!analise) return [];
    const chave = { pago: (l: { pago: number }) => l.pago, descontos: (l: { descontos: number }) => l.descontos, pct: (l: { pctDesconto: number }) => l.pctDesconto }[ordem] as (l: any) => number;
    return [...analise.ranking].sort((a, b) => chave(b) - chave(a)).slice(0, 10);
  }, [analise, ordem]);

  if (loading) return <p className="text-center py-20 text-zinc-400 text-sm">Carregando...</p>;
  if (!dados) return null;

  const seletor = (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Período</span>
      {PERIODOS.map((p) => (
        <button
          key={p}
          onClick={() => setMeses(p)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
            meses === p ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:text-zinc-900'
          )}
        >
          Últimos {p} meses
        </button>
      ))}
    </div>
  );

  if (!analise) {
    return (
      <div className="space-y-4">
        {seletor}
        <AfastadosHoje afastados={afastados} nomes={dados.nomes} />
        <p className="text-center py-16 text-zinc-400 text-sm">
          O dashboard usa os lançamentos fechados. Feche o primeiro mês em &quot;Cálculo do Mês&quot; para ver os indicadores e gráficos.
        </p>
      </div>
    );
  }

  const { ultima, anterior } = analise;
  const varPago = variacao(ultima.pago, anterior?.pago);
  const mesUlt = nomeCompetencia(ultima.competencia);
  const linhasSupervisor = analise.supervisores.map((s) => ({
    rotulo: s.supervisor,
    valor: s.pago,
    detalhe: `${s.promotores} ${s.promotores === 1 ? 'promotor' : 'promotores'} · média ${moeda(s.promotores ? s.pago / s.promotores : 0)}`,
    cor: s.supervisor === 'Sem supervisor' ? COR.neutro : undefined,
  }));
  const metadeSupervisor = Math.ceil(linhasSupervisor.length / 2);

  return (
    <div className="space-y-6">
      {seletor}

      {dados.previa && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-3 text-xs text-sky-900">
          <strong>Prévia de {nomeCompetencia(dados.previa)}:</strong> nenhum mês foi fechado ainda, então o dashboard mostra o cálculo em aberto deste lançamento. Depois do primeiro
          fechamento ele passa a usar os lançamentos fechados e a mostrar a evolução mensal.
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Indicador
          rotulo={`Lançado em ${rotuloMes(ultima.competencia)}`}
          valor={moeda(ultima.pago)}
          sub={varPago === null ? 'Sem mês anterior para comparar' : `${varPago >= 0 ? '▲' : '▼'} ${pct(Math.abs(varPago))} vs ${rotuloMes(anterior.competencia)}`}
        />
        <Indicador
          rotulo={`Descontos em ${rotuloMes(ultima.competencia)}`}
          valor={moeda(ultima.descontos)}
          sub={ultima.bruto > 0 ? `${pct(ultima.descontos / ultima.bruto)} do valor bruto` : undefined}
        />
        <Indicador
          rotulo="Promotores pagos"
          valor={String(ultima.promotores)}
          sub={ultima.promotores > 0 ? `Média de ${moeda(ultima.pago / ultima.promotores)} por promotor` : undefined}
        />
        <Indicador
          rotulo="Saldo devedor em aberto"
          valor={moeda(ultima.saldoDevedor)}
          sub={analise.comSaldo > 0 ? `${analise.comSaldo} promotor(es) a abater no próximo lançamento` : 'Nenhum promotor com saldo'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <CartaoGrafico className="xl:col-span-2" titulo="Evolução mensal" subtitulo={`Valor lançado e descontos por competência (${analise.porMes.length} ${analise.porMes.length === 1 ? 'mês fechado' : 'meses fechados'})`}>
          <LinhaEvolucao meses={analise.porMes} />
        </CartaoGrafico>
        <CartaoGrafico titulo="Descontos por motivo" subtitulo={`Total no período: ${moeda(analise.totalDescontos)}`}>
          <BarrasHorizontais
            cor={COR.laranja}
            vazio="Nenhum desconto no período."
            linhas={analise.motivos.map((m) => ({ rotulo: m.motivo, valor: m.valor, detalhe: `${m.dias} ${m.dias === 1 ? 'dia' : 'dias'}` }))}
          />
        </CartaoGrafico>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <CartaoGrafico titulo="Valor lançado por praça" subtitulo={mesUlt}>
          <BarrasHorizontais
            cor={COR.azul}
            vazio="Sem dados."
            linhas={analise.pracas.map((p) => ({
              rotulo: p.praca,
              valor: p.pago,
              detalhe: `${p.promotores} ${p.promotores === 1 ? 'promotor' : 'promotores'} · média ${moeda(p.promotores ? p.pago / p.promotores : 0)}`,
              cor: p.praca === 'Sem praça' ? COR.neutro : undefined,
            }))}
          />
        </CartaoGrafico>
        <CartaoGrafico className="xl:col-span-2" titulo="Dias de ausência por mês" subtitulo="Soma dos dias de férias, atestados, faltas e feriados locais de todos os promotores">
          <BarrasEmpilhadas meses={analise.ausencias} />
        </CartaoGrafico>
      </div>

      {linhasSupervisor.some((l) => l.rotulo !== 'Sem supervisor') && (
        <CartaoGrafico titulo="Valor lançado por supervisor" subtitulo={mesUlt}>
          <div className="grid grid-cols-1 gap-x-10 gap-y-3 md:grid-cols-2">
            <BarrasHorizontais cor={COR.azul} vazio="Sem dados." linhas={linhasSupervisor.slice(0, metadeSupervisor)} />
            <BarrasHorizontais cor={COR.azul} vazio="" linhas={linhasSupervisor.slice(metadeSupervisor)} />
          </div>
        </CartaoGrafico>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <AfastadosHoje afastados={afastados} nomes={dados.nomes} />
        <Card className="xl:col-span-2 border-zinc-100 shadow-sm bg-white/70">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-zinc-100">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-zinc-900">Ranking de promotores</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">Top 10 no período · {moeda(analise.totalPago)} lançados no total</p>
              </div>
              <div className="flex gap-2">
                {([['descontos', 'Mais descontos'], ['pct', '% descontado'], ['pago', 'Maior valor']] as [Ordem, string][]).map(([k, rot]) => (
                  <button
                    key={k}
                    onClick={() => setOrdem(k)}
                    className={cn('px-3 py-1.5 rounded-full text-[11px] font-bold border', ordem === k ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200')}
                  >
                    {rot}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Promotor</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Praça</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-zinc-500">Meses</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-zinc-500">Lançado</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-zinc-500">Descontos</TableHead>
                    <TableHead className="px-5 text-right text-[11px] font-bold uppercase tracking-wider text-zinc-500">% desc.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((l) => (
                    <TableRow key={l.colaborador_id}>
                      <TableCell className="px-5 py-3">
                        <p className="text-sm font-bold text-zinc-900">{l.nome}</p>
                        <p className="text-[10px] text-zinc-500">MAT: {l.matricula}</p>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-600">{l.praca ?? <span className="text-zinc-300">sem praça</span>}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{l.meses}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums font-bold">{moeda(l.pago)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{l.descontos > 0 ? moeda(l.descontos) : '—'}</TableCell>
                      <TableCell className="px-5 text-right text-xs tabular-nums">{l.descontos > 0 ? pct(l.pctDesconto) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-zinc-400">
        Os números vêm dos lançamentos <strong>fechados</strong>; o mês em aberto no Cálculo do Mês só entra aqui depois de fechado. A praça exibida é a atual de cada promotor.
      </p>
    </div>
  );
}

function AfastadosHoje({ afastados, nomes }: { afastados: { colaborador_id: string; tipo: keyof typeof TIPO_LABEL; data_inicio: string; data_fim: string }[]; nomes: Map<string, string> }) {
  return (
    <CartaoGrafico titulo="Afastados hoje" subtitulo="Férias, atestados e faltas em vigor">
      {afastados.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-400">Ninguém afastado hoje.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 -my-2">
          {afastados.map((a, i) => (
            <li key={`${a.colaborador_id}-${i}`} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-900 truncate">{nomes.get(a.colaborador_id) ?? '—'}</p>
                <p className="text-[10px] text-zinc-500">até {formatarData(a.data_fim)}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-700 shrink-0">
                <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: COR_TIPO[a.tipo] }} />
                {TIPO_LABEL[a.tipo]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CartaoGrafico>
  );
}
