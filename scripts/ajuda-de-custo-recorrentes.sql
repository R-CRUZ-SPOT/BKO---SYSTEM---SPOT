-- Ajuda de Custo: Internet recorrente (repete todo mês até ser encerrado)
-- Execute no SQL Editor do Supabase DEPOIS dos scripts anteriores. Pode ser rodado mais de uma vez.

CREATE TABLE IF NOT EXISTS public.ajuda_custo_recorrentes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'internet' CHECK (tipo IN ('internet')),
  valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  inicio TEXT NOT NULL CHECK (inicio ~ '^[0-9]{4}-[0-9]{2}$'),            -- primeira competência em que vale
  fim TEXT CHECK (fim IS NULL OR fim ~ '^[0-9]{4}-[0-9]{2}$'),             -- última competência em que vale (nulo = sem término)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (colaborador_id, tipo, inicio)
);

ALTER TABLE public.ajuda_custo_recorrentes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ajuda_custo_recorrentes' AND policyname = 'Acesso total para autenticados') THEN
    CREATE POLICY "Acesso total para autenticados" ON public.ajuda_custo_recorrentes FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;
