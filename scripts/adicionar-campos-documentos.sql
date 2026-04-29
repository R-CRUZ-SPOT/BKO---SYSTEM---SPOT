-- Executar no SQL Editor do Supabase para adicionar novos campos
ALTER TABLE public.colaboradores
ADD COLUMN cpf TEXT,
ADD COLUMN rg TEXT,
ADD COLUMN ctps TEXT,
ADD COLUMN serie_ctps TEXT;
