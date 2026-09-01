-- ═══════════════════════════════════════════════════════════════════════════
--  DEVOLVER O `anon` ÀS FUNÇÕES DO LINK DO CLIENTE
--  01/09/2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que aconteceu
--
-- O link do cliente parou de abrir no celular. No computador da gráfica ele
-- abria normalmente — e foi isso que escondeu o problema por um tempo.
--
-- A razão da diferença: no computador da gráfica o navegador já tem uma sessão
-- do Supabase aberta (o painel), então a chamada sai com o papel
-- `authenticated`. No celular do cliente não há sessão nenhuma: a chamada sai
-- com o papel `anon`, a chave pública. E as quatro funções que sustentam o
-- Portal do Pedido tinham perdido o EXECUTE para `anon`:
--
--     link_cliente_abrir    anon=false   authenticated=true
--     link_cliente_pedido   anon=false   authenticated=true
--     link_cliente_status   anon=false   authenticated=true
--     link_cliente_visto    anon=false   authenticated=true
--
-- O que o cliente via era a tela de "⚠️ Link inválido ou expirado", porque é
-- assim que o `cliente.js` interpreta a recusa. Mas o link estava ativo: o
-- banco respondia HTTP 401 `permission denied for function`, e não "não achei".
--
-- ## Por que o privilégio sumiu
--
-- Não foi coisa nossa: nenhum arquivo deste repositório revoga essas funções.
-- Uma varredura pelas 314 funções do schema `public` mostrou 74 sem `anon`, e
-- as outras 70 são todas do ERP parceiro (`cc_*`, `mc_*`, `fn_*`, notas
-- fiscais, dashboards). Ou seja: alguém do lado do parceiro fechou `anon` num
-- lote de funções internas — o que está certo para as delas — e as nossas
-- quatro foram junto, porque de fora elas têm a mesma cara.
--
-- É por isso que este arquivo pode precisar rodar de novo algum dia. Ele é
-- idempotente de propósito: rodar duas vezes não faz mal nenhum.
--
-- ## Por que devolver `anon` é seguro
--
-- Porque `anon` aqui não ganha acesso a dado nenhum por conta própria. As
-- quatro são `SECURITY DEFINER` com `search_path` fixo, e todas exigem o par
-- número+token do link. A tabela `pedidos_links_cliente` continua fechada à
-- chave pública desde 16/08/2026 (`link_cliente_fechar_a_chave_publica.sql`) —
-- quem não tem o token não abre nada, e nem o token é devolvido ao navegador.
--
-- Este arquivo só repõe o que `link_cliente_funcoes.sql` (linhas 151-152),
-- `link_cliente_pedido.sql` (linha 437) e `link_marca_quando_o_cliente_abre.sql`
-- (linha 139) já declaravam. Não é privilégio novo.

BEGIN;

GRANT EXECUTE ON FUNCTION public.link_cliente_abrir(text, text)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_cliente_pedido(text, text)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_cliente_status(text, text, text)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_cliente_visto(text, text)         TO anon, authenticated;

COMMIT;

-- ─── Conferência ────────────────────────────────────────────────────────────
--
-- As quatro linhas têm de sair com `anon` = true. Se alguma sair false, o
-- GRANT não pegou e o link do cliente continua fechado no celular.

SELECT p.proname AS funcao,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS autenticado
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('link_cliente_abrir', 'link_cliente_pedido',
                     'link_cliente_status', 'link_cliente_visto')
 ORDER BY p.proname;

-- ─── Como desfazer ──────────────────────────────────────────────────────────
--
-- Desfazer isto fecha o Portal do Pedido para todo cliente que não estiver
-- logado no painel — ou seja, para todos eles. Só faz sentido se o Portal for
-- desativado de vez.
--
--   REVOKE EXECUTE ON FUNCTION public.link_cliente_abrir(text, text)        FROM anon;
--   REVOKE EXECUTE ON FUNCTION public.link_cliente_pedido(text, text)       FROM anon;
--   REVOKE EXECUTE ON FUNCTION public.link_cliente_status(text, text, text) FROM anon;
--   REVOKE EXECUTE ON FUNCTION public.link_cliente_visto(text, text)        FROM anon;
