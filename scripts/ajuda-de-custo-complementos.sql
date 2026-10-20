-- Ajuda de Custo: acertos imediatos (complementos) de diferença de valor no mês corrente
-- Execute no SQL Editor do Supabase DEPOIS dos scripts anteriores. Pode ser rodado mais de uma vez.

CREATE TABLE IF NOT EXISTS public.ajuda_custo_complementos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL CHECK (competencia ~ '^[0-9]{4}-[0-9]{2}$'),   -- mês dos dias acertados
  valor NUMERIC(10,2) NOT NULL,                                            -- total a pagar agora (pode ser negativo)
  dias JSONB NOT NULL DEFAULT '[]'::jsonb,                                 -- [{data, pago, novo}]: dias acertados
  observacao TEXT,
  criado_por TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  lancado_em TIMESTAMP WITH TIME ZONE                                      -- preenchido quando o pagamento foi efetuado
);
CREATE INDEX IF NOT EXISTS idx_ac_complementos_colab ON public.ajuda_custo_complementos (colaborador_id, competencia);

ALTER TABLE public.ajuda_custo_complementos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ajuda_custo_complementos' AND policyname = 'Acesso total para autenticados') THEN
    CREATE POLICY "Acesso total para autenticados" ON public.ajuda_custo_complementos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;
