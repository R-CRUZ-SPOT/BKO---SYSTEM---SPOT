-- Salário do colaborador (vem da coluna SALARIO da planilha de Gestão de Pessoas).
-- Usado na Ajuda de Custo para mostrar quanto a ajuda representa do salário. Pode ser rodado mais de uma vez.
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS salario NUMERIC(10,2);
