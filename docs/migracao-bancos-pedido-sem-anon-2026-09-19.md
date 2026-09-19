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

## Implantação das rotas

Em 19/09/2026, as duas Edge Functions foram implantadas de forma aditiva:

- `painel`: versão 247, `verify_jwt=true`, hash do bundle iniciado por
  `195cab84f50d`;
- `acesso-estacao`: versão 250, `verify_jwt=false`, hash do bundle iniciado por
  `1b90c0bc2c64`; a função continua exigindo `ACESSO_AGENTE_SEGREDO` antes de
  validar o operador ou ler o corpo.

A primeira tentativa com o token de auditoria protegido por DPAPI recebeu 403,
por falta de permissão para publicar funções. A sessão já autenticada do
Supabase CLI possuía o papel necessário e concluiu os dois deploys. A listagem
posterior confirmou ambas como `ACTIVE`. Chamadas sem credenciais devolveram
401: `painel` recusou por falta de Authorization e `acesso-estacao` recusou por
segredo do agente inválido.

Naquele ponto, o frontend e o agente ainda não tinham sido publicados. Nenhum
privilégio das tabelas foi alterado.

## Publicação do consumidor

Também em 19/09/2026:

- PR `#55` integrado em `main` no commit `d7b25f06`;
- Cloudflare Pages concluiu a publicação com sucesso;
- o domínio público entregou `index.html` e `script.js?v=900` com os mesmos
  hashes normalizados de `origin/main`;
- o JavaScript público apresentou zero chamadas diretas a `pedidos_bancos` ou
  `pedidos_modelos_banco`;
- NewProd `1.2.335` publicado em arquivo novo, com 156.028.928 bytes e SHA-256
  `e456e6c0c98147ebf6e60a09898ee09296c0dc277aae065a19f474097b3cb21d`;
- o arquivo público foi baixado e conferido antes da ativação de `latest.json`;
- tag `agente-v1.2.335` enviada ao GitHub;
- as estações `PC-JR-HOME` e `GUSTAVO-PROD` confirmaram `NewProd 1.2.335` por
  heartbeat; `PC-JR-HOME` também confirmou a versão pela rota local.

O snapshot da frota ainda não permite fechar `anon`. É preciso confirmar quais
estações usam bancos de pedidos e obter heartbeat em `1.2.335` das estações
aplicáveis antes da retirada de `SELECT`.

Uma nova consulta às 09:31 (horário de Brasília) tornou o bloqueio mais
preciso. Além de `PC-JR-HOME` e `GUSTAVO-PROD` em `1.2.335`, seis estações
operacionais com sinal recente ainda estavam abaixo da versão necessária:
`LAPTOP-9BSK81S0` em `1.2.334`; `LASER-04`, `LASER-01`, `LASER-02`, `TEX-01` e
`FLEXO` em `1.2.333`. `CESAR-CPD`, sem versão, e `PRD-ACABAMENTO` são instalações
de teste já classificadas pelo inventário e não entram nesse bloqueio.

Um novo snapshot somente de metadados, coletado em 19/09/2026 sem alterar o
banco, confirmou:

- `pagamentos_v2` com RLS ativa e `anon` sem `INSERT`, `UPDATE`, `DELETE` ou
  `TRUNCATE`;
- `producao_ordens_servico` com RLS ativa, sem privilégios efetivos para
  `anon` e com policy para `authenticated`;
- `pedidos_bancos` e `pedidos_modelos_banco` ainda sem RLS, sem policies e com
  privilégios amplos de `anon`, inclusive leitura e escrita.

## Baseline de tráfego

Às 09:34 (horário de Brasília), foi salvo um baseline agregado de
`pg_stat_statements`, sem texto de consulta, parâmetros ou linhas comerciais.
Desde o reset das estatísticas em 31/08/2026, ele encontrou 25 chamadas e 250
linhas associadas a `pedidos_bancos`, e 27 chamadas e 280 linhas associadas a
`pedidos_modelos_banco`, todas atribuídas a `postgres`; a coleta de metadados
também aparece separadamente como `supabase_read_only_user`.

Esta versão da extensão não oferece `last_exec_time`. Além disso, a atribuição a
`postgres` não distingue a Edge Function/RPC de outras execuções privilegiadas.
Logo, os totais não provam ausência de tráfego anônimo depois da publicação. O
arquivo é somente o marco inicial: uma coleta posterior deve comparar o aumento
das chamadas depois que as estações aplicáveis estiverem em `1.2.335`.

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

1. Integrar a implementação à revisão atual do painel, preservando as rotas de
   propostas que também alteraram `painel/index.ts` e
   `acesso-estacao/index.ts`. **Concluído no PR `#55`.**
2. Implantar primeiro as duas Edge Functions. **Concluído em 19/09/2026.**
3. Validar com dados sintéticos ou pedido de teste:
   - usuário web com `perm_amostras_view` consulta somente o `id_int` pedido;
   - usuário sem a permissão recebe 403;
   - operador local ativo consulta pela estação;
   - banco e modelo de pedidos diferentes recebem 404;
   - criação, alteração, vínculo, desvínculo e exclusão retornam a linha gravada.
4. Publicar o frontend web e conferir o arquivo entregue com cache-buster.
   **Concluído em `v900`.**
5. Gerar e instalar a versão do NewProd nas estações; confirmar por versão e
   heartbeat, além de uma leitura real controlada. **Versão `1.2.335` publicada;
   duas estações confirmadas, demais estações aplicáveis pendentes.**
6. Conferir `pg_stat_statements`: as tabelas não devem mais receber consultas
   `anon` do painel ou das estações atualizadas.
7. Avisar o mantenedor com alvo, efeito e janela. Aguardar o aceite expresso.
8. Na janela aprovada, retirar de `anon` `SELECT`, `INSERT`, `UPDATE`, `DELETE`,
   `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN` nas duas tabelas e validar os
   privilégios efetivos. O SQL final deve ser preparado a partir de um snapshot
   novo; a proposta `06_bancos_conter_escrita_anon.proposta.sql` mantém SELECT e
   não é o fechamento final.

A proposta final revisável está em
`sql/auditoria_rls/07_bancos_fechar_anon_e_habilitar_rls.proposta.sql`. Ela não
foi aplicada. O arquivo exige um marcador explícito da janela, confere dono,
estado de RLS, ausência de policies, ACLs, papéis e a RPC pública protegida por
token antes de retirar todos os privilégios de `anon` e habilitar RLS. Qualquer
divergência aborta a transação inteira. Seis cenários sintéticos passaram em
PGlite/PostgreSQL 17; isso não substitui novo snapshot, aceite do mantenedor e
validação posterior em produção.

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
