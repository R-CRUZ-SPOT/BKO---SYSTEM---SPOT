// Salário do colaborador (vem da planilha de Gestão de Pessoas) e quanto a ajuda de custo representa dele (puro).

/** Converte o valor da célula em número: aceita número, "R$ 2.500,00", "2.500,00", "2500,50" e "2500.50". */
export function parseSalario(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null;
  let s = String(valor).replace(/R\$|\s/gi, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, ''); // "2.500.000" = separador de milhar
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Percentual (0..100) da ajuda de custo sobre o salário; null sem salário informado. */
export function percentualDoSalario(ajuda: number, salario: number | null | undefined): number | null {
  if (!salario || salario <= 0) return null;
  return (ajuda / salario) * 100;
}

/** Faixas de percentual da ajuda sobre o salário (da maior para a menor); intervalo [min, max). */
export const FAIXAS_SALARIO = [
  { id: '50+', rotulo: '50% ou mais', min: 50, max: Infinity },
  { id: '40-50', rotulo: '40 a 50%', min: 40, max: 50 },
  { id: '30-40', rotulo: '30 a 40%', min: 30, max: 40 },
  { id: '20-30', rotulo: '20 a 30%', min: 20, max: 30 },
  { id: '10-20', rotulo: '10 a 20%', min: 10, max: 20 },
  { id: '<10', rotulo: 'Menos de 10%', min: -Infinity, max: 10 },
] as const;

export type FaixaSalario = (typeof FAIXAS_SALARIO)[number]['id'] | 'sem';

export const ROTULO_FAIXA: Record<FaixaSalario, string> = {
  ...(Object.fromEntries(FAIXAS_SALARIO.map((f) => [f.id, f.rotulo])) as Record<string, string>),
  sem: 'Sem salário',
} as Record<FaixaSalario, string>;

/** Faixa do percentual (0..100); "sem" quando não há salário informado. */
export function faixaDoPercentual(p: number | null): FaixaSalario {
  if (p === null) return 'sem';
  return FAIXAS_SALARIO.find((f) => p >= f.min && p < f.max)?.id ?? '<10';
}
