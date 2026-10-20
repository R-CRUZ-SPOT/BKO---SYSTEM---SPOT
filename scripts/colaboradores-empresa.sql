-- Colaboradores: guarda a coluna EMPRESA da planilha de importação (tipo de contratação, ex.: TMP = temporário)
-- Execute no SQL Editor do Supabase ANTES de reimportar a planilha. É aditivo e pode ser rodado mais de uma vez.
-- Depois, reimporte a planilha em Gestão de Pessoas: a importação atualiza os colaboradores já cadastrados.

ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS empresa TEXT;
