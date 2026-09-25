# Link do Cliente: confirmacao de entrega e nota (23/09/2026)

## Evidencia e causa

- No pedido 22588, em janela anonima, a chamada `link_cliente_salvar_entrega`
  retornou HTTP 400 / `P0001` / `endereço persistido diverge do solicitado`.
  Os cabecalhos da mesma chamada continham `apikey` e `Authorization`; a
  mensagem anterior de falta de chave nao explicava esta falha.
- A RPC instalada e `SECURITY DEFINER`, pertence a `postgres` e, apos inserir
  o endereco exclusivo do pedido, compara os nove campos retornados por
  `link_cliente_pedido` aos valores enviados pelo portal. A excecao reverte
  o INSERT e o vinculo com a proposta na mesma transacao.
- A consulta de catalogo mostrou o gatilho `trg_preencher_dados_recebedor_endereco`
  como `BEFORE INSERT` em `enderecos`. A definicao instalada de
  `fn_preencher_dados_recebedor_endereco()` atribui sempre `NEW.recebedor` e
  `NEW.cpf_recebedor` a partir do cliente comercial. Isso substitui o nome e o
  documento informados pelo cliente no link. Quando divergem, a conferencia
  final da RPC falha exatamente com o erro observado.

## Correcao aplicada

`sql/revisao_vibe/20260923_entrega_preservar_recebedor.up.sql` modifica apenas
`link_cliente_salvar_entrega`. Depois do INSERT, a RPC restaura nome e
documento do recebedor na linha recem-criada e limita a atualizacao pelo UUID
e cliente da proposta. Se o documento do recebedor difere do cliente comercial,
remove a inscricao estadual herdada desse cliente dessa linha de entrega.
A verificacao original dos nove campos continua obrigatoria. O gatilho e os
INSERTs de outros fluxos nao mudam. A aplicacao aborta se a definicao instalada,
o proprietario, o gatilho ou o privilegio de execucao divergirem da inspecao.

`sql/revisao_vibe/20260923_entrega_preservar_recebedor.down.sql` contem a
reversao local da funcao. Reverter reintroduz o erro quando o recebedor e
diferente do cliente comercial. Nenhum dos scripts altera linhas de pedidos
existentes ao ser instalado; chamadas futuras continuam transacionais.

## Nota fiscal e verificacao

O botao **Confirmar** da aba Nota chama `link_cliente_salvar_faturamento`
somente ao mudar o cadastro fiscal; confirmar os dados atuais grava a decisao
em `pedidos_artes`. A RPC fiscal tambem e `SECURITY DEFINER` e pertence a
`postgres` na instalacao consultada. Os harnesses locais de Entrega, Nota e
confirmacoes passaram, mas nao simulam o gatilho real de `enderecos`; nenhum
teste local comprova a gravacao da nota no banco de producao.

O usuario informou que a Entrega passou no pedido 22588 apos instalar a
correcao. Ainda nao recebemos a releitura apos recarregar o link nem o resultado
da consulta de indicadores da Nota. Se a Nota falhar, registrar a resposta
exata de `link_cliente_salvar_faturamento` (quando houve troca de cadastro) ou
do UPDATE de `pedidos_artes`, sem copiar token ou dados pessoais.

Estado: o usuario executou o UP no SQL Editor em 23/09/2026. A consulta apos
o `COMMIT` retornou `correcao_instalada=true` e hash da funcao iniciado por
`580a50e5`. A consulta exibida em imagem cortou o restante do hash. O teste
funcional da Entrega passou no pedido 22588, conforme relato do usuario.
A releitura apos recarregar o link e a verificacao de persistencia da Nota
seguem pendentes. Nenhum frontend foi publicado para esta correcao. Os testes
locais `portal_confirmacoes_harness.js`, `portal_faturamento_dados_harness.js`
e `portal_entrega_cep_harness.js` passaram. O teste PostgreSQL em memoria nao
rodou porque a copia local de PGlite esta incompleta; nao houve instalacao de
dependencias para este diagnostico.
