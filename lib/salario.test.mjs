// Rodar com: node --test lib/salario.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSalario, percentualDoSalario } from './salario.ts';

test('interpreta salário em vários formatos', () => {
  assert.equal(parseSalario(2500), 2500);
  assert.equal(parseSalario('R$ 2.500,00'), 2500);
  assert.equal(parseSalario('2.500,5'), 2500.5);
  assert.equal(parseSalario('2500,50'), 2500.5);
  assert.equal(parseSalario('2500.50'), 2500.5);
  assert.equal(parseSalario('2.500.000'), 2500000);
  assert.equal(parseSalario(''), null);
  assert.equal(parseSalario(null), null);
  assert.equal(parseSalario('abc'), null);
  assert.equal(parseSalario(0), null);
});

test('percentual da ajuda sobre o salário', () => {
  assert.equal(percentualDoSalario(150, 1500), 10);
  assert.equal(Math.round(percentualDoSalario(780, 2000) * 10) / 10, 39);
  assert.equal(percentualDoSalario(100, null), null);
  assert.equal(percentualDoSalario(100, 0), null);
});

import { faixaDoPercentual } from './salario.ts';

test('faixas do percentual: limites inferiores pertencem à faixa de cima', () => {
  assert.equal(faixaDoPercentual(null), 'sem');
  assert.equal(faixaDoPercentual(50), '50+');
  assert.equal(faixaDoPercentual(120), '50+');
  assert.equal(faixaDoPercentual(49.99), '40-50');
  assert.equal(faixaDoPercentual(20), '20-30');
  assert.equal(faixaDoPercentual(19.9), '10-20');
  assert.equal(faixaDoPercentual(9.9), '<10');
  assert.equal(faixaDoPercentual(0), '<10');
});
