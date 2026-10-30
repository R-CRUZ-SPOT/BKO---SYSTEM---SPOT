'use client';

// Gráficos do dashboard da Ajuda de Custo, em SVG/CSS puros (sem dependências).
// Cores: paleta categórica validada (azul, laranja, aqua, magenta, nessa ordem).
// Convenção do módulo: azul = valor lançado, laranja = descontos.

import { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TIPO_LABEL, type TipoOcorrencia, moeda } from '@/lib/ajuda-custo';
import type { MesResumo } from '@/lib/ajuda-custo-dashboard';
import { cn } from '@/lib/utils';

export const COR = {
  azul: '#2a78d6',
  laranja: '#eb6834',
  aqua: '#1baf7a',
  magenta: '#e87ba4',
  neutro: '#a1a1aa',
  grafite: '#52514e',
};

export const COR_TIPO: Record<TipoOcorrencia, string> = {
  ferias: COR.azul,
  atestado: COR.laranja,
  falta: COR.aqua,
  feriado_local: COR.magenta,
  desligamento: COR.grafite,
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const rotuloMes = (competencia: string) => `${MESES[Number(competencia.slice(5, 7)) - 1]}/${competencia.slice(2, 4)}`;

export function moedaCurta(n: number) {
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')} mil`;
  return `R$ ${Math.round(n)}`;
}

function ticksBonitos(max: number): number[] {
  if (max <= 0) return [0, 1];
  const bruto = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto / mag;
  const passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= Math.ceil(max / passo) * passo + 1e-9; v += passo) ticks.push(v);
  return ticks;
}

export function CartaoGrafico({ titulo, subtitulo, className, children }: { titulo: string; subtitulo?: string; className?: string; children: React.ReactNode }) {
  return (
    <Card className={cn('border-zinc-100 shadow-sm bg-white/70', className)}>
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-tight text-zinc-900">{titulo}</h3>
          {subtitulo && <p className="text-[11px] text-zinc-500 mt-0.5">{subtitulo}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {itens.map((i) => (
        <li key={i.nome} className="flex items-center gap-1.5 text-[11px] text-zinc-600">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: i.cor }} />
          {i.nome}
        </li>
      ))}
    </ul>
  );
}

function Dica({ esquerdaPct, children }: { esquerdaPct: number; children: React.ReactNode }) {
  const transform = esquerdaPct > 70 ? 'translateX(-100%)' : esquerdaPct < 30 ? 'translateX(0)' : 'translateX(-50%)';
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[11px] shadow-lg"
      style={{ left: `${esquerdaPct}%`, transform }}
    >
      {children}
    </div>
  );
}

const W = 720;
const H = 260;
const M = { l: 64, r: 84, t: 12, b: 30 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;

/** Evolução mensal: valor lançado x descontos (mesmo eixo, em R$). */
export function LinhaEvolucao({ meses }: { meses: MesResumo[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = meses.length;

  const ticks = ticksBonitos(Math.max(...meses.flatMap((m) => [m.pago, m.descontos]), 0));
  const yMax = ticks[ticks.length - 1];
  const x = (i: number) => (n === 1 ? M.l + PW / 2 : M.l + (PW * i) / (n - 1));
  const y = (v: number) => M.t + PH * (1 - v / yMax);

  const series = [
    { nome: 'Valor lançado', cor: COR.azul, valor: (m: MesResumo) => m.pago },
    { nome: 'Descontos', cor: COR.laranja, valor: (m: MesResumo) => m.descontos },
  ];

  function aoMover(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let melhor = 0;
    meses.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i;
    });
    setHover(melhor);
  }

  // rótulos finais: evita sobreposição quando os dois últimos valores são próximos
  const ultimo = meses[n - 1];
  const yFinais = series.map((s) => y(s.valor(ultimo)));
  if (Math.abs(yFinais[0] - yFinais[1]) < 14) {
    const [cima, baixo] = yFinais[0] <= yFinais[1] ? [0, 1] : [1, 0];
    yFinais[cima] -= 7;
    yFinais[baixo] += 7;
  }

  return (
    <div className="space-y-2">
      <Legenda itens={series.map((s) => ({ nome: s.nome, cor: s.cor }))} />
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label="Evolução mensal do valor lançado e dos descontos"
          onMouseMove={aoMover}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#e4e4e7" strokeWidth={1} />
              <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#71717a">{moedaCurta(t)}</text>
            </g>
          ))}
          {meses.map((m, i) => (
            <text key={m.competencia} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#71717a">{rotuloMes(m.competencia)}</text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + PH} stroke="#a1a1aa" strokeWidth={1} />}
          {series.map((s, si) => (
            <g key={s.nome}>
              {n > 1 && (
                <polyline
                  fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                  points={meses.map((m, i) => `${x(i)},${y(s.valor(m))}`).join(' ')}
                />
              )}
              {meses.map((m, i) => (
                <circle key={m.competencia} cx={x(i)} cy={y(s.valor(m))} r={hover === i ? 5 : 4} fill={s.cor} stroke="#fff" strokeWidth={2} />
              ))}
              <text x={x(n - 1) + 12} y={yFinais[si] + 4} fontSize={11} fontWeight={700} fill="#3f3f46">{moeda(s.valor(ultimo))}</text>
            </g>
          ))}
        </svg>
        {hover !== null && (
          <Dica esquerdaPct={(x(hover) / W) * 100}>
            <p className="font-black text-zinc-900 mb-1">{rotuloMes(meses[hover].competencia)}</p>
            {series.map((s) => (
              <p key={s.nome} className="flex items-center gap-1.5 text-zinc-700">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.cor }} />
                {s.nome}: <strong className="tabular-nums">{moeda(s.valor(meses[hover]))}</strong>
              </p>
            ))}
            <p className="text-zinc-500 mt-1">{meses[hover].promotores} promotores</p>
          </Dica>
        )}
      </div>
    </div>
  );
}

export interface LinhaBarra {
  rotulo: string;
  valor: number;
  detalhe?: string;
  cor?: string;
}

/** Barras horizontais com valor visível em cada linha (ideal para até ~10 categorias). */
export function BarrasHorizontais({ linhas, cor, vazio }: { linhas: LinhaBarra[]; cor: string; vazio: string }) {
  const max = Math.max(...linhas.map((l) => l.valor), 0);
  if (linhas.length === 0) return <p className="py-8 text-center text-sm text-zinc-400">{vazio}</p>;
  return (
    <ul className="space-y-3">
      {linhas.map((l) => (
        <li key={l.rotulo} title={`${l.rotulo}: ${moeda(l.valor)}${l.detalhe ? ` · ${l.detalhe}` : ''}`}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-bold text-zinc-800 truncate">{l.rotulo}</span>
            <span className="tabular-nums font-bold text-zinc-900 shrink-0">{moeda(l.valor)}</span>
          </div>
          <div className="mt-1 h-3.5">
            <div
              className="h-full rounded-r-[4px]"
              style={{ width: `${max > 0 ? Math.max((l.valor / max) * 100, 1.5) : 0}%`, background: l.cor ?? cor }}
            />
          </div>
          {l.detalhe && <p className="mt-0.5 text-[10px] text-zinc-500">{l.detalhe}</p>}
        </li>
      ))}
    </ul>
  );
}

const TIPOS: TipoOcorrencia[] = ['ferias', 'atestado', 'falta', 'feriado_local', 'desligamento'];

/** Dias de ausência por mês, empilhados por tipo de ocorrência. */
export function BarrasEmpilhadas({ meses }: { meses: { competencia: string; porTipo: Record<TipoOcorrencia, number> }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = meses.length;
  const totais = meses.map((m) => TIPOS.reduce((s, t) => s + m.porTipo[t], 0));
  const ticks = ticksBonitos(Math.max(...totais, 0));
  const yMax = ticks[ticks.length - 1];
  const banda = PW / Math.max(n, 1);
  const largura = Math.min(44, banda * 0.6);
  const y = (v: number) => M.t + PH * (1 - v / yMax);
  const cx = (i: number) => M.l + banda * i + banda / 2;
  const usados = TIPOS.filter((t) => meses.some((m) => m.porTipo[t] > 0));

  return (
    <div className="space-y-2">
      <Legenda itens={TIPOS.map((t) => ({ nome: TIPO_LABEL[t], cor: COR_TIPO[t] }))} />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Dias de ausência por mês e tipo" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r + 40} y1={y(t)} y2={y(t)} stroke="#e4e4e7" strokeWidth={1} />
              <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#71717a">{Math.round(t)}</text>
            </g>
          ))}
          {meses.map((m, i) => {
            let acumulado = 0;
            return (
              <g key={m.competencia} onMouseEnter={() => setHover(i)}>
                <rect x={M.l + banda * i} y={M.t} width={banda} height={PH} fill="transparent" />
                {usados.map((t) => {
                  const v = m.porTipo[t];
                  if (v <= 0) return null;
                  const yTopo = y(acumulado + v);
                  const h = y(acumulado) - yTopo;
                  acumulado += v;
                  // 2px de respiro entre os segmentos
                  return <rect key={t} x={cx(i) - largura / 2} y={yTopo} width={largura} height={Math.max(h - 2, 1)} rx={3} fill={COR_TIPO[t]} />;
                })}
                <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#71717a">{rotuloMes(m.competencia)}</text>
                {totais[i] > 0 && (
                  <text x={cx(i)} y={y(totais[i]) - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill="#3f3f46">{totais[i]}</text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <Dica esquerdaPct={(cx(hover) / W) * 100}>
            <p className="font-black text-zinc-900 mb-1">{rotuloMes(meses[hover].competencia)}</p>
            {TIPOS.map((t) => (
              <p key={t} className="flex items-center gap-1.5 text-zinc-700">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: COR_TIPO[t] }} />
                {TIPO_LABEL[t]}: <strong className="tabular-nums">{meses[hover].porTipo[t]} dia(s)</strong>
              </p>
            ))}
          </Dica>
        )}
      </div>
    </div>
  );
}

export function Indicador({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: React.ReactNode }) {
  return (
    <Card className="border-zinc-100 shadow-sm bg-white/70">
      <CardContent className="p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{rotulo}</p>
        <p className="text-2xl font-black tabular-nums text-zinc-900 mt-1">{valor}</p>
        {sub && <p className="text-[11px] text-zinc-500 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
