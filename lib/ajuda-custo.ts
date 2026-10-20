// Motor de cálculo da Ajuda de Custo (vale-transporte dos promotores).
//
// Regras (ver DOCUMENTATION.md > Ajuda de Custo):
//  - O lançamento é feito por competência (mês seguinte ao mês corrente, ~dia 28).
//  - Bruto = soma, para cada dia da competência, do valor do dia da semana do promotor,
//    ignorando feriados e dias cobertos por ocorrência (férias, atestado, falta, feriado local).
//  - Descontos = dias que JÁ FORAM PAGOS em lançamentos anteriores (snapshot guardado em
//    ajuda_custo_dias) e que agora estão cobertos por uma ocorrência/feriado.
//  - Se descontos > bruto, paga 0 e o excedente vira saldo devedor, abatido no lançamento seguinte.
//
// Este arquivo é puro (sem React/Supabase) para poder ser testado isoladamente.
// Datas sempre como string 'YYYY-MM-DD' e competências como 'YYYY-MM'.

export type TipoOcorrencia = 'ferias' | 'atestado' | 'falta' | 'feriado_local';

export const TIPO_LABEL: Record<TipoOcorrencia, string> = {
  ferias: 'Férias',
  atestado: 'Atestado',
  falta: 'Falta',
  feriado_local: 'Feriado local',
};

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export interface Ocorrencia {
  id?: string;
  colaborador_id: string;
  tipo: TipoOcorrencia;
  data_inicio: string;
  data_fim: string;
  observacao?: string | null;
}

/** valores[0] = domingo ... valores[6] = sábado (mesmo índice de Date.getUTCDay) */
export interface Tarifa {
  colaborador_id: string;
  vigencia_inicio: string;
  valores: number[];
}

export interface DiaPago {
  id?: string;
  colaborador_id: string;
  data: string;
  valor: number;
}

export interface ColaboradorCalc {
  id: string;
  nome: string;
  matricula?: string | null;
  /** tipo de contratação (coluna EMPRESA da planilha); TMP = temporário */
  empresa?: string | null;
}

/** Feriado cadastrado pelo usuário. praca_id nulo = vale para todos. recorrente = repete todo ano (a partir do ano de `data`). */
export interface FeriadoCadastrado {
  data: string;
  descricao: string;
  praca_id: string | null;
  recorrente: boolean;
}

export interface EntradaCalculo {
  competencia: string;
  colaboradores: ColaboradorCalc[];
  tarifas: Tarifa[];
  ocorrencias: Ocorrencia[];
  /** data -> descrição. Feriados que valem para todos (nacionais + cadastrados). */
  feriados: Map<string, string>;
  /** Feriados de praça (cidade/estado): valem só para os promotores daquela praça. */
  feriadosRegionais?: FeriadoCadastrado[];
  /** colaborador -> praça */
  pracaPorColaborador?: Map<string, string>;
  /** Dias pagos em lançamentos fechados que ainda não foram descontados. */
  diasPagosPendentes: DiaPago[];
  /** Saldo devedor remanescente do último lançamento fechado, por colaborador. */
  saldoAnterior: Map<string, number>;
  /** Colaboradores que têm lançamento fechado na competência anterior (senão estimamos). */
  comLancamentoAnterior: Set<string>;
  /**
   * Última competência fechada anterior a esta (null = nenhuma). Quando informada, meses abertos entre ela e
   * a competência são calculados em cadeia (prévia), em vez de assumidos como pagos.
   * Se omitida, não há cadeia (comportamento simples).
   */
  ultimaFechada?: string | null;
  /**
   * Valor efetivamente pago por dia após acertos imediatos (complementos): colaborador -> data -> valor.
   * Quando existe, substitui o valor pago original (para descontos e novos acertos).
   */
  valoresAcertados?: Map<string, Map<string, number>>;
  /** Dias cuja diferença já foi levada ao DIF - AJC de algum lançamento (colaborador -> datas): não geram acerto imediato. */
  diasComDifAplicada?: Map<string, Set<string>>;
  /** Primeira competência que o sistema controla, quando ainda não há nenhuma fechada. */
  inicioControle?: string;
}

export interface DiaCalculado {
  data: string;
  valor: number;
  pago: boolean;
  motivo?: string;
}

export interface Desconto {
  data: string;
  valor: number;
  motivo: string;
  /** true quando o dia pago foi estimado por não existir lançamento anterior no sistema */
  estimado: boolean;
  /** id do registro em ajuda_custo_dias, quando existe */
  diaPagoId?: string;
}

/** Lançamento avulso manual de um promotor em uma competência. DIF - AJC pode ser negativo. */
export interface Avulso {
  colaborador_id: string;
  internet: number;
  dif_ajc: number;
  /** Lançamento à parte: NÃO entra no valor a lançar da ajuda de custo. */
  alimentacao: number;
  observacao: string | null;
  /** Dias já pagos cuja diferença de valor foi acertada via DIF - AJC (marcados ao fechar). */
  dif_dias: { id?: string; data: string; pago: number; novo: number }[];
}

/** Valor a lançar = ajuda de custo calculada + Internet + DIF - AJC (nunca negativo). Alimentação fica de fora. */
export function valorTotalLancar(valorAjuda: number, av?: Pick<Avulso, 'internet' | 'dif_ajc'> | null): number {
  return Math.max(0, r2(valorAjuda + (av?.internet ?? 0) + (av?.dif_ajc ?? 0)));
}

/**
 * Saldo devedor a levar para o próximo mês: o do cálculo mais o que sobrar de um DIF - AJC negativo (redução de
 * valor) que a ajuda de custo do mês não cobre. Sem isso o excedente seria perdido.
 */
export function saldoDevedorFinal(valorAjuda: number, saldoDevedor: number, av?: Pick<Avulso, 'internet' | 'dif_ajc'> | null): number {
  const sobra = r2(valorAjuda + (av?.internet ?? 0) + (av?.dif_ajc ?? 0));
  return r2(saldoDevedor + Math.max(0, -sobra));
}

export interface PorDiaSemana {
  dow: number;
  quantidade: number;
  subtotal: number;
}

export interface ResultadoColaborador {
  colaborador: ColaboradorCalc;
  semTarifa: boolean;
  dias: DiaCalculado[];
  diasPagos: DiaPago[];
  /** Dias do mês anterior assumidos como pagos (primeiro uso) e não descontados: viram base para descontos futuros. */
  diasAnterioresAssumidos: DiaPago[];
  porDiaSemana: PorDiaSemana[];
  bruto: number;
  diasTrabalhados: number;
  descontos: Desconto[];
  totalDescontos: number;
  saldoAnterior: number;
  liquido: number;
  valorPagar: number;
  saldoDevedor: number;
}

// ---------- datas ----------

/** Promotor temporário: EMPRESA = TMP. */
export const ehTemporario = (empresa?: string | null) => /^\s*TMP\b/i.test(empresa ?? '');

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const toISO = (d: Date) => d.toISOString().slice(0, 10);

export const diaSemana = (iso: string) => toDate(iso).getUTCDay();

export function diasDoMes(competencia: string): string[] {
  const [y, m] = competencia.split('-').map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: total }, (_, i) => `${competencia}-${String(i + 1).padStart(2, '0')}`);
}

export function somarMeses(competencia: string, n: number): string {
  const [y, m] = competencia.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return toISO(d).slice(0, 7);
}

/** Competência padrão: mês seguinte ao de hoje (o lançamento é feito no fim do mês corrente). */
export function competenciaPadrao(hoje = new Date()): string {
  const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  return somarMeses(atual, 1);
}

export function nomeCompetencia(competencia: string): string {
  const [y, m] = competencia.split('-').map(Number);
  const nome = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${y}`;
}

export function formatarData(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ---------- feriados nacionais ----------

function pascoa(ano: number): Date {
  // Algoritmo de Meeus/Jones/Butcher
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Feriados nacionais (Carnaval e Corpus Christi são ponto facultativo e NÃO entram). */
export function feriadosNacionais(ano: number): Map<string, string> {
  const mapa = new Map<string, string>();
  const fixos: [string, string][] = [
    ['01-01', 'Confraternização Universal'],
    ['04-21', 'Tiradentes'],
    ['05-01', 'Dia do Trabalho'],
    ['09-07', 'Independência'],
    ['10-12', 'Nossa Senhora Aparecida'],
    ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'],
    ['12-25', 'Natal'],
  ];
  fixos.forEach(([md, nome]) => mapa.set(`${ano}-${md}`, nome));
  if (ano >= 2024) mapa.set(`${ano}-11-20`, 'Consciência Negra');
  const sexta = pascoa(ano);
  sexta.setUTCDate(sexta.getUTCDate() - 2);
  mapa.set(toISO(sexta), 'Sexta-feira Santa');
  return mapa;
}

export function feriadosNacionaisEntre(anoInicio: number, anoFim: number): Map<string, string> {
  const todos = new Map<string, string>();
  for (let a = anoInicio; a <= anoFim; a++) feriadosNacionais(a).forEach((v, k) => todos.set(k, v));
  return todos;
}

/** Datas efetivas dos feriados cadastrados nos anos pedidos (aplica a recorrência). */
export function expandirFeriados(lista: FeriadoCadastrado[], anos: number[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const f of lista) {
    const anoInicial = Number(f.data.slice(0, 4));
    const mesDia = f.data.slice(5);
    if (f.recorrente) {
      for (const ano of anos) {
        if (ano < anoInicial) continue;
        const iso = `${ano}-${mesDia}`;
        if (toISO(toDate(iso)) === iso) mapa.set(iso, f.descricao); // descarta 29/02 em ano não bissexto
      }
    } else if (anos.includes(anoInicial)) {
      mapa.set(f.data, f.descricao);
    }
  }
  return mapa;
}

function feriadosDoColaborador(colaboradorId: string, entrada: EntradaCalculo): Map<string, string> {
  const praca = entrada.pracaPorColaborador?.get(colaboradorId);
  const regionais = (entrada.feriadosRegionais ?? []).filter((f) => f.praca_id && f.praca_id === praca);
  if (regionais.length === 0) return entrada.feriados;
  const ano = Number(entrada.competencia.slice(0, 4));
  const mapa = new Map(entrada.feriados);
  expandirFeriados(regionais, [ano - 1, ano, ano + 1]).forEach((desc, data) => mapa.set(data, desc));
  return mapa;
}

// ---------- cálculo ----------

function tarifaVigente(tarifas: Tarifa[], data: string): Tarifa | undefined {
  let escolhida: Tarifa | undefined;
  for (const t of tarifas) {
    if (t.vigencia_inicio <= data && (!escolhida || t.vigencia_inicio > escolhida.vigencia_inicio)) {
      escolhida = t;
    }
  }
  return escolhida;
}

function ocorrenciaNoDia(ocorrencias: Ocorrencia[], data: string): Ocorrencia | undefined {
  // Prioridade: férias > atestado > falta > feriado local
  const prioridade: TipoOcorrencia[] = ['ferias', 'atestado', 'falta', 'feriado_local'];
  const doDia = ocorrencias.filter((o) => o.data_inicio <= data && data <= o.data_fim);
  for (const tipo of prioridade) {
    const achada = doDia.find((o) => o.tipo === tipo);
    if (achada) return achada;
  }
  return undefined;
}

/** Motivo pelo qual o dia NÃO é trabalhado/pago, ou undefined se é um dia normal. */
function motivoDeExclusao(data: string, ocorrencias: Ocorrencia[], feriados: Map<string, string>): string | undefined {
  const oc = ocorrenciaNoDia(ocorrencias, data);
  if (oc) return TIPO_LABEL[oc.tipo];
  const fer = feriados.get(data);
  if (fer) return `Feriado: ${fer}`;
  return undefined;
}

/**
 * Tarifa que se presume ter sido usada para pagar o mês (quando o pagamento não está registrado no sistema):
 * a vigente no 1º dia do mês, pois o lançamento é feito antes do mês começar. Se o valor só passa a vigorar
 * depois (cadastro feito no mês anterior), usa a tarifa mais antiga. Mudanças de valor ocorridas ao longo do
 * mês ficam de fora do que foi pago e aparecem como diferença.
 */
function tarifaPagaNoMes(tarifas: Tarifa[], mes: string): Tarifa | undefined {
  const maisAntiga = [...tarifas].sort((a, b) => a.vigencia_inicio.localeCompare(b.vigencia_inicio))[0];
  return tarifaVigente(tarifas, `${mes}-01`) ?? maisAntiga;
}

/** Valor efetivamente pago no dia: o acertado por complemento, se houver, senão o valor original. */
function valorEfetivo(entrada: EntradaCalculo, colaboradorId: string, data: string, valor: number): number {
  return entrada.valoresAcertados?.get(colaboradorId)?.get(data) ?? valor;
}

export function calcularColaborador(
  colab: ColaboradorCalc,
  entrada: EntradaCalculo
): ResultadoColaborador {
  const { competencia } = entrada;
  const feriados = feriadosDoColaborador(colab.id, entrada);
  const tarifas = entrada.tarifas.filter((t) => t.colaborador_id === colab.id);
  const ocorrencias = entrada.ocorrencias.filter((o) => o.colaborador_id === colab.id);

  // 1) Bruto da competência
  const dias: DiaCalculado[] = [];
  const diasPagos: DiaPago[] = [];
  const porDow = new Map<number, PorDiaSemana>();

  for (const data of diasDoMes(competencia)) {
    const t = tarifaVigente(tarifas, data);
    const valor = t ? t.valores[diaSemana(data)] || 0 : 0;
    if (valor <= 0) continue;
    const motivo = motivoDeExclusao(data, ocorrencias, feriados);
    dias.push({ data, valor, pago: !motivo, motivo });
    if (!motivo) {
      diasPagos.push({ colaborador_id: colab.id, data, valor });
      const dow = diaSemana(data);
      const acc = porDow.get(dow) ?? { dow, quantidade: 0, subtotal: 0 };
      acc.quantidade += 1;
      acc.subtotal = r2(acc.subtotal + valor);
      porDow.set(dow, acc);
    }
  }
  const bruto = r2(diasPagos.reduce((s, d) => s + d.valor, 0));

  // 2) Descontos sobre dias já pagos anteriormente
  const inicioCompetencia = `${competencia}-01`;
  const descontos: Desconto[] = [];
  const diasAnterioresAssumidos: DiaPago[] = [];

  for (const pago of entrada.diasPagosPendentes) {
    if (pago.colaborador_id !== colab.id || pago.data >= inicioCompetencia) continue;
    const motivo = motivoDeExclusao(pago.data, ocorrencias, feriados);
    if (motivo) {
      descontos.push({ data: pago.data, valor: valorEfetivo(entrada, colab.id, pago.data, pago.valor), motivo, estimado: false, diaPagoId: pago.id });
    }
  }

  // Sem lançamento anterior no sistema: estima o que foi pago no mês anterior
  // (todos os dias com valor, exceto os que o calendário já permitia saber que não seriam pagos).
  if (!entrada.comLancamentoAnterior.has(colab.id)) {
    const anterior = somarMeses(competencia, -1);
    const pagoPresumido = tarifaPagaNoMes(tarifas, anterior);
    for (const data of diasDoMes(anterior)) {
      const valorBase = pagoPresumido ? pagoPresumido.valores[diaSemana(data)] || 0 : 0;
      if (valorBase <= 0) continue;
      const valor = valorEfetivo(entrada, colab.id, data, valorBase);
      // feriado do calendário (nacional/cadastrado): assumimos que já era conhecido e não foi pago
      if (feriados.has(data)) continue;
      const oc = ocorrenciaNoDia(ocorrencias, data);
      if (oc?.tipo === 'ferias') continue; // férias são planejadas: assumimos que não foi pago
      if (!oc) {
        // assumido como pago e sem ocorrência por enquanto: se uma ocorrência chegar depois, será descontada
        diasAnterioresAssumidos.push({ colaborador_id: colab.id, data, valor });
        continue;
      }
      descontos.push({ data, valor, motivo: `${TIPO_LABEL[oc.tipo]} (estimado)`, estimado: true });
    }
  }

  descontos.sort((a, b) => a.data.localeCompare(b.data));
  const totalDescontos = r2(descontos.reduce((s, d) => s + d.valor, 0));

  // 3) Saldo devedor anterior e resultado final
  const saldoAnterior = r2(entrada.saldoAnterior.get(colab.id) ?? 0);
  const liquido = r2(bruto - totalDescontos - saldoAnterior);

  return {
    colaborador: colab,
    semTarifa: tarifas.length === 0,
    dias,
    diasPagos,
    diasAnterioresAssumidos,
    porDiaSemana: [...porDow.values()].sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7)),
    bruto,
    diasTrabalhados: diasPagos.length,
    descontos,
    totalDescontos,
    saldoAnterior,
    liquido,
    valorPagar: Math.max(0, liquido),
    saldoDevedor: Math.max(0, r2(-liquido)),
  };
}

export interface DiferencaDia {
  diaPagoId?: string;
  /** true quando o dia pago foi presumido (mês anterior não fechado no sistema) */
  estimado?: boolean;
  data: string;
  pago: number;
  novo: number;
  diferenca: number;
}

/**
 * Dias já pagos (e ainda não descontados) cujo valor diário mudou depois do pagamento: compara o valor
 * efetivamente pago com o valor vigente hoje para aquele dia. Dias que viram desconto (falta, atestado,
 * feriado...) não entram: ali o que vale é o desconto do valor pago.
 */
export function diferencasDeValor(colab: ColaboradorCalc, entrada: EntradaCalculo): DiferencaDia[] {
  const tarifas = entrada.tarifas.filter((t) => t.colaborador_id === colab.id);
  const ocorrencias = entrada.ocorrencias.filter((o) => o.colaborador_id === colab.id);
  const feriados = feriadosDoColaborador(colab.id, entrada);
  const inicio = `${entrada.competencia}-01`;
  const lista: DiferencaDia[] = [];
  for (const pago of entrada.diasPagosPendentes) {
    if (pago.colaborador_id !== colab.id || pago.data >= inicio) continue;
    if (motivoDeExclusao(pago.data, ocorrencias, feriados)) continue;
    const t = tarifaVigente(tarifas, pago.data);
    if (!t) continue;
    const novo = t.valores[diaSemana(pago.data)] || 0;
    const pagoEfetivo = valorEfetivo(entrada, colab.id, pago.data, pago.valor);
    const diferenca = r2(novo - pagoEfetivo);
    if (Math.abs(diferenca) < 0.01) continue;
    lista.push({ diaPagoId: pago.id, data: pago.data, pago: pagoEfetivo, novo, diferenca });
  }

  // Mês anterior não registrado no sistema (primeiro uso): o valor pago é presumido pelas tarifas
  // vigentes no 1º dia do mês; a diferença aparece nos dias em que uma nova vigência já estava valendo.
  if (!entrada.comLancamentoAnterior.has(colab.id) && !inicioDaCadeia(entrada)) {
    const anterior = somarMeses(entrada.competencia, -1);
    const pagoPresumido = tarifaPagaNoMes(tarifas, anterior);
    for (const data of diasDoMes(anterior)) {
      const pagoBase = pagoPresumido ? pagoPresumido.valores[diaSemana(data)] || 0 : 0;
      const vigente = tarifaVigente(tarifas, data);
      if (pagoBase <= 0 || !vigente) continue;
      const pago = valorEfetivo(entrada, colab.id, data, pagoBase);
      if (feriados.has(data) || ocorrenciaNoDia(ocorrencias, data)) continue; // não foi pago / vira desconto
      const novo = vigente.valores[diaSemana(data)] || 0;
      const diferenca = r2(novo - pago);
      if (Math.abs(diferenca) < 0.01) continue;
      lista.push({ data, pago, novo, diferenca, estimado: true });
    }
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Diferença de valor dos dias de um mês, para pagamento imediato (acerto/complemento): para cada dia com valor
 * novo vigente, compara com o valor já pago. O valor pago vem, em ordem: do acerto anterior, do dia pago em
 * lançamento fechado ou, se o mês não está registrado no sistema, do presumido (tarifa vigente no 1º dia do mês).
 * Inclui dias futuros do mês (o promotor vai trabalhá-los com o novo valor). Dias com feriado, férias, atestado
 * ou falta ficam de fora. `entrada` deve ter sido carregada com competência = mês seguinte a `mes`.
 */
export function diferencasNoMes(colab: ColaboradorCalc, entrada: EntradaCalculo, mes: string): DiferencaDia[] {
  const tarifas = entrada.tarifas.filter((t) => t.colaborador_id === colab.id);
  const ocorrencias = entrada.ocorrencias.filter((o) => o.colaborador_id === colab.id);
  const feriados = feriadosDoColaborador(colab.id, entrada);
  const pagosDoMes = new Map(
    entrada.diasPagosPendentes.filter((d) => d.colaborador_id === colab.id && d.data.startsWith(mes)).map((d) => [d.data, d])
  );
  const mesRegistrado = pagosDoMes.size > 0;
  const presumido = tarifaPagaNoMes(tarifas, mes);
  const lista: DiferencaDia[] = [];

  for (const data of diasDoMes(mes)) {
    const vigente = tarifaVigente(tarifas, data);
    if (!vigente) continue;
    if (motivoDeExclusao(data, ocorrencias, feriados)) continue;
    if (entrada.diasComDifAplicada?.get(colab.id)?.has(data)) continue; // já será acertado na folha (DIF - AJC)
    const novo = vigente.valores[diaSemana(data)] || 0;
    const registrado = pagosDoMes.get(data);
    if (mesRegistrado && !registrado && !entrada.valoresAcertados?.get(colab.id)?.has(data)) continue; // dia não pago no lançamento
    const base = registrado ? registrado.valor : presumido ? presumido.valores[diaSemana(data)] || 0 : 0;
    const pago = valorEfetivo(entrada, colab.id, data, base);
    const diferenca = r2(novo - pago);
    if (Math.abs(diferenca) < 0.01) continue;
    lista.push({ diaPagoId: registrado?.id, data, pago, novo, diferenca, estimado: !registrado });
  }
  return lista;
}

/** Primeira competência da cadeia de cálculo, ou null se a competência pode ser calculada direto. */
function inicioDaCadeia(entrada: EntradaCalculo): string | null {
  if (entrada.ultimaFechada === undefined) return null;
  const inicio = entrada.ultimaFechada ? somarMeses(entrada.ultimaFechada, 1) : entrada.inicioControle;
  return inicio && inicio < entrada.competencia ? inicio : null;
}

/**
 * Calcula os meses abertos em sequência (prévia), propagando dias pagos, descontos e saldo devedor de um mês
 * para o seguinte, como aconteceria se cada mês fosse fechado em ordem.
 */
function calcularEncadeado(colab: ColaboradorCalc, entrada: EntradaCalculo, inicio: string): ResultadoColaborador {
  let pendentes = entrada.diasPagosPendentes.filter((d) => d.colaborador_id === colab.id);
  let saldo = entrada.saldoAnterior.get(colab.id) ?? 0;
  let temAnterior = entrada.comLancamentoAnterior.has(colab.id);

  for (let competencia = inicio; ; competencia = somarMeses(competencia, 1)) {
    const resultado = calcularColaborador(colab, {
      ...entrada,
      competencia,
      colaboradores: [colab],
      diasPagosPendentes: pendentes,
      saldoAnterior: new Map([[colab.id, saldo]]),
      comLancamentoAnterior: new Set(temAnterior ? [colab.id] : []),
    });
    if (competencia === entrada.competencia) return resultado;

    const descontadas = new Set(resultado.descontos.filter((d) => !d.estimado).map((d) => d.data));
    pendentes = [
      ...pendentes.filter((p) => !descontadas.has(p.data)),
      ...resultado.diasAnterioresAssumidos,
      ...resultado.diasPagos,
    ];
    saldo = resultado.saldoDevedor;
    temAnterior = true;
  }
}

export function calcularCompetencia(entrada: EntradaCalculo): ResultadoColaborador[] {
  const inicio = inicioDaCadeia(entrada);
  return entrada.colaboradores.map((c) => (inicio ? calcularEncadeado(c, entrada, inicio) : calcularColaborador(c, entrada)));
}

export type SituacaoFechamento = { ok: true } | { ok: false; motivo: string };

/** Só é possível fechar a competência seguinte à última fechada (ou, se nada foi fechado, a primeira do controle). */
export function verificarFechamento(competencia: string, fechadas: string[], inicioControle: string): SituacaoFechamento {
  if (fechadas.some((f) => f > competencia)) {
    return { ok: false, motivo: 'Já existem meses posteriores fechados. Reabra-os (do mais recente para o mais antigo) antes de fechar este.' };
  }
  const ultima = fechadas.filter((f) => f < competencia).sort().pop();
  const esperada = ultima ? somarMeses(ultima, 1) : inicioControle;
  if (competencia > esperada) return { ok: false, motivo: `Feche ${nomeCompetencia(esperada)} antes de fechar este mês.` };
  return { ok: true };
}

export const moeda = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
