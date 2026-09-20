# Pedido avulso: preservacao e recuperacao do 21824

Estado atual: recuperacao parcial do cadastro do 21824 executada e conferida.
A migracao geral de Avulso permanece rascunho, sem aplicacao; nenhum clone foi criado.
Produtos e modelos continuam sem recuperacao. Ver a ultima secao deste registro.

## Autorizacao e ambiente

O usuario autorizou consultar o pedido 21824 em producao, corrigir a perda de dados
ao marcar/desmarcar Avulso no ERP Vibe e retornar o pedido ao estado anterior.
Projeto confirmado: `vwbtitjlpelrcnsytzqw`, PostgreSQL 17.4. A alteracao de
infraestrutura para criar um clone pago ainda depende de autorizacao especifica.
Checkout `main` ja estava alterado; as alteracoes anteriores foram preservadas.

## Evidencia consultada em 09/09/2026

- A proposta 21824 existe. `produtos_proposta` e `pedidos_modelos`: zero linhas.
- `pedidos_artes`: uma linha APROVADO, com uma referencia de arquivo e a chave
  `item_2496`. O produto 2496 nao existe mais.
- A FK `fk_pedidos_modelos_produtos_proposta` ainda usa ON DELETE CASCADE.
- Auditoria 335656, em 09/09/2026 11:19:36.289485 UTC (08:19:36 em Sao Paulo),
  mudou `is_avulso` de false para true. O registro anterior da proposta permanece
  em `audit.logs_v2.old_data`, inclusive o texto do orcamento anterior.
- Nao foram encontrados registros do produto/modelo em `audit.logs`,
  `audit.logs_v2`, `producao_os_itens` ou `print_queue` nas consultas do pedido.
- Nao ha banco CSV do pedido em `pedidos_bancos`, nem registro em `pedidos_backup`.
  Isso nao comprova que nunca houve CSV dentro de uma numeracao antiga.
- Existem 555 modelos no banco na previa consultada. Nenhum sera convertido ou
  regravado pela troca da FK; ela sera validada contra os registros existentes.
- Backup fisico 1624192457 COMPLETED, criado em 09/09/2026 09:27:05.032 UTC
  (06:27:05 em Sao Paulo), anterior ao incidente. Conteudo do backup ainda nao lido.
  PITR esta desativado. O backup fisico nao tem download direto.

A ausencia de log DELETE impede atribuir o momento exato ou o autor da exclusao.
A mudanca para avulso, o produto orfao e a cascata ativa sustentam o diagnostico,
mas o codigo do botao Avulso no ERP Vibe ainda precisa ser conferido.

## Correcao preparada

`sql/preservar_pedido_avulso.sql` cria um arquivo privado de produtos e variacoes
removidos enquanto a proposta estiver avulsa. Os modelos permanecem com os mesmos
IDs, artes, numeracao, selecao CSV, vinculos de banco e acabamento; a FK passa
a SET NULL. Ao desmarcar Avulso, os produtos e variacoes arquivados voltam com os
mesmos IDs e os modelos originais sao religados. A sequencia nao e reiniciada.

O arquivo tem RLS e nenhum acesso para anon/authenticated. As funcoes de trigger
tem search_path fixo e nao podem ser chamadas diretamente por esses papeis.
Conflitos de IDs interrompem toda a desmarcacao; nao ha sobrescrita nem geracao
de modelos substitutos. Repetir uma desmarcacao nao cria duplicatas.

A exclusao comercial continua ocorrendo enquanto Avulso, preservando a ausencia
de itens nas somas comerciais desse modo. Produtos de pedidos comuns nao sao
arquivados por esta migracao, mas a FK SET NULL preserva seus modelos tambem.
Variacoes sao arquivadas antes da cascata e restauradas junto com o produto.

Contrato a validar com o Vibe: marcar `is_avulso=true` antes de remover produtos;
ao desmarcar, recarregar os produtos restaurados. O frontend do ERP nao deve
executar uma segunda exclusao/recriacao dos itens depois dessa restauracao.
Sem conferir esse fluxo, nao declarar o ciclo de ponta a ponta validado.

## Validacao preparada

`tests/pedido_avulso_regressao.py` gera SQL com dados sinteticos e schema exclusivo.
Ele testa ciclo completo, preservacao de modelos/CSV/variacoes, campos gerados,
repeticao, segundo ciclo com edicoes recentes, isolamento por pedido, conflito
com rollback, retentativa e privacidade do arquivo. Termina com ROLLBACK.

Nao executar testes no banco de producao. Nao foi encontrado PostgreSQL local,
Docker ou biblioteca PGlite ja instalada. O teste ainda precisa de um PostgreSQL
descartavel autorizado. Gerar o SQL localmente nao equivale a executa-lo.

## Previa de aplicacao e recuperacao

Migracao: producao no projeto acima; uma tabela privada, duas funcoes, dois
triggers e a FK identificada. Zero UPDATE/DELETE direto sobre pedidos existentes.
Transacao unica com limites de lock e duracao; qualquer erro desfaz a instalacao.
Validar depois a FK, triggers, permissoes, contagem e hashes dos modelos existentes.

Restauracao 21824: clonar o backup em projeto temporario independente; desativar
agendamentos no clone (a origem tem dois jobs ativos), sem alterar a origem.
Ler somente os produtos, variacoes, modelos, bancos e vinculos do pedido 21824.
Conferir IDs, quantidades, numeracao, status, integridade dos arquivos e diferencas
com a auditoria anterior ao Avulso. A quantidade de modelos do backup ainda e
desconhecida; nao inventar campos com base apenas no texto do orcamento.

Antes de escrever, apresentar previa com as contagens e campos a restaurar;
conferir novamente que o pedido continua no estado diagnosticado. Recuperar
apenas essas linhas, numa transacao, com checagem de conflitos. Manter estado
anterior de destino em area privada para recuperacao e registrar hashes/contagens
sem copiar dados pessoais ou credenciais para arquivos, Git ou logs.
Comparar o resultado com a fonte e com o estado anterior ao Avulso, preservando
pagamentos e demais dominios que nao forem parte da restauracao revisada.

Nao restaurar o backup inteiro sobre producao: isso reverteria outros pedidos.
Nao declarar o 21824 recuperado antes da extracao e validacao das linhas originais.

## Custos e pendencias externas

API de billing confirma instancia Micro, US$ 0.01344/h de computacao. Um clone
replica recursos de banco e pode adicionar custo de armazenamento; a cotacao
completa deve ser conferida antes de cria-lo. Nenhum clone foi criado.

Fontes oficiais consultadas:
- https://supabase.com/docs/guides/platform/clone-project
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/reference/api/v1-list-project-addons

## Suspensao anterior por orientacao do usuario

O usuario informou nao ter acesso ao codigo do ERP Vibe e orientou: "nao corra
riscos". A criacao da copia paga nao foi autorizada. A autorizacao anterior para
corrigir e recuperar nao permite ignorar essa nova restricao.

Naquele momento, o SQL permaneceu como rascunho, explicitamente marcado NAO APLICAR. Nao instalar
os triggers, trocar a FK, alterar a flag Avulso, recriar itens ou contratar o
clone enquanto essas dependencias nao forem resolvidas. O 21824 segue sem
restauracao e a protecao proposta segue sem instalacao.

Sem o repositorio, a equipe responsavel pelo Vibe pode fornecer o contrato do
fluxo: ordem das chamadas ao marcar/desmarcar, se ha DELETE e INSERT posteriores
ao UPDATE de is_avulso, uso de transacao e comportamento do recarregamento dos
itens. Essa confirmacao e a regressao isolada devem preceder a revisao de aplicacao.
Nenhuma mensagem foi enviada ao Vibe nesta tarefa.

Verificacao local concluida: sintaxe Python e geracao do SQL sintetico com
23 assercoes; schema exclusivo, ausencia de referencias public. e COMMIT no SQL
gerado, terminacao em ROLLBACK e ausencia de dados reais. A regressao PostgreSQL
nao foi executada; esses checks nao comprovam o comportamento da migracao.

## Recuperacao parcial autorizada e aplicada

Depois da suspensao, o usuario pediu: "corrigir o possivel no pedido 21824".
Esse pedido autorizou uma recuperacao pontual dos campos comprovados pela
auditoria, preservando a restricao de nao assumir riscos com o fluxo do ERP.
A migracao geral e a criacao de infraestrutura paga continuam suspensas.

Previa apresentada: producao `vwbtitjlpelrcnsytzqw`, tabela `public.propostas`,
filtro `id_int = 21824`, uma linha. Fonte `audit.logs_v2.id = 335656`, `old_data`
anterior a conversao para Avulso. Campos recuperados:

- `is_avulso`: true para false;
- `valor`: 90.90 para 101.00 (valor-base historico, distinto do total);
- `texto_whatsapp`: texto historico completo, 494 caracteres;
- `frete_escolhido`: opcao historica exata, copiada dentro do banco.

O total `valor_total = 90.90`, o status `LIBERADO` e todos os demais campos da
proposta foram preservados, exceto o carimbo automatico `updated_at`. Nao foram
revertidas as transicoes operacionais posteriores ao incidente. Nao houve
alteracao em pagamentos, produtos, modelos, artes, funcoes, FKs ou triggers.

Execucao: `sql/recuperar_parcialmente_pedido_21824.sql`, em transacao unica,
com lock de linha, guarda do hash integral do estado atual, guarda da fonte
historica e guarda das definicoes/corpos dos triggers instalados. A transacao
exigiu uma linha alterada, correspondencia dos quatro campos com a fonte,
ausencia de alteracoes nos demais campos e auditoria completa antes do COMMIT.

- API retornou HTTP 201; consulta independente posterior confirmou a gravacao.
- Horario: 09/09/2026 12:25:56.222582 UTC (09:25:56 em Sao Paulo).
- Auditoria da recuperacao: **335744**, transacao **1478446**.
- Auditoria lista exatamente os quatro campos acima e conserva o estado anterior.
- Hash MD5 do texto recuperado: `f5289e653ecf893158c71c24e0119316`, igual a fonte.
- SHA-256 do SQL executado:
  `1b954d171a468c4ca6e8ac44358781b68e428b7edf46b3530648c17ba80c1197`.
- Consulta de validacao: todos os quatro campos iguais a fonte; demais campos
  da proposta iguais ao estado imediatamente anterior a recuperacao.

Reversao: a auditoria 335744 guarda `old_data` e `new_data`. Se solicitada,
conferir que o destino ainda coincide com `new_data` e restaurar somente os
mesmos quatro campos de `old_data`, com nova transacao e auditoria. Nao reverter
automaticamente nem sobrescrever edicoes posteriores. O SQL de recuperacao e
de uso unico: seus hashes recusam reaplicacao contra o estado ja recuperado.

Limites confirmados apos a operacao: zero produtos e zero modelos no pedido.
O registro de arte continua APROVADO e a referencia do PDF original ainda tem
objeto correspondente no Storage; a integridade binaria do PDF nao foi testada.
A tela do ERP Vibe nao foi aberta/validada. Nenhum dado de modelo foi inventado.
O arquivo da migracao geral de Avulso continua marcado NAO APLICAR.
