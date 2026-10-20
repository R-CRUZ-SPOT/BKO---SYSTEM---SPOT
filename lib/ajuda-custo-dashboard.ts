// Agregações do dashboard da Ajuda de Custo (puras, sem React/Supabase).
import { diasDoMes, r2, type TipoOcorrencia } from './ajuda-custo.ts';

export interface ItemDash {
  competencia: string;
  colaborador_id: string;
  nome: string;
  matricula: string;
  praca: string | null;
  bruto: number;
  descontos: number;
  valor_pagar: number;
  saldo_devedor: number;
  dias_trabalhados: number;
  listaDescontos: { data: string; valor: number; motivo: string }[];
}

export interface OcorrenciaDash {
  colaborador_id: string;
  tipo: TipoOcorrencia;
  data_inicio: string;
  data_fim: string;
}

export interface MesResumo {
  competencia: string;
  pago: number;
  bruto: number;
  descontos: number;
  saldoDevedor: number;
  promotores: number;
}

export function resumirPorMes(itens: ItemDash[]): MesResumo[] {
  const mapa = new Map<string, MesResumo>();
  for (const i of itens) {
    const m = mapa.get(i.competencia) ?? { competencia: i.competencia, pago: 0, bruto: 0, descontos: 0, saldoDevedor: 0, promotores: 0 };
    m.pago = r2(m.pago + i.valor_pagar);
    m.bruto = r2(m.bruto + i.bruto);
    m.descontos = r2(m.descontos + i.descontos);
    m.saldoDevedor = r2(m.saldoDevedor + i.saldo_devedor);
    m.promotores += 1;
    mapa.set(i.competencia, m);
  }
  return [...mapa.values()].sort((a, b) => a.competencia.localeCompare(b.competencia));
}

export type CategoriaDesconto = 'Atestado' | 'Falta' | 'Férias' | 'Feriado' | 'Outros';

export function categoriaDoMotivo(motivo: string): CategoriaDesconto {
  const m = motivo.toLowerCase();
  if (m.startsWith('atestado')) return 'Atestado';
  if (m.startsWith('falta')) return 'Falta';
  if (m.startsWith('férias') || m.startsWith('ferias')) return 'Férias';
  if (m.startsWith('feriado')) return 'Feriado';
  return 'Outros';
}

export function descontosPorMotivo(itens: ItemDash[]): { motivo: CategoriaDesconto; valor: number; dias: number }[] {
  const mapa = new Map<CategoriaDesconto, { valor: number; dias: number }>();
  for (const i of itens) {
    for (const d of i.listaDescontos) {
      const cat = categoriaDoMotivo(d.motivo);
      const acc = mapa.get(cat) ?? { valor: 0, dias: 0 };
      acc.valor = r2(acc.valor + d.valor);
      acc.dias += 1;
      mapa.set(cat, acc);
    }
  }
  return [...mapa.entries()].map(([motivo, v]) => ({ motivo, ...v })).sort((a, b) => b.valor - a.valor);
}

export function porPraca(itens: ItemDash[], competencia: string): { praca: string; pago: number; promotores: number }[] {
  const mapa = new Map<string, { pago: number; promotores: number }>();
  for (const i of itens.filter((x) => x.competencia === competencia)) {
    const chave = i.praca ?? 'Sem praça';
    const acc = mapa.get(chave) ?? { pago: 0, promotores: 0 };
    acc.pago = r2(acc.pago + i.valor_pagar);
    acc.promotores += 1;
    mapa.set(chave, acc);
  }
  return [...mapa.entries()].map(([praca, v]) => ({ praca, ...v })).sort((a, b) => b.pago - a.pago);
}

export interface LinhaRanking {
  colaborador_id: string;
  nome: string;
  matricula: string;
  praca: string | null;
  pago: number;
  bruto: number;
  descontos: number;
  meses: number;
  pctDesconto: number; // descontos / bruto, 0..1
}

export function rankingPromotores(itens: ItemDash[]): LinhaRanking[] {
  const mapa = new Map<string, LinhaRanking>();
  for (const i of itens) {
    const l = mapa.get(i.colaborador_id) ?? { colaborador_id: i.colaborador_id, nome: i.nome, matricula: i.matricula, praca: i.praca, pago: 0, bruto: 0, descontos: 0, meses: 0, pctDesconto: 0 };
    l.pago = r2(l.pago + i.valor_pagar);
    l.bruto = r2(l.bruto + i.bruto);
    l.descontos = r2(l.descontos + i.descontos);
    l.meses += 1;
    mapa.set(i.colaborador_id, l);
  }
  return [...mapa.values()].map((l) => ({ ...l, pctDesconto: l.bruto > 0 ? l.descontos / l.bruto : 0 }));
}

/** Dias de ocorrência (por tipo) que caem em cada mês informado. */
export function diasOcorrenciaPorMes(ocorrencias: OcorrenciaDash[], competencias: string[]): { competencia: string; porTipo: Record<TipoOcorrencia, number> }[] {
  return competencias.map((competencia) => {
    const dias = diasDoMes(competencia);
    const primeiro = dias[0];
    const ultimo = dias[dias.length - 1];
    const porTipo: Record<TipoOcorrencia, number> = { ferias: 0, atestado: 0, falta: 0, feriado_local: 0 };
    for (const o of ocorrencias) {
      const ini = o.data_inicio > primeiro ? o.data_inicio : primeiro;
      const fim = o.data_fim < ultimo ? o.data_fim : ultimo;
      if (fim < ini) continue;
      porTipo[o.tipo] += Math.round((Date.parse(fim) - Date.parse(ini)) / 86400000) + 1;
    }
    return { competencia, porTipo };
  });
}

export function afastadosHoje(ocorrencias: OcorrenciaDash[], hoje: string) {
  return ocorrencias.filter((o) => o.tipo !== 'feriado_local' && o.data_inicio <= hoje && hoje <= o.data_fim);
}

/** Variação percentual entre dois valores; null se não há base de comparação. */
export function variacao(atual: number, anterior: number | undefined): number | null {
  if (anterior === undefined || anterior === 0) return null;
  return (atual - anterior) / anterior;
}
