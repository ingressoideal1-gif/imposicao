# Links do cliente no dominio proprio

Dominio publico: `https://imposition.ai-ideal.com.br`.
Formato mantido: `/cliente/<numero>-<token>`.

Em 07/09/2026, o Supabase `vwbtitjlpelrcnsytzqw` (PostgreSQL 17.4)
gerava os 89 links ativos da coluna `public.pedidos_links_cliente.link`
com o dominio da Vercel. A migracao `sql/links_cliente_cloudflare_20260907.sql`
foi aplicada com sucesso: 89 de 89 links passaram ao dominio proprio.
Os demais campos foram comparados dentro da transacao e permaneceram iguais.
O ERP recebe o novo dominio ao reler essa coluna; URLs ja copiadas ou
armazenadas pelo ERP nao sao substituidas retroativamente.

O painel passa a usar `CLIENTE_BASE_URL` para carregar, gerar e copiar links,
inclusive quando aberto por uma origem local ou legada. A copia instalada do
painel precisa receber esse JavaScript para usar a mesma regra.
O endereco de instalacao do Ideal Control e as funcoes de QR nao fazem parte
desta mudanca. Nenhuma politica RLS, token ou regra de aprovacao foi alterada.

## Aplicacao e recuperacao

A migracao exige a expressao antiga exata e PostgreSQL 17+. Atualiza a expressao
da coluna gerada sem remover a coluna; preserva numeros, tokens e demais dados.
Usa transacao, tempo limite de bloqueio de 5 segundos e validacao dos links.
Nao reaplicar o SQL inicial `sql/link_pronto_para_o_erp.sql` para mudar dominio.

O arquivo `sql/links_cliente_cloudflare_20260907_rollback.sql` restaura a
expressao anterior, com as mesmas verificacoes. Executar somente com autorizacao
de reversao. Para reverter o painel, reverter apenas o commit desta correcao.

Referência tecnica: [ALTER TABLE no PostgreSQL 17](https://www.postgresql.org/docs/17/sql-altertable.html).

## Validacao

- Sintaxe de `frontend/script.js` verificada pelo Node.
- Testes simulados de geracao e carregamento com origem Vercel, local e Cloudflare,
  tokens novos/existentes e indisponibilidade do cliente Supabase.
- Harness da lista de arte: 134 verificacoes passaram.
- Testes existentes do portal do cliente e da lista de arte passaram.
- Nenhum link real foi aberto para evitar registrar acesso do cliente.

A troca de dominio nao comprova login, instalacao PWA ou impressao fisica.
