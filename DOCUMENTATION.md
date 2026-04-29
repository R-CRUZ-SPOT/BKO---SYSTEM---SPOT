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
