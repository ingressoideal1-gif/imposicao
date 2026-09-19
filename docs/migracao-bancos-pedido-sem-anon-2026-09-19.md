# Migração de `pedidos_bancos` sem acesso anônimo

Data: 19/09/2026  
Projeto: e-deal (`vwbtitjlpelrcnsytzqw`)  
Ambiente: produção da gráfica

## Situação

`pedidos_bancos.csv_data` contém dados variáveis de clientes, inclusive nomes e
fotos. Enquanto `anon` conservar `SELECT`, qualquer pessoa com a chave pública
pode tentar consultar outro pedido mudando `id_int`.

O portal público já usa a RPC `link_cliente_bancos_modelos(numero, token)` e não
precisa de acesso direto às tabelas. Os consumidores diretos restantes são o
painel autenticado e o NewProd da estação.

## Implementação local concluída

- O painel envia as cinco operações (`consultar`, `criar`, `atualizar`,
  `excluir` e `vincular`) para a Edge Function `painel`, com JWT.
- A estação envia as mesmas operações ao agente local. O agente repassa para
  `acesso-estacao` com `ACESSO_AGENTE_SEGREDO` e o código do operador.
- A Edge Function consulta novamente o código ativo; a cópia local não concede
  autoridade sobre o banco.
- Leitura exige `perm_amostras_view`; escrita exige `perm_amostras_edit`.
- Toda consulta recebe `id_int`. Atualizações e exclusões filtram por `id` e
  `id_int`. Um vínculo só é gravado depois de conferir que modelo e banco
  pertencem ao mesmo pedido.
- INSERT, PATCH, DELETE e upsert exigem exatamente uma linha retornada.
- Falha de rede ou autorização não vira lista vazia: ela interrompe o fluxo para
  impedir que um modelo ligado a banco caia silenciosamente na numeração
  sequencial.
- Não há mais acesso direto a `pedidos_bancos` ou `pedidos_modelos_banco` no
  diretório `frontend/`.

Nenhuma função foi implantada, nenhum frontend foi publicado, nenhum agente foi
instalado e nenhum privilégio foi alterado nesta etapa.

## Efeito na usabilidade

Com todas as camadas atualizadas, as telas e ações permanecem as mesmas. Há duas
mudanças deliberadas em caso de erro:

1. sessão web ausente ou sem permissão mostra recusa em vez de consultar com a
   chave anônima;
2. estação sem código ativo pede novo login e não carrega o banco do pedido.

Uma estação antiga não conhece a nova rota. Por isso o `SELECT` de `anon` só
pode ser retirado depois de confirmar a instalação da versão nova em todas as
estações que usam bancos de pedidos.

## Ordem segura de implantação

1. Integrar este commit à revisão atual do painel, resolvendo os pontos em que
   `painel/index.ts` e `acesso-estacao/index.ts` também receberam as rotas de
   propostas.
2. Implantar primeiro as duas Edge Functions.
3. Validar com dados sintéticos ou pedido de teste:
   - usuário web com `perm_amostras_view` consulta somente o `id_int` pedido;
   - usuário sem a permissão recebe 403;
   - operador local ativo consulta pela estação;
   - banco e modelo de pedidos diferentes recebem 404;
   - criação, alteração, vínculo, desvínculo e exclusão retornam a linha gravada.
4. Publicar o frontend web e conferir o arquivo entregue com cache-buster.
5. Gerar e instalar a versão do NewProd nas estações; confirmar por versão e
   heartbeat, além de uma leitura real controlada.
6. Conferir `pg_stat_statements`: as tabelas não devem mais receber consultas
   `anon` do painel ou das estações atualizadas.
7. Avisar o mantenedor com alvo, efeito e janela. Aguardar o aceite expresso.
8. Na janela aprovada, retirar de `anon` `SELECT`, `INSERT`, `UPDATE`, `DELETE`,
   `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN` nas duas tabelas e validar os
   privilégios efetivos. O SQL final deve ser preparado a partir de um snapshot
   novo; a proposta `06_bancos_conter_escrita_anon.proposta.sql` mantém SELECT e
   não é o fechamento final.

## Recuperação

- Antes do fechamento das tabelas: reverter frontend/agente para a versão
  anterior e manter as Edge Functions, que são aditivas.
- Depois do fechamento: em falha operacional, corrigir ou reverter o consumidor
  primeiro. Qualquer concessão temporária a `anon` exige novo aceite do
  mantenedor, janela curta e validação posterior.
- As rotas novas não alteram schema nem migração. Reverter o commit remove as
  rotas e o transporte, sem tocar nos dados existentes.

## Validação local

- Deno: 26 testes passaram, incluindo 5 casos novos de isolamento e permissão.
- Python: 3 testes novos do relay local e 30 testes relacionados a bancos
  passaram.
- Frontend/rotas: 81 verificações passaram.
- Harnesses JavaScript de bancos: 149 verificações passaram.
- `node --check frontend/script.js`, `python -m py_compile app.py db.py` e
  `git diff --check` passaram.

Os testes usam respostas sintéticas. Eles não comprovam implantação, instalação
nas estações nem fechamento das permissões em produção.
