# Distribuição automática — instalação e operação

Implementação local de 31/10/2026. Regras em
[plano-distribuicao-designers-2026-10-31.md](plano-distribuicao-designers-2026-10-31.md).
Foram executadas apenas consultas de prévia em transações READ ONLY no banco real.
Nenhuma migração, ativação ou alteração de atribuições foi executada em produção.

**Três regressões aprovadas localmente após correção.** O deadlock foi reproduzido
inclusive sem a distribuição; sua correção adicional foi autorizada e preparada
em SQL separado. Instalação e ativação continuam pendentes de autorização e
validação operacional. Ver [revisão](revisao-distribuicao-gatilhos-2026-10-31.md).

## Arquivos e arquitetura

- `sql/distribuicao_designers.sql`: instalação transacional, inicialmente desativada.
  O esquema privado `arte_fila` guarda configuração, responsáveis, disponibilidades
  e eventos. RPCs públicas validam a sessão e o papel; tabelas privadas não têm acesso direto.
- `frontend/script.js`: módulo ARTE_DISTRIBUICAO com consulta, controles, calendário
  útil e integração à lista. O protótipo separado foi incorporado ao asset já
  sincronizado nas estações; `index.html` e `producao.html` recebem o cache atualizado.
- `tests/distribuicao_designers_*`: testes sintéticos de painel, navegador e SQL.

A carga é uma linha por `id_int`, mesmo com várias artes/modelos. O classificador
é o existente `imposition_card_arte_ler()`. Gatilhos das seis fontes apenas inserem
na caixa de eventos privada, inclusive em chamadas aninhadas e enquanto inativo.
A captura inativa evita perder commits concorrentes à ativação; pode acumular
eventos enquanto o mecanismo estiver desativado.

O consumidor privado `arte_fila.consumir()` toma a trava de distribuição
`(731031,1)` e processa o estado confirmado de todos os pedidos do lote. Um segundo
consumidor retorna sem competir. A remoção é pelos IDs exatos capturados: eventos
com sequência menor, mas commit posterior, não são perdidos. Falhas revertem o
lote inteiro, preservando os eventos para a próxima tentativa. As atualizações de
designer podem gerar um evento adicional; a próxima passagem converge sem nova
atribuição ou auditoria duplicada. RPCs administrativas reconciliam a carga antes
de fixar designer ou mudar disponibilidade.

A ativação agenda o consumidor no pg_cron a cada cinco segundos, com timeout de
15 segundos. Falha ao agendar reverte a ativação; desativar remove o job.
Distribuição após commit é eventual: atrasos, contenção ou falhas podem exceder
cinco segundos. O painel informa pedidos com atualização pendente e consulta a
cada minuto. Não depende de navegador aberto. Monitorar o job
`ideal-arte-distribuicao`, falhas em `cron.job_run_details` e idade/quantidade de
`arte_fila.eventos`; o sucesso do consumidor é necessário para a carga convergir.

`sql/ordenar_travas_catalogo_modelos.sql` é uma correção separada, a aplicar antes
da distribuição. Usa a chave `(731031,2)` em ambos os pontos de entrada antes dos
locks de linha, mantendo os gatilhos legados. Serializa alterações de verso/vínculo
e modo de impressão até o commit, inclusive entre numerações diferentes. Não é
uma promessa de ausência de deadlocks em transações arbitrárias que obtenham
locks previamente; essas transações exigem a mesma ordem.

O rodízio é único entre as empresas, por confirmação explícita do usuário em
31/10/2026. Todos os designers cadastrados participam, mesmo sem `id_empresa`.
Disponibilidade, carga e desempate são globais; o mecanismo não altera o cadastro
de empresas dos usuários nem as permissões comerciais existentes.

O original até três e o responsável que recebe futuras alterações são o mesmo
campo operacional; atribuições anteriores ficam no histórico. Correções preservam
o responsável mesmo com carga acima de três ou fila segurada. Ausência prevalece
sobre tudo isso. Quando todos estão ausentes/segurados, o pedido fica em espera.
A fixação manual pode escolher um designer com fila segurada; não pode escolher ausente.
Retirar a fixação não transfere um trabalho já atribuído automaticamente.

O novo relógio não reaproveita créditos históricos de tempo corrido. Registra tempo
útil a partir da ativação/atribuição; pausa quando fica sem responsável. A regra
anterior de recuperar crédito ao retornar da aprovação em até 60 minutos permanece,
mas o crédito passa a guardar segundos úteis. Segurar fila não pausa relógio.
Feriados em dias úteis são contados. A lista consulta mudanças externas a cada minuto.

## Validação antes de aplicar no banco

Requer autorização específica para leitura/escrita no ambiente escolhido. Conferir:

1. Banco alvo, tabelas e tipos das colunas usadas; índices por `id_int` nas fontes.
2. Escopo aprovado: `usuarios.id_empresa` pode existir e não divide o rodízio.
   A instalação ainda recusa outros campos `empresa_id`, `id_empresa` ou `tenant_id`
   nas fontes principais. Essa exceção específica não autoriza ignorar outros
   mecanismos de isolamento; revisar qualquer divergência antes de aplicar.
3. Lista de designers em `usuarios`: setor contendo "designer", `user_id` preenchido,
   nomes e vínculos de `pedidos_artes` válidos. Nome só resolve identidade quando único.
4. Conferir amostra de Em Arte, Enviar Arte, aprovação parcial, aprovado, cancelado,
   produção e Corrigir Arte contra o painel. Overrides locais não são fonte do rodízio.
5. Prévia da carga e das atribuições atuais. A ativação preserva a base existente,
   sem redistribuição retroativa por excesso de carga. Registrar contagens e backup
   autorizado de `id`, `id_int`, `designer_uid`, `designer_nome`, sem exportar outros dados.
6. Confirmar pg_cron e permissão do proprietário das funções para criar/remover
   o job. O agendador é dublê nos testes; validar execução real após autorização.
7. Executar os testes SQL em PostgreSQL descartável compatível e validar concorrência
   entre duas conexões reais. PGlite valida SQL/transações, mas não prova essa concorrência.

Não há migração automática no carregamento do site. Instalar o SQL uma única vez
(uma segunda execução falha e reverte a transação). Nenhuma tabela comercial é
reestruturada; gatilhos e o índice `arte_fila_produtos_id_int_idx` são adicionados.
A criação do índice faz parte da transação de instalação e deve ter sua janela
avaliada, pois pode aguardar/bloquear escritas nessa tabela. Instalação permanece desativada.
As RPCs requerem sessão Supabase: não aceitam um papel informado pelo navegador.

## Ativação e prova de funcionamento

Após validar o banco e publicar os arquivos do frontend pelo fluxo protegido:

1. ADM autenticado abre Lista de Arte e clica **Ativar distribuição**.
2. Conferir resposta persistida da RPC `arte_distribuicao_estado`: `ativo=true`,
   designers corretos, carga inicial e nenhuma transferência inesperada.
3. Num cenário autorizado, conferir três pedidos com o original e o quarto com
   menor carga; conferir todas as linhas de arte e o histórico, não apenas a tela.
4. Segurar fila: nenhuma transferência; ausência: todos os pedidos em Em Arte
   transferidos, fixações retiradas e motivo registrado. Reativar não traz pedidos de volta.
5. Testar alteração de responsável com duas sessões e verificar ausência de duplicação,
   perda de atualização e contagens acima/abaixo do resultado esperado.

O botão de fixação e o histórico aparecem na caixa de designers do pedido.
ADM controla disponibilidade no bloco **Distribuição de designers**, acima da tabela.
Atendimento não altera disponibilidade. Negativas explícitas de edição continuam valendo no banco.

## Recuperação

Para interromper o mecanismo, ADM pode chamar a RPC `arte_distribuicao_ativar` com
`p_ativo=false` usando sessão autenticada. Isso interrompe novas decisões, preservando
atribuições e histórico; não reverte transferências já realizadas. O job é removido,
mas a captura de eventos permanece para não perder commits na próxima ativação.
A correção independente de catálogo/modelos continua ordenando suas travas;
desativar a distribuição não desfaz essa correção.

Reversão de responsáveis requer prévia e autorização separadas: selecionar eventos
do período, comparar o responsável atual com o último gravado, verificar trabalhos
posteriores e restaurar somente os pedidos explicitamente aprovados. Não apagar o
esquema/histórico, nem fazer rollback global sobre alterações operacionais posteriores.

## Testes locais

Sem instalar dependências:

```powershell
node tests/distribuicao_designers_harness.js
node tests/distribuicao_designers_browser_harness.js
```

Com PGlite previamente autorizado e instalado apenas em diretório temporário:

```powershell
node tests/distribuicao_designers_sql_harness.mjs C:\caminho-temporario\node_modules\@electric-sql\pglite\dist\index.js
```

O harness SQL sempre cria um banco em memória. Nunca recebe URL ou credenciais.
`distribuicao_designers_fixture.sql` é exclusivo desse banco descartável e não deve
ser executado no ambiente compartilhado. As tabelas sintéticas não validam o schema real.

## Evidência local desta implementação

- Harness de distribuição/calendário/integração: 40 verificações aprovadas.
- Navegador headless: controles ADM, fixação, histórico, escape de HTML e restrições aprovados.
- Regressões existentes: Lista de Arte 134 + 53, relógio 81, bloqueios 118,
  permissões 79 e Entrega/Faturamento 12 verificações aprovadas.
- Sintaxe dos dois arquivos JavaScript de implementação e whitespace revisados.
- Harness SQL: 87 verificações aprovadas em PGlite 0.5.14, instalado com autorização
  somente em pasta temporária, sem scripts de instalação, alteração de package.json
  ou lockfile do projeto. Banco em memória, sem credenciais ou acesso remoto.
- A execução identificou e corrigiu um alias SQL ambíguo e o registro da primeira
  atribuição manual (horário para desempate e responsável anterior na auditoria).
- Os testes cobrem carga, desempate, lotes, múltiplas artes por pedido, fixação,
  ausência, fila segurada, espera, retorno de alteração, calendário, permissões,
  rollback, primeira atribuição manual e preservação da base na ativação/desativação.
- PostgreSQL 17.11 descartável: concorrência entre duas conexões aprovada; a segunda
  conexão consumidora não processou um lote já em andamento, e o produtor continuou
  gravando sem disputar a trava da distribuição. Evento de commit tardio foi preservado.
  Terceiro pedido preservado, quarto distribuído, auditoria sem duplicação e rollback
  sem resíduos. O cluster temporário foi encerrado ao terminar.
- Prévia de metadados no Supabase configurado: PostgreSQL 17.4, mecanismo ainda não
  instalado. Evidência em `docs/evidencias/distribuicao-designers-schema-20261031.json`.
- Escopo definido pelo usuário: rodízio único entre empresas. A instalação permite
  especificamente `usuarios.id_empresa`; teste com três empresas confirma carga
  compartilhada e redistribuição por ausência, preservando os cadastros dos designers.
- Publicação, migração, interação com os 35 gatilhos existentes e operação com pedidos
  reais não foram validadas por escrita. Não confundir os testes sintéticos com essa prova.

## Prévia de escopo — 31/10/2026

Somente agregados, sem nomes, documentos, contatos ou identificadores de pessoas:

- Quatro designers cadastrados, todos com `id_empresa` nulo.
- Pedidos com arte agrupados pela empresa do criador: empresa 1 = 450;
  empresa 2 = 732; empresa 3 = 248; sem empresa do criador = 6.
- Essa associação pelo criador não comprova qual empresa é dona operacional do pedido.
  O usuário confirmou a fila única compartilhada; não preencher cadastros automaticamente.
- `produtos_proposta` não tem índice por `id_int` na prévia. O SQL local agora prepara
  esse índice, sem executá-lo em produção, para as consultas de classificação.
- As demais fontes consultadas têm índices por número de pedido. As políticas existentes
  não foram alteradas; inspeção por presença textual de filtros não é auditoria de RLS.

Próximo passo: revisar o pacote local e preparar a instalação autorizada em duas
etapas (ordenação de travas, depois distribuição inativa). Antes da ativação,
conferir o pg_cron e os hashes atuais dos gatilhos revisados. Os três cenários
problemáticos passaram localmente; o agendador real e pedidos reais permanecem
sem teste de escrita. Instalação, ativação e publicação não foram executadas.

Teste de concorrência reproduzível, usando binários PostgreSQL já existentes:

```powershell
.\venv\Scripts\python.exe tests\distribuicao_designers_postgres.py C:\caminho\pgsql\bin\psql.exe --revisar-gatilhos
```

O harness cria um cluster novo em TEMP, escuta somente em 127.0.0.1, usa dados sintéticos
e encerra o servidor ao final. Não aceita DSN remoto e não reutiliza banco operacional.


## Correções da segunda revisão — 31/10/2026

- Reativação: reconciliar a base existente com o responsável atual da fonte,
  inclusive remoção do designer; limpar fixação antiga se o responsável mudou.
  Pedidos cuja arte foi removida deixam de contar na carga. Um evento posterior
  não restaura o designer antigo. Mudanças são registradas como `base_reconciliada`.
- Primeira entrada: `ja_distribuido` diferencia um responsável cadastrado fora de
  Em Arte de uma atribuição já efetuada. Entradas vindas de Pendente Informação
  passam pelo rodízio; pedidos fixados e retornos de alteração preservam o responsável.
- Navegador: o fluxo legado exige resposta atual confirmando inatividade (ou RPC
  ausente antes de qualquer instalação reconhecida). Falha de consulta invalida
  essa confirmação; o atalho `setOSDesigner` também consulta antes de gravar.

Novas regressões incluídas nos harnesses SQL e JavaScript. Nenhuma migração
já aplicada foi alterada: o SQL de instalação continua exclusivamente local.


## Pacote web preparado para publicação

O procedimento e as adaptações à base atual estão em
[entrega-distribuicao-designers-2026-10-31.md](entrega-distribuicao-designers-2026-10-31.md).
Escopo confirmado: publicar web e deixar SQL preparado, sem instalar nem ativar.
O módulo não depende de um novo arquivo na lista de sincronismo do NewProd.
