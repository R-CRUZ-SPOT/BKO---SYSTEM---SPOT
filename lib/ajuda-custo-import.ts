// Interpretação da planilha de importação de Valores por Dia (pura, sem React/Supabase).

export interface ColabImport {
  id: string;
  nome: string;
  matricula: string;
}

export interface LinhaImport {
  linha: number; // número da linha na planilha (cabeçalho = 1)
  matricula: string;
  nomePlanilha: string;
  colaborador?: ColabImport;
  vigencia?: string;
  /** nome da praça informado na planilha (opcional) */
  praca?: string;
  /** 0 = domingo ... 6 = sábado */
  valores: number[];
  erro?: string;
}

// colunas aceitas -> índice do dia (0 = domingo)
const COLUNAS_DIA: Record<string, number> = {
  domingo: 0, dom: 0,
  segunda: 1, segundafeira: 1, seg: 1,
  terca: 2, tercafeira: 2, ter: 2,
  quarta: 3, quartafeira: 3, qua: 3,
  quinta: 4, quintafeira: 4, qui: 4,
  sexta: 5, sextafeira: 5, sex: 5,
  sabado: 6, sab: 6,
};

export const normalizar = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const semZeros = (m: string) => m.replace(/^0+/, '');

export function lerValor(bruto: unknown): number | null {
  if (bruto === null || bruto === undefined || String(bruto).trim() === '') return 0;
  if (typeof bruto === 'number') return Number.isFinite(bruto) && bruto >= 0 ? Math.round(bruto * 100) / 100 : null;
  let t = String(bruto).replace(/R\$/gi, '').replace(/\s/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function lerData(bruto: unknown): string | null | undefined {
  if (bruto === null || bruto === undefined || String(bruto).trim() === '') return undefined; // vazio
  if (bruto instanceof Date) {
    // o xlsx devolve datas deslocadas por fuso: +12h e leitura em UTC elimina o erro
    const d = new Date(bruto.getTime() + 12 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const t = String(bruto).trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return valida(Number(m[3]), Number(m[2]), Number(m[1]));
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valida(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function valida(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Converte as linhas lidas da planilha (objetos por cabeçalho) em linhas validadas. */
export function interpretarPlanilha(
  rows: Record<string, unknown>[],
  colaboradores: ColabImport[],
  vigenciaPadrao: string
): LinhaImport[] {
  const porMatricula = new Map(colaboradores.map((c) => [c.matricula.trim(), c]));
  const porMatriculaSemZeros = new Map<string, ColabImport | null>();
  colaboradores.forEach((c) => {
    const k = semZeros(c.matricula.trim());
    porMatriculaSemZeros.set(k, porMatriculaSemZeros.has(k) ? null : c); // null = ambígua
  });

  const vistos = new Set<string>();

  return rows.map((row, idx): LinhaImport => {
    const chaves = Object.keys(row).map((k) => ({ original: k, norm: normalizar(k) }));
    const pegar = (...nomes: string[]) => chaves.find((c) => nomes.includes(c.norm))?.original;

    const kMat = pegar('matricula', 'mat');
    const kNome = pegar('nome', 'promotor', 'colaborador');
    const kPraca = pegar('praca', 'cidade', 'local', 'pracacidade');
    const kVig = pegar('vigencia', 'iniciovigencia', 'valeapartirde', 'apartirde');

    const matricula = String(kMat ? row[kMat] ?? '' : '').trim();
    const nomePlanilha = String(kNome ? row[kNome] ?? '' : '').trim();
    const valores = Array(7).fill(0) as number[];
    const base: LinhaImport = { linha: idx + 2, matricula, nomePlanilha, valores };

    if (!matricula) return { ...base, erro: 'Matrícula não informada' };

    const colaborador = porMatricula.get(matricula) ?? porMatriculaSemZeros.get(semZeros(matricula)) ?? undefined;
    if (!colaborador) return { ...base, erro: 'Matrícula não encontrada entre os colaboradores ativos' };

    for (const c of chaves) {
      const dow = COLUNAS_DIA[c.norm];
      if (dow === undefined) continue;
      const v = lerValor(row[c.original]);
      if (v === null) return { ...base, colaborador, erro: `Valor inválido em "${c.original}"` };
      valores[dow] = v;
    }
    if (valores.every((v) => v === 0)) return { ...base, colaborador, erro: 'Nenhum valor diário informado' };

    let vigencia = vigenciaPadrao;
    if (kVig) {
      const d = lerData(row[kVig]);
      if (d === null) return { ...base, colaborador, erro: 'Vigência inválida (use dd/mm/aaaa)' };
      if (d) vigencia = d;
    }

    const chave = `${colaborador.id}|${vigencia}`;
    if (vistos.has(chave)) return { ...base, colaborador, vigencia, erro: 'Promotor repetido na planilha para a mesma vigência' };
    vistos.add(chave);

    const praca = String(kPraca ? row[kPraca] ?? '' : '').trim() || undefined;
    return { ...base, colaborador, vigencia, praca };
  });
}
