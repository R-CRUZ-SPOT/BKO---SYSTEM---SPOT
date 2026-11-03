// Vínculo promotor x praça a partir das colunas UF e Cidade da planilha de colaboradores (puro, sem React/Supabase).
import { normalizarTexto, separarPraca } from './ajuda-custo.ts';

export interface LinhaPracaPlanilha {
  matricula: string;
  cidade?: string | null;
  uf?: string | null;
}

export interface PlanoPracas {
  /** praca_id preenchido quando a praça já existe; senão `chave` aponta para uma praça nova de `novas` */
  vinculos: { colaborador_id: string; praca_id: string | null; chave: string }[];
  novas: { chave: string; nome: string }[];
  /** linhas sem cidade ou sem UF válida */
  semDados: number;
  /** matrículas da planilha que não foram encontradas no cadastro */
  semCadastro: number;
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** "SÃO JOÃO DEL REI" -> "São João del Rei" (preposições em minúsculas). */
export function formatarCidade(cidade: string): string {
  return cidade
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && (MINUSCULAS.has(p) || p === 'del') ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

export const UF_VALIDA = /^[A-Za-z]{2}$/;

/** Chave de comparação entre praças: cidade sem acento/caixa + UF. */
export function chavePraca(cidade: string, uf: string | null): string {
  return `${normalizarTexto(cidade)}|${(uf ?? '').toUpperCase()}`;
}

export function nomePraca(cidade: string, uf: string): string {
  return `${formatarCidade(cidade)}/${uf.toUpperCase()}`;
}

export function planejarPracas(
  linhas: LinhaPracaPlanilha[],
  colaboradores: { id: string; matricula: string }[],
  pracas: { id: string; nome: string }[]
): PlanoPracas {
  const idPorMatricula = new Map(colaboradores.map((c) => [String(c.matricula), c.id]));
  const pracaPorChave = new Map<string, string>();
  for (const p of pracas) {
    const { cidade, uf } = separarPraca(p.nome);
    const chave = chavePraca(cidade, uf);
    if (!pracaPorChave.has(chave)) pracaPorChave.set(chave, p.id);
  }

  const novas = new Map<string, string>();
  const vinculos: PlanoPracas['vinculos'] = [];
  let semDados = 0;
  let semCadastro = 0;

  for (const l of linhas) {
    const cidade = l.cidade?.toString().trim() ?? '';
    const uf = l.uf?.toString().trim() ?? '';
    if (!cidade || !UF_VALIDA.test(uf)) {
      semDados++;
      continue;
    }
    const colaborador_id = idPorMatricula.get(String(l.matricula));
    if (!colaborador_id) {
      semCadastro++;
      continue;
    }
    const chave = chavePraca(cidade, uf);
    const praca_id = pracaPorChave.get(chave) ?? null;
    if (!praca_id && !novas.has(chave)) novas.set(chave, nomePraca(cidade, uf));
    vinculos.push({ colaborador_id, praca_id, chave });
  }
  return { vinculos, novas: [...novas].map(([chave, nome]) => ({ chave, nome })), semDados, semCadastro };
}
