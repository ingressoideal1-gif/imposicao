-- ─────────────────────────────────────────────────────────────────────────────
-- Os segredos que as Edge Functions precisam, guardados no banco
-- ─────────────────────────────────────────────────────────────────────────────
--
-- POR QUE ISTO EXISTE
--
-- O lugar natural destes valores seria "Edge Functions → Secrets" do Supabase.
-- Não deu: o projeto vive na organização do parceiro, e a conta do usuário
-- (ingressoideal1@gmail.com) tem papel **Developer** ali — que publica função
-- mas não administra segredo. Medido em 16/08/2026: `POST /v1/projects/{ref}/
-- secrets` responde 403 tanto pela CLI quanto pela API de gerenciamento, e o
-- painel recusaria pelo mesmo motivo.
--
-- Só o Owner (everton.prd@gmail.com) pode colá-los lá. Enquanto isso não
-- acontece, esta tabela é o caminho — e as funções leem **o ambiente primeiro**,
-- esta tabela depois. No dia em que os segredos entrarem nos Secrets de
-- verdade, eles passam a vencer sozinhos e esta tabela vira peso morto, que se
-- apaga com um `DROP TABLE`.
--
-- O QUE ISTO CUSTA EM SEGURANÇA, HONESTAMENTE
--
-- Um segredo em variável de ambiente não é legível pela API de dados de jeito
-- nenhum. Aqui ele passa a ser legível por quem tiver a `service_role`.
--
-- Isso NÃO amplia o estrago de um vazamento, e a razão é simples: quem tem a
-- `service_role` já escreve direto em qualquer tabela deste banco. Forjar um QR
-- do Pedido ou um bilhete de elevação serve para conseguir escrever no banco
-- *através da API* — é estritamente menos poder do que já se tem com a chave.
-- A chave-mestra continua sendo a coisa a proteger, e ela não mudou de lugar.
--
-- O que a tabela NÃO pode ser é legível por `anon` ou `authenticated`. Daí o
-- RLS ligado sem política nenhuma, logo abaixo.

CREATE TABLE IF NOT EXISTS imposition_segredos (
    nome        TEXT PRIMARY KEY,
    valor       TEXT NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS LIGADO E SEM POLÍTICA NENHUMA.
--
-- É a configuração mais fechada que existe: `anon` e `authenticated` recebem
-- zero linhas, e a `service_role` passa por cima do RLS por natureza. Não
-- escreva política aqui — qualquer política é mais permissiva do que nenhuma.
--
-- ARMADILHA JÁ DOCUMENTADA NESTE PROJETO (16/08/2026, tabela do freio de força
-- bruta): com RLS ligado e nenhuma política, o PostgREST responde **200 e 204**
-- para leitura e escrita da chave anônima, sem fazer nada. Ver "200 não é
-- prova" abaixo. Não conclua que a tabela está aberta por causa do código de
-- resposta; confira lendo de volta.
ALTER TABLE imposition_segredos ENABLE ROW LEVEL SECURITY;

-- Também tiramos o GRANT: sem ele, nem o RLS precisa ser consultado.
REVOKE ALL ON imposition_segredos FROM anon, authenticated;

COMMENT ON TABLE imposition_segredos IS
    'Segredos das Edge Functions. Só a service_role lê. O ambiente vence esta '
    'tabela quando a variável existir — ver _compartilhado/segredos.ts.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 200 NÃO É PROVA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Para conferir que está mesmo fechada, não basta ver o código de resposta com
-- a chave anônima. O teste que vale é: escrever uma linha com a chave de
-- serviço, e tentar LER ela de volta com a anônima. Se voltar vazio, está certo.
--
--   -- com a service_role:
--   insert into imposition_segredos (nome, valor) values ('_teste', 'x');
--   -- com a anon, via PostgREST:
--   GET /rest/v1/imposition_segredos?nome=eq._teste   →  tem de vir []
--   delete from imposition_segredos where nome = '_teste';
