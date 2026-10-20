// Rodar com: node --test lib/ajuda-custo-dashboard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { resumirPorMes, descontosPorMotivo, porPraca, rankingPromotores, diasOcorrenciaPorMes, afastadosHoje, variacao, categoriaDoMotivo } from './ajuda-custo-dashboard.ts';

const item = (o) => ({ competencia: '2026-11', colaborador_id: 'a', nome: 'Ana', matricula: '1', praca: 'Salvador/BA', bruto: 100, descontos: 0, valor_pagar: 100, saldo_devedor: 0, dias_trabalhados: 10, listaDescontos: [], ...o });

test('resumo por mês soma e ordena', () => {
  const r = resumirPorMes([item({ competencia: '2026-12', valor_pagar: 50 }), item({}), item({ colaborador_id: 'b', valor_pagar: 25.5, descontos: 10 })]);
  assert.deepEqual(r.map((m) => m.competencia), ['2026-11', '2026-12']);
  assert.equal(r[0].pago, 125.5);
  assert.equal(r[0].descontos, 10);
  assert.equal(r[0].promotores, 2);
});

test('categoria dos motivos', () => {
  assert.equal(categoriaDoMotivo('Atestado (estimado)'), 'Atestado');
  assert.equal(categoriaDoMotivo('Feriado: Independência da Bahia'), 'Feriado');
  assert.equal(categoriaDoMotivo('Falta'), 'Falta');
  assert.equal(categoriaDoMotivo('Feriado local'), 'Feriado');
  assert.equal(categoriaDoMotivo('qualquer'), 'Outros');
});

test('descontos por motivo agrega valor e dias, ordenado', () => {
  const r = descontosPorMotivo([item({ listaDescontos: [{ data: 'x', valor: 10, motivo: 'Falta' }, { data: 'y', valor: 30, motivo: 'Atestado' }, { data: 'z', valor: 20, motivo: 'Atestado (estimado)' }] })]);
  assert.deepEqual(r, [{ motivo: 'Atestado', valor: 50, dias: 2 }, { motivo: 'Falta', valor: 10, dias: 1 }]);
});

test('por praça, com "Sem praça"', () => {
  const r = porPraca([item({}), item({ colaborador_id: 'b', praca: null, valor_pagar: 300 })], '2026-11');
  assert.deepEqual(r.map((x) => x.praca), ['Sem praça', 'Salvador/BA']);
});

test('ranking calcula percentual de desconto', () => {
  const r = rankingPromotores([item({ bruto: 200, descontos: 50 }), item({ competencia: '2026-12', bruto: 200, descontos: 50 })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].meses, 2);
  assert.equal(r[0].pctDesconto, 0.25);
});

test('dias de ocorrência por mês recortam o período', () => {
  const r = diasOcorrenciaPorMes([{ colaborador_id: 'a', tipo: 'ferias', data_inicio: '2026-11-23', data_fim: '2026-12-22' }], ['2026-11', '2026-12', '2027-01']);
  assert.equal(r[0].porTipo.ferias, 8);
  assert.equal(r[1].porTipo.ferias, 22);
  assert.equal(r[2].porTipo.ferias, 0);
});

test('afastados hoje ignora feriado local; variação', () => {
  const oc = [
    { colaborador_id: 'a', tipo: 'atestado', data_inicio: '2026-10-10', data_fim: '2026-10-20' },
    { colaborador_id: 'b', tipo: 'feriado_local', data_inicio: '2026-10-14', data_fim: '2026-10-14' },
  ];
  assert.equal(afastadosHoje(oc, '2026-10-14').length, 1);
  assert.equal(variacao(110, 100), 0.1);
  assert.equal(variacao(10, 0), null);
  assert.equal(variacao(10, undefined), null);
});
