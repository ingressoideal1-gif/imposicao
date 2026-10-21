# Segunda opção de e-mail de artes

Implementação local na branch `feat/email-artes-corpo-20261021`, baseada em
`origin/main` no commit `975fe0e7`. O checkout operacional permaneceu intacto.

## Comportamento

- **Enviar Link ao Cliente** mantém o envio direto existente, com aprovação
  interativa, orçamento, pagamento e atendimento.
- **Enviar Artes no E-mail** abre o editor na opção 2, com mensagem editável,
  informações de todos os modelos e prévia das imagens. Não gera nem depende
  de link do cliente e não envia automaticamente ao abrir.
- O editor existente também oferece a opção 2. Ao alternar, os rascunhos de
  mensagem de cada opção são preservados. Quando aberto pelo atalho sem link,
  a opção 1 fica indisponível nesse modal; seu botão original continua disponível.
- A opção 2 não contém endereço/botão do portal nem pagamento. Orienta o cliente
  a responder ao e-mail. A resposta não altera automaticamente a aprovação no
  sistema; o atendimento continua responsável por registrar o retorno.
- Informações: nome, quantidade, cor e numeração de cada modelo. Frente e verso
  são apresentados separadamente. PDFs usados como fonte são rasterizados página
  a página. São priorizadas as amostras salvas; modelos com composição de cor ou
  numeração e sem amostra precisam de uma prévia gerada antes de enviar.
- O preparo apenas lê modelos e recursos. Não regenera amostras, grava status,
  cria links, modifica quantidade ou altera numeração.

## Transporte e validação

O endpoint existente aceita `modo: "artes_corpo"` com `os_id`, destinatário,
assunto, texto e modelos `{id, imagens: [{face, pagina, dados}]}`. A opção nova
recusa `link_url` e HTML arbitrário. A autorização existente é preservada.

O servidor resolve o número a partir de `vibe_...` ou da OS UUID em
`producao_ordens_servico`, confere todos os IDs em `pedidos_modelos` e usa as
informações cadastrais do banco para montar HTML escapado. Falta de modelo,
frente ou verso exigido por `verso_tipo` interrompe o envio inteiro. Não há
download de URL de imagem no servidor.

As imagens JPEG/PNG são incorporadas por `Content-ID` em `multipart/related`,
com alternativas HTML e texto. O cliente de e-mail não precisa buscar as artes
no Storage nem abrir o portal. Limites: 100 modelos, 100 imagens/páginas,
1.500.000 caracteres por data URL e 11.000.000 no conjunto. A preparação limita
a maior dimensão a 1600 pixels e converte para JPEG com fundo branco.

O envio atual e seu MIME permanecem iguais quando não há imagens incorporadas.
O aceite SMTP continua distinto de entrega na caixa de entrada.

## Evidências locais

- 41 testes Deno: envio atual, layout, segunda opção, validação de imagens,
  autorização, rota HTTP real com transporte simulado e SMTP.
- 37 testes pytest: quatro harnesses de e-mail e contratos isolados de canais,
  segurança da estação e compatibilidade do painel.
- Harness novo em Chromium: duas opções, rasterização JPEG real, frente/verso,
  paginação com leitor PDF simulado, rascunhos, falta de verso, abertura sem link,
  duplicidade, concorrência e fechamento durante carregamento.
- Parser MIME independente do Python confirmou HTML/texto e as três imagens
  JPEG inline da mensagem sintética.
- Prévia HTML responsiva conferida em 820 e 390 pixels, sem rolagem horizontal.
- `node --check frontend/script.js` e `git diff --check` passaram.
- O pytest apresentou aviso de depreciação da combinação Starlette/httpx;
  nenhuma dependência foi alterada.

Artefatos sintéticos em `design/email-corpo-preview/`: HTML, EML e capturas.
`tests/email_corpo_preview.ts` gera HTML/EML a partir do exemplo produzido pelo
harness, sem conexão SMTP ou dados reais.

## Entrega pendente

Nenhum commit, push, deploy, instalação, acesso a dados reais ou envio real foi
executado. Para disponibilizar: publicar primeiro a Edge Function `painel`
(compatível com o frontend anterior), depois o frontend com atualização de
cache pelo fluxo de entrega. A bateria completa de entrega dos canais e a
preparação do painel empacotado não foram executadas nesta implementação local.
Conferência em caixas reais de Outlook/Gmail e autenticação SMTP permanecem
fora da validação simulada realizada aqui.
