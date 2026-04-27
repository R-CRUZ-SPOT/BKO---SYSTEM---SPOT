-- Script para apagar TODOS os registros do banco de dados BKO SYSTEM
-- ATENÇÃO: Isso apagará todos os dados das tabelas de forma irreversível.
-- Recomenda-se executar isso apenas em ambiente de testes ou antes de uma nova importação geral.

-- Para executar:
-- 1. Acesse o painel do Supabase (supabase.com)
-- 2. Vá em 'SQL Editor' no menu lateral esquerdo
-- 3. Crie uma nova query (New Query)
-- 4. Cole o código abaixo e clique em 'Run' (ou pressione Cmd/Ctrl + Enter)

-- A instrução CASCADE garante que, se houver chaves estrangeiras, a deleção em cadeia aconteça corretamente sem erros de dependência.

TRUNCATE TABLE vouchers CASCADE;
TRUNCATE TABLE aparelhos CASCADE;
TRUNCATE TABLE linhas CASCADE;
TRUNCATE TABLE colaboradores CASCADE;

-- Se o seu sistema também tiver tabelas de log ou histórico de importação que você deseja resetar,
-- você pode adicionar comandos TRUNCATE semelhantes para essas tabelas aqui.
