# Tempo por entrada no card — implantação

## Contrato e causa

O usuário confirmou que cada pedido deve contar desde o momento da entrada
no card/status, inclusive numa volta a um card anterior. A gravação anterior
dependia de `renderOrdens`: uma memória vazia seguida de `upsert` podia substituir
um início já salvo. O teste reproduziu a substituição de 28/09 por 30/09.
A paginação da v984 não eliminou esse escritor nem registrava mudanças com
todos os painéis fechados.

O resultado SQL enviado pelo usuário confirmou sete pedidos com o mesmo início
(30/09/2026 09:15:44.074, Brasília) e um pedido com início anterior. Isso confirma
a simultaneidade dos registros; não identifica qual aba os gravou.

## Implementação local

- Retirada da escrita dos relógios do navegador. Desenhar e atualizar só leem.
- Nova tabela de etapa atual, com SELECT para `authenticated`, sem INSERT/UPDATE.
- Gatilhos diferidos: registrar o card final no fim da transação de status.
- Classificação equivalente à função do frontend para as fontes persistidas;
  overrides locais não são eventos do banco.
- Histórico de entradas/saídas, sem excluir registros anteriores.
- Mesmo card mantém o início; mudança para outro card inicia nova contagem.
- Tabela legada preservada. Escritas de abas antigas nessa tabela não alcançam
  os marcadores novos.
- Baseline sem horário: dados históricos corrompidos não recebem `now()` como
  se fosse o horário real. Mostrar `--` até entrada comprovada.

## Aplicação e recuperação

Preflight recebido como texto do operador em 30/09/2026: PostgreSQL 17.4,
sessão somente leitura, 353 pedidos no baseline e as duas tabelas novas ausentes.
As colunas usadas pela migração existem; `id_int` é integer em artes/modelos,
bigint em propostas e `numero_pedido` é text em links. Os comparadores bigint
da migração são compatíveis. Há índices por pedido nas quatro fontes, incluindo
`numero_pedido` como primeira coluna do índice dos links. Nenhum gatilho listado
usa os quatro nomes novos. Os gatilhos existentes de sincronização permanecem;
o novo registro diferido lê o estado final da transação. O preflight contém
as definições dos gatilhos, não os corpos das funções existentes.

Sete dos oito relógios legados consultados agora têm exatamente o mesmo início
`2026-09-30T13:55:09.695Z`, evidência adicional da regravação conjunta. Esse
resultado foi fornecido pelo operador, não obtido por execução remota do agente.
Não será usado para inventar horários individuais. O baseline estimado é de
353 inserções somente na tabela nova, podendo variar com novos pedidos até a
aplicação; os dados comerciais e a tabela antiga não são atualizados pela migração.

Alvo: projeto e-deal (`vwbtitjlpelrcnsytzqw`), produção. Não aplicado por este agente.
As duas credenciais locais foram recusadas com HTTP 401 na tentativa anterior.

Aplicação confirmada pelo operador em 30/09/2026 por retorno completo de
`verificacao_tempo`: 353 pedidos, zero com início e 353 sem início; quatro
gatilhos habilitados (`O`), diferíveis e inicialmente diferidos; leitura
autenticada permitida e INSERT/UPDATE/DELETE/execução da função registradora
negados. Histórico vazio e os oito pedidos consultados sem início, como
esperado para o baseline. Isso confirma a instalação informada pelo operador;
uma transição operacional posterior e sua releitura ainda precisam ser observadas.

1. Executar [preflight somente leitura](../sql/tempo_etapas_servidor_preflight.sql).
   Revisar tipos/colunas, gatilhos existentes, quantidade de pedidos e ausência
   das duas tabelas novas. Guardar o resultado antes de prosseguir.
2. Revisar e aplicar [migração](../sql/tempo_etapas_servidor.sql). Ela cria duas
   tabelas, quatro funções e quatro gatilhos; não altera os dados comerciais.
   Insere um baseline por pedido já nas artes, modelos ou links, sem horário inventado.
   Novos eventos gravam apenas o pedido cujo status mudou. Tudo em transação,
   com limite de espera por lock de cinco segundos e de 60 segundos por comando.
   A migração bloqueia temporariamente escritas nas quatro fontes enquanto
   captura o baseline e instala os gatilhos; revisar volume e índices antes.
3. Executar [verificação](../sql/tempo_etapas_servidor_verificar.sql). Esperado:
   quatro gatilhos ativos/diferidos; leitura do painel verdadeira; escrita e
   execução da função registradora pelo painel falsas. Copiar o conteúdo completo
   da célula `verificacao_tempo`. O baseline começa sem horários; novas transições
   legítimas posteriores à instalação já podem aparecer com início e histórico.
4. Publicar o frontend somente depois da confirmação do banco. Não publicar
   isoladamente: a tabela nova ainda precisa existir.
5. Observar uma mudança operacional legítima de card; conferir horário/histórico
   e repetir a leitura após atualizar/abrir outra aba, sem fabricar transição em
   pedido real apenas para testar.

Antes do commit SQL, usar ROLLBACK. Após aplicação, o
[rollback operacional](../sql/tempo_etapas_servidor_rollback.sql) remove apenas
os quatro gatilhos, preservando as tabelas e o histórico. Restaurar o frontend
por revert revisado. Não apagar dados como parte da recuperação.

## Validação

Os harnesses Node usam fontes reais e dados sintéticos. Com a autorização
"executar", foi instalado PGlite **0.5.8** exclusivamente em
`C:\ProjectBackups\tempo-etapas-testes-20260930`, com scripts de instalação
desativados. Nenhuma dependência ou lockfile do projeto foi alterado.

`tests/tempo_etapas_sql.cjs` **passou em PostgreSQL em memória**: 2.700 combinações
comparadas com `classificarPedidoNaArte`, incluindo cliente com link aberto ou
fechado. Também passaram transições sem navegador, preservação no mesmo card,
retorno, histórico de entrada/saída, fechamento por Ignorar, rollback de status,
rollback operacional que preserva histórico, leitura autenticada e bloqueio
de leitura anônima/escrita direta/execução da função interna.

No primeiro teste, `String(Date)` escondia frações de segundo e acusou igualdade
em duas entradas diferentes. A asserção passou a ler `desde::text`, preservando
a precisão do PostgreSQL. Não foi alterado o comportamento para satisfazer o teste.

Comando reproduzível:

```powershell
$env:PGLITE_MODULE = 'C:/ProjectBackups/tempo-etapas-testes-20260930/node_modules/@electric-sql/pglite'
node tests/tempo_etapas_sql.cjs
```

Executados e aprovados: `tempo_persistencia_harness.js` (100 releituras),
`tempo_carga_harness.js` (1.205 registros, falha parcial e recuperação),
`tempo_no_card_harness.js` (66 verificações), `tempo_na_tela_harness.js`
(40 verificações em Chromium), `estacao_sem_sessao_harness.js` (17 verificações),
`painel_prazos_lotes_harness.js`, `lista_arte_atualizacao_harness.js` e
`lista_arte_carga_harness.js`. Sintaxe JavaScript e `git diff --check` aprovados.
O primeiro teste de carga falhou por ausência de `NODE_PATH` nesta worktree;
foi repetido com a dependência Puppeteer já existente, sem instalação, e passou.

A suíte SQL também cobre baseline sem horário inventado, mudanças intermediárias
numa transação, modelos, produção e correção de arte. PGlite usa uma sessão:
contenção de locks entre sessões PostgreSQL reais não foi medida. O preflight
de produção foi conferido com o resultado fornecido pelo operador, conforme
registrado acima. A consulta de verificação em JSON também é validada na suíte
SQL. O agente não executou SQL remoto. Após a confirmação do operador, os
scripts SQL serão versionados separadamente; a entrega do frontend segue pelo
`entrega-segura.ps1`, com comparação dos arquivos públicos após propagação.
