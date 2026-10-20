-- Ajuda de Custo: praças (cidade/estado) e feriados regionais recorrentes
-- Execute no SQL Editor do Supabase DEPOIS de scripts/ajuda-de-custo.sql. Pode ser rodado mais de uma vez.

-- 1. Praças (ex.: "Salvador/BA")
CREATE TABLE IF NOT EXISTS public.ajuda_custo_pracas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_pracas_nome ON public.ajuda_custo_pracas (lower(nome));

-- 2. Cada promotor pertence a no máximo uma praça (a chave primária garante isso)
CREATE TABLE IF NOT EXISTS public.ajuda_custo_promotor_praca (
  colaborador_id UUID PRIMARY KEY REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  praca_id UUID NOT NULL REFERENCES public.ajuda_custo_pracas(id) ON DELETE CASCADE
);

-- 3. Feriados: agora podem ser de uma praça (praca_id) e repetir todo ano (recorrente)
ALTER TABLE public.ajuda_custo_feriados ADD COLUMN IF NOT EXISTS praca_id UUID REFERENCES public.ajuda_custo_pracas(id) ON DELETE RESTRICT;
ALTER TABLE public.ajuda_custo_feriados ADD COLUMN IF NOT EXISTS recorrente BOOLEAN NOT NULL DEFAULT FALSE;

-- A data deixa de ser única sozinha: a mesma data pode existir em praças diferentes
ALTER TABLE public.ajuda_custo_feriados DROP CONSTRAINT IF EXISTS ajuda_custo_feriados_data_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_feriados_data_praca
  ON public.ajuda_custo_feriados (data, COALESCE(praca_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- RLS no mesmo padrão das demais tabelas
ALTER TABLE public.ajuda_custo_pracas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajuda_custo_promotor_praca ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ajuda_custo_pracas','ajuda_custo_promotor_praca']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Acesso total para autenticados') THEN
      EXECUTE format('CREATE POLICY "Acesso total para autenticados" ON public.%I FOR ALL USING (auth.role() = ''authenticated'')', t);
    END IF;
  END LOOP;
END $$;
