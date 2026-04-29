-- Executar no SQL Editor do Supabase

-- 1. LIMPEZA (Limpar todas as tabelas e regras antigas pra evitar conflitos)
-- Remover a trigger e a função associada (se existir)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Remover as tabelas, se existirem (CASCADE remove todas as chaves estrangeiras e políticas associadas)
DROP TABLE IF EXISTS public.vouchers CASCADE;
DROP TABLE IF EXISTS public.vinculos CASCADE;
DROP TABLE IF EXISTS public.linhas CASCADE;
DROP TABLE IF EXISTS public.aparelhos CASCADE;
DROP TABLE IF EXISTS public.colaboradores CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 2. CRIAÇÃO

-- Habilitar a extensão pgcrypto
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Criar tabela de profiles para gerenciar perfis de acesso
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'BKO')) DEFAULT 'BKO',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS em profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura de perfis permitida para todos autenticados" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Atualização de perfis apenas por ADMIN" ON public.profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

-- Trigger para criar profile automaticamente após sign up
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'ADMIN'); -- Definindo temporariamente o primeiro a se logar como ADMIN (Ajuste caso queira usar painel admin depois para atribuir o papel)
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Tabela de colaboradores
CREATE TABLE public.colaboradores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  matricula TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  email TEXT,
  email_validado BOOLEAN DEFAULT FALSE,
  data_admissao DATE,
  job TEXT,
  cargo TEXT,
  data_nascimento DATE,
  cpf TEXT,
  rg TEXT,
  ctps TEXT,
  serie_ctps TEXT,
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  data_inativacao TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de aparelhos
CREATE TABLE public.aparelhos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  imei TEXT UNIQUE NOT NULL,
  modelo TEXT,
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de linhas
CREATE TABLE public.linhas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ddd TEXT,
  numero TEXT UNIQUE NOT NULL,
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de vinculos (historico)
CREATE TABLE public.vinculos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  aparelho_id UUID REFERENCES public.aparelhos(id) ON DELETE CASCADE,
  linha_id UUID REFERENCES public.linhas(id) ON DELETE CASCADE,
  data_inicio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_fim TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de vouchers
CREATE TABLE public.vouchers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  produto TEXT NOT NULL,
  valor TEXT NOT NULL,
  validade DATE,
  codigo TEXT NOT NULL,
  matricula TEXT,
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'disponível' CHECK (status IN ('disponível', 'utilizado')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS em todas as tabelas e permitir acesso para autenticados
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aparelhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total para autenticados" ON public.colaboradores FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso total para autenticados" ON public.aparelhos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso total para autenticados" ON public.linhas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso total para autenticados" ON public.vinculos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso total para autenticados" ON public.vouchers FOR ALL USING (auth.role() = 'authenticated');
