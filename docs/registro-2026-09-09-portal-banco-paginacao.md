# Paginação do banco no portal — pedido 21894

## Causa e resultado

O portal procurava `csv_data` dentro da numeração. Os modelos Foto (1000940)
e Setor (1000947) usam `pedidos_bancos`, com o vínculo e o mapa de elementos em
`pedidos_modelos_banco`. Como esse vínculo não chegava ao portal, a condição
de dados variáveis era falsa: aparecia a imagem salva, sem o seletor de linhas.

A página passa a resolver o banco de cada modelo com `BancoDoModelo`, o mesmo
resolvedor usado pelo painel. Foto tem 6 páginas; Setor tem 4 após o filtro
existente de linhas com conteúdo. A RPC preserva as 6 linhas e os IDs originais
em cada projeção; seleção, linhas inativas e filtro de conteúdo continuam no cliente.
A correção anterior de somente frente permanece.

## Implementação

- `sql/link_cliente_bancos_modelos.sql`: função aditiva, `STABLE`, somente leitura,
  com `SECURITY DEFINER` e `search_path` explícito. Exige par número/token ativo
  único, identidade comercial coerente, modelo do pedido e banco do mesmo pedido.
  Projeta colunas usadas e metadados das fotos; não retorna o token.
  Execução concedida a `anon`/`authenticated`, revogada de `PUBLIC`.
- `cliente-bancos.js`: estado por abertura, resposta validada, geração contra
  respostas atrasadas, cache por modelo e preservação do CSV legado sem vínculo.
- `cliente-dados.js`, `cliente.html`, `cliente.js`: leitura pela RPC, seletor
  existente ligado ao banco resolvido, texto e foto da linha corrente. Composição
  em canvas separado; só a solicitação atual publica a página completa.
- No PDF, permanece um único seletor. A composição usa a linha da página e
  apresenta erro se quantidade de páginas e linhas não corresponderem.
- Falhas de dados/arte/foto impedem aprovação daquela composição, com aviso e
  nova tentativa. A recuperação das fotos limpa somente falhas das URLs dos
  modelos do pedido (`foto-lib.js`); não descarta imagens já carregadas.
- Recursos alterados do portal identificados por `v=848`. Sem dependências novas,
  alteração financeira, alteração do motor de impressão ou gravação de bancos.

## Execução no ambiente compartilhado

Em 09/09/2026, esquema verificado e SQL instalado no projeto Supabase
`vwbtitjlpelrcnsytzqw`, PostgreSQL 17.4, por `ferramentas/rodar_sql.ps1` do
checkout original. Transação concluída. A função não existia antes.
O arquivo SQL versionado corresponde ao instalado; não o reaplicar como migração
idempotente nem editá-lo depois de aplicado.

Verificado: `propostas.id_int` único; IDs dos modelos bigint e vínculos text;
modelo e banco relacionados por `id_int`. As tabelas comerciais consultadas não
têm coluna de empresa: isolamento depende do pedido único e dos relacionamentos
conferidos, além do token. Quando existe empresa explícita, a função também confere.

Validação real somente leitura, sem chamar abertura do link ou aprovação:

- RPC via HTTP com a chave pública e token do pedido: sucesso, modelos 1000940
  e 1000947. Os filtros reais do frontend resultaram em 6 e 4 páginas.
- Token inválido, vazio e token válido com outro número: retorno nulo.
- Grants e propriedade `STABLE` conferidos no catálogo PostgreSQL.
- Zero alterações em dados comerciais ou status de aprovação. Nenhum token,
  nome de participante ou conteúdo do banco incluído neste registro ou nas fixtures.

## Testes e limites

147 testes pytest passaram: banco do portal, sintaxe de todo frontend, frente/verso,
PDF, link, cabeçalho, contratos do portal, banco na impressão e CSV sob demanda.
Harnesses adicionais: fotos 72/72, fatia do modelo 127 verificações e número da
página 28 casos, todos aprovados.

Chromium com dados sintéticos e Supabase simulado verificou cliques reais,
Foto 6/Setor 4, primeira/intermediária/última linha, pixels das fotos e textos
efetivamente desenhados, limite de página, isolamento entre modelos, cliques
rápidos, falha/retry de RPC, falha/retry da mesma URL de foto, modo somente leitura
e zero escritas em erro. PDF: linha correspondente, solicitação atrasada, erro
`getPage`, recuperação, preservação da última imagem completa e totais divergentes.
Revisão visual do cartão com CSS do projeto em 1100 px e 390 px, usando Arial
local; os testes não dependem de fontes externas. Evidências sintéticas ficam em
`rascunhos/portal-bancos/` (ignorado pelo Git).

Sem PostgreSQL local descartável: casos de vínculo cruzado/identidade ambígua
foram revisados no SQL e no contrato, sem criar registros adversariais em produção.
Não houve aprovação real de pedido, teste em iPhone físico nem envio pelo WhatsApp.

## Publicação e recuperação

Publicação do frontend pela integração existente de `main` com Cloudflare Pages,
após revisão e testes; conferir `cliente.html` e hashes dos recursos públicos em
`https://imposition.ai-ideal.com.br`. A nova RPC foi instalada antes do frontend.

Em caso de regressão, reverter somente os arquivos de frontend desta entrega
através de novo commit/deploy, mantendo a RPC aditiva para abas já abertas.
O portal anterior ignora a função. A eventual revogação/remoção da RPC é uma etapa
separada, depois de confirmar ausência de consumidores; nenhum dado precisa ser
restaurado. Preserve os demais trabalhos no checkout original.
