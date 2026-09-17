# Hora do prazo no Acabamento

Inspeção em worktree isolado `C:\ProjetosLocais\ideal-imposition-acabamento-prazo`,
branch `fix/acabamento-prazo-hora-20260917`, base `967c6313` (origin/main).

Acabamento e Produção consomem `state.ordens` e `formatPrazoBadge` de script.js.
O Acabamento chama esse formatador na lista e na ficha do pedido. Seu wrapper
de `renderOrdens` redesenha a lista quando os pedidos são recarregados.

Adicionada cobertura ao harness de Acabamento usando as funções reais de prazo:
composição de data/hora separadas, renderização de 16:00, atualização para 15:30,
hora ausente e data ausente. As 844 verificações passaram. Mensagens de erro
emitidas pelo harness pertencem aos cenários simulados de falha da suíte.

Os arquivos públicos index.html, script.js e acabamento.js do domínio
imposition.ai-ideal.com.br conferiram com a base por SHA-256 normalizado.
A raiz operacional contém referências antigas e script.js sem os helpers de
composição do prazo. Não foi determinado se essa é a instalação usada pelo usuário;
nenhuma mudança preexistente nessa raiz foi alterada.

## Causa confirmada no contexto do NewProd

O usuário esclareceu que a hora falta nos dois painéis no NewProd. A instalação
local 1.2.332 serve script.js e acabamento.js idênticos aos públicos. O login local
não cria sessão Supabase, e a consulta anônima de setores retorna lista vazia.
Isso já é documentado no código da rota `app.py:/api/peso-setores/{pedido}`.

A consulta somente de leitura dessa rota para o pedido autorizado 22192 encontrou
um setor LASER, mas a resposta contém somente setor, peso_real_kg e status_producao.
A Edge Function limita explicitamente sua projeção a essas três colunas.

Frontend preparado para consultar a rota existente no NewProd, com no máximo
quatro pedidos simultâneos e preservação da data se a consulta falhar. No site,
permanece a leitura pelo cliente autenticado do Supabase. Testes de prazo passaram,
incluindo ausência de sessão, hora nula, resposta de erro e limite de concorrência.

O usuário autorizou aplicar e publicar a correção. Acrescentada somente `hora` à
projeção de `supabase/functions/_compartilhado/pesos.ts`, commit `093320d1`.
Os 237 testes Deno passaram com `--no-config --no-lock --node-modules-dir=none`
(a execução padrão não resolveu @types/node no worktree sem node_modules).
A checagem de tipos de acesso-estacao também passou.

A função publicada foi baixada antes do deploy para recuperação em
`C:\ProjetosLocais\CodexBackups\prazo-newprod-20260917-074841`.
Comparação dos 13 arquivos: só pesos.ts difere do código que estava publicado.
Deploy de acesso-estacao concluído no projeto vwbtitjlpelrcnsytzqw. A consulta
real `GET http://127.0.0.1:9000/api/peso-setores/22192` confirmou setor LASER e
`hora: 16:00:00`, antes da publicação do frontend. Nenhuma gravação
no banco, mudança de RLS ou novo instalador foi necessária.
Limite: uma consulta por pedido com data no NewProd; chamadas limitadas a quatro
simultâneas. Falhas individuais não impedem as horas dos demais pedidos.

## Entrega e verificação final

- Frontend **v893**, commit `6319cc91`, integrado em main e tag v893 publicada.
- Cloudflare Pages concluiu. A primeira comparação detectou propagação pendente;
  nova consulta, sem repetir deploy, confirmou index.html, producao.html e script.js
  nos dois domínios (imposition.ai-ideal.com.br e imposicao.pages.dev): 6/6 iguais.
- Os mesmos três arquivos foram sincronizados no painel desta instalação em
  `C:\Users\Junior\AppData\Local\NewProd Agent\painel`, sem reiniciar o agente.
  Backup anterior em `C:\ProjetosLocais\CodexBackups\prazo-newprod-20260917-074841\painel-antes-v893`.
  Comparação via HTTP local na porta 9000 confirmou os três arquivos servidos.
- Verificação integrada de leitura real: extraiu as funções do script servido pelo
  NewProd, consultou a data de 22192 e sua hora pela rota autenticada existente;
  resultado `2026-09-16T16:00:00`, badge `16/09 16:00`. Nenhuma escrita no pedido.
- 237 testes Deno, checagem de tipos de acesso-estacao, 844 verificações do
  Acabamento, 27 de prazo, 14 de ordenação e regressão do carregamento ERP passaram.
  A regressão cobre o caminho local sem sessão, falha individual e concorrência.

A aba já aberta precisa ser recarregada; não houve inspeção visual da sessão do
operador. Outras estações recebem o painel pelo sincronismo normal do NewProd.
Não foi necessário novo instalador. Dados, RLS e regras de peso ficaram intactos.

Recuperação, se necessária e autorizada: reverter o frontend `6319cc91` e publicar
com nova versão de cache; restaurar a função usando o código preservado no backup
acima. A versão anterior do frontend tolera a coluna hora adicional da rota.
O checkout operacional e suas alterações preexistentes permanecem preservados.
