# Documentação Técnica e Operacional - BKO SYSTEM

Este documento fornece uma visão detalhada do **BKO SYSTEM**, abrangendo sua arquitetura, telas, funcionalidades, configurações de segurança e orientações para resolução de problemas.

---

## 1. Visão Geral do Sistema
O **BKO SYSTEM** é uma plataforma avançada de gestão de Backoffice, desenvolvida para gerenciar ativos corporativos (aparelhos e linhas), informações de colaboradores e premiações (vouchers).

**Tecnologias Principais:**
- **Frontend:** Next.js 15 (App Router), Tailwind CSS, Lucide React (Ícones), Motion (Animações).
- **Backend/Banco de Dados:** Supabase (Auth, PostgreSQL DB, Row Level Security).
- **Linguagem:** TypeScript.

---

## 2. Arquitetura de Dados (Database)

O sistema utiliza o Supabase como banco de dados relacional. Abaixo estão as principais tabelas e suas funções:

### Tabelas
- `profiles`: Armazena o perfil de acesso do usuário logado no sistema (`ADMIN` ou `BKO`).
- `colaboradores`: Cadastro principal de funcionários (Matrícula, Nome, Cargo, Status, Data de Nascimento).
- `aparelhos`: Inventário de dispositivos móveis (IMEI, Modelo).
- `linhas`: Controle de números de telefone corporativos (DDD, Número).
- `vinculos`: Histórico de qual aparelho e linha está com qual colaborador em determinado período.
- `vouchers`: Gestão de prêmios e cartões-presente (Código, Valor, Validade, Status).

### Relacionamentos
- Um **Aparelho** ou **Linha** pode estar vinculado a um **Colaborador**.
- Um **Voucher** pode ser atribuído a um **Colaborador** (via matrícula).

---

## 3. Segurança e Regras de Acesso (RLS)

O sistema utiliza **Row Level Security (RLS)** do Supabase para garantir que os dados estejam protegidos.

### Regras de Acesso (Políticas)
1.  **Profiles**:
    -   Leitura: Permitida para qualquer usuário autenticado.
    -   Escrita/Update: Restrita a usuários com a role `ADMIN`.
2.  **Dados Operacionais (Colaboradores, Aparelhos, Linhas, etc.)**:
    -   Acesso Total: Usuários autenticados podem visualizar e editar os dados, desde que possuam login válido no sistema.
3.  **Roles (Papéis)**:
    -   `ADMIN`: Possui acesso total ao sistema, incluindo a tela de gestão de usuários para alterar permissões.
    -   `BKO`: Acesso operacional às telas de gestão, mas não pode gerenciar perfis de outros usuários.

---

## 4. Telas e Funcionalidades

### 4.1 Login / Autenticação
- Acesso restrito via e-mail e senha.
- **Segurança:** Sessão expira automaticamente após 30 minutos de inatividade para proteção dos dados.

### 4.2 Dashboard (Visão Geral)
- Métricas rápidas sobre o estado do Backoffice.
- Alerta visual sobre aniversariantes do dia através de badges no menu.

### 4.3 Gestão de Pessoas (Colaboradores)
- Listagem, cadastro, edição e inativação de colaboradores.
- Importação massiva via arquivo Excel (.xlsx).
- Busca por matrícula ou nome.

### 4.4 Aniversariantes
- Visualização de todos os colaboradores que fazem aniversário no dia atual.
- Facilitador para ações de engajamento e premiação.

### 4.5 Inventário de Celulares (Aparelhos)
- Controle de estoque e atribuição de aparelhos via IMEI.
- Possibilidade de vincular/desvincular aparelhos de colaboradores.

### 4.6 Controle de Linhas
- Gestão de chips e números corporativos.
- Histórico de utilização por colaborador.

### 4.7 Gestão de Vouchers
- Banco de códigos de premiação.
- Controle de status (`disponível` ou `utilizado`).
- Histórico de entrega de vouchers por matrícula.

### 4.8 Administração (Usuarios)
- Exclusiva para `ADMIN`.
- Lista usuários que já acessaram o sistema e permite alterar o nível de acesso entre `BKO` e `ADMIN`.

---

## 5. Manutenção e Troubleshooting (Resolução de Problemas)

### 5.1 Erros de Conectividade com o Banco de Dados
**Sintoma:** O sistema exibe um aviso de que as variáveis de ambiente estão ausentes ou os dados não carregam.
-   **Causa:** `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` não configurados.
-   **Solução:** Verificar as configurações de Secrets (Segredos) no painel do AI Studio ou o arquivo `.env.local`.

### 5.2 Erro de Permissão (Permission Denied)
**Sintoma:** Ao tentar salvar um dado, o sistema retorna erro de permissão.
-   **Causa:** A política de RLS no Supabase pode estar bloqueando a ação ou o usuário perdeu o acesso `ADMIN`.
-   **Solução:** 
    1.  Verificar no editor SQL do Supabase se as tabelas possuem `ENABLE ROW LEVEL SECURITY`.
    2.  Executar novamente o script `supabase.sql` se houver suspeita de corrupção nas regras.

### 5.3 Problemas com Autenticação (Loop de Login)
**Sintoma:** O usuário faz login mas é redirecionado de volta para a tela inicial.
-   **Causa:** O perfil do usuário na tabela `profiles` pode não ter sido criado corretamente.
-   **Solução:** O sistema possui uma trigger automática (`on_auth_user_created`), mas caso falhe, verifique se o ID do usuário no `auth.users` existe na tabela `public.profiles`.

### 5.4 Expiração de Sessão
**Sintoma:** O usuário é deslogado "do nada".
-   **Causa:** Inatividade por mais de 30 minutos ou fechamento da aba do navegador (usamos `sessionStorage` para segurança máxima).
-   **Solução:** Basta realizar o login novamente.

---

## 6. Scripts Auxiliares (Localizados em /scripts)
-   `supabase.sql`: Script mestre para recriar toda a estrutura do banco e regras de segurança.
-   `limpar-banco.sql`: Remove todos os dados operacionais (use com cautela).

---

## 7. Melhores Práticas de Operação
1.  **Backup de Regras:** Sempre mantenha o arquivo `supabase.sql` atualizado no repositório. Ele é sua garantia de recuperação rápida em caso de desastre.
2.  **Inativação vs Exclusão:** Evite excluir colaboradores. Use o status "inativo" para manter a integridade do histórico de vínculos e vouchers.
3.  **Matrícula Única:** A matrícula é o identificador único para importações. Garanta que o Excel de importação siga o padrão de colunas esperado pela tela de Colaboradores.

---
*Documentação gerada automaticamente para suporte à continuidade do projeto BKO SYSTEM.*

## Ajuda de Custo (transporte dos promotores)

Rota `/ajuda-de-custo`. Antes de usar, execute no SQL Editor do Supabase, nesta ordem: `scripts/ajuda-de-custo.sql`, `scripts/ajuda-de-custo-pracas.sql`, `scripts/ajuda-de-custo-avulsos.sql` e `scripts/ajuda-de-custo-complementos.sql` e `scripts/ajuda-de-custo-recorrentes.sql`. Para identificar promotores temporários (TMP), execute também `scripts/colaboradores-empresa.sql` e reimporte a planilha de colaboradores (a coluna EMPRESA passa a ser guardada).

- **Valores por Dia**: valor de cada dia da semana por promotor, com histórico por data de vigência.
- **Ocorrências**: férias, atestados, faltas e feriados locais (períodos de datas).
- **Feriados**: nacionais (calculados) + feriados adicionais, para todos ou por **praça**, com opção "repete todo ano" (data fixa).
- **Praças**: cidade/estado do promotor (uma por promotor). Feriados regionais valem automaticamente para quem está na praça.
- **Cálculo do Mês**: competência = mês seguinte. Bruto = Σ valor do dia × dias do mês (sem feriados/ocorrências).
  Descontos = dias **já pagos** em lançamentos fechados que agora têm ocorrência. Se descontos > bruto, paga 0 e o saldo
  devedor é abatido no lançamento seguinte. "Fechar" grava o snapshot dos dias pagos (`ajuda_custo_dias`).
- **Lançamentos avulsos** (botão ao final de cada promotor no Cálculo do Mês): **Internet** e **DIF - AJC** somam ao valor a lançar (DIF - AJC aceita valor negativo); **Alimentação** é lançamento à parte e não soma. "Calcular diferença" compara o valor pago nos dias já pagos com o valor vigente hoje (para mudança retroativa de roteiro/valores; a vigência do novo valor deve ser a data real da mudança) e preenche o DIF - AJC; ao fechar, esses dias passam a valer o valor ajustado.
- **Acertos** (acerto imediato): quando o valor diário muda durante o mês e a diferença precisa ser paga na hora. Calcula, para o mês escolhido, a diferença entre o valor já pago (ou presumido, se o mês não está fechado no sistema) e o valor vigente, do dia da nova vigência até o fim do mês. Registra uma lista de pagamentos a lançar (com marca de "lançado"); os dias passam a valer o valor acertado, então o fechamento seguinte não cobra/paga a diferença de novo.
- **Temporários e filtros**: promotores com EMPRESA = TMP aparecem com destaque (linha amarela e selo TMP) no Cálculo do Mês, no Histórico e em Acertos. O Cálculo do Mês tem busca por nome/matrícula e filtro por tipo de contratação (EMPRESA); cartões e exportação seguem o filtro. Há cartões com o total a lançar de **CLT + MKT** e de **TMP**. No cadastro manual do colaborador, informe a EMPRESA (CLT, TMP, MKT etc.); a edição também permite alterá-la.
- **Internet recorrente**: no diálogo de avulsos, a opção *Recorrente* repete o Internet todo mês a partir da competência até ser desmarcada (a regra fica no promotor, com início e fim; meses fechados não mudam). Alterar o valor vale dali em diante; desmarcar encerra a repetição e o valor digitado vale só naquele mês.
- **Supervisor**: cada promotor tem um supervisor (colunas `supervisor`, `supervisor_origem` e `supervisor_atualizado_em` em `colaboradores`; execute `scripts/colaboradores-supervisor.sql`). Vem da planilha de Roteiro (botão *Supervisores* em Gestão de Pessoas, com conferência antes de gravar) ou é editado no cadastro do colaborador. Valores editados manualmente **não** são sobrescritos por uma nova importação do Roteiro, a menos que o usuário peça para substituir ou marque "voltar a seguir a planilha". Aparece no Cálculo do Mês (filtro, Excel), Acertos e no Dashboard (valor por supervisor).
- **Desligamento** (tipo de ocorrência): informa-se o primeiro e o último dia (os demais tipos pedem o primeiro dia e a quantidade de dias). Os dias do período não são pagos e dias já pagos nele são descontados na folha seguinte; prevalece sobre os outros tipos no mesmo dia. Em bancos existentes, execute `scripts/ajuda-de-custo-desligamento.sql`. **Inativação automática**: quando o primeiro dia do desligamento chega (verificado ao abrir o sistema e ao salvar a ocorrência), o promotor ativo é inativado com data de inativação = primeiro dia, liberando aparelhos e linhas e encerrando vínculos (`lib/inativar-desligados.ts`). O painel de descontos pendentes do mês fechado lista só os desligados.
- **Descontos pendentes após o fechamento**: no mês fechado, um painel lista os dias já pagos que depois ganharam desligamento, atestado, falta, férias ou feriado e ainda não foram descontados (valor efetivamente pago, com Excel). Ativos são descontados na folha seguinte; **desligados** ficam destacados, pois não terão folha seguinte e o valor é acertado na rescisão (somente informativo). Rotina: pagar com a exportação do sistema e **fechar o mês na hora do pagamento** (conferindo que o A lançar é igual ao pago); o que surgir depois aparece nesse painel e na prévia do mês seguinte.
- **Pago após o fechamento**: promotor que entra no mês depois do fechamento (valores por dia cadastrados com vigência na data de entrada) aparece, no último mês fechado, no painel "ficaram fora do fechamento". Após pagar, *Registrar pagamento* inclui o promotor na folha do mês, sinalizado como "Pago após o fechamento" (com a data), e os dias pagos passam a valer para descontos futuros.
- **Dashboard**: indicadores e gráficos dos lançamentos fechados (evolução, descontos por motivo, valor por praça, ausências, ranking, afastados hoje).
- **Histórico**: lançamentos fechados mês a mês; o último pode ser reaberto.

Para zerar o módulo (ex.: após testes): `scripts/ajuda-de-custo-limpar.sql`.

Motor de cálculo: `lib/ajuda-custo.ts` (puro). Testes: `node --test lib/ajuda-custo.test.mjs`.
