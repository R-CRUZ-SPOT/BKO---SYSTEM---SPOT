-- Ajuda de Custo: APAGA TODOS OS DADOS do módulo (testes) e deixa as tabelas vazias.
-- Execute no SQL Editor do Supabase. NÃO apaga colaboradores nem nenhuma outra tabela do sistema.
-- Irreversível: lançamentos fechados, ocorrências, valores, feriados, praças e vínculos serão removidos.

BEGIN;

DELETE FROM public.ajuda_custo_lancamentos;      -- apaga em cascata itens e dias pagos
DELETE FROM public.ajuda_custo_complementos;
DELETE FROM public.ajuda_custo_avulsos;
DELETE FROM public.ajuda_custo_ocorrencias;
DELETE FROM public.ajuda_custo_valores;
DELETE FROM public.ajuda_custo_promotor_praca;
DELETE FROM public.ajuda_custo_feriados;         -- antes das praças (feriados referenciam praças)
DELETE FROM public.ajuda_custo_pracas;

COMMIT;

-- Conferência: todas devem retornar 0
SELECT 'lancamentos' AS tabela, COUNT(*) FROM public.ajuda_custo_lancamentos
UNION ALL SELECT 'itens', COUNT(*) FROM public.ajuda_custo_itens
UNION ALL SELECT 'dias', COUNT(*) FROM public.ajuda_custo_dias
UNION ALL SELECT 'complementos', COUNT(*) FROM public.ajuda_custo_complementos
UNION ALL SELECT 'avulsos', COUNT(*) FROM public.ajuda_custo_avulsos
UNION ALL SELECT 'ocorrencias', COUNT(*) FROM public.ajuda_custo_ocorrencias
UNION ALL SELECT 'valores', COUNT(*) FROM public.ajuda_custo_valores
UNION ALL SELECT 'promotor_praca', COUNT(*) FROM public.ajuda_custo_promotor_praca
UNION ALL SELECT 'feriados', COUNT(*) FROM public.ajuda_custo_feriados
UNION ALL SELECT 'pracas', COUNT(*) FROM public.ajuda_custo_pracas;
