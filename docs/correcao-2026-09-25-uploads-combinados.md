# Combinação de modelos — upload não declarado

## Causa reproduzida

Após a correção v960, foi relatado erro HTTP 400 “Upload não declarado no trabalho” ao combinar modelos. Os formulários de Pedido e Imposição incluem `file`/`file_verso` da seleção individual mesmo quando o payload usa `multi_artes`. A preparação confirma as faces indexadas (`ma_file_N`/`ma_verso_N`), mas deixava os anexos individuais no formulário. O backend corretamente recusava esses anexos não declarados.

O caso foi reproduzido sem dados reais: cinco modelos sintéticos, oito faces com arte, uma frente vazia e um verso vazio. O formulário produzido pelo helper real do frontend, fornecido ao `validar_uploads` real do agente, lançou a mesma exceção antes da correção.

## Correção e validação

- `frontend/arte-de-impressao.js`: quando há modelos combinados, remover somente `file`, `file_verso` e o alias legado duplicado `multi_artes_files`. As artes indexadas continuam sendo preparadas, confirmadas e declaradas por modelo/face.
- Nenhuma regra de bloco, quantidade, numeração ou validação do backend foi alterada.
- Novo `tests/uploads_combinados_harness.js` exporta o formulário preparado para a regressão Python; teste confirma aceitação das oito faces e rejeição de um upload extra reintroduzido.
- 25 testes Python de integridade passaram; harness combinado passou; 38 verificações de integridade no navegador passaram; diff e sintaxe conferidos.
- Sem consultas/escritas de produção, envio à impressora ou novo MSI nesta correção. Painel local deve sincronizar e ser recarregado; esta entrega não altera o manifesto do agente.

## Entrega

O orquestrador interrompeu a primeira tentativa antes da publicação porque `origin/main` havia recebido três commits, incluindo v961 / agente 1.2.341 e a correção de duplicação do verso. O trabalho local foi commitado e o avanço integrado sem conflitos, preservando essas mudanças. O diff funcional desta entrega contra a nova base continua limitado à remoção dos três anexos residuais.

Após a integração: 33 testes Python de integridade/duplicação de verso, 41 verificações no navegador e o harness combinado passaram. Correção preparada para publicação frontend v962. Confirmação pública será acrescentada após o deploy. Geração do pedido real e impressão física permanecem pendentes de validação operacional.

### Publicação concluída

- Commit `e95e507dea03fa713eaed76ea30905bbc339a6d7` integrado em `origin/main`; tag `v962`.
- Cloudflare Pages: sucesso, deployment `acc11161-1e5a-4e64-8f02-ada2fe59108a`.
- Orquestrador terminou com `PUBLICADA_E_VERIFICADA`. A consulta adicional ao domínio Pages inicialmente recebeu conteúdo anterior durante o deploy; após propagação, **6/6 hashes** de index, Produção e helper coincidiram nos dois domínios.
- [Prova pública](evidencias/uploads-combinados-v962-web.json).
- Reabrir/recarregar o painel após sincronização na estação e repetir a combinação. Nenhum trabalho real foi enviado à impressora nesta correção.
