-- Execute no SQL Editor do Supabase para adicionar suporte a fotos de perfil

-- 1. Adicionar coluna foto_url na tabela colaboradores
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- 2. Criar um bucket (pasta de armazenamento) para os avatares (se não existir)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Configurar regras de segurança para o bucket (permitir envio por usuários autenticados)
-- Permite que usuários autenticados façam upload de imagens
CREATE POLICY "Permitir upload de fotos para autenticados" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'avatars');

-- Permite que usuários autenticados atualizem fotos
CREATE POLICY "Permitir alteração de fotos para autenticados" 
ON storage.objects FOR UPDATE 
TO authenticated 
WITH CHECK (bucket_id = 'avatars');

-- Permite que qualquer pessoa acesse as fotos publicamente para vizualização no sistema
CREATE POLICY "Permitir acesso público às fotos" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'avatars');
