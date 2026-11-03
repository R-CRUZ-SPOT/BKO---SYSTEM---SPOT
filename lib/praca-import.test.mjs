// Rodar com: node --test lib/praca-import.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatarCidade, planejarPracas, nomePraca } from './praca-import.ts';

const colabs = [{ id: '1', matricula: '10' }, { id: '2', matricula: '20' }, { id: '3', matricula: '30' }];
const pracas = [{ id: 'p1', nome: 'Salvador/BA' }, { id: 'p2', nome: 'São Paulo - SP' }];

test('formata o nome da cidade e da praça', () => {
  assert.equal(formatarCidade('SÃO JOÃO DEL REI'), 'São João del Rei');
  assert.equal(formatarCidade('  feira de   santana '), 'Feira de Santana');
  assert.equal(nomePraca('SALVADOR', 'ba'), 'Salvador/BA');
});

test('usa a praça existente (sem acento/caixa/formato) e cria as que faltam', () => {
  const plano = planejarPracas(
    [
      { matricula: '10', cidade: 'SALVADOR', uf: 'BA' },
      { matricula: '20', cidade: 'Sao Paulo', uf: 'sp' },
      { matricula: '30', cidade: 'Recife', uf: 'PE' },
    ],
    colabs,
    pracas
  );
  assert.deepEqual(plano.vinculos.map((v) => [v.colaborador_id, v.praca_id]), [['1', 'p1'], ['2', 'p2'], ['3', null]]);
  assert.deepEqual(plano.novas.map((n) => n.nome), ['Recife/PE']);
});

test('mesma cidade em UF diferente é outra praça; várias linhas da mesma praça nova criam uma só', () => {
  const plano = planejarPracas(
    [{ matricula: '10', cidade: 'Salvador', uf: 'SE' }, { matricula: '20', cidade: 'Recife', uf: 'PE' }, { matricula: '30', cidade: 'RECIFE', uf: 'pe' }],
    colabs,
    pracas
  );
  assert.equal(plano.vinculos[0].praca_id, null);
  assert.deepEqual(plano.novas.map((n) => n.nome).sort(), ['Recife/PE', 'Salvador/SE']);
});

test('ignora linhas sem cidade, sem UF válida ou fora do cadastro', () => {
  const plano = planejarPracas(
    [{ matricula: '10', cidade: '', uf: 'BA' }, { matricula: '20', cidade: 'Salvador', uf: 'Bahia' }, { matricula: '99', cidade: 'Salvador', uf: 'BA' }, { matricula: '30', cidade: 'Salvador', uf: 'BA' }],
    colabs,
    pracas
  );
  assert.equal(plano.semDados, 2);
  assert.equal(plano.semCadastro, 1);
  assert.equal(plano.vinculos.length, 1);
});
