# Montagem: geração e faces — 12/09/2026

Implementação local na branch `fix/montagem-geracao-faces`, em
`C:\Users\Junior\Projetos Ingresso ideal\imposicao-montagem-geracao-faces`,
baseada no `origin/main` disponível (`0ecbc2df`). O checkout principal foi preservado.

## Resultado

- A geração admite um trabalho por vez. Botão, edição, teclado e arrasto ficam
  bloqueados durante o preparo e a entrega. Zoom/redesenho não reabilitam o envio;
  sucesso ou erro restauram o botão e seu rótulo.
- Células e registros de modelos são copiados no início; destino, opção de abrir
  e faces são capturados antes das esperas. As artes prontas são destacadas do
  catálogo por pedido. CSV é carregado antes dos bancos do pedido, sem nova
  espera entre a confirmação destes bancos e a construção das artes.
- Geração aguarda o fim dos carregamentos iniciados na Montagem. Respostas de
  pedidos que deixaram de estar selecionados não substituem o seletor atual.
- A numeração com `print_mode` explícito (`front`, `duplex`, `duplex_unico`)
  define as faces. Sem esse modo, valem `verso` e a grafia normalizada do ERP.
  Compatibilidade, avisos e geração usam essa mesma resolução na Montagem.
- Modelos com verso são identificados no seletor, no compositor, na lista e na
  faixa de compatibilidade. Não podem ser combinados com modelos sem verso,
  mesmo quando a saída escolhida é Apenas frente.
- `duplex` e `duplex_unico` também exigem montagens separadas: o motor recebe um
  modo de paginação por trabalho. Não se escolhe mais um deles para ambos.
- A compatibilidade é conferida de novo antes do envio e ao preparar cada arte;
  mudanças de face, formato, saída ou material exigem remover/adicionar o modelo.
- O controle **Faces da impressão** oferece Frente e verso, Apenas frente e
  Apenas verso. Modelos sem verso oferecem somente Apenas frente.

## PDF e preservação da impressão

O motor continua recebendo o modo completo do modelo. Depois da imposição,
o `pdf-lib.min.js` já existente seleciona as páginas: índices 0, 2, 4... para
frente e 1, 3, 5... para verso. Não se altera o modo do motor para `front` ao
separar faces; isso mudaria a leitura do PDF de entrada no duplex clássico.

As páginas indesejadas são removidas do próprio documento, preservando
OutputIntent/ICC, recursos, rotação e posicionamento. Para modelos com verso,
o retorno deve ter exatamente duas páginas por folha da montagem; uma resposta
inconsistente é recusada, sem download nem gravação do PDF incorreto.

Os nomes terminam em `_frente-e-verso.pdf`, `_frente.pdf` ou `_verso.pdf`.
Download, pasta da estação e abertura na tela recebem o arquivo já filtrado.
O verso separado conserva o espelhamento calculado para casar com a frente.

Não houve alteração no Python, API, banco, dependências ou agente instalado.

## Arquivos e validação

Fontes: `frontend/montagem.js`, `frontend/index.html`, `frontend/style.css`.
Regressões: `tests/montagem_harness.js`, `tests/montagem_tela_harness.js`,
`tests/test_montagem.py`, `tests/montagem_faces_pdf_harness.js` e
`tests/test_montagem_faces_pdf.py`.

Validação executada com o Python já instalado no checkout principal e os
pacotes Node existentes, acessados por junction local (nenhuma instalação):

```powershell
& '..\ideal-imposition\venv\Scripts\python.exe' -m pytest -n 0 tests/test_montagem.py tests/test_montagem_faces_pdf.py -q
node --check frontend/montagem.js
git diff --check
```

Resultado: **27 testes aprovados**, incluindo 250 verificações do núcleo e
201 do navegador. PDFs sintéticos do motor cobrem duplex e verso único,
uma e duas folhas, posições fora de ordem e repetidas. A separação preservou
texto, tamanho, rotação e imagem renderizada das páginas; o perfil ICC foi
conferido separadamente. Recursos HTTP externos são bloqueados nos testes de tela.

Na primeira montagem do teste de integração, o texto sintético estava perto
demais da borda e era recortado pelo motor; o fixture foi centralizado na célula.
Nenhum código do motor foi alterado para acomodar o teste.

Prévias com dados sintéticos:
[tela](../design/preview-montagem-faces.png) e
[controles e modelos](../design/preview-montagem-faces-lado.png).

## Limites e próximo passo

Entrega local, sem commit, push ou publicação. A publicação deverá versionar
os assets e conferir seu conteúdo público. Instalação na estação, gravação em
pasta real e registro físico entre frente e verso permanecem sem prova nesta
tarefa; não foram acessados dados reais ou serviços da gráfica.

A prévia da folha continua sendo o mapa de células, não um novo renderizador
de arte de verso. As faces podem ser conferidas no PDF final aberto na tela.

Os outros pontos da análise (entrada parcial de posições, distinção de tiragem
zero/desconhecida e tamanho mínimo do número na prévia) não fizeram parte deste
pedido de implementação.

## Complemento: produto e status

Novo pedido do usuário: escolher Produto, listar apenas pedidos que o contenham
e, no seletor Modelo, somente modelos desse produto. A Montagem passa a aceitar
apenas pedidos **Em produção** e modelos **Aguardando**.

- Produto é opcional, com a opção Todos os produtos. O filtro usa
  `_vibe_id_produto`/`id_produto`; quando necessário, resolve o vínculo exato
  `id_produto_proposta_origem` com `_itens_raw`. Não compara nomes aproximados.
- Os nomes vêm de `produtosGlobais.nomeReal`; produtos citados pelos pedidos
  também aparecem se ainda não estiverem no catálogo da sessão.
- O pedido é filtrado por `status_interno`, aceitando a grafia com ou sem acento
  de EM PRODUÇÃO. Status de arte, Em impressão, Em acabamento, finalizados e
  cancelados não abrem essa lista. Foi removido o critério anterior de impressos
  nos últimos 30 dias.
- O modelo segue o normalizador de impressão do painel, na mesma ordem de campos
  de `loadOSItens`: `status_impressao`, `status_producao`, `impressao`.
  Os valores legados que o painel apresenta como Aguardando mantêm essa leitura;
  aprovação da arte não é confundida com status de impressão.
- Pedidos que contêm o produto podem aparecer mesmo quando todos os respectivos
  modelos já estão impressos; nesse caso o segundo seletor informa que não há
  modelos aguardando. Não há carregamento de todos os modelos de todos os pedidos
  para montar a primeira lista: usa-se o índice de produtos já carregado.
- Busca por número, retorno pela linha e inclusão direta respeitam os mesmos
  filtros. Mudar Produto limpa pedido/modelo/posições digitadas e invalida
  respostas antigas, mas preserva as células já montadas.
- A geração revalida status do pedido e modelo. O filtro de produto não invalida
  as células já adicionadas: outros produtos compatíveis podem continuar na
  folha; as regras de formato/material/saída/verso continuam obrigatórias.

Validação após este complemento: **27 testes aprovados**, com 250 verificações
do núcleo e **206 do navegador**. Foram cobertos produto sem pedidos, produto
resolvido pelo vínculo, modelos impressos/em correção, pedido fora da produção,
busca e inclusão que tentam contornar o filtro, mudança durante o carregamento
e revalidação de status antes da geração. Sintaxe e diff também conferidos.

Prévia interativa local com dados simulados:
`http://127.0.0.1:8766/montagem-teste-local.html`.
O teste via HTTP retornou 200, selecionou Triband, mostrou somente os pedidos
compatíveis e o modelo aguardando e adicionou duas células sem erro JavaScript.
Continua sem publicação ou validação com dados reais.


## Publicacao v856

Publicacao autorizada pelo usuario em 12/09/2026. Entrega isolada na branch
`fix/montagem-geracao-faces`, baseada em `origin/main` v855. As referencias de
assets de `index.html` e `producao.html` passam a v856. O script legado de
publicacao inclui Vercel e Edge Functions; esta entrega usa o fluxo Git do
Cloudflare Pages e altera somente o frontend, testes e registro desta tarefa.
A verificacao dos arquivos publicos sera realizada depois do merge.
Nao inclui build ou instalacao do agente, alteracao de banco ou impressao fisica.
