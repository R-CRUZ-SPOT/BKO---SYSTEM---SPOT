'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth-context';
import { calcularCompetencia, competenciaPadrao, diferencasDeValor, diferencasNoMes, moeda, nomeCompetencia, r2, somarMeses, verificarFechamento } from '@/lib/ajuda-custo';
import { supabase } from '@/lib/supabase';
import { avisarAcertosMudaram } from '@/hooks/use-acertos-pendentes';
import { carregarEntrada, fecharLancamento, type CarregamentoCalculo } from '@/lib/ajuda-custo-data';
import { TabelaLancamento, linhaDeResultado } from '@/components/ajuda-custo/tabela-lancamento';
import { LancamentoFechado } from '@/components/ajuda-custo/lancamento-fechado';
import { AvulsosDialog } from '@/components/ajuda-custo/avulsos-dialog';
import { rotuloCampo } from '@/components/ajuda-custo/colab-picker';

export default function CalculoPage() {
  const { user } = useAuth();
  const [competencia, setCompetencia] = useState(competenciaPadrao());
  const [dados, setDados] = useState<CarregamentoCalculo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fechando, setFechando] = useState(false);
  const [editandoAvulsos, setEditandoAvulsos] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setDados(await carregarEntrada(competencia));
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar: ' + (e.message || 'verifique se os scripts scripts/ajuda-de-custo.sql e scripts/ajuda-de-custo-pracas.sql foram executados no Supabase.'));
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [competencia]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const resultados = useMemo(() => (dados && !dados.lancamento ? calcularCompetencia(dados.entrada) : []), [dados]);
  const comTarifa = resultados.filter((r) => !r.semTarifa);
  const estimados = comTarifa.filter((r) => r.descontos.some((d) => d.estimado));
  const semPraca = dados && (dados.entrada.feriadosRegionais?.length ?? 0) > 0 ? comTarifa.filter((r) => !dados.entrada.pracaPorColaborador?.has(r.colaborador.id)) : [];
  const situacao = dados && !dados.lancamento ? verificarFechamento(competencia, dados.fechadas, dados.entrada.inicioControle ?? competencia) : null;

  const resultadoEdicao = editandoAvulsos ? comTarifa.find((r) => r.colaborador.id === editandoAvulsos) : undefined;

  // diferenças de valor em dias já pagos ainda não levadas ao DIF - AJC (reduções ou acréscimos não acertados antes)
  const diferencasPendentes = useMemo(() => {
    if (!dados || dados.lancamento) return [];
    return comTarifa
      .filter((r) => (dados.avulsos.get(r.colaborador.id)?.dif_dias.length ?? 0) === 0)
      // só reduções: acréscimos do mês vigente são pagos na hora, na aba Acertos
      .map((r) => ({ r, dif: diferencasDeValor(r.colaborador, dados.entrada).filter((d) => d.diferenca < 0) }))
      .filter((x) => x.dif.length > 0)
      .map((x) => ({ ...x, total: r2(x.dif.reduce((s, d) => s + d.diferenca, 0)) }));
  }, [dados, comTarifa]);
  const [aplicandoDif, setAplicandoDif] = useState(false);

  // acréscimos de valor no mês vigente (mês anterior à competência) ainda sem acerto: devem ser pagos na aba Acertos
  const acrescimosAgora = useMemo(() => {
    if (!dados || dados.lancamento) return [];
    const mesVigente = somarMeses(competencia, -1);
    return comTarifa.filter((r) => diferencasNoMes(r.colaborador, dados.entrada, mesVigente).some((d) => d.diferenca > 0));
  }, [dados, comTarifa, competencia]);

  // DIF - AJC calculado (aplicado antes) que não bate mais com os valores cadastrados, ex.: a vigência foi removida/alterada
  const difDesatualizado = useMemo(() => {
    if (!dados || dados.lancamento) return [];
    return comTarifa
      .map((r) => ({ r, av: dados.avulsos.get(r.colaborador.id) }))
      .filter((x): x is { r: typeof x.r; av: NonNullable<typeof x.av> } => !!x.av && x.av.dif_dias.length > 0)
      .map((x) => {
        const atuais = new Map(diferencasDeValor(x.r.colaborador, dados.entrada).map((d) => [d.data, d.novo]));
        const igual = x.av.dif_dias.length === atuais.size && x.av.dif_dias.every((d) => atuais.get(d.data) === d.novo);
        return { ...x, igual };
      })
      .filter((x) => !x.igual);
  }, [dados, comTarifa]);
  const [atualizandoDif, setAtualizandoDif] = useState(false);

  async function atualizarDifDesatualizado() {
    if (!dados) return;
    const ok = window.confirm(
      `Recalcular o DIF - AJC de ${difDesatualizado.length} promotor(es) com os valores cadastrados hoje?\n\nA parte calculada é substituída (se não houver mais diferença, ela é removida). Valores digitados manualmente no DIF - AJC são mantidos.`
    );
    if (!ok) return;
    setAtualizandoDif(true);
    for (const { r, av } of difDesatualizado) {
      const antigoCalculado = r2(av.dif_dias.reduce((s, d) => s + (d.novo - d.pago), 0));
      const manual = r2(av.dif_ajc - antigoCalculado);
      const novas = diferencasDeValor(r.colaborador, dados.entrada);
      const novoTotal = r2(novas.reduce((s, d) => s + d.diferenca, 0));
      const dif = r2(manual + novoTotal);
      const vazio = dif === 0 && av.internet === 0 && av.alimentacao === 0 && !av.observacao;
      const { error } = vazio
        ? await supabase.from('ajuda_custo_avulsos').delete().eq('competencia', competencia).eq('colaborador_id', r.colaborador.id)
        : await supabase.from('ajuda_custo_avulsos').update({
            dif_ajc: dif,
            dif_dias: novas.map((d) => ({ id: d.diaPagoId, data: d.data, pago: d.pago, novo: d.novo })),
            updated_at: new Date().toISOString(),
          }).eq('competencia', competencia).eq('colaborador_id', r.colaborador.id);
      if (error) {
        setAtualizandoDif(false);
        return toast.error('Erro ao atualizar: ' + error.message);
      }
    }
    setAtualizandoDif(false);
    toast.success('DIF - AJC atualizado.');
    avisarAcertosMudaram();
    carregar();
  }

  async function aplicarDiferencas() {
    const totalGeral = r2(diferencasPendentes.reduce((s, x) => s + x.total, 0));
    const ok = window.confirm(
      `Aplicar no DIF - AJC de ${diferencasPendentes.length} promotor(es) as diferenças de valor dos dias já pagos?\n\nTotal: ${moeda(totalGeral)} (negativo = desconto). Você ainda pode ajustar cada um pelo botão de avulsos antes de fechar.`
    );
    if (!ok) return;
    setAplicandoDif(true);
    const { error } = await supabase.from('ajuda_custo_avulsos').upsert(
      diferencasPendentes.map(({ r, dif, total }) => {
        const av = dados?.avulsos.get(r.colaborador.id);
        return {
          competencia,
          colaborador_id: r.colaborador.id,
          internet: av?.internet ?? 0,
          dif_ajc: r2((av?.dif_ajc ?? 0) + total),
          alimentacao: av?.alimentacao ?? 0,
          observacao: av?.observacao ?? null,
          dif_dias: dif.map((d) => ({ id: d.diaPagoId, data: d.data, pago: d.pago, novo: d.novo })),
          updated_at: new Date().toISOString(),
        };
      }),
      { onConflict: 'competencia,colaborador_id' }
    );
    setAplicandoDif(false);
    if (error) return toast.error('Erro ao aplicar: ' + error.message);
    toast.success('Diferenças aplicadas no DIF - AJC.');
    avisarAcertosMudaram();
    carregar();
  }

  async function fechar() {
    const ok = window.confirm(
      `Fechar o lançamento de ${nomeCompetencia(competencia)}?\n\nIsso grava o histórico do mês e passa a valer como base dos descontos dos próximos lançamentos. Você pode reabrir depois, se for o último mês fechado.`
    );
    if (!ok) return;
    setFechando(true);
    try {
      await fecharLancamento(competencia, comTarifa, user?.email ?? null, null, dados?.avulsos);
      toast.success(`${nomeCompetencia(competencia)} fechado.`);
      await carregar();
    } catch (e: any) {
      toast.error('Erro ao fechar: ' + e.message);
    } finally {
      setFechando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <label className={rotuloCampo}>Competência (mês que será pago)</label>
          <Input type="month" value={competencia} onChange={(e) => e.target.value && setCompetencia(e.target.value)} className="h-11 w-48 rounded-xl bg-white" />
        </div>
        {dados && !dados.lancamento && comTarifa.length > 0 && situacao?.ok && (
          <Button onClick={fechar} disabled={fechando} className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20">
            <CheckCircle2 className="w-4 h-4 mr-2" /> {fechando ? 'Fechando...' : `Fechar lançamento de ${nomeCompetencia(competencia)}`}
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-center py-20 text-zinc-400 text-sm">Calculando...</p>
      ) : !dados ? null : dados.lancamento ? (
        <LancamentoFechado
          key={dados.lancamento.id}
          lancamento={dados.lancamento}
          podeReabrir={dados.ultimaCompetenciaFechada === competencia}
          onReaberto={carregar}
        />
      ) : (
        <>
          {situacao && !situacao.ok && (
            <Aviso>
              <strong>Prévia:</strong> {situacao.motivo} Os valores abaixo simulam os meses anteriores ainda abertos fechando em sequência e não podem ser fechados agora.
            </Aviso>
          )}
          {estimados.length > 0 && (
            <Aviso>
              <strong>{estimados.length} promotor(es)</strong> com desconto <strong>estimado</strong>: {nomeCompetencia(somarMeses(competencia, -1))} não está fechado no sistema, então o valor pago nesse mês foi
              presumido (todos os dias com valor, exceto férias e feriados) e os dias com falta, atestado ou feriado local estão sendo descontados. Confira com o que foi realmente lançado antes de fechar:{' '}
              {estimados.slice(0, 8).map((r, i) => (
                <span key={r.colaborador.id}>
                  {i > 0 && ', '}
                  <strong>{r.colaborador.nome}</strong>
                </span>
              ))}
              {estimados.length > 8 && ` e mais ${estimados.length - 8}`}.
            </Aviso>
          )}
          {semPraca.length > 0 && (
            <Aviso>
              {semPraca.length} promotor(es) sem praça: feriados regionais cadastrados não são aplicados a eles. Defina a praça na aba Praças ou pela importação de valores.
            </Aviso>
          )}
          {resultados.some((r) => r.semTarifa) && (
            <Aviso>Promotores sem valores cadastrados não aparecem no cálculo. Cadastre em &quot;Valores por Dia&quot;.</Aviso>
          )}
          {acrescimosAgora.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-xs text-rose-900">
              <p>
                <strong>{acrescimosAgora.length} promotor(es)</strong> com acréscimo de valor no mês vigente que ainda não foi pago. Acréscimos são pagos na hora, não na folha:
                registre em Acertos.
              </p>
              <Link href="/ajuda-de-custo/complementos" className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700">Ir para Acertos</Link>
            </div>
          )}
          {!dados.avulsosIndisponiveis && difDesatualizado.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">
              <p>
                <strong>{difDesatualizado.length} promotor(es)</strong> com DIF - AJC calculado que não corresponde mais aos valores cadastrados (a vigência foi removida ou alterada depois de aplicar).
                Atualize para recalcular; se não houver mais diferença, o DIF - AJC calculado é removido.
              </p>
              <Button size="sm" disabled={atualizandoDif} onClick={atualizarDifDesatualizado} className="rounded-xl bg-amber-600 hover:bg-amber-700">
                {atualizandoDif ? 'Atualizando...' : 'Atualizar DIF - AJC'}
              </Button>
            </div>
          )}
          {!dados.avulsosIndisponiveis && diferencasPendentes.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-3 text-xs text-sky-900">
              <p>
                <strong>{diferencasPendentes.length} promotor(es)</strong> com redução de valor em dias já pagos (o valor diário diminuiu depois do pagamento). A redução entra como desconto
                (DIF - AJC negativo) nesta folha. Total: <strong>{moeda(r2(diferencasPendentes.reduce((s, x) => s + x.total, 0)))}</strong>.
              </p>
              <Button size="sm" disabled={aplicandoDif} onClick={aplicarDiferencas} className="rounded-xl bg-sky-700 hover:bg-sky-800">
                {aplicandoDif ? 'Aplicando...' : 'Aplicar no DIF - AJC'}
              </Button>
            </div>
          )}
          {dados.avulsosIndisponiveis && (
            <Aviso>Os lançamentos avulsos (Internet, DIF - AJC, Alimentação) ainda não estão disponíveis: execute scripts/ajuda-de-custo-avulsos.sql no Supabase.</Aviso>
          )}
          <TabelaLancamento
            linhas={comTarifa.map((r) => linhaDeResultado(r, dados.avulsos.get(r.colaborador.id)))}
            competencia={competencia}
            onEditarAvulsos={dados.avulsosIndisponiveis ? undefined : setEditandoAvulsos}
          />
          {resultadoEdicao && (
            <AvulsosDialog
              key={resultadoEdicao.colaborador.id}
              promotor={{ id: resultadoEdicao.colaborador.id, nome: resultadoEdicao.colaborador.nome, matricula: resultadoEdicao.colaborador.matricula ?? '' }}
              competencia={competencia}
              avulso={dados.avulsos.get(resultadoEdicao.colaborador.id)}
              diferencas={diferencasDeValor(resultadoEdicao.colaborador, dados.entrada)}
              onFechar={() => setEditandoAvulsos(null)}
              onSalvo={() => {
                setEditandoAvulsos(null);
                carregar();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  );
}
