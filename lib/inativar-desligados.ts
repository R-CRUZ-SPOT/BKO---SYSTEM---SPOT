import { supabase } from '@/lib/supabase';
import { dataCache } from '@/lib/data-cache';

/**
 * Inativa os promotores cujo desligamento (ocorrência da Ajuda de Custo) já começou: do primeiro dia até o último,
 * o promotor ainda ativo passa a inativo, com data de inativação igual ao primeiro dia. Segue o mesmo efeito da
 * inativação manual (libera aparelhos e linhas e encerra os vínculos). Devolve os nomes dos inativados.
 * Só vale para desligamentos em curso: quem foi reativado depois que o período terminou não é inativado de novo.
 */
export async function inativarDesligadosVigentes(): Promise<string[]> {
  try {
    const hoje = new Date().toLocaleDateString('sv-SE');
    const { data: ocorrencias, error } = await supabase
      .from('ajuda_custo_ocorrencias')
      .select('colaborador_id, data_inicio')
      .eq('tipo', 'desligamento')
      .lte('data_inicio', hoje)
      .gte('data_fim', hoje);
    if (error || !ocorrencias?.length) return [];

    const inicioPorId = new Map<string, string>();
    ocorrencias.forEach((o: any) => {
      const atual = inicioPorId.get(o.colaborador_id);
      if (!atual || o.data_inicio < atual) inicioPorId.set(o.colaborador_id, o.data_inicio);
    });
    const ids = [...inicioPorId.keys()];

    const ativos: { id: string; nome: string }[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from('colaboradores').select('id, nome').in('id', ids.slice(i, i + 100)).eq('status', 'ativo');
      (data ?? []).forEach((c: any) => ativos.push({ id: c.id, nome: c.nome }));
    }
    if (ativos.length === 0) return [];

    for (const c of ativos) {
      const inicio = inicioPorId.get(c.id)!;
      const { error: erroUpdate } = await supabase.from('colaboradores').update({ status: 'inativo', data_inativacao: `${inicio}T00:00:00` }).eq('id', c.id);
      if (erroUpdate) throw erroUpdate;
      await supabase.from('aparelhos').update({ colaborador_id: null }).eq('colaborador_id', c.id);
      await supabase.from('linhas').update({ colaborador_id: null }).eq('colaborador_id', c.id);
      await supabase.from('vinculos').update({ data_fim: `${inicio}T00:00:00` }).eq('colaborador_id', c.id).is('data_fim', null);
    }
    dataCache.invalidate('colaboradores');
    dataCache.invalidate('dashboard_stats');
    return ativos.map((c) => c.nome);
  } catch (e) {
    console.error('Inativação automática de desligados falhou:', e);
    return [];
  }
}
