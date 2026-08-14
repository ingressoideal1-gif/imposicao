# Catálogo de Fontes — upload em lote, sem digitação, com busca e amostra

**Data:** 14/08/2026
**Aprovado pelo usuário:** sim ("executar")

## O problema

A tela Configurações > Fontes tem cinco defeitos acumulados:

1. **O botão Excluir nunca funcionou**: o frontend chama `DELETE /api/fontes?id=X`,
   mas a rota do backend é `DELETE /api/fontes/{fonte_id}`. O FastAPI responde 405
   e a tela mostra "Erro ao excluir fonte" sempre.
2. **Cadastrar exige digitar** "Nome da Fonte" e "Família CSS" à mão, um arquivo
   por vez. Digitação manual produz o desvio nome ≠ família — e o font picker grava
   `f.nome` no elemento enquanto o `@font-face` declara `f.font_family`, então o
   desvio faz a tela desenhar com fonte genérica em máquina que não tem a fonte
   instalada.
3. A lista não tem **ordem** definida (sai na ordem do JSON).
4. A lista não tem **busca**.
5. A linha da tabela mostra o nome pequeno, sem **amostra** legível da fonte.

## A decisão

Tudo se resolve no frontend. **Nenhuma mudança em `app.py`, `engine.py`, `db.py`
nem `fonte-canvas.js`** — o caminho da impressão (embutir `_font_data` via catálogo)
e o desenho nas três telas ficam intocados. Entradas existentes do catálogo não são
alteradas.

### 1. Excluir

`deletarFonteWeb` passa a chamar `DELETE ${apiBase}/api/fontes/${encodeURIComponent(id)}`.
O binário no Storage não é apagado (barato, reversível, e apagar poderia quebrar
arte antiga que aponte para a URL).

### 2. Upload em lote, nome de dentro do arquivo

- O formulário perde os campos de texto Nome/Família. Fica: seletor de arquivos
  **múltiplo** (`.ttf,.otf,.woff,.woff2`), Categoria opcional (padrão "Geral"),
  botão de upload.
- Módulo novo `frontend/fonte-nome.js`, no padrão do `fonte-canvas.js` (IIFE sem
  dependências, `module.exports` para rodar em Node nos testes). Exporta:
  - `nomeDaFonte(arrayBuffer, nomeDoArquivo)` → string. Lê a tabela `name` do
    sfnt (TTF/OTF/TTC): família tipográfica (nameID 16) ou família (nameID 1),
    mais o subfamília (17/2) quando não for Regular/Normal — "Gotham Book",
    "Arial Bold". Prefere entradas Windows/Unicode (platform 3, UTF-16BE), cai
    para Macintosh Roman (platform 1). WOFF: descabeçalha e descomprime a tabela
    `name` com `DecompressionStream('deflate')` quando comprimida. WOFF2 ou
    qualquer falha de leitura: cai para `nomeDoArquivoLimpo`.
  - `nomeDoArquivoLimpo(nomeDoArquivo)` → "gotham_book-2.ttf" → "Gotham Book 2".
  - `chaveDeDuplicata(nome)` → minúsculas, sem acento, espaços colapsados —
    a chave de comparação de duplicatas.
- `nome` e `font_family` da entrada nova recebem **a mesma string** extraída.
  Isso elimina, para fontes novas, o desvio nome ≠ família do item 2.
- **Duplicata é pulada, não substituída**: `chaveDeDuplicata` do candidato é
  comparada contra `nome` E `font_family` de todo o catálogo e contra os nomes já
  aceitos no próprio lote. Substituir trocaria em silêncio o binário de uma fonte
  já usada em artes aprovadas — por isso pular.
- Erro em um arquivo não derruba o lote. Ao final, resultado por extenso na tela
  (não só no console): "7 cadastradas · 2 já existiam (Arial Bold, Lobster) ·
  1 falhou (x.woff2: motivo)".
- O caminho no Storage continua `chat-ideal/fontes/<timestamp>_<nomeSeguro>` e o
  payload do `POST /api/fontes` continua com as mesmas chaves
  (`nome`, `font_family`, `categoria`, `arquivo_url`, `ativo`).

### 3. Ordem alfabética

Uma ordenação só, em `loadCatalogoFontes`, logo após receber o JSON:
`localeCompare('pt-BR', {sensitivity:'base'})` por `nome`. Tabela, font picker e o
`<select>` do Criar Arte leem todos de `state_fonts.catalogo`, então herdam a ordem.

### 4. Busca

Campo "🔍 Buscar fonte..." acima da tabela; filtra por nome, família e categoria a
cada tecla (mesma semântica do filtro que o font picker já tem).

### 5. Amostra

Cada linha mostra o nome na própria fonte e uma amostra maior
("AaBbCc 0123456789", ~22px) desenhada com `font-family: '<font_family>'`. As
regras `@font-face` já foram injetadas pelo `definirCatalogoFontes` antes do
render, então a amostra usa a fonte verdadeira (baixa sob demanda, `font-display:
swap`).

## Por que a impressão não é afetada

- `_embed_system_fonts` (app.py) casa o elemento contra o catálogo por
  `nome.lower()` e `font_family.lower()`. Entradas novas têm os dois iguais —
  casam com folga. Entradas antigas não mudam.
- Ordenar e filtrar são apresentação; o backend continua devolvendo e recebendo o
  mesmo formato.
- O valor gravado nos elementos pelo picker (`f.nome`) não muda de semântica.

## Testes

- `tests/fonte_nome_harness.js` + `tests/FonteNome.Tests.ps1` (padrão
  FonteCanvas): binário sfnt mínimo construído no próprio harness com a tabela
  `name`; casos — TTF com nameID 16/17, TTF só com 1/2, subfamília Regular
  omitida, fallback de nome de arquivo, `chaveDeDuplicata` (caixa, acento,
  espaço).
- Guarda em Pester contra a volta do 405: o `script.js` tem de chamar o DELETE
  com o id no caminho (`/api/fontes/${...}`), nunca `?id=`.
- Guardas de tela: `index.html` sem os inputs `fonte-name`/`fonte-family`, com
  `multiple` no input de arquivo e com o campo de busca.

## Publicação

Mudança de frontend → na próxima publicação o site e o agente saem **juntos**
(regra permanente do projeto), com versão nova do agente.
