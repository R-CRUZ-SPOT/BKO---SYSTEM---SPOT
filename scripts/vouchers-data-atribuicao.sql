-- Data em que o voucher foi atribuído ao colaborador (usada na tela de aniversariantes)
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS data_atribuicao TIMESTAMP WITH TIME ZONE;

-- Vouchers já utilizados e sem data: assume a data de atualização
UPDATE public.vouchers
   SET data_atribuicao = updated_at
 WHERE data_atribuicao IS NULL
   AND (matricula IS NOT NULL OR colaborador_id IS NOT NULL);
