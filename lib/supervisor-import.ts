// Interpretação da planilha de Roteiro para gravar o supervisor de cada promotor (pura, sem React/Supabase).
//
// Política de conflito: o supervisor tem origem 'planilha' ou 'manual'. Valores manuais (editados em Gestão de
// Pessoas) NÃO são sobrescritos pela planilha, a menos que o usuário peça para substituir.
import type { RoteiroEntry } from './roteiro-parser';

export const normalizarSupervisor = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/** Nome sem acento, em minúsculas e com espaços normalizados, para casar o Roteiro com o cadastro. */
export const normalizarNome = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export interface ColabSup {
  id: string;
  nome: string;
  matricula: string;
  status?: string | null;
  supervisor?: string | null;
  supervisor_origem?: string | null;
}

export type AcaoSupervisor = 'novo' | 'atualizar' | 'igual' | 'manter_manual';

export interface LinhaSupervisor {
  colaborador: ColabSup;
  supervisorNovo: string;
  supervisorAtual: string;
  origemAtual: string | null;
  acao: AcaoSupervisor;
  /** todos os supervisores distintos que a planilha traz para o promotor (mais de um = conferir) */
  supervisoresNaPlanilha: string[];
}

export interface ResultadoSupervisores {
  linhas: LinhaSupervisor[];
  /** nomes do Roteiro sem colaborador correspondente */
  naoEncontrados: string[];
  /** nomes do Roteiro que casam com mais de um colaborador (homônimos): ignorados */
  ambiguos: string[];
  /** promotores encontrados cuja linha do Roteiro está sem supervisor */
  semSupervisor: number;
}

export function interpretarRoteiroSupervisores(
  entries: RoteiroEntry[],
  colaboradores: ColabSup[],
  substituirManuais = false
): ResultadoSupervisores {
  const porNome = new Map<string, ColabSup[]>();
  for (const c of colaboradores) {
    const k = normalizarNome(c.nome);
    if (!k) continue;
    porNome.set(k, [...(porNome.get(k) ?? []), c]);
  }

  // por promotor: contagem de cada supervisor nas linhas do Roteiro (uma linha por loja)
  const contagem = new Map<string, { colab: ColabSup; sups: Map<string, number>; vazias: number }>();
  const naoEncontrados = new Set<string>();
  const ambiguos = new Set<string>();

  for (const e of entries) {
    const nomes = [e.nome, e.nom_pessoa_completo].map((n) => (n ?? '').trim()).filter(Boolean);
    if (nomes.length === 0) continue;

    let candidatos: ColabSup[] | undefined;
    let nomeUsado = nomes[0];
    for (const n of nomes) {
      const achados = porNome.get(normalizarNome(n));
      if (achados && achados.length > 0) {
        candidatos = achados;
        nomeUsado = n;
        break;
      }
    }
    if (!candidatos) {
      naoEncontrados.add(nomes[0]);
      continue;
    }
    // homônimos: se só um estiver ativo, usa o ativo; senão ignora e avisa
    const ativos = candidatos.filter((c) => (c.status ?? 'ativo') === 'ativo');
    const escolhido = candidatos.length === 1 ? candidatos[0] : ativos.length === 1 ? ativos[0] : null;
    if (!escolhido) {
      ambiguos.add(nomeUsado);
      continue;
    }

    const reg = contagem.get(escolhido.id) ?? { colab: escolhido, sups: new Map<string, number>(), vazias: 0 };
    const sup = normalizarSupervisor(e.supervisor);
    if (sup) reg.sups.set(sup, (reg.sups.get(sup) ?? 0) + 1);
    else reg.vazias += 1;
    contagem.set(escolhido.id, reg);
  }

  const linhas: LinhaSupervisor[] = [];
  let semSupervisor = 0;
  for (const { colab, sups } of contagem.values()) {
    if (sups.size === 0) {
      semSupervisor += 1;
      continue;
    }
    // vale o supervisor que mais aparece nas linhas do promotor (empate: o primeiro da planilha)
    const [supervisorNovo] = [...sups.entries()].sort((a, b) => b[1] - a[1])[0];
    const atual = normalizarSupervisor(colab.supervisor);
    const origem = colab.supervisor_origem ?? null;

    let acao: AcaoSupervisor;
    if (!atual) acao = 'novo';
    else if (atual === supervisorNovo) acao = 'igual';
    else if (origem === 'manual' && !substituirManuais) acao = 'manter_manual';
    else acao = 'atualizar';

    linhas.push({ colaborador: colab, supervisorNovo, supervisorAtual: atual, origemAtual: origem, acao, supervisoresNaPlanilha: [...sups.keys()] });
  }

  linhas.sort((a, b) => a.colaborador.nome.localeCompare(b.colaborador.nome));
  return { linhas, naoEncontrados: [...naoEncontrados].sort(), ambiguos: [...ambiguos].sort(), semSupervisor };
}
