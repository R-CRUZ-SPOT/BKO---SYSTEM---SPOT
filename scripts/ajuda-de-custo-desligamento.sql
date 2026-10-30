-- Ajuda de Custo: novo tipo de ocorrência "desligamento"
-- Execute no SQL Editor do Supabase. Para bancos que já têm a tabela de ocorrências (o script ajuda-de-custo.sql
-- já nasce com o novo tipo). Pode ser rodado mais de uma vez.

ALTER TABLE public.ajuda_custo_ocorrencias DROP CONSTRAINT IF EXISTS ajuda_custo_ocorrencias_tipo_check;
ALTER TABLE public.ajuda_custo_ocorrencias
  ADD CONSTRAINT ajuda_custo_ocorrencias_tipo_check
  CHECK (tipo IN ('ferias', 'atestado', 'falta', 'feriado_local', 'desligamento'));
