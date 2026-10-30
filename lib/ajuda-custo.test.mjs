// Rodar com: node --test lib/ajuda-custo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { somarDias, mesclarInternetRecorrente, ehTemporario, calcularColaborador, descontosPosFechamento, calcularCompetencia, diferencasDeValor, diferencasNoMes, saldoDevedorFinal, valorTotalLancar, verificarFechamento, expandirFeriados, feriadosNacionaisEntre, diasDoMes, competenciaPadrao } from './ajuda-custo.ts';

const feriados = feriadosNacionaisEntre(2026, 2026);
// seg 15, ter 20, qua-sex 10, sáb/dom 0   (índice 0 = domingo)
const tarifa = { colaborador_id: 'p1', vigencia_inicio: '2026-01-01', valores: [0, 15, 20, 10, 10, 10, 0] };
const colab = { id: 'p1', nome: 'Promotor Teste' };

const base = (extra = {}) => ({
  competencia: '2026-11',
  colaboradores: [colab],
  tarifas: [tarifa],
  ocorrencias: [],
  feriados,
  diasPagosPendentes: [],
  saldoAnterior: new Map(),
  comLancamentoAnterior: new Set(['p1']),
  ...extra,
});

test('competência padrão é o mês seguinte', () => {
  assert.equal(competenciaPadrao(new Date(2026, 9, 28)), '2026-11');
  assert.equal(competenciaPadrao(new Date(2026, 11, 28)), '2027-01');
});

test('bruto = valor do dia × quantidade de cada dia da semana, sem feriados', () => {
  // Nov/2026: seg 2(Finados),9,16,23,30 | ter 3,10,17,24 | qua 4,11,18,25 | qui 5,12,19,26 | sex 6,13,20(Consc.Negra),27
  const r = calcularColaborador(colab, base());
  assert.equal(r.bruto, 4 * 15 + 4 * 20 + 4 * 10 + 4 * 10 + 3 * 10); // 250
  assert.equal(r.diasTrabalhados, 19);
  assert.equal(r.valorPagar, 250);
});

test('férias no meio do mês retiram só os dias de férias; retorno conta só os dias trabalhados', () => {
  const ferias = { colaborador_id: 'p1', tipo: 'ferias', data_inicio: '2026-11-10', data_fim: '2026-12-09' };
  const nov = calcularColaborador(colab, base({ ocorrencias: [ferias] }));
  // sobra: seg 9; ter 3; qua 4; qui 5; sex 6 -> 15+20+10+10+10
  assert.equal(nov.bruto, 65);
  const dez = calcularColaborador(colab, base({ competencia: '2026-12', ocorrencias: [ferias], comLancamentoAnterior: new Set(['p1']) }));
  // Dez: só a partir do dia 10 (qua). dias úteis de 10 a 31 sem 25/12
  const esperado = diasDoMes('2026-12').filter((d) => d >= '2026-12-10' && d !== '2026-12-25')
    .reduce((s, d) => s + tarifa.valores[new Date(d + 'T00:00:00Z').getUTCDay()], 0);
  assert.equal(dez.bruto, esperado);
});

test('atestado/falta no mês corrente desconta dias que já foram pagos', () => {
  const pagos = [
    { id: 'a', colaborador_id: 'p1', data: '2026-10-19', valor: 15 }, // seg
    { id: 'b', colaborador_id: 'p1', data: '2026-10-20', valor: 20 }, // ter
    { id: 'c', colaborador_id: 'p1', data: '2026-10-21', valor: 10 }, // qua
  ];
  const ocorrencias = [
    { colaborador_id: 'p1', tipo: 'atestado', data_inicio: '2026-10-19', data_fim: '2026-10-20' },
    { colaborador_id: 'p1', tipo: 'falta', data_inicio: '2026-10-21', data_fim: '2026-10-21' },
  ];
  const r = calcularColaborador(colab, base({ diasPagosPendentes: pagos, ocorrencias }));
  assert.equal(r.totalDescontos, 45);
  assert.equal(r.valorPagar, 250 - 45);
});

test('dia pago em que NÃO havia valor/ocorrência não é descontado; feriado local descontado', () => {
  const pagos = [
    { id: 'a', colaborador_id: 'p1', data: '2026-10-22', valor: 10 },
    { id: 'b', colaborador_id: 'p1', data: '2026-10-23', valor: 10 },
  ];
  const ocorrencias = [{ colaborador_id: 'p1', tipo: 'feriado_local', data_inicio: '2026-10-23', data_fim: '2026-10-23' }];
  const r = calcularColaborador(colab, base({ diasPagosPendentes: pagos, ocorrencias }));
  assert.deepEqual(r.descontos.map((d) => d.data), ['2026-10-23']);
});

test('atestado longo: sem saldo no mês de retorno vira saldo devedor, abatido no seguinte', () => {
  // atestado de 20/10 a 30/11 -> novembro inteiro sem pagar, outubro (20-30) já pago
  const outubroPago = diasDoMes('2026-10')
    .filter((d) => d >= '2026-10-20')
    .map((d) => ({ colaborador_id: 'p1', data: d, valor: tarifa.valores[new Date(d + 'T00:00:00Z').getUTCDay()] }))
    .filter((d) => d.valor > 0);
  const atestado = { colaborador_id: 'p1', tipo: 'atestado', data_inicio: '2026-10-20', data_fim: '2026-11-30' };

  const nov = calcularColaborador(colab, base({ diasPagosPendentes: outubroPago, ocorrencias: [atestado] }));
  assert.equal(nov.bruto, 0);
  assert.equal(nov.valorPagar, 0);
  assert.ok(nov.saldoDevedor > 0);
  assert.equal(nov.saldoDevedor, nov.totalDescontos);

  // Dezembro: saldo devedor abatido do bruto
  const dez = calcularColaborador(colab, base({
    competencia: '2026-12',
    ocorrencias: [atestado],
    saldoAnterior: new Map([['p1', nov.saldoDevedor]]),
  }));
  assert.equal(dez.valorPagar, Math.max(0, dez.bruto - nov.saldoDevedor));
});

test('primeiro uso (sem lançamento anterior): estima mês anterior pago, exceto férias/feriados do calendário', () => {
  const ocorrencias = [
    { colaborador_id: 'p1', tipo: 'atestado', data_inicio: '2026-10-26', data_fim: '2026-10-27' }, // seg+ter
    { colaborador_id: 'p1', tipo: 'ferias', data_inicio: '2026-10-28', data_fim: '2026-10-30' },
  ];
  const r = calcularColaborador(colab, base({ ocorrencias, comLancamentoAnterior: new Set() }));
  assert.equal(r.totalDescontos, 35);
  assert.ok(r.descontos.every((d) => d.estimado));
});

test('mudança de valor por vigência', () => {
  const nova = { colaborador_id: 'p1', vigencia_inicio: '2026-11-16', valores: [0, 30, 30, 30, 30, 30, 0] };
  const r = calcularColaborador(colab, base({ tarifas: [tarifa, nova] }));
  // até 15/11: seg 9 (15), ter 3,10 (40), qua 4,11 (20), qui 5,12 (20), sex 6,13 (20) = 115
  // a partir de 16/11: seg 16,23,30 + ter 17,24 + qua 18,25 + qui 19,26 + sex 27 = 10 dias × 30 = 300
  assert.equal(r.bruto, 415);
});

test('sem tarifa cadastrada', () => {
  const r = calcularColaborador(colab, base({ tarifas: [] }));
  assert.equal(r.semTarifa, true);
  assert.equal(r.valorPagar, 0);
});

test('desconto estimado funciona mesmo quando a vigência do valor começa só na competência (cadastro feito no mês anterior)', () => {
  // Promotor cadastrado com vigência 01/11, mas ocorrências de outubro já existem
  const novaTarifa = { ...tarifa, vigencia_inicio: '2026-11-01' };
  const ocorrencias = [
    { colaborador_id: 'p1', tipo: 'atestado', data_inicio: '2026-10-06', data_fim: '2026-10-08' }, // ter, qua, qui
    { colaborador_id: 'p1', tipo: 'falta', data_inicio: '2026-10-09', data_fim: '2026-10-09' }, // sex
  ];
  const r = calcularColaborador(colab, base({ tarifas: [novaTarifa], ocorrencias, comLancamentoAnterior: new Set() }));
  assert.equal(r.totalDescontos, 20 + 10 + 10 + 10);
});

test('atestado que chega depois do fechamento (29 a 31) é descontado no lançamento seguinte', () => {
  // Fechamento de novembro feito em 28/10, sem lançamento de outubro no sistema (primeiro uso)
  const fechamento = calcularColaborador(colab, base({ comLancamentoAnterior: new Set() }));
  const assumidos = fechamento.diasAnterioresAssumidos;
  assert.ok(assumidos.some((d) => d.data === '2026-10-29'));
  assert.ok(assumidos.some((d) => d.data === '2026-10-30'));

  // Depois chega o atestado de 29 a 31/10. Calculando dezembro, os dias pendentes incluem o snapshot de outubro
  const atestado = { colaborador_id: 'p1', tipo: 'atestado', data_inicio: '2026-10-29', data_fim: '2026-10-31' };
  const pendentes = [...assumidos, ...fechamento.diasPagos].map((d, i) => ({ ...d, id: String(i) }));
  const dez = calcularColaborador(colab, base({ competencia: '2026-12', ocorrencias: [atestado], diasPagosPendentes: pendentes }));
  // 29/10 (qui) 10 + 30/10 (sex) 10 ; 31/10 é sábado sem valor
  assert.equal(dez.totalDescontos, 20);
  assert.deepEqual(dez.descontos.map((x) => x.data), ['2026-10-29', '2026-10-30']);
});

test('feriado de praça recorrente: vale só para a praça e se repete nos anos seguintes', () => {
  // 02/07/2026 é quinta, 02/07/2027 é sexta; ambos com valor 10
  const julho = { data: '2026-07-02', descricao: 'Independência da Bahia', praca_id: 'ba', recorrente: true };
  const outro = { id: 'p2', nome: 'Outro (SP)' };
  const entrada = (comp, extra = {}) => base({
    competencia: comp,
    colaboradores: [colab, outro],
    tarifas: [tarifa, { ...tarifa, colaborador_id: 'p2' }],
    feriadosRegionais: [julho],
    pracaPorColaborador: new Map([['p1', 'ba'], ['p2', 'sp']]),
    comLancamentoAnterior: new Set(['p1', 'p2']),
    ...extra,
  });

  for (const comp of ['2026-07', '2027-07']) {
    const ba = calcularColaborador(colab, entrada(comp));
    const sp = calcularColaborador(outro, entrada(comp));
    const dia = comp + '-02';
    assert.equal(ba.diasPagos.some((d) => d.data === dia), false, 'baiano não é pago no feriado em ' + comp);
    assert.equal(sp.diasPagos.some((d) => d.data === dia), true, 'paulista é pago em ' + comp);
    assert.equal(ba.bruto, sp.bruto - 10);
  }
  // não vale antes do ano de início
  const antes = calcularColaborador(colab, entrada('2025-07', { tarifas: [{ ...tarifa, vigencia_inicio: '2020-01-01' }] }));
  assert.equal(antes.diasPagos.some((d) => d.data === '2025-07-02'), true);
});

test('feriado de praça descoberto depois do pagamento desconta no lançamento seguinte', () => {
  const julho = { data: '2026-07-02', descricao: 'Independência da Bahia', praca_id: 'ba', recorrente: true };
  const r = calcularColaborador(colab, base({
    competencia: '2026-08',
    feriadosRegionais: [julho],
    pracaPorColaborador: new Map([['p1', 'ba']]),
    diasPagosPendentes: [{ id: 'x', colaborador_id: 'p1', data: '2026-07-02', valor: 10 }],
  }));
  assert.equal(r.totalDescontos, 10);
  assert.match(r.descontos[0].motivo, /Independência da Bahia/);
});

test('feriado não recorrente vale só no ano cadastrado', () => {
  const m = expandirFeriados([{ data: '2026-05-10', descricao: 'X', praca_id: null, recorrente: false }], [2026, 2027]);
  assert.deepEqual([...m.keys()], ['2026-05-10']);
  const bi = expandirFeriados([{ data: '2024-02-29', descricao: 'Y', praca_id: null, recorrente: true }], [2025, 2026, 2028]);
  assert.deepEqual([...bi.keys()], ['2028-02-29']);
});

test('prévia de dezembro com novembro aberto: não desconta novembro (não foi pago), abate só o saldo devedor', () => {
  // caso real: ocorrência de 14/10 a 12/12, valores seg-sáb 30, nada fechado ainda, início do controle = novembro
  const tarifa30 = { colaborador_id: 'p1', vigencia_inicio: '2026-11-01', valores: [0, 30, 30, 30, 30, 30, 30] };
  const oc = { colaborador_id: 'p1', tipo: 'atestado', data_inicio: '2026-10-14', data_fim: '2026-12-12' };
  const entrada = (competencia) => base({
    competencia, tarifas: [tarifa30], ocorrencias: [oc], comLancamentoAnterior: new Set(),
    ultimaFechada: null, inicioControle: '2026-11',
  });

  const nov = calcularCompetencia(entrada('2026-11'))[0];
  assert.equal(nov.bruto, 0);
  assert.equal(nov.totalDescontos, 480); // 16 dias de outubro já pagos
  assert.equal(nov.saldoDevedor, 480);

  const dez = calcularCompetencia(entrada('2026-12'))[0];
  assert.equal(dez.bruto, 450);
  assert.equal(dez.totalDescontos, 0, 'novembro não foi pago, não há o que descontar');
  assert.equal(dez.saldoAnterior, 480);
  assert.equal(dez.valorPagar, 0);
  assert.equal(dez.saldoDevedor, 30);
});

test('cadeia a partir da última competência fechada', () => {
  // outubro fechado com dias pagos; novembro aberto; prévia de dezembro com atestado que cobre fim de outubro e novembro todo
  const pagosOut = [
    { id: 'o1', colaborador_id: 'p1', data: '2026-10-29', valor: 10 },
    { id: 'o2', colaborador_id: 'p1', data: '2026-10-30', valor: 10 },
  ];
  const oc = { colaborador_id: 'p1', tipo: 'atestado', data_inicio: '2026-10-29', data_fim: '2026-11-30' };
  const r = calcularCompetencia(base({
    competencia: '2026-12', ocorrencias: [oc], diasPagosPendentes: pagosOut,
    comLancamentoAnterior: new Set(['p1']), ultimaFechada: '2026-10', inicioControle: '2026-11',
  }))[0];
  // novembro (virtual): paga 0 e fica devendo 20; dezembro: só abate esse saldo, sem redescontar os dias de outubro
  assert.equal(r.saldoAnterior, 20);
  assert.equal(r.totalDescontos, 0);
  assert.equal(r.valorPagar, r.bruto - 20);
});

test('verificarFechamento: só na ordem', () => {
  assert.equal(verificarFechamento('2026-11', [], '2026-11').ok, true);
  assert.equal(verificarFechamento('2026-12', [], '2026-11').ok, false);
  assert.equal(verificarFechamento('2026-12', ['2026-11'], '2026-11').ok, true);
  assert.equal(verificarFechamento('2027-01', ['2026-11'], '2026-11').ok, false);
  assert.match(verificarFechamento('2027-01', ['2026-11'], '2026-11').motivo, /Dezembro/);
  assert.equal(verificarFechamento('2026-10', ['2026-11'], '2026-11').ok, false); // há mês posterior fechado
});

test('valor a lançar: ajuda + Internet + DIF - AJC (alimentação fica de fora); DIF negativo desconta; nunca negativo', () => {
  assert.equal(valorTotalLancar(200, { internet: 30, dif_ajc: 20 }), 250);
  assert.equal(valorTotalLancar(200, { internet: 0, dif_ajc: -50 }), 150);
  assert.equal(valorTotalLancar(0, { internet: 0, dif_ajc: -50 }), 0);
  assert.equal(valorTotalLancar(100, undefined), 100);
});

test('diferença de valor: promotora mudou de roteiro no meio do mês, outubro já pago com valor antigo', () => {
  // outubro pago com sábado 30; novo valor vigente desde 15/10 com sábado 50
  const antiga = { colaborador_id: 'p1', vigencia_inicio: '2026-10-01', valores: [0, 30, 30, 30, 30, 30, 30] };
  const nova = { colaborador_id: 'p1', vigencia_inicio: '2026-10-15', valores: [0, 30, 30, 30, 30, 30, 50] };
  const pagos = ['2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31', '2026-10-16'].map((data, i) => ({
    id: 'd' + i, colaborador_id: 'p1', data, valor: 30,
  }));
  const entrada = base({ competencia: '2026-11', tarifas: [antiga, nova], diasPagosPendentes: pagos });
  const r = diferencasDeValor(colab, entrada);
  // sábados 17, 24 e 31 (>= 15/10) ficaram R$ 20 abaixo; sábado 10 é anterior à mudança; sexta 16 não mudou
  assert.deepEqual(r.map((d) => d.data), ['2026-10-17', '2026-10-24', '2026-10-31']);
  assert.ok(r.every((d) => d.diferenca === 20));
});

test('diferença de valor ignora dias que viram desconto e dias já acertados (valor pago = valor atual)', () => {
  const nova = { colaborador_id: 'p1', vigencia_inicio: '2026-10-01', valores: [0, 30, 30, 30, 30, 30, 50] };
  const pagos = [
    { id: 'a', colaborador_id: 'p1', data: '2026-10-17', valor: 30 }, // falta neste dia: vira desconto
    { id: 'b', colaborador_id: 'p1', data: '2026-10-24', valor: 50 }, // já acertado: pago = atual
  ];
  const falta = { colaborador_id: 'p1', tipo: 'falta', data_inicio: '2026-10-17', data_fim: '2026-10-17' };
  const r = diferencasDeValor(colab, base({ competencia: '2026-11', tarifas: [nova], ocorrencias: [falta], diasPagosPendentes: pagos }));
  assert.deepEqual(r, []);
});

test('diferença com mês anterior pago fora do sistema: valor pago presumido = vigente no 1º dia do mês', () => {
  // outubro foi pago antes do sistema com sábado 30; em 14/10 mudou para 50
  const v1 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-01', valores: [0, 30, 30, 30, 30, 30, 30] };
  const v2 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-14', valores: [0, 30, 30, 30, 30, 30, 50] };
  const entrada = (competencia) => base({
    competencia, tarifas: [v1, v2], comLancamentoAnterior: new Set(), ultimaFechada: null, inicioControle: '2026-11',
  });

  const nov = diferencasDeValor(colab, entrada('2026-11'));
  assert.deepEqual(nov.map((d) => d.data), ['2026-10-17', '2026-10-24', '2026-10-31']);
  assert.ok(nov.every((d) => d.diferenca === 20 && d.estimado === true && d.pago === 30 && d.novo === 50));

  // em outubro (competência) o mês anterior é setembro: sem mudança, sem diferença
  assert.deepEqual(diferencasDeValor(colab, entrada('2026-10')), []);
});

test('diferença presumida ignora dia com falta (vira desconto) e a estimativa de desconto usa o valor presumido pago', () => {
  const v1 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-01', valores: [0, 30, 30, 30, 30, 30, 30] };
  const v2 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-14', valores: [0, 30, 30, 30, 30, 30, 50] };
  const falta = { colaborador_id: 'p1', tipo: 'falta', data_inicio: '2026-10-24', data_fim: '2026-10-24' };
  const e = base({ competencia: '2026-11', tarifas: [v1, v2], ocorrencias: [falta], comLancamentoAnterior: new Set(), ultimaFechada: null, inicioControle: '2026-11' });
  assert.deepEqual(diferencasDeValor(colab, e).map((d) => d.data), ['2026-10-17', '2026-10-31']);
  const r = calcularColaborador(colab, e);
  assert.equal(r.totalDescontos, 30, 'desconta o valor que foi pago (30), não o valor novo (50)');
});

test('acerto imediato: mudança de roteiro no mês corrente (mês pago fora do sistema), dias passados e futuros', () => {
  // outubro pago com sábado 30; em 14/10 sábado passou a 50. Hoje é 15/10, mas o acerto inclui o mês todo a partir da vigência
  const v1 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-01', valores: [0, 30, 30, 30, 30, 30, 30] };
  const v2 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-14', valores: [0, 30, 30, 30, 30, 30, 50] };
  const entrada = base({ competencia: '2026-11', tarifas: [v1, v2], comLancamentoAnterior: new Set(), ultimaFechada: null, inicioControle: '2026-11' });

  const r = diferencasNoMes(colab, entrada, '2026-10');
  assert.deepEqual(r.map((d) => d.data), ['2026-10-17', '2026-10-24', '2026-10-31']);
  assert.equal(r.reduce((s, d) => s + d.diferenca, 0), 60);
  assert.ok(r.every((d) => d.estimado));
});

test('acerto imediato: depois de registrado, não propõe de novo nem cobra no fechamento; desconto usa o valor acertado', () => {
  const v1 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-01', valores: [0, 30, 30, 30, 30, 30, 30] };
  const v2 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-14', valores: [0, 30, 30, 30, 30, 30, 50] };
  const acertos = new Map([['p1', new Map([['2026-10-17', 50], ['2026-10-24', 50], ['2026-10-31', 50]])]]);
  const falta = { colaborador_id: 'p1', tipo: 'falta', data_inicio: '2026-10-24', data_fim: '2026-10-24' };
  const e = base({
    competencia: '2026-11', tarifas: [v1, v2], valoresAcertados: acertos,
    comLancamentoAnterior: new Set(), ultimaFechada: null, inicioControle: '2026-11',
  });
  assert.deepEqual(diferencasNoMes(colab, e, '2026-10'), []);
  assert.deepEqual(diferencasDeValor(colab, e), []);
  // falta no sábado 24: desconta o que foi efetivamente pago (30 + 20 de acerto = 50)
  const r = calcularColaborador(colab, { ...e, ocorrencias: [falta] });
  assert.equal(r.totalDescontos, 50);
});

test('acerto imediato com mês fechado no sistema: usa os dias pagos registrados e ignora dia não pago', () => {
  const v1 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-01', valores: [0, 30, 30, 30, 30, 30, 30] };
  const v2 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-14', valores: [0, 30, 30, 30, 30, 30, 50] };
  const pagos = [
    { id: 'a', colaborador_id: 'p1', data: '2026-10-17', valor: 30 },
    { id: 'c', colaborador_id: 'p1', data: '2026-10-31', valor: 30 },
  ]; // sábado 24 não foi pago (ex.: já era férias no fechamento)
  const e = base({ competencia: '2026-11', tarifas: [v1, v2], diasPagosPendentes: pagos, comLancamentoAnterior: new Set(['p1']), ultimaFechada: '2026-10', inicioControle: '2026-11' });
  const r = diferencasNoMes(colab, e, '2026-10');
  assert.deepEqual(r.map((d) => d.data), ['2026-10-17', '2026-10-31']);
  assert.ok(r.every((d) => !d.estimado && d.diaPagoId));
});

test('redução de valor (promotor recebeu a mais): aparece como diferença negativa e vira desconto na folha', () => {
  // outubro pago com sábado 30; em 14/10 o sábado passou a 20
  const v1 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-01', valores: [0, 30, 30, 30, 30, 30, 30] };
  const v2 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-14', valores: [0, 30, 30, 30, 30, 30, 20] };
  const e = base({ competencia: '2026-11', tarifas: [v1, v2], comLancamentoAnterior: new Set(), ultimaFechada: null, inicioControle: '2026-11' });

  const r = diferencasNoMes(colab, e, '2026-10');
  assert.deepEqual(r.map((d) => d.data), ['2026-10-17', '2026-10-24', '2026-10-31']);
  assert.ok(r.every((d) => d.diferenca === -10));

  // na folha: DIF - AJC = -30 reduz o valor a lançar
  const calc = calcularColaborador(colab, e);
  assert.equal(valorTotalLancar(calc.valorPagar, { internet: 0, dif_ajc: -30 }), calc.valorPagar - 30);
});

test('DIF - AJC negativo maior que a ajuda do mês: o excedente vira saldo devedor', () => {
  assert.equal(valorTotalLancar(20, { internet: 0, dif_ajc: -50 }), 0);
  assert.equal(saldoDevedorFinal(20, 0, { internet: 0, dif_ajc: -50 }), 30);
  assert.equal(saldoDevedorFinal(200, 0, { internet: 0, dif_ajc: -30 }), 0);
  assert.equal(saldoDevedorFinal(0, 480, { internet: 0, dif_ajc: -10 }), 490);
  assert.equal(saldoDevedorFinal(100, 0, undefined), 0);
});

test('acréscimo e redução no mesmo mês: dias já levados ao DIF - AJC da folha não viram acerto imediato (evita pagar em dobro)', () => {
  // Aline: qui/sex/sáb 26 -> 30 desde 15/10 (outubro pago com 26)
  const v1 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-01', valores: [0, 26, 26, 26, 26, 26, 26] };
  const v2 = { colaborador_id: 'p1', vigencia_inicio: '2026-10-15', valores: [0, 26, 26, 26, 30, 30, 30] };
  const e = base({ competencia: '2026-11', tarifas: [v1, v2], comLancamentoAnterior: new Set(), ultimaFechada: null, inicioControle: '2026-11' });

  const todos = diferencasNoMes(colab, e, '2026-10');
  assert.equal(todos.length, 9); // qui 15,22,29 · sex 16,23,30 · sáb 17,24,31
  assert.equal(todos.reduce((s, d) => s + d.diferenca, 0), 36);

  // se a diferença de 3 dias já foi aplicada no DIF - AJC da folha, esses dias saem do acerto imediato
  const aplicados = new Map([['p1', new Set(['2026-10-15', '2026-10-22', '2026-10-29'])]]);
  const resto = diferencasNoMes(colab, { ...e, diasComDifAplicada: aplicados }, '2026-10');
  assert.equal(resto.length, 6);
  assert.ok(resto.every((d) => !['2026-10-15', '2026-10-22', '2026-10-29'].includes(d.data)));
});

test('temporário: EMPRESA = TMP (sem diferenciar maiúsculas, espaços ou sufixo)', () => {
  assert.equal(ehTemporario('TMP'), true);
  assert.equal(ehTemporario(' tmp '), true);
  assert.equal(ehTemporario('TMP - Loja'), true);
  assert.equal(ehTemporario('SPOT'), false);
  assert.equal(ehTemporario('ATMP'), false);
  assert.equal(ehTemporario(null), false);
  assert.equal(ehTemporario(undefined), false);
});

test('Internet recorrente: vale do início até o fim, o valor mais recente prevalece e substitui o digitado no mês', () => {
  const av = new Map([['a', { colaborador_id: 'a', internet: 10, dif_ajc: -5, alimentacao: 0, observacao: 'x', dif_dias: [] }]]);
  const regs = [
    { colaborador_id: 'a', valor: 70, inicio: '2026-08', fim: '2026-10' },
    { colaborador_id: 'a', valor: 80, inicio: '2026-11', fim: null },
    { colaborador_id: 'b', valor: 50, inicio: '2026-06', fim: '2026-09' }, // já encerrado
    { colaborador_id: 'c', valor: 60, inicio: '2027-01', fim: null }, // ainda não começou
  ];

  const out = mesclarInternetRecorrente(av, regs, '2026-11');
  assert.equal(out.get('a').internet, 80);
  assert.equal(out.get('a').recorrente, true);
  assert.equal(out.get('a').recorrenteDesde, '2026-11');
  assert.equal(out.get('a').dif_ajc, -5, 'mantém os demais campos do avulso');
  assert.equal(out.has('b'), false);
  assert.equal(out.has('c'), false);

  // mês anterior: ainda o valor antigo; mês depois do fim do primeiro registro não existe lacuna
  assert.equal(mesclarInternetRecorrente(new Map(), regs, '2026-10').get('a').internet, 70);
  assert.equal(mesclarInternetRecorrente(new Map(), regs, '2026-07').has('a'), false);
  // promotor sem avulso no mês também recebe a recorrência
  const so = mesclarInternetRecorrente(new Map(), regs, '2026-12').get('a');
  assert.equal(so.internet, 80);
  assert.equal(so.dif_ajc, 0);
  // o Internet recorrente soma ao valor a lançar como o digitado
  assert.equal(valorTotalLancar(200, so), 280);
});

test('somarDias: último dia = primeiro dia + quantidade de dias corridos - 1', () => {
  assert.equal(somarDias('2026-10-28', 427 - 1), '2027-12-28'); // licença de 427 dias
  assert.equal(somarDias('2026-11-23', 30 - 1), '2026-12-22'); // férias de 30 dias
  assert.equal(somarDias('2026-10-19', 3 - 1), '2026-10-21'); // atestado de 3 dias
  assert.equal(somarDias('2026-10-13', 1 - 1), '2026-10-13'); // 1 dia: o próprio dia
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(somarDias('2026-03-01', -1), '2026-02-28');
});

test('desligamento: dias do período não são pagos e dias já pagos viram desconto; prevalece sobre férias', () => {
  // desligado de 10/11 a 30/11; férias no mesmo período não mudam o motivo
  const desl = { colaborador_id: 'p1', tipo: 'desligamento', data_inicio: '2026-11-10', data_fim: '2026-11-30' };
  const ferias = { colaborador_id: 'p1', tipo: 'ferias', data_inicio: '2026-11-15', data_fim: '2026-11-20' };
  const r = calcularColaborador(colab, base({ ocorrencias: [ferias, desl] }));
  // sobram só os dias anteriores a 10/11: ter 3, qua 4, qui 5, sex 6 e seg 9
  assert.equal(r.bruto, 15 + 20 + 10 + 10 + 10);
  assert.ok(r.dias.filter((d) => !d.pago && d.data >= '2026-11-10').every((d) => d.motivo === 'Desligamento' || d.motivo?.startsWith('Feriado')));
  assert.ok(r.dias.some((d) => d.data === '2026-11-16' && d.motivo === 'Desligamento'), 'o dia de férias vira desligamento');

  // dias de outubro já pagos, com desligamento registrado depois: descontados no lançamento seguinte
  const deslOut = { colaborador_id: 'p1', tipo: 'desligamento', data_inicio: '2026-10-26', data_fim: '2026-10-31' };
  const pagos = [{ id: 'a', colaborador_id: 'p1', data: '2026-10-26', valor: 15 }, { id: 'b', colaborador_id: 'p1', data: '2026-10-27', valor: 20 }];
  const nov = calcularColaborador(colab, base({ ocorrencias: [deslOut], diasPagosPendentes: pagos }));
  assert.equal(nov.totalDescontos, 35);
  assert.match(nov.descontos[0].motivo, /Desligamento/);
});

test('descontos pós-fechamento: dias pagos que ganharam desligamento, mesmo sem folha seguinte', () => {
  const desl = { colaborador_id: 'p1', tipo: 'desligamento', data_inicio: '2026-11-10', data_fim: '2026-11-30' };
  const pagos = [
    { id: 'a', colaborador_id: 'p1', data: '2026-11-09', valor: 15 }, // antes do desligamento: fica
    { id: 'b', colaborador_id: 'p1', data: '2026-11-10', valor: 20 },
    { id: 'c', colaborador_id: 'p1', data: '2026-11-12', valor: 10 },
    { id: 'd', colaborador_id: 'p2', data: '2026-11-10', valor: 99 }, // outro promotor, sem ocorrência
  ];
  const r = descontosPosFechamento(base({ ocorrencias: [desl] }), pagos);
  assert.equal(r.size, 1);
  const lista = r.get('p1');
  assert.deepEqual(lista.map((d) => d.data), ['2026-11-10', '2026-11-12']);
  assert.equal(lista.reduce((s, d) => s + d.valor, 0), 30);
  assert.ok(lista.every((d) => d.motivo === 'Desligamento'));

  // valor acertado (complemento) vale no lugar do valor pago original
  const acertado = descontosPosFechamento(base({ ocorrencias: [desl], valoresAcertados: new Map([['p1', new Map([['2026-11-10', 25]])]]) }), pagos);
  assert.equal(acertado.get('p1')[0].valor, 25);
});
