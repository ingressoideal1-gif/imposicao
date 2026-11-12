# Acesso contínuo à nota emitida pelo portal

## Problema e comportamento

O botão publicado abria diretamente `url_danfe`/`url_pdf` devolvida pela RPC.
Uma URL assinada antiga pode expirar, mesmo com a nota autorizada e o PDF ainda
armazenado. O Vibe contorna isso obtendo outro acesso ao documento a cada clique.

A correção local troca a âncora por um botão que chama `nota-fiscal-cliente`.
Cada clique revalida o par número/token do Link do Cliente pela RPC existente
`link_cliente_notas_fiscais`, incluindo os filtros de autorização, produção e
cancelamento. A URL enviada pelo navegador somente identifica uma das notas
retornadas para aquele pedido; não é um destino arbitrário de download.

Para PDFs nos buckets fiscais `nfe-documentos` e `nfse-documentos` do mesmo
projeto, a função extrai o caminho, descarta o token antigo e pede uma assinatura
nova ao Storage. O cliente não precisa de sessão de atendente no Vibe. O botão
não tem validade fixa: um acesso de transporte de 60 segundos é gerado quando
ele é usado. Isso não torna permanente a URL copiada da barra do PDF, nem permite
acesso depois de revogar o Link do Cliente ou cancelar a nota.

URLs HTTPS estáveis, sem query string, do domínio FocusNFe já observado são
preservadas somente após a mesma validação. Outros domínios, buckets, XML,
caminhos ambíguos e respostas inválidas são recusados. Não existe fallback
para o link expirado. Não há escrita de registros comerciais/fiscais.

A nova aba é aberta no clique, antes da rede, sem acesso a `window.opener`.
Falhas fecham a aba de espera e mostram mensagem no cartão. Cliques duplicados,
popup bloqueado e respostas atrasadas de outro pedido são tratados.

## Arquivos e testes

- `frontend/cliente-faturamento.js`: botão e fluxo de abertura.
- `supabase/functions/nota-fiscal-cliente/`: endpoint e testes isolados.
- `supabase/config.toml`: configuração da nova função pública, com autorização
  própria pelo token do pedido antes de qualquer assinatura.
- `tests/portal_notas_fiscais_harness.cjs`: regressões da interação.

Os testes de servidor injetam banco e Storage simulados e não possuem permissão
de rede. Cobrem renovação, revogação, outro pedido, nota indisponível, caminhos,
erros do Storage e ausência de segredos nas respostas. O frontend testa carga,
preservação de formulários, duplicidade, popup e falha sem abrir URL antiga.

Resultado local: 443 testes Deno passaram (incluindo 7 da nova função), 28 testes
do portal passaram e o teste PGlite da RPC passou. A conferência de produção e
Piloto passou com 911 testes e 2 subtestes em cada canal, 2 testes ignorados em
cada canal, além de todos os harnesses. O aviso de depreciação do TestClient da
dependência Starlette permanece. Sintaxe, diff e varredura de segredos aprovados.
Logs locais em `dist/nota-fiscal/deno-acesso-continuo.log` e
`dist/nota-fiscal/canais-acesso-continuo.log` (ignorados pelo Git).

## Entrega autorizada e limites

Após a preparação local sem publicação, o usuário autorizou a entrega segura.
A função `nota-fiscal-cliente` foi publicada no projeto `vwbtitjlpelrcnsytzqw`,
versão 1, ACTIVE, com `verify_jwt=false` e autorização própria pelo token do pedido.
A RPC existente não foi alterada e nenhum SQL ou registro comercial foi modificado.

Teste real do pedido 24164: token inválido recusado com HTTP 404; token válido
recebeu HTTP 200/no-store e novo acesso; NF-e 48334 respondeu HTTP 206 com
`application/pdf` e assinatura `%PDF-`. Somente um trecho do arquivo foi lido
para validação, sem salvar conteúdo, URL assinada ou tokens nas evidências.

O frontend acompanha a função pelo fluxo protegido com nova versão de cache.
A função usa somente variáveis padrão do Supabase (`SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY`), nunca expostas ao cliente. Os caminhos NFS-e foram
validados apenas com dados sintéticos; a prova real acima cobre NF-e.
Para recuar, republicar o frontend anterior;
a função aditiva pode permanecer sem uso, sem impacto em notas emitidas.
