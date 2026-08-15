-- ============================================================
-- STORAGE — tirar a LISTAGEM anonima de quatro buckets
-- ============================================================
--
-- O problema, achado em 15/08/2026 a partir do aviso do proprio Supabase
-- ("Clients can list all files in this bucket"):
--
-- A chave anonima do projeto esta publicada dentro do site (por natureza — ela e
-- a chave publica). Com ela, qualquer pessoa consegue PEDIR A LISTA de arquivos
-- destes buckets:
--
--   pdf_fatura             cobrancas, com nome de cliente no nome do arquivo
--   artes                  artes dos pedidos
--   print_jobs             PDFs mandados para impressao
--   amostras_renderizadas  amostras dos pedidos
--
-- Os quatro sao buckets PUBLICOS, entao o arquivo ja era baixavel por quem
-- tivesse a URL. O que a listagem muda e que ninguem precisa adivinhar URL: da
-- para enumerar tudo e baixar em seguida. No pdf_fatura isso e documento
-- financeiro com nome de pessoa.
--
-- ── Por que este arquivo nao apaga politica nenhuma ──
--
-- As politicas de leitura do storage.objects podem estar servindo a outros
-- buckets e ao ERP parceiro (o e-deal, o boletos e as notas sao dele). Apagar uma
-- politica ampla resolveria aqui e poderia quebrar uma tela de la.
--
-- Entao em vez de apagar, ACRESCENTA uma politica RESTRITIVA. No PostgreSQL as
-- restritivas sao combinadas com E logico: o que ja existia continua valendo, e
-- esta trava por cima. Escopo `to anon`, de proposito — usuario logado do ERP
-- continua listando o que listava; quem perde a listagem e so a chave publica.
--
-- ── O que NAO muda ──
--
-- Baixar arquivo de bucket publico nao passa por row level security (a rota
-- /object/public/... e servida direto), entao o link do cliente, as artes e as
-- amostras continuam abrindo normalmente. Enviar arquivo tambem nao e afetado:
-- upload e INSERT/UPDATE, nao SELECT.
--
-- Nem o painel nem o agente listam bucket em lugar nenhum — conferido no
-- frontend e no Python antes de escrever isto.
--
-- ── Como desfazer ──
--
--   drop policy "sem listagem anonima" on storage.objects;
--
-- ============================================================

drop policy if exists "sem listagem anonima" on storage.objects;

create policy "sem listagem anonima"
  on storage.objects
  as restrictive
  for select
  to anon
  using (
    bucket_id not in ('pdf_fatura', 'artes', 'print_jobs', 'amostras_renderizadas')
  );
