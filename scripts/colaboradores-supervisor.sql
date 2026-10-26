-- Colaboradores: supervisor de cada promotor
-- Execute no SQL Editor do Supabase. É aditivo e pode ser rodado mais de uma vez.
--
--  supervisor               nome do supervisor (um por promotor)
--  supervisor_origem        'planilha' (veio da planilha de Roteiro) ou 'manual' (editado em Gestão de Pessoas).
--                           Valores manuais NÃO são sobrescritos por uma nova importação do Roteiro, a menos que
--                           o usuário peça para substituir.
--  supervisor_atualizado_em quando o supervisor foi definido/alterado pela última vez

ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS supervisor TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS supervisor_origem TEXT CHECK (supervisor_origem IS NULL OR supervisor_origem IN ('planilha', 'manual'));
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS supervisor_atualizado_em TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_colaboradores_supervisor ON public.colaboradores (supervisor);
