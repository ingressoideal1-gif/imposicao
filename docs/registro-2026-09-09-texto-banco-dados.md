# Texto — Banco de Dados (09/09/2026)

## Resultado local

Novo botão junto de Texto Fixo no editor de numerações. Reutiliza o elemento
`TEXT` e o painel completo de texto variável/CSV, com origem Banco de Dados,
zeros em 0 e nome editável inicialmente vazio. Não cria tabela nem migração.

Configurações mantidas: nome, X/Y, rotação, cor, face, origem, exemplo, coluna
do CSV quando há cabeçalho no editor, largura máxima, reduzir fonte/comprimir
letras/quebrar linhas, alinhamento, conferência de estouro, fonte, tamanho,
zeros, prefixo, sufixo, ordem, bloqueio, duplicação e exclusão. Em numeração
TICKET, também herda o seletor de posição já existente.

Sem CSV no editor, a coluna continua sendo escolhida em Colunas do modelo do
pedido (`el:<id>`). O mapa, a duplicação e a serialização preservam as opções.
O exemplo é usado na visualização sem linha de amostra; uma célula vazia de
uma linha existente permanece vazia.

## Formatação e compatibilidade

O novo elemento guarda `database_text: true`, além de `type: 'TEXT'` e
`source: 'database'`. A marca distingue seu contrato dos elementos antigos,
que não são convertidos. Não há alteração na fórmula sequencial/TICKET.

`formatarTextoDoBanco` em `frontend/texto-ajuste.js` e o ramo correspondente
em `engine.py` aplicam prefixo/sufixo ao texto do banco. Zeros opcionais
(0–10) completam somente valores constituídos de dígitos ASCII, preservando
zeros já existentes, nomes e códigos alfanuméricos. Zero numérico é dado
válido. Null/vazio não recebem prefixo/sufixo nem exemplo na impressão.
Sem linha de banco, o motor mantém a recusa de impressão existente.

O ajuste de largura recebe o texto já formatado. O aviso do novo elemento é
atualizado ao editar, sem reconstruir o campo em foco. Prévias do editor,
pedido, portal, sobreposição do PDF e gabarito usam a mesma formatação.

Foi necessário alterar o motor porque o caminho legado de banco imprime o
valor bruto, mesmo quando certas prévias exibem prefixo/sufixo. Esse problema
legado não foi corrigido em massa; a mudança de comportamento vale para a
marca nova. Elementos FIXED e TEXT antigos conservam seu contrato.

## Arquivos

- `frontend/index.html`, `frontend/script.js`: acesso e painel reutilizado,
  selo do elemento, conferência, exemplos e prévias.
- `frontend/texto-ajuste.js`, `frontend/pedido.js`, `frontend/cliente.js`:
  formatação comum e consumo nas prévias.
- `frontend/cliente.html`: atualização das URLs dos scripts afetados;
  `index.html` recebe a mesma identificação `833-texto-banco-1`.
- `engine.py`: formatação do novo elemento antes de desenhar o PDF.
- `tests/texto_banco_browser_harness.js`, `tests/test_texto_banco.py`:
  navegador isolado e renderização de PDF com dados sintéticos.
- `design/preview-texto-banco-dados-2026-09-09.png`: captura do painel real
  recortado em página sintética, com CSS local e banco fictício.

## Validação

- 18 testes novos aprovados: elemento criado no Chrome e serializado para o
  motor, conteúdo do PDF, zero, vazio, nome, código alfanumérico, preservação
  de zeros, recusa sem linha, três modos de largura × três alinhamentos e
  compatibilidade com elementos antigos.
- O harness também exercita controles, vínculo por elemento, mudança de
  página nas prévias do painel/cliente, gabarito, aviso de largura, bloqueio,
  duplicação e ordem. Toda requisição de rede é bloqueada.
- 29 testes existentes aprovados em `test_engine_ajuste_texto.py`,
  `test_engine_largura_maxima.py` e `test_engine_banco_nunca_vira_sequencial.py`.
- Sintaxe dos quatro JavaScripts alterados e `git diff --check` aprovados.
- Na preparação do harness, a importação de fonte web bloqueada impediu o
  carregamento do CSS. O teste passou a remover apenas essa importação, usando
  estilos locais. Uma asserção de rótulo também foi ajustada para ler o texto
  original, sem a transformação visual em maiúsculas. Não houve mudança no
  CSS da aplicação para resolver essas falhas do ambiente de teste.

## Entrega, limites e recuperação

Somente implementação local. Nenhum banco compartilhado, credencial, envio,
commit, publicação ou build/instalação do agente foi executado. Não foi testado
o salvamento remoto nem a impressão física. O painel completo da aplicação
com sessão real não foi aberto; o teste recorta as funções reais do editor.

Para disponibilizar a função, frontend e motor do agente precisam ser
atualizados juntos: um motor antigo aceita TEXT, mas ignora a marca nova e
imprime o valor bruto. O executável/MSI instalado não foi atualizado.

O checkout já tinha alterações em vários arquivos, inclusive script.js,
index.html, pedido.js e engine.py. Foram preservadas. Uma cópia desses sete
arquivos imediatamente anterior à tarefa está em
`%TEMP%/ideal-texto-banco-649a13cb42274f87b42bc533136d0293`.
Para desfazer, revisar e retirar somente os trechos desta tarefa; não usar
reset/restauração global nem sobrescrever edições posteriores com a cópia.

## Preparação da publicação autorizada

Após a entrega local, o usuário solicitou publicar. Base atualizada:
`origin/main` em `5f090ae0`, no worktree isolado `../imposicao-texto-banco`,
branch `feat/texto-banco-dados`. Somente o diff contra a cópia anterior à
tarefa foi aplicado; as demais alterações da pasta original ficaram lá.

- Assets afetados identificados por `v=845` (substitui a identificação local
  `833-texto-banco-1`). Versão do agente elevada de 1.2.325 para 1.2.326 nos
  três arquivos de versão. Manifesto público anterior confirmado em 1.2.325.
- **112 testes aprovados** na base atualizada: texto novo, largura, proteção
  contra substituição por contador e sintaxe de todos os JS próprios.
- PyInstaller e WiX existentes usados diretamente, pois os scripts amplos
  de build/publicação têm caminhos fixos ou efeitos fora desta entrega.
- MSI `dist/NewProd_Setup_v1.2.326.msi`: **74.588.160 bytes**;
  ProductVersion conferido no próprio MSI: **1.2.326.0**.
- SHA-256: `9868faeaa0e4bf8db529c57bd1d27bcecc0bd97da982ad6bf29071b73d73c995`.
- Código compilado de engine/app/db/security_config/agent_version comparado
  com as fontes do worktree. Seis arquivos do frontend embutido comparados
  byte a byte, DLLs de impressão e presença do módulo restrito conferidos.
- Pool e credencial restrita reutilizados pelo processo existente, sem
  exibir conteúdo ou incluí-los no Git; nenhum `.env` copiado ao worktree.
- Distribuição prevista no bucket existente `agent-releases`: MSI com nome
  novo, download público e hash, depois ativação de `latest.json`.

Não instalar o MSI automaticamente nesta estação durante a publicação.
Publicar o manifesto não comprova a atualização em todas as estações.
Recuperação por código anterior com versão superior a 1.2.326; o atualizador
não executa downgrade ao reapontar o manifesto para 1.2.325.
