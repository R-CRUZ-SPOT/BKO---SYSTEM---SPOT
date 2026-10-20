'use client';

import { useEffect, useState } from 'react';
import { diferencasNoMes, somarMeses } from '@/lib/ajuda-custo';
import { carregarEntrada } from '@/lib/ajuda-custo-data';

// Quantos promotores têm diferença de valor (acréscimo) pendente de acerto imediato no mês corrente (para a bolinha vermelha dos menus).
// O resultado fica em cache por 1 minuto e é recalculado quando um acerto é registrado/excluído.

const EVENTO = 'ajuda-custo-acertos-mudou';
const TTL = 60_000;
let cache: { em: number; n: number } | null = null;
let emAndamento: Promise<number> | null = null;

async function buscar(): Promise<number> {
  if (cache && Date.now() - cache.em < TTL) return cache.n;
  if (!emAndamento) {
    emAndamento = (async () => {
      try {
        const mes = new Date().toLocaleDateString('sv-SE').slice(0, 7);
        const { entrada } = await carregarEntrada(somarMeses(mes, 1));
        const n = entrada.colaboradores.filter((c) => diferencasNoMes(c, entrada, mes).some((d) => d.diferenca > 0)).length;
        cache = { em: Date.now(), n };
        return n;
      } catch {
        return 0; // tabelas ainda não criadas, sem permissão etc.: simplesmente não sinaliza
      } finally {
        emAndamento = null;
      }
    })();
  }
  return emAndamento;
}

/** Avisa os menus que os acertos mudaram (chame depois de registrar, excluir ou cadastrar valores). */
export function avisarAcertosMudaram() {
  cache = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO));
}

export function useAcertosPendentes(ativo = true) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const carregar = () => {
      buscar().then((v) => vivo && setN(v));
    };
    carregar();
    window.addEventListener(EVENTO, carregar);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO, carregar);
    };
  }, [ativo]);
  return n;
}
