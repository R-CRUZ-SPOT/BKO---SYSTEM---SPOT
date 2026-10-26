// Rodar com: node --test lib/supervisor-import.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarRoteiroSupervisores, normalizarNome, normalizarSupervisor } from './supervisor-import.ts';

const colabs = [
  { id: '1', nome: 'JOÃO DA SILVA', matricula: '10', status: 'ativo' },
  { id: '2', nome: 'MARIA SOUZA', matricula: '20', status: 'ativo', supervisor: 'ANA LIMA', supervisor_origem: 'manual' },
  { id: '3', nome: 'PEDRO ALVES', matricula: '30', status: 'ativo', supervisor: 'CARLOS', supervisor_origem: 'planilha' },
  { id: '4', nome: 'LUCIA REIS', matricula: '40', status: 'ativo', supervisor: 'BETO', supervisor_origem: 'planilha' },
  { id: '5', nome: 'HOMONIMO UM', matricula: '50', status: 'ativo' },
  { id: '6', nome: 'HOMONIMO UM', matricula: '51', status: 'ativo' },
  { id: '7', nome: 'ANTIGO INATIVO', matricula: '70', status: 'inativo' },
  { id: '8', nome: 'ANTIGO INATIVO', matricula: '71', status: 'ativo' },
];

const linha = (nome, supervisor, extra = {}) => ({ nome, supervisor, ...extra });

test('normalizações', () => {
  assert.equal(normalizarNome('  João   da  SILVA '), 'joao da silva');
  assert.equal(normalizarSupervisor('  ana  lima '), 'ANA LIMA');
  assert.equal(normalizarSupervisor(null), '');
});

test('casa por nome sem acento/caixa e define a ação conforme o supervisor atual e a origem', () => {
  const r = interpretarRoteiroSupervisores(
    [
      linha('joao da silva', 'Fulano Tal'), // novo (sem supervisor)
      linha('Maria Souza', 'Outro Nome'), // atual manual e diferente: mantém
      linha('PEDRO ALVES', 'Dario'), // atual da planilha e diferente: atualiza
      linha('Lucia Reis', 'beto'), // igual (ignora caixa)
    ],
    colabs
  );
  const porId = Object.fromEntries(r.linhas.map((l) => [l.colaborador.id, l]));
  assert.equal(porId['1'].acao, 'novo');
  assert.equal(porId['1'].supervisorNovo, 'FULANO TAL');
  assert.equal(porId['2'].acao, 'manter_manual');
  assert.equal(porId['3'].acao, 'atualizar');
  assert.equal(porId['4'].acao, 'igual');
});

test('substituir manuais troca a ação de manter_manual para atualizar', () => {
  const r = interpretarRoteiroSupervisores([linha('Maria Souza', 'Outro Nome')], colabs, true);
  assert.equal(r.linhas[0].acao, 'atualizar');
});

test('várias lojas: vale o supervisor mais frequente e lista todos os distintos', () => {
  const r = interpretarRoteiroSupervisores(
    [linha('JOÃO DA SILVA', 'A'), linha('JOÃO DA SILVA', 'B'), linha('JOÃO DA SILVA', 'B'), linha('JOÃO DA SILVA', '')],
    colabs
  );
  assert.equal(r.linhas[0].supervisorNovo, 'B');
  assert.deepEqual(r.linhas[0].supervisoresNaPlanilha.sort(), ['A', 'B']);
});

test('usa NOM_PESSOA_COMPLETO quando NOME não casa', () => {
  const r = interpretarRoteiroSupervisores([{ nome: 'x', nom_pessoa_completo: 'Pedro Alves', supervisor: 'Dario' }], colabs);
  assert.equal(r.linhas[0].colaborador.id, '3');
});

test('não encontrados, homônimos (ignorados) e preferência pelo único ativo', () => {
  const r = interpretarRoteiroSupervisores(
    [linha('Pessoa Inexistente', 'X'), linha('Homonimo Um', 'Y'), linha('Antigo Inativo', 'Z')],
    colabs
  );
  assert.deepEqual(r.naoEncontrados, ['Pessoa Inexistente']);
  assert.deepEqual(r.ambiguos, ['Homonimo Um']);
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].colaborador.id, '8'); // só um dos homônimos está ativo
});

test('promotor encontrado sem supervisor na planilha é contado à parte', () => {
  const r = interpretarRoteiroSupervisores([linha('JOÃO DA SILVA', '  ')], colabs);
  assert.equal(r.linhas.length, 0);
  assert.equal(r.semSupervisor, 1);
});
