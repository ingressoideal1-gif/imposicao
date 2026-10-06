# Modo de impressão compatível com o Vibe

Implementação local na branch `fix/modo-compativel-vibe-20261006`, baseada em
`5922c381a47a532cadc0109a6970f1c6f4a38913`. O checkout operacional foi preservado.
Esta revisão substitui a regra anterior que derivava `verso_tipo` da numeração.

## Contrato

| `pedidos_modelos.verso_tipo`, informado pelo Vibe | Modos permitidos na numeração |
|---|---|
| SÓ FRENTE | `front` |
| FRENTE E VERSO | `duplex`, `duplex_unico`, `pdf_odd_even`, `pdf_duplicate_back` |
| VERSO FIXO | Os mesmos quatro modos com verso |
| VERSO VARIÁVEL | Os mesmos quatro modos com verso |

Os rótulos legados Frente, FxVerso e Verso Comum continuam reconhecidos.
Campo ausente/desconhecido bloqueia a configuração vinculada até o preenchimento
no Vibe. O catálogo avulso continua permitindo os cinco modos.

`producao_numeracoes.print_mode` permanece junto de `elements[].face`.
A numeração determina a composição e a prévia. Escolher outra opção com verso
não renomeia o campo comercial. `pdf_odd_even` continua representado por `duplex`
no seletor do trabalho; a numeração conserva o modo PDF original.

No editor vinculado, Pedido e Imposição, opções incompatíveis ficam indisponíveis.
Uma seleção incompatível já existente permanece visível, com aviso, sem substituição
automática. A correção é manual: mudar a categoria no Vibe, reabrir o pedido e
ajustar a numeração. Preservam-se os elementos ao alternar o modo; cabe conferir
visualmente a frente e o verso antes de produzir.

O salvamento da numeração consulta o pedido e os vínculos atuais. A geração relê
categoria, vínculo e modo; falha de rede, alteração concorrente detectada ou
payload de modo anterior bloqueiam o envio. Numeração compartilhada exige
compatibilidade com todos os modelos vinculados; o gatilho também verifica
modelos não visíveis ao usuário, sem expor seus dados. Pedidos de categorias
opostas precisam de numerações separadas.

O frontend deixa de escrever `verso_tipo` e `frente_verso` por seleção de modo ou
numeração. No SQL novo, `frente_verso` acompanha a categoria reconhecida do Vibe.
A alteração do Vibe pode deixar temporariamente uma incompatibilidade, necessária
para ajustar manualmente a numeração depois. Não é feita conversão automática
de arte, elementos, paginação ou histórico.

## Arquivos e validação

Fontes: `frontend/cor-numeracao-do-modelo.js`, `script.js`, `pedido.js`, `cliente.js`;
as três páginas consumidoras usam cache `1028-vibe1` nos arquivos alterados.
O contexto do editor aberto pela Imposição passa a incluir `osId`.
Na leitura da numeração, METADATA fornece o modo apenas se a coluna estiver ausente.

Regressões específicas: `modo_compativel_vibe_harness.js`,
`verso_tipo_canonico_harness.js`, `cliente_verso_atual_harness.js`.
Cobrem matriz 4 × 5, DOM, incompatibilidade sem troca silenciosa, consulta
indisponível, mudanças no Vibe, numeração/vínculo, seleção assíncrona e paginação
de vínculos compartilhados. Os três entram em `conferir_duas_versoes.py`.
As fixtures de testes antigos foram atualizadas com categoria/modo explícitos e
com o módulo real de contrato. O teste de fluxo combinado simula a conferência
Vibe, testada separadamente, preservando suas verificações de geração.

`tests/modo_compativel_vibe_postgres.cjs` executa PostgreSQL/PGlite em memória,
aplicando a migração anterior real, a nova e a reversão. Verifica RLS, vínculos
ocultos, permissões, preservação dos rótulos e ausência de alteração do histórico.
Usa a dependência já disponível via `PGLITE_MODULE`; não instala dependências.

Resultados concluídos nesta cópia:

- `conferir_duas_versoes.py`: 389 testes Python passaram, 2 foram ignorados,
  em cada canal; os 15 harnesses JavaScript passaram em ambos. Aviso existente
  de depreciação Starlette/httpx, sem alteração de dependências.
- Sintaxe de todo o frontend: 93 testes passaram.
- Teste PostgreSQL/PGlite de migração, RLS e reversão: passou.
- Harnesses adicionais de persistência, Modo PDF, FxVersoUnico, duplicação,
  filas, vínculo da numeração, faces de impressão e fluxo combinado: passaram.
- `git diff --check`: sem erros.
- Pacote independente gerado em `dist/piloto-vibe/NewProdPiloto.exe`,
  142672070 bytes, SHA-256
  `af1388e47dc60b9c1d32eae7a52192c798307c664c3fae5c268970f40b6abaf3`.
  Conferência do pacote aprovada; os sete arquivos frontend/HTML alterados
  foram extraídos e comparados byte a byte com a fonte: 7/7 iguais.
  Evidência em `dist/piloto-vibe/fontes-conferidas.json`.
  O manifesto aponta o commit-base; este pacote inclui alterações locais
  ainda não commitadas e não foi instalado/publicado.

## Ativação manual coordenada

Alvo previsto: Supabase e-deal (`vwbtitjlpelrcnsytzqw`), tabelas
`public.pedidos_modelos` e `public.producao_numeracoes`.
Nenhum SQL remoto foi executado pelo agente nesta revisão.

1. Publicar o frontend revisado, atualizar o painel NewProd e instalar o novo
   pacote independente do Piloto. Encerrar abas antigas antes de liberar edições.
   Durante a transição, suspender mudanças de categoria/vínculo/modo: os gatilhos
   anteriores ainda sobrescrevem o texto comercial até a aplicação do SQL novo.
2. No projeto correto, executar **o arquivo inteiro**
   `sql/modo_compativel_vibe_20261006.up.sql`, em uma execução. Ele exige os dois
   gatilhos anteriores ativos e usa uma transação com limites de espera/execução.
   Não executar trechos isolados de funções. Se houver erro, a transação não
   confirma a substituição; conferir a causa antes de repetir.
3. Executar `sql/modo_compativel_vibe_20261006.verificar.sql`.
   Esperado: `novos_ativos=2`, `antigos_desativados=2`, `regra_instalada=true`.
4. Reabrir um pedido e conferir as opções conforme a categoria. Conferir geração
   de PDF e faces com o operador antes de afirmar validação operacional.

O SQL altera quatro funções e instala dois gatilhos novos, desativando os dois
anteriores. Estimativa de registros históricos atualizados: **zero**. Não altera
políticas RLS nem concede acesso a tabelas. O gatilho da numeração é definer para
validar todos os vínculos; execução direta de suas funções não é concedida.
Os limites SQL são 5 s para lock e 30 s para execução. A proteção da geração
descrita é a dos fluxos do frontend; esta revisão não altera o endpoint Python
nem oferece uma reserva transacional que dure até a impressão física.

O histórico já corrigido anteriormente continua como está. Esta mudança não
recupera o texto comercial que existia antes daquela correção. Não reaplicar o
backfill anterior: ele pertence à regra substituída. Divergências comerciais
devem ser corrigidas no Vibe, sem inferência a partir da numeração.

## Recuperação e estado da entrega

`sql/modo_compativel_vibe_20261006.down.sql` restaura os gatilhos anteriores em
transação, sem alterar registros e sem apagar os backups históricos. Essa
reversão volta a permitir que a numeração sobrescreva o texto nas escritas
seguintes; coordená-la com a recuperação da aplicação anterior.

Implementação local; publicação, instalação nas estações e aplicação manual do
SQL são etapas separadas. Não há comprovação de impressão física nesta revisão.

## Continuação autorizada

O operador aplicou o SQL manualmente e apresentou a verificação:
`novos_ativos=2`, `antigos_desativados=2`, `regra_instalada=true`.
Isso é confirmação do operador, não execução remota pelo agente.

Publicação preparada em `ideal-imposition-modo-vibe-publicar-20261006`, branch
`entrega/modo-vibe-20261006`, sobre a mesma base atual de origin/main. A simulação
do publicador passou e reservou v1029 para os assets alterados. SQL e teste
PostgreSQL permanecem na cópia de preparação original; não são reaplicados.
A alteração local em `ferramentas/conferir_duas_versoes.py` fica nessa preparação;
os novos harnesses acompanham esta entrega e são executados pelo publicador,
além da conferência comum dos dois canais. O pacote Piloto será recompilado
com os assets versionados da publicação, substituindo o artefato de preparação.
