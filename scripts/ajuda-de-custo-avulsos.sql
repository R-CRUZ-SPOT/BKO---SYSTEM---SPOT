-- Ajuda de Custo: lançamentos avulsos (Internet, DIF - AJC, Alimentação) e acerto de diferença de valores
-- Execute no SQL Editor do Supabase DEPOIS dos scripts anteriores. Pode ser rodado mais de uma vez.

-- 1. Lançamentos avulsos por promotor e competência (editáveis até o fechamento)
CREATE TABLE IF NOT EXISTS public.ajuda_custo_avulsos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  competencia TEXT NOT NULL CHECK (competencia ~ '^[0-9]{4}-[0-9]{2}$'),
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  internet NUMERIC(10,2) NOT NULL DEFAULT 0,
  dif_ajc NUMERIC(10,2) NOT NULL DEFAULT 0,      -- diferença de ajuda de custo; pode ser negativa
  alimentacao NUMERIC(10,2) NOT NULL DEFAULT 0,  -- lançamento à parte, não soma ao valor a lançar
  observacao TEXT,
  dif_dias JSONB NOT NULL DEFAULT '[]'::jsonb,   -- dias pagos acertados pelo DIF - AJC
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (competencia, colaborador_id)
);

-- 2. Congela os avulsos no lançamento fechado
ALTER TABLE public.ajuda_custo_itens ADD COLUMN IF NOT EXISTS internet NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.ajuda_custo_itens ADD COLUMN IF NOT EXISTS dif_ajc NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.ajuda_custo_itens ADD COLUMN IF NOT EXISTS alimentacao NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 3. Dias pagos cuja diferença de valor foi acertada passam a valer o valor ajustado
ALTER TABLE public.ajuda_custo_dias ADD COLUMN IF NOT EXISTS valor_ajustado NUMERIC(10,2);
ALTER TABLE public.ajuda_custo_dias ADD COLUMN IF NOT EXISTS ajustado_item_id UUID REFERENCES public.ajuda_custo_itens(id) ON DELETE SET NULL;

-- RLS no mesmo padrão das demais tabelas
ALTER TABLE public.ajuda_custo_avulsos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ajuda_custo_avulsos' AND policyname = 'Acesso total para autenticados') THEN
    CREATE POLICY "Acesso total para autenticados" ON public.ajuda_custo_avulsos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;
