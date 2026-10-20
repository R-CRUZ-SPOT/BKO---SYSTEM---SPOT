import { supabase } from '@/lib/supabase';
import type { ItemDash, OcorrenciaDash } from '@/lib/ajuda-custo-dashboard';
import {
  type Avulso,
  type RecorrenteInternet,
  mesclarInternetRecorrente,
  type DiaPago,
  type EntradaCalculo,
  type Ocorrencia,
  type ResultadoColaborador,
  type Tarifa,
  type FeriadoCadastrado,
  expandirFeriados,
  calcularCompetencia,
  valorTotalLancar,
  saldoDevedorFinal,
  competenciaPadrao,
  feriadosNacionaisEntre,
  somarMeses,
} from '@/lib/ajuda-custo';

const COLUNAS_DIAS = ['valor_dom', 'valor_seg', 'valor_ter', 'valor_qua', 'valor_qui', 'valor_sex', 'valor_sab'] as const;

export const colunasValor = COLUNAS_DIAS;

export function linhaParaTarifa(row: any): Tarifa {
  return {
    colaborador_id: row.colaborador_id,
    vigencia_inicio: row.vigencia_inicio,
    valores: COLUNAS_DIAS.map((c) => Number(row[c] ?? 0)),
  };
}

/** Busca todas as páginas (o Supabase limita a 1000 linhas por consulta). */
export async function buscarTudo<T>(montar: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const tamanho = 1000;
  const todos: T[] = [];
  for (let from = 0; ; from += tamanho) {
    const { data, error } = await montar(from, from + tamanho - 1);
    if (error) throw error;
    todos.push(...(data ?? []));
    if (!data || data.length < tamanho) break;
  }
  return todos;
}

/** colaborador -> empresa. Se a coluna ainda não existe no banco, devolve vazio (nada quebra). */
export async function carregarEmpresas(): Promise<Map<string, string | null>> {
  const { data, error } = await supabase.from('colaboradores').select('id, empresa').limit(10000);
  if (error) return new Map();
  return new Map((data ?? []).map((c: any) => [c.id as string, (c.empresa ?? null) as string | null]));
}

export interface CarregamentoCalculo {
  entrada: EntradaCalculo;
  lancamento: any | null; // lançamento já fechado desta competência, se houver
  ultimaCompetenciaFechada: string | null;
  /** todas as competências fechadas */
  fechadas: string[];
  /** lançamentos avulsos (Internet, DIF - AJC, Alimentação) desta competência, por colaborador */
  avulsos: Map<string, Avulso>;
  /** true se a tabela de avulsos ainda não existe no banco (script SQL não executado) */
  avulsosIndisponiveis: boolean;
}

const numero = (v: unknown) => Number(v ?? 0);

export function linhaParaAvulso(r: any): Avulso {
  return {
    colaborador_id: r.colaborador_id,
    internet: numero(r.internet),
    dif_ajc: numero(r.dif_ajc),
    alimentacao: numero(r.alimentacao),
    observacao: r.observacao ?? null,
    dif_dias: Array.isArray(r.dif_dias) ? r.dif_dias : [],
  };
}

export async function carregarEntrada(competencia: string): Promise<CarregamentoCalculo> {
  const anterior = somarMeses(competencia, -1);
  const anoBase = Number(competencia.slice(0, 4));

  const [valoresRes, feriadosRes, lancamentosRes] = await Promise.all([
    supabase.from('ajuda_custo_valores').select('*'),
    supabase.from('ajuda_custo_feriados').select('data, descricao, praca_id, recorrente'),
    supabase.from('ajuda_custo_lancamentos').select('id, competencia, fechado_em, fechado_por, observacao').order('competencia', { ascending: false }),
  ]);
  if (valoresRes.error) throw valoresRes.error;
  if (feriadosRes.error) throw feriadosRes.error;
  if (lancamentosRes.error) throw lancamentosRes.error;

  const tarifas = (valoresRes.data ?? []).map(linhaParaTarifa);
  const idsComTarifa = [...new Set(tarifas.map((t) => t.colaborador_id))];

  const feriados = feriadosNacionaisEntre(anoBase - 1, anoBase + 1);
  const cadastrados = (feriadosRes.data ?? []) as FeriadoCadastrado[];
  expandirFeriados(cadastrados.filter((f) => !f.praca_id), [anoBase - 1, anoBase, anoBase + 1]).forEach((desc, data) => feriados.set(data, desc));
  const feriadosRegionais = cadastrados.filter((f) => f.praca_id);

  const pracaPorColaborador = new Map<string, string>();
  const { data: vinculosPraca, error: erroPraca } = await supabase.from('ajuda_custo_promotor_praca').select('colaborador_id, praca_id').limit(10000);
  if (erroPraca) throw erroPraca;
  (vinculosPraca ?? []).forEach((v: any) => pracaPorColaborador.set(v.colaborador_id, v.praca_id));

  const lancamentos = lancamentosRes.data ?? [];
  const lancamento = lancamentos.find((l: any) => l.competencia === competencia) ?? null;
  const ultimaAnterior = lancamentos.find((l: any) => l.competencia < competencia) ?? null;
  // a janela de dias pendentes precisa alcançar a última competência fechada (a cadeia parte dela)
  const janelaInicio = `${[somarMeses(competencia, -3), ultimaAnterior?.competencia].filter(Boolean).sort()[0]}-01`;

  let colaboradores: any[] = [];
  if (idsComTarifa.length > 0) {
    const { data, error } = await supabase
      .from('colaboradores')
      .select('id, nome, matricula, status')
      .in('id', idsComTarifa)
      .eq('status', 'ativo')
      .order('nome');
    if (error) throw error;
    const empresas = await carregarEmpresas();
    colaboradores = (data ?? []).map((c: any) => ({ ...c, empresa: empresas.get(c.id) ?? null }));
  }

  const ocorrencias = await buscarTudo<any>((from, to) =>
    supabase.from('ajuda_custo_ocorrencias').select('*').gte('data_fim', janelaInicio).range(from, to)
  );

  const diasPendentes = await buscarTudo<any>((from, to) =>
    supabase
      .from('ajuda_custo_dias')
      .select('id, colaborador_id, data, valor, valor_ajustado')
      .is('descontado_item_id', null)
      .gte('data', janelaInicio)
      .lt('data', `${competencia}-01`)
      .range(from, to)
  );

  const saldoAnterior = new Map<string, number>();
  if (ultimaAnterior) {
    const { data, error } = await supabase
      .from('ajuda_custo_itens')
      .select('colaborador_id, saldo_devedor')
      .eq('lancamento_id', ultimaAnterior.id);
    if (error) throw error;
    (data ?? []).forEach((i: any) => saldoAnterior.set(i.colaborador_id, Number(i.saldo_devedor)));
  }

  const comLancamentoAnterior = new Set<string>();
  if (ultimaAnterior) {
    const { data, error } = await supabase.from('ajuda_custo_itens').select('colaborador_id').eq('lancamento_id', ultimaAnterior.id);
    if (error) throw error;
    (data ?? []).forEach((i: any) => comLancamentoAnterior.add(i.colaborador_id));
  }

  // acertos imediatos já registrados: valem como valor efetivamente pago no dia
  const valoresAcertados = new Map<string, Map<string, number>>();
  const { data: complementos } = await supabase.from('ajuda_custo_complementos').select('colaborador_id, dias');
  (complementos ?? []).forEach((c: any) => {
    const mapa = valoresAcertados.get(c.colaborador_id) ?? new Map<string, number>();
    (Array.isArray(c.dias) ? c.dias : []).forEach((d: any) => mapa.set(d.data, Number(d.novo)));
    valoresAcertados.set(c.colaborador_id, mapa);
  });

  // dias cuja diferença já foi levada ao DIF - AJC de alguma folha (em qualquer competência)
  const diasComDifAplicada = new Map<string, Set<string>>();
  const { data: difRows } = await supabase.from('ajuda_custo_avulsos').select('colaborador_id, dif_dias').limit(10000);
  (difRows ?? []).forEach((r: any) => {
    const set = diasComDifAplicada.get(r.colaborador_id) ?? new Set<string>();
    (Array.isArray(r.dif_dias) ? r.dif_dias : []).forEach((d: any) => set.add(d.data));
    diasComDifAplicada.set(r.colaborador_id, set);
  });

  const avulsos = new Map<string, Avulso>();
  const { data: avulsosRows, error: erroAvulsos } = await supabase.from('ajuda_custo_avulsos').select('*').eq('competencia', competencia);
  (avulsosRows ?? []).forEach((r: any) => avulsos.set(r.colaborador_id, linhaParaAvulso(r)));

  // Internet recorrente (repete todo mês até ser encerrado); tolerante a tabela ainda inexistente
  const { data: recRows } = await supabase.from('ajuda_custo_recorrentes').select('colaborador_id, valor, inicio, fim').eq('tipo', 'internet');
  const recorrentes: RecorrenteInternet[] = (recRows ?? []).map((r: any) => ({ colaborador_id: r.colaborador_id, valor: Number(r.valor), inicio: r.inicio, fim: r.fim ?? null }));

  return {
    lancamento,
    avulsos: mesclarInternetRecorrente(avulsos, recorrentes, competencia),
    avulsosIndisponiveis: !!erroAvulsos,
    ultimaCompetenciaFechada: lancamentos[0]?.competencia ?? null,
    fechadas: lancamentos.map((l: any) => l.competencia as string),
    entrada: {
      competencia,
      colaboradores,
      tarifas,
      ocorrencias: ocorrencias as Ocorrencia[],
      feriados,
      feriadosRegionais,
      pracaPorColaborador,
      valoresAcertados,
      diasComDifAplicada,
      // valor efetivamente pago: se o dia teve a diferença acertada (DIF - AJC), vale o valor ajustado
      diasPagosPendentes: diasPendentes.map((d: any): DiaPago => ({ id: d.id, colaborador_id: d.colaborador_id, data: d.data, valor: Number(d.valor_ajustado ?? d.valor) })),
      saldoAnterior,
      comLancamentoAnterior,
      ultimaFechada: ultimaAnterior?.competencia ?? null,
      inicioControle: competenciaPadrao(),
    },
  };
}

export async function fecharLancamento(
  competencia: string,
  resultados: ResultadoColaborador[],
  usuario: string | null,
  observacao: string | null,
  avulsos: Map<string, Avulso> = new Map()
) {
  const { data: lanc, error: erroLanc } = await supabase
    .from('ajuda_custo_lancamentos')
    .insert({ competencia, fechado_por: usuario, observacao })
    .select('id')
    .single();
  if (erroLanc) throw erroLanc;

  try {
    const elegiveis = resultados.filter((r) => !r.semTarifa);
    const { data: itens, error: erroItens } = await supabase
      .from('ajuda_custo_itens')
      .insert(
        elegiveis.map((r) => {
          const av = avulsos.get(r.colaborador.id);
          return {
          lancamento_id: lanc.id,
          colaborador_id: r.colaborador.id,
          dias_trabalhados: r.diasTrabalhados,
          bruto: r.bruto,
          descontos: r.totalDescontos,
          saldo_anterior: r.saldoAnterior,
          // valor a lançar = ajuda de custo + Internet + DIF - AJC (alimentação é lançamento à parte)
          valor_pagar: valorTotalLancar(r.valorPagar, av),
          saldo_devedor: saldoDevedorFinal(r.valorPagar, r.saldoDevedor, av),
          internet: av?.internet ?? 0,
          dif_ajc: av?.dif_ajc ?? 0,
          alimentacao: av?.alimentacao ?? 0,
          detalhes: {
            avulsos: av ? { observacao: av.observacao, dif_dias: av.dif_dias, recorrente: !!av.recorrente } : null,
            por_dia_semana: r.porDiaSemana,
            dias_pagos: r.diasPagos.map((d) => ({ data: d.data, valor: d.valor })),
            dias_excluidos: r.dias.filter((d) => !d.pago).map((d) => ({ data: d.data, valor: d.valor, motivo: d.motivo })),
            descontos: r.descontos.map((d) => ({ data: d.data, valor: d.valor, motivo: d.motivo, estimado: d.estimado })),
          },
          };
        })
      )
      .select('id, colaborador_id');
    if (erroItens) throw erroItens;

    const itemPorColab = new Map<string, string>((itens ?? []).map((i: any) => [i.colaborador_id, i.id]));

    // inclui os dias do mês anterior assumidos como pagos (primeiro uso), para que ocorrências que
    // cheguem depois (ex.: atestado de 29 a 31) possam ser descontadas nos próximos lançamentos
    const linhasDias = elegiveis.flatMap((r) => {
      const itemId = itemPorColab.get(r.colaborador.id);
      const acertosPresumidos = new Map((avulsos.get(r.colaborador.id)?.dif_dias ?? []).filter((d) => !d.id).map((d) => [d.data, d.novo]));
      return [...r.diasAnterioresAssumidos, ...r.diasPagos].map((d) => {
        const novo = acertosPresumidos.get(d.data);
        // dia presumido pago cuja diferença foi acertada via DIF - AJC já nasce com o valor ajustado
        return {
          item_id: itemId,
          colaborador_id: r.colaborador.id,
          data: d.data,
          valor: d.valor,
          ...(novo !== undefined && r.diasAnterioresAssumidos.some((a) => a.data === d.data) ? { valor_ajustado: novo, ajustado_item_id: itemId } : {}),
        };
      });
    });
    for (let i = 0; i < linhasDias.length; i += 500) {
      const { error } = await supabase.from('ajuda_custo_dias').insert(linhasDias.slice(i, i + 500));
      if (error) throw error;
    }

    // dias cuja diferença de valor foi acertada via DIF - AJC passam a valer o valor novo (base de descontos futuros)
    for (const r of elegiveis) {
      const itemId = itemPorColab.get(r.colaborador.id);
      for (const d of (avulsos.get(r.colaborador.id)?.dif_dias ?? []).filter((x) => x.id)) {
        const { error } = await supabase.from('ajuda_custo_dias').update({ valor_ajustado: d.novo, ajustado_item_id: itemId }).eq('id', d.id);
        if (error) throw error;
      }
    }

    // marca como descontados os dias pagos antes que foram abatidos agora
    for (const r of elegiveis) {
      const ids = r.descontos.map((d) => d.diaPagoId).filter((x): x is string => !!x);
      if (ids.length === 0) continue;
      const { error } = await supabase.from('ajuda_custo_dias').update({ descontado_item_id: itemPorColab.get(r.colaborador.id) }).in('id', ids);
      if (error) throw error;
    }
  } catch (e) {
    // desfaz: o CASCADE remove itens/dias e o SET NULL libera os dias marcados
    await supabase.from('ajuda_custo_lancamentos').delete().eq('id', lanc.id);
    throw e;
  }
  return lanc.id as string;
}

export async function reabrirLancamento(id: string) {
  // devolve aos dias o valor originalmente pago (o acerto de DIF - AJC feito neste fechamento é desfeito)
  const { data: itens, error: erroItens } = await supabase.from('ajuda_custo_itens').select('id').eq('lancamento_id', id);
  if (erroItens) throw erroItens;
  const ids = (itens ?? []).map((i: any) => i.id as string);
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from('ajuda_custo_dias').update({ valor_ajustado: null }).in('ajustado_item_id', ids.slice(i, i + 100));
    if (error) throw error;
  }
  const { error } = await supabase.from('ajuda_custo_lancamentos').delete().eq('id', id);
  if (error) throw error;
}

async function carregarPreviaDashboard(): Promise<DadosDashboard> {
  const competencia = competenciaPadrao();
  const { entrada, avulsos } = await carregarEntrada(competencia);
  const resultados = calcularCompetencia(entrada).filter((r) => !r.semTarifa);

  const { data: pracasRows } = await supabase.from('ajuda_custo_pracas').select('id, nome');
  const nomePraca = new Map<string, string>((pracasRows ?? []).map((p: any) => [p.id, p.nome]));

  const itens: ItemDash[] = resultados.map((r) => {
    const av = avulsos.get(r.colaborador.id);
    const pracaId = entrada.pracaPorColaborador?.get(r.colaborador.id);
    return {
      competencia,
      colaborador_id: r.colaborador.id,
      nome: r.colaborador.nome,
      matricula: r.colaborador.matricula ?? '',
      praca: (pracaId && nomePraca.get(pracaId)) || null,
      bruto: r.bruto,
      descontos: r.totalDescontos,
      valor_pagar: valorTotalLancar(r.valorPagar, av),
      saldo_devedor: saldoDevedorFinal(r.valorPagar, r.saldoDevedor, av),
      dias_trabalhados: r.diasTrabalhados,
      listaDescontos: r.descontos.map((d) => ({ data: d.data, valor: d.valor, motivo: d.motivo })),
    };
  });

  // ocorrências desde hoje ou desde o início da competência (o que vier antes), para "afastados hoje" e ausências
  const hoje = new Date().toLocaleDateString('sv-SE');
  const inicio = [hoje, `${competencia}-01`].sort()[0];
  const ocorrencias = await buscarTudo<any>((from, to) =>
    supabase.from('ajuda_custo_ocorrencias').select('colaborador_id, tipo, data_inicio, data_fim, colaboradores(nome)').gte('data_fim', inicio).range(from, to)
  );
  const nomes = new Map<string, string>(ocorrencias.map((o: any) => [o.colaborador_id as string, (o.colaboradores?.nome ?? '—') as string]));

  return { itens, ocorrencias: ocorrencias as OcorrenciaDash[], competencias: [competencia], nomes, previa: competencia };
}

export interface DadosDashboard {
  itens: ItemDash[];
  ocorrencias: OcorrenciaDash[];
  competencias: string[]; // em ordem crescente
  nomes: Map<string, string>; // colaborador -> nome (para afastados hoje)
  /** competência da prévia (mês em aberto), quando ainda não existe nenhum mês fechado */
  previa?: string;
}

/** Carrega os últimos `meses` lançamentos fechados e as ocorrências do mesmo intervalo. */
export async function carregarDashboard(meses: number): Promise<DadosDashboard> {
  const { data: lancs, error } = await supabase
    .from('ajuda_custo_lancamentos')
    .select('id, competencia')
    .order('competencia', { ascending: false })
    .limit(meses);
  if (error) throw error;
  const lancamentos = lancs ?? [];
  const competencias = lancamentos.map((l: any) => l.competencia as string).sort();
  const competenciaPorId = new Map(lancamentos.map((l: any) => [l.id as string, l.competencia as string]));

  // sem nenhum mês fechado, o dashboard mostra uma prévia do próximo lançamento (cálculo em aberto)
  if (lancamentos.length === 0) return carregarPreviaDashboard();

  const [itensBrutos, pracasRes, vincRes] = await Promise.all([
    lancamentos.length
      ? buscarTudo<any>((from, to) =>
          supabase
            .from('ajuda_custo_itens')
            .select('lancamento_id, colaborador_id, bruto, descontos, valor_pagar, saldo_devedor, dias_trabalhados, detalhes, colaboradores(nome, matricula)')
            .in('lancamento_id', lancamentos.map((l: any) => l.id))
            .range(from, to)
        )
      : Promise.resolve([] as any[]),
    supabase.from('ajuda_custo_pracas').select('id, nome'),
    supabase.from('ajuda_custo_promotor_praca').select('colaborador_id, praca_id').limit(10000),
  ]);

  const nomePraca = new Map<string, string>((pracasRes.data ?? []).map((p: any) => [p.id, p.nome]));
  const pracaDoColab = new Map<string, string>((vincRes.data ?? []).map((v: any) => [v.colaborador_id, nomePraca.get(v.praca_id) ?? '']));

  const itens: ItemDash[] = itensBrutos.map((i: any) => ({
    competencia: competenciaPorId.get(i.lancamento_id) as string,
    colaborador_id: i.colaborador_id,
    nome: i.colaboradores?.nome ?? '—',
    matricula: i.colaboradores?.matricula ?? '',
    praca: pracaDoColab.get(i.colaborador_id) || null,
    bruto: Number(i.bruto),
    descontos: Number(i.descontos),
    valor_pagar: Number(i.valor_pagar),
    saldo_devedor: Number(i.saldo_devedor),
    dias_trabalhados: i.dias_trabalhados,
    listaDescontos: (i.detalhes?.descontos ?? []).map((d: any) => ({ data: d.data, valor: Number(d.valor), motivo: String(d.motivo ?? '') })),
  }));

  // ocorrências do intervalo dos lançamentos até hoje (para "afastados hoje" sempre há dados)
  const inicio = competencias[0] ? `${competencias[0]}-01` : new Date().toLocaleDateString('sv-SE');
  const ocorrencias = await buscarTudo<any>((from, to) =>
    supabase.from('ajuda_custo_ocorrencias').select('colaborador_id, tipo, data_inicio, data_fim, colaboradores(nome)').gte('data_fim', inicio).range(from, to)
  );
  const nomes = new Map<string, string>(ocorrencias.map((o: any) => [o.colaborador_id as string, (o.colaboradores?.nome ?? '—') as string]));

  return { itens, ocorrencias: ocorrencias as OcorrenciaDash[], competencias, nomes };
}
