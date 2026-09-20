# Plano: paginação dos bancos do pedido no portal do cliente

Estado: planejamento local. Nenhuma implementação, SQL remoto ou publicação
faz parte desta etapa. A autorização anterior de publicação cobriu a correção
de frente/verso; a execução deste plano deve ter seu próprio escopo autorizado.

## 1. Resultado esperado e ponto de partida

O cliente deve folhear as linhas que cada modelo efetivamente usa e conferir a
arte composta com foto, textos e códigos. O contador e o desenho devem representar
a mesma linha; frente e verso, quando existentes, devem representar a mesma peça.

Diagnóstico confirmado nesta conversa para o pedido 21894:

| Modelo | ID | Páginas esperadas com os dados diagnosticados |
| --- | --- | --- |
| Foto | 1000940 | 6, somente frente |
| Setor | 1000947 | 4, somente frente |

O banco tem seis linhas, mas Setor aproveita quatro após os filtros do modelo.
Esses números são critérios de conferência do caso atual, nunca constantes no
código. Reconsultar antes da validação final: dados podem ser editados depois.

A v847 lê somente o CSV interno das numerações. O painel já lê `pedidos_bancos`
e `pedidos_modelos_banco` e aplica `BancoDoModelo.numeracaoResolvida`.
As numerações do exemplo não têm CSV interno. Ver
`diagnostico-2026-09-09-pedido-21894-paginacao.md` para evidência e reprodução.

## 2. Preparação e limites

1. Conferir `origin/main`, versão pública, instruções aplicáveis e alterações
   existentes. Criar worktree isolado da base atual. Não reaproveitar como base
   a pasta principal, que contém alterações de outras tarefas.
2. Fixar primeiro a regressão com dados sintéticos: banco separado de seis
   linhas, dois modelos, mapeamentos diferentes e seleção de quatro linhas no
   segundo modelo. O teste deve falhar na versão sem a integração.
3. Inventariar os consumidores do CSV no portal: montagem do cartão,
   `numDoItem`, `linhasDaAmostra`, `amostraCsvPagina`, atualização do contador,
   `renderItemAmostraCombinada`, pré-carregamento de foto/PDF/SVG e sobreposição
   do visualizador PDF. Identificar funções duplicadas sem refatoração geral.

Não alterar quantidades, numeração de impressão, TICKET, montagem Multi-Artes,
preços, aprovações persistidas ou os arquivos originais de arte. Não copiar o
banco do pedido para o cadastro de numerações. Não trocar automaticamente o modo
CSV pelo modo PDF. Não regenerar links ou snapshots ao abrir ou folhear.

## 3. Contrato de leitura protegido pelo token

Recomendação: uma RPC aditiva e somente de leitura, com nome proposto
`link_cliente_bancos_modelos`, em novo arquivo SQL. Evitar substituir a RPC ampla
`link_cliente_pedido`, que também atende orçamento, entrega e faturamento.
Não editar uma migração já aplicada para introduzir o recurso.

A função recebe número do pedido e token. O servidor deve:

- Validar o par, o link ativo e o vínculo com o pedido. Não aceitar a escolha
  arbitrária de banco/modelo feita pelo navegador como autorização.
- Vincular explicitamente modelos, bancos e pedido autorizado; conferir o
  isolamento por empresa nos relacionamentos efetivamente existentes. As tabelas
  locais de referência de bancos não declaram `empresa_id`: não inventar coluna
  nem assumir unicidade suficiente sem verificar o esquema implantado.
- Recusar identidade ambígua; não usar um `LIMIT 1` arbitrário para conceder
  acesso quando houver mais de um candidato ao vínculo autorizado.
- Retornar bancos e mapas apenas dos modelos autorizados. Definir uma projeção
  explícita dos dados necessários ao desenho, incluindo os metadados usados por
  seleção/atividade e fotos (`__id`, `__ativo`, partes necessárias de `__fotos`).
  Não incluir colunas administrativas ou arquivos que não alimentam a arte.
- Distinguir pedido sem banco vinculado, banco legitimamente vazio e vínculo
  inválido/inacessível. Falha de consulta não pode virar resposta de sucesso vazia.
- Não gravar acessos, estados de aprovação, propostas ou dados do banco.

O formato final de resposta deve ser fechado e coberto por testes antes do SQL.
Preferir bancos deduplicados por ID e vínculos por modelo. Se houver projeção de
linhas no servidor, manter IDs e ordem originais e provar equivalência com os
filtros atuais; nunca recalcular IDs após o filtro.

Caso use `SECURITY DEFINER`, revisar dono, nomes qualificados, `search_path` fixo
e permissões explícitas de execução. O cliente usa somente credenciais públicas
e o token do link. Não ampliar acesso direto anônimo às tabelas nem levar chave
de serviço ao navegador. Não revogar permissões antigas nesta tarefa.

Antes da execução remota, preparar o script exato, identificar o projeto alvo
`vwbtitjlpelrcnsytzqw`, conferir o esquema atual e registrar objetos afetados,
recuperação e validação. Impacto previsto: uma função e suas permissões; zero
alterações de linhas de pedidos, modelos, bancos ou artes. Nenhum SQL será aplicado
automaticamente como parte dos testes.

## 4. Integração no portal

Arquivos previstos:

| Arquivo | Responsabilidade |
| --- | --- |
| Novo `sql/link_cliente_bancos_modelos.sql` | Leitura restrita ao token/pedido |
| `frontend/cliente-dados.js` | Chamada da RPC e tratamento do retorno |
| `frontend/cliente.html` | Carregar `banco-do-modelo.js` antes do consumidor e versionar os scripts alterados |
| `frontend/cliente.js` | Estado, resolução por modelo, paginação e desenho |
| `frontend/banco-do-modelo.js` | Reutilizar a lógica existente; modificar somente se uma lacuna for comprovada |
| `tests/` e documentação da entrega | Regressões, evidências e recuperação |

Carregamento proposto:

1. Após validar o link, carregar numerações, elementos e os bancos autorizados.
   Consultas independentes podem correr em paralelo; montar os cartões somente
   quando as dependências da arte estiverem resolvidas ou em erro explícito.
2. Manter estados separados: carregando, pronto, sem vínculo, banco vazio e erro.
   O estado fica associado à abertura atual do pedido. Descartar respostas de
   uma abertura anterior e limpar bancos/vínculos ao mudar de pedido.
3. Resolver a numeração para cada modelo usando o ID escolhido/reconciliado,
   seu banco e seu mapa. Tratar IDs de modelo como texto na comparação, conforme
   o contrato existente. Não modificar o objeto compartilhado do catálogo.
4. Usar essa resolução em todos os consumidores identificados na preparação.
   Reutilizar uma resolução estável por modelo durante a abertura, para preservar
   referências e caches de recursos sem compartilhar mapas entre modelos.
5. Aplicar os filtros existentes: linhas ativas, seleção do modelo e dados nas
   colunas utilizadas. Manter a ordem original e os metadados de foto/recorte.
6. Exibir anterior, próxima, posição atual/total e acesso direto à posição.
   Desabilitar anterior na primeira e próxima na última; limitar entradas inválidas.
   Cada modelo mantém sua própria posição. Zero/uma linha não cria navegação falsa.
7. Resolver uma única linha por desenho, para foto, textos, códigos e ambas as
   faces. Não deixar que uma foto ou renderização atrasada substitua a página
   escolhida depois. Carregar recursos da página corrente e evitar redesenho em laço.

Se faltar banco, coluna ou recurso necessário, informar o que não carregou e
oferecer nova tentativa. Uma imagem salva pode continuar visível como referência,
mas não deve ser apresentada como confirmação da composição variável atual.
Proposta para revisão funcional: enquanto a composição necessária estiver incompleta,
impedir a ação de aprovar aquele modelo na interface. Essa proteção precisa ser
testada junto do fluxo existente; não muda status no banco nem cria nova regra de
aprovação no servidor. Não exigir que o cliente visite todas as páginas.

Modelos já aprovados continuam em leitura: podem folhear sem ganhar botões de
aprovação/alteração. Modelos sem banco separado conservam o caminho do CSV interno.
Para PDF multipáginas, preservar o navegador próprio e conferir a sobreposição dos
dados sem criar duas paginações concorrentes. Divergência entre páginas e linhas
deve ser apresentada, nunca compensada silenciosamente.

## 5. Validação e critérios para liberar

| Grupo | Evidência necessária |
| --- | --- |
| Regressão do 21894 | Foto com 6 posições e Setor com 4; arte continua só frente |
| Conteúdo por posição | Foto, nome/texto, código e contador mudam juntos; conferir primeira, intermediária e última |
| Isolamento | Dois modelos com a mesma numeração e mapas/bancos diferentes não compartilham dados ou posição |
| Legado | CSV interno sem vínculo continua funcionando; caso sem banco continua estático |
| Filtros | Linhas inativas, seleção vazia, IDs selecionados, campos vazios e mapeamento por elemento/nome |
| Recursos | Foto atrasada/ausente, PDF/SVG de fundo, fontes e recortes; troca rápida sem mostrar dados da posição anterior |
| Modos | Frente, duplex, duplex_unico e PDF multipáginas preservados |
| Falhas | RPC indisponível, vínculo quebrado, coluna ausente, repetição de tentativa e mudança de pedido durante a carga |
| Token | Vazio, inválido, revogado, pedido trocado, vínculo cruzado e identidade ambígua não entregam dados |
| Efeitos colaterais | Abrir, folhear e tentar novamente não escrevem banco, arte, status ou mensagens |
| Aprovação | Modo leitura permanece; falha de composição não produz falsa confirmação nem escrita automática |

Executar testes de funções/integração com serviços simulados e uma regressão em
Chromium que clique nas setas e confirme o conteúdo desenhado, não apenas o HTML.
Usar dados e fotos sintéticos distinguíveis por página. Testar desktop e largura
390px, inclusive acesso direto à última página e retorno à primeira.

Rodar a sintaxe do frontend e as suítes pertinentes já existentes: banco do
modelo/pedido, fatia CSV, fotos, texto de banco, portal, PDF paginado, FxVersoUnico,
gabarito e a regressão de frente/verso. Inspecionar efeitos dos testes antes de
executar; usar `-n 0` e as dependências instaladas, sem instalação automática.

Para a RPC, testes de fonte ou simuladores não provam permissões PostgreSQL.
Usar banco local isolado, se disponível. Se não houver, registrar a limitação
e preparar validação específica de instalação e leitura; não usar produção como
substituto automático de banco descartável.

Critério de liberação: testes relevantes aprovados, contrato da RPC revisado,
preview conferido, diff restrito, nenhuma exposição de dados nos artefatos e
recuperação preparada. A revisão deve incluir o comportamento durante erros.

## 6. Sequência de implantação e conferência final

Somente após autorização do escopo de execução, incluindo a RPC e a publicação:

1. Concluir implementação e testes locais; preparar SQL aditivo e entrega revisável.
2. Conferir novamente ambiente e código implantados. Registrar definição/permissões
   anteriores caso o nome da função já exista. Aplicar apenas o SQL revisado.
3. Validar a leitura da RPC e a rejeição dos casos inválidos antes de publicar o
   frontend. Se falhar, parar a implantação do frontend e tratar o contrato.
4. Integrar os arquivos necessários por branch/PR e publicar no Cloudflare Pages.
   Escolher a próxima versão disponível dos assets, sem fixar agora v848.
5. Conferir HTML e hashes dos scripts no domínio oficial. Validar a paginação do
   21894 e um caso legado. A abertura normal do link pode registrar acesso por
   `link_cliente_abrir`: documentar esse efeito; não clicar em aprovar, alterar ou
   enviar mensagens para validar a publicação.
6. Registrar resultado real por modelo, versão, commit/PR, SQL aplicado, testes,
   hashes, efeitos observados e limitações. Conferência em navegador automatizado
   não substitui validação física no iPhone/WhatsApp; registrar se não realizada.

## 7. Recuperação

Primeiro voltar o frontend para o código anterior com uma nova versão de assets,
mantendo temporariamente a RPC aditiva para navegadores ainda abertos. Isso retorna
à exibição estática anterior sem apagar artes ou dados. Não corrigir pedidos em
lote como tentativa de recuperar a interface.

Retirar a RPC ou restaurar sua definição/permissões anteriores somente após
confirmar que nenhum consumidor ativo depende dela e com operação específica
revisada. Nenhuma exclusão de tabela, linha de banco, numeração ou arquivo de arte
faz parte do rollback.
