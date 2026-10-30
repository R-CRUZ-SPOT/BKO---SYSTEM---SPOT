-- Ajuda de Custo dos promotores
-- Execute no SQL Editor do Supabase. É aditivo: não mexe nas tabelas existentes e pode ser rodado mais de uma vez.

-- 1. Valores por dia da semana de cada promotor (com histórico por vigência)
CREATE TABLE IF NOT EXISTS public.ajuda_custo_valores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  vigencia_inicio DATE NOT NULL,
  valor_dom NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_seg NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_ter NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_qua NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_qui NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_sex NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_sab NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (colaborador_id, vigencia_inicio)
);

-- 2. Ocorrências: férias, atestados, faltas e feriados locais (períodos de datas)
CREATE TABLE IF NOT EXISTS public.ajuda_custo_ocorrencias (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ferias', 'atestado', 'falta', 'feriado_local', 'desligamento')),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (data_fim >= data_inicio)
);
CREATE INDEX IF NOT EXISTS idx_ac_ocorrencias_colab ON public.ajuda_custo_ocorrencias (colaborador_id, data_inicio, data_fim);

-- 3. Feriados que valem para todos, além dos nacionais (que o sistema já conhece)
CREATE TABLE IF NOT EXISTS public.ajuda_custo_feriados (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  data DATE NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Lançamentos fechados (um por competência) - é o histórico mês a mês
CREATE TABLE IF NOT EXISTS public.ajuda_custo_lancamentos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  competencia TEXT NOT NULL UNIQUE CHECK (competencia ~ '^[0-9]{4}-[0-9]{2}$'),
  observacao TEXT,
  fechado_por TEXT,
  fechado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Resultado de cada promotor no lançamento
CREATE TABLE IF NOT EXISTS public.ajuda_custo_itens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lancamento_id UUID NOT NULL REFERENCES public.ajuda_custo_lancamentos(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  dias_trabalhados INT NOT NULL DEFAULT 0,
  bruto NUMERIC(10,2) NOT NULL DEFAULT 0,
  descontos NUMERIC(10,2) NOT NULL DEFAULT 0,
  saldo_anterior NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_pagar NUMERIC(10,2) NOT NULL DEFAULT 0,
  saldo_devedor NUMERIC(10,2) NOT NULL DEFAULT 0,
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (lancamento_id, colaborador_id)
);

-- 6. Snapshot dos dias efetivamente pagos em cada lançamento.
--    É isso que permite descontar depois apenas o que realmente foi pago.
CREATE TABLE IF NOT EXISTS public.ajuda_custo_dias (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.ajuda_custo_itens(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  -- preenchido quando o dia foi descontado em um lançamento posterior
  descontado_item_id UUID REFERENCES public.ajuda_custo_itens(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ac_dias_colab ON public.ajuda_custo_dias (colaborador_id, data);

-- RLS no mesmo padrão das demais tabelas
ALTER TABLE public.ajuda_custo_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajuda_custo_ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajuda_custo_feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajuda_custo_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajuda_custo_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajuda_custo_dias ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ajuda_custo_valores','ajuda_custo_ocorrencias','ajuda_custo_feriados','ajuda_custo_lancamentos','ajuda_custo_itens','ajuda_custo_dias']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Acesso total para autenticados') THEN
      EXECUTE format('CREATE POLICY "Acesso total para autenticados" ON public.%I FOR ALL USING (auth.role() = ''authenticated'')', t);
    END IF;
  END LOOP;
END $$;
