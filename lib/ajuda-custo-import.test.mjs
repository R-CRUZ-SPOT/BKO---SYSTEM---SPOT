// Rodar com: node --test lib/ajuda-custo-import.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarPlanilha, lerValor, lerData } from './ajuda-custo-import.ts';

const colabs = [
  { id: 'a', nome: 'Ana', matricula: '00123' },
  { id: 'b', nome: 'Bia', matricula: '777' },
];

test('valores em vários formatos', () => {
  assert.equal(lerValor('R$ 15,50'), 15.5);
  assert.equal(lerValor('1.234,56'), 1234.56);
  assert.equal(lerValor(12), 12);
  assert.equal(lerValor(''), 0);
  assert.equal(lerValor('abc'), null);
  assert.equal(lerValor(-3), null);
});

test('datas', () => {
  assert.equal(lerData('05/11/2026'), '2026-11-05');
  assert.equal(lerData('2026-11-05'), '2026-11-05');
  assert.equal(lerData(''), undefined);
  assert.equal(lerData('31/02/2026'), null);
});

test('interpreta linhas, casa matrícula mesmo sem zeros à esquerda e usa vigência padrão', () => {
  const r = interpretarPlanilha(
    [
      { Matrícula: 123, Nome: 'Ana', Segunda: '15,00', 'Terça': 20, Quarta: 10, Quinta: 10, Sexta: 10 },
      { Matrícula: '777', Segunda: 8, Sábado: '5,5', 'Vigência': '01/12/2026' },
    ],
    colabs,
    '2026-11-01'
  );
  assert.equal(r[0].erro, undefined);
  assert.equal(r[0].colaborador.id, 'a');
  assert.equal(r[0].vigencia, '2026-11-01');
  assert.deepEqual(r[0].valores, [0, 15, 20, 10, 10, 10, 0]);
  assert.equal(r[1].vigencia, '2026-12-01');
  assert.deepEqual(r[1].valores, [0, 8, 0, 0, 0, 0, 5.5]);
});

test('erros: matrícula inexistente, sem valores, valor inválido, repetido', () => {
  const r = interpretarPlanilha(
    [
      { Matrícula: '999', Segunda: 10 },
      { Matrícula: '777' },
      { Matrícula: '777', Segunda: 'x' },
      { Matrícula: '777', Segunda: 10 },
      { Matrícula: '777', Segunda: 12 },
    ],
    colabs,
    '2026-11-01'
  );
  assert.match(r[0].erro, /não encontrada/);
  assert.match(r[1].erro, /Nenhum valor/);
  assert.match(r[2].erro, /inválido/);
  assert.equal(r[3].erro, undefined);
  assert.match(r[4].erro, /repetido/);
});

test('coluna Praça é lida (opcional)', () => {
  const r = interpretarPlanilha(
    [{ Matrícula: '777', Praça: ' Salvador/BA ', Segunda: 10 }, { Matrícula: '123', Segunda: 10 }],
    colabs,
    '2026-11-01'
  );
  assert.equal(r[0].praca, 'Salvador/BA');
  assert.equal(r[1].praca, undefined);
});
