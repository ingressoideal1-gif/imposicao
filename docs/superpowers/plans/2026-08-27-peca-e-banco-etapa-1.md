# Plano — separar a peça do banco · Etapa 1: a fundação e a garantia

> **Para quem for executar:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`. Os passos usam `- [ ]` para marcação.
>
> **ESTE PLANO NÃO ESTÁ AUTORIZADO A RODAR.** Em 27/08/2026 o usuário disse:
> *"não executar, temos muitas numerações em andamento que não podem sofrer
> alterações… estamos em fase de estudos e planejamento."* O documento existe para
> ser lido e criticado. A ordem para executar é dele, e ainda não veio.

Estudo que originou: artifact **Peça, banco e modelo** (27/08/2026), com a medição do
catálogo — 171 numerações, 138 exclusivas, 77 que são a mesma peça repetida.

**Objetivo desta etapa:** existir um caminho novo, completo e testado, em que o banco de
dados é um registro do pedido e o modelo diz quais linhas e quais colunas ele usa — sem
que nada mude para ninguém, porque nesta etapa nenhuma tela ainda grava esse vínculo.

**Arquitetura:** a peça (`producao_numeracoes`) para de ser o dono do dado. Um banco
passa a ser um registro próprio com dono no pedido; o modelo guarda a qual banco se liga
e um mapa de colunas. Toda a resolução acontece em **um** ponto do navegador —
`numeracaoDoModelo()` — que devolve uma numeração já resolvida, com a mesma forma que o
resto do código sempre recebeu. Quem não tem banco próprio recebe **o mesmo objeto de
antes, pela mesma referência**.

**Ferramentas:** JavaScript no navegador (`frontend/`), harnesses em node
(`tests/*_harness.js`, rodados com `node tests/<arquivo>.js`), SQL entregue como arquivo
pronto para colar no editor do Supabase.

---

## Restrições globais (valem para todas as tarefas)

1. **Nenhuma escrita nas 171 numerações existentes.** Sem migração, sem backfill, sem
   limpar `csv_data` de ninguém. Se uma tarefa precisar alterar um registro de
   `producao_numeracoes` que já existe, a tarefa está errada.
2. **A bifurcação é por ausência, e é por modelo.** Modelo com banco próprio segue o
   caminho novo; modelo sem, segue o de hoje. Não existe interruptor global nem "modo
   novo" do sistema.
3. **O caminho de hoje não é refatorado de passagem.** Nada de unificar os dois caminhos
   numa função só "mais limpa". O novo entra como desvio adicional; o ramo antigo fica
   literalmente igual, linha por linha.
4. **Nada é gravado na tabela do parceiro.** `pedidos_modelos` é do Vibe. O `csv_selecao`
   mora lá porque aquela exceção foi aberta antes; ela **não** autoriza a próxima. Os
   campos novos vão em tabela nossa (ver Tarefa 1).
5. **Toda regra nova entra nas duas telas no mesmo commit.** `frontend/pedido.js` é um
   clone do `frontend/script.js`. A distribuição de linhas nasceu só num deles e o outro
   passou dois meses imprimindo o banco inteiro (pedido 20495). Ao mexer numa regra de
   impressão, procure a gêmea.
6. **O `engine.py` não muda nesta etapa.** O navegador manda os elementos já resolvidos.
   Se em algum momento o motor precisar mudar, o agente sai publicado junto com o site.
7. **Ao fim de cada tarefa, `node tests/banco_do_pedido_regressao_harness.js` tem de
   passar.** É a rede da Tarefa 0.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Estado |
|---|---|---|
| `tests/banco_do_pedido_regressao_harness.js` | congela o comportamento de hoje | criar |
| `sql/pedidos_bancos.sql` | as duas tabelas novas, aditivas | criar |
| `tests/pedidos_bancos_sql_harness.js` | prova que o SQL não toca em nada existente | criar |
| `frontend/banco-do-modelo.js` | as funções puras da resolução | criar |
| `tests/banco_do_modelo_harness.js` | testes das funções puras | criar |
| `frontend/script.js` | `numeracaoDoModelo` ganha o desvio; payload multi-artes | modificar |
| `frontend/pedido.js` | a gêmea | modificar |
| `frontend/index.html` | carregar o `banco-do-modelo.js` | modificar |

O `banco-do-modelo.js` é arquivo novo de propósito: as funções são puras, cabem num
harness sem navegador, e ficam fora do `script.js`, que já tem mais de 39 mil linhas.
Segue o padrão do `cor-numeracao-do-modelo.js` e do `qr-ideal-colunas.js`.

---

## Contratos compartilhados

**`window.BancoDoModelo`**, exportado por `frontend/banco-do-modelo.js`:

```js
/** O registro de banco a que este modelo se liga, ou null. `bancos` é a lista
 *  do pedido, já baixada. Não faz rede. */
function bancoDoModelo(vinculo, bancos): object|null

/** O nome de coluna que ESTE modelo usa no lugar de `pedida`. Sem mapa, ou
 *  sem entrada para ela, devolve a própria `pedida`. */
function colunaDoModelo(mapa, pedida): string

/** Cópia dos elementos com `csv_column` trocado pelo mapa. Só mexe em
 *  elemento `source === 'database'` com `csv_column` preenchido. */
function elementosDoModelo(elements, mapa): Array

/** A numeração como ESTE modelo a enxerga.
 *  SEM banco e SEM mapa devolve `num` — o MESMO objeto, sem cópia. */
function numeracaoResolvida(num, banco, mapa): object|null
```

**Formato do mapa** (`csv_mapa`), de → para por nome de coluna:

```json
{ "05/09": "06/09" }
```

Ausente e `{}` significam a mesma coisa: a numeração lê as colunas dela.

**Formato do vínculo do modelo** (tabela `pedidos_modelos_banco`):

```json
{ "modelo_id": "…uuid…", "banco_id": "…uuid…", "csv_mapa": { "05/09": "06/09" } }
```

Modelo sem linha nessa tabela é modelo do caminho de hoje.

---

## Tarefa 0 — a rede de proteção

Vem antes de tudo. Enquanto ela não estiver escrita e passando **contra o código atual**,
nenhuma outra tarefa começa: um teste que só é escrito depois da mudança prova que a
mudança faz o que o autor quis, não que ela preservou o que existia.

**Arquivos:**
- Criar: `tests/banco_do_pedido_regressao_harness.js`

**Interfaces:**
- Consome: `frontend/script.js` (funções extraídas do texto-fonte), `frontend/pedido.js`
- Produz: `node tests/banco_do_pedido_regressao_harness.js`, usado como portão nas
  tarefas 2 a 4

- [ ] **Passo 1: escrever o harness**

Segue a técnica já usada em `tests/csv_fatia_do_modelo_harness.js`: recortar as funções
do `script.js` pelo texto e rodá-las num sandbox, sem navegador.

```js
// Congela o comportamento de HOJE dos modelos que não têm banco próprio.
//
// Existe por causa da ordem do usuário em 27/08/2026: as numerações em uso não
// podem sofrer alteração nenhuma quando o caminho novo (banco do pedido) entrar.
// Este harness é o que quebra o build se alguém encostar no ramo antigo.
//
// Roda em node: `node tests/banco_do_pedido_regressao_harness.js`.

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let falhas = 0, total = 0;
function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra ? '\n         ' + JSON.stringify(extra) : ''));
}

global.window = global.window || {};

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

function sandboxDoScript(state, nomes, devolve) {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const fonte = nomes.map(n => extrairFuncao(script, n)).join('\n');
    return new Function('state', 'window', fonte + '\nreturn { ' + devolve + ' };')(state, global.window);
}

/** Uma numeração à moda antiga: o banco mora dentro dela. */
function numeracaoAntiga() {
    return {
        id: 'num-1',
        csv_headers: ['NOME', 'CODIGO'],
        csv_data: [
            { __id: 1, NOME: 'ANA',   CODIGO: 'A01' },
            { __id: 2, NOME: 'BRUNO', CODIGO: 'A02' },
            { __id: 3, NOME: 'CARLA', CODIGO: 'A03' }
        ],
        elements: [
            { id: 'el_1', type: 'TEXT', source: 'database', csv_column: 'NOME' },
            { id: 'el_2', type: 'QR',   source: 'database', csv_column: 'CODIGO' }
        ]
    };
}

// ── 1. A garantia mecânica: mesma referência, sem cópia ──────────────────────

(function modeloAntigoRecebeAMesmaNumeracao() {
    const state = { numeracoes: [] };
    const api = sandboxDoScript(state,
        ['numeracaoIdDoItem', 'numeracaoDoModelo'], 'numeracaoDoModelo');
    const num = numeracaoAntiga();
    state.numeracoes.push(num);

    const item = { id: 'm-1', amostra_num_id: 'num-1' };

    // `===` e não deepEqual: uma cópia com o mesmo conteúdo já seria uma mudança
    // de comportamento — quem guardava a referência para escrever nela (o
    // `garantirCsvDaNumeracao` faz isso) passaria a escrever no lugar errado.
    ok(api.numeracaoDoModelo(item) === num,
        'modelo sem banco proprio recebe a MESMA numeracao, sem copia');
})();

// ── 2. A fatia de linhas não muda ────────────────────────────────────────────

(function fatiaDeHojeContinuaIgual() {
    const state = { numeracoes: [] };
    const api = sandboxDoScript(state,
        ['linhasAtivasCsv', 'numeracaoIdDoItem', 'colunasDoBancoDaNumeracao',
         'linhasComDadoDaNumeracao', 'fatiaCsvDoItem'], 'fatiaCsvDoItem');
    const num = numeracaoAntiga();
    state.numeracoes.push(num);

    const inteiro = api.fatiaCsvDoItem({ id: 'm', amostra_num_id: 'num-1', csv_selecao: null }, num);
    ok(inteiro.length === 3, 'sem distribuicao, o modelo leva o banco inteiro', inteiro.length);
    ok(inteiro.every((r, i) => r.__id === i + 1), 'e na ordem do banco');

    const num2 = numeracaoAntiga();
    num2.csv_data[1].__ativo = false;
    state.numeracoes.length = 0; state.numeracoes.push(num2);
    const semDesmarcada = api.fatiaCsvDoItem({ id: 'm', amostra_num_id: 'num-1', csv_selecao: null }, num2);
    ok(semDesmarcada.length === 2, 'linha desmarcada continua fora', semDesmarcada.length);

    const num3 = numeracaoAntiga();
    num3.csv_data[2].NOME = ''; num3.csv_data[2].CODIGO = '';
    state.numeracoes.length = 0; state.numeracoes.push(num3);
    const semVazia = api.fatiaCsvDoItem({ id: 'm', amostra_num_id: 'num-1', csv_selecao: null }, num3);
    ok(semVazia.length === 2, 'linha sem nada nas colunas lidas continua fora', semVazia.length);
})();

// ── 3. As colunas conferidas saem as mesmas ──────────────────────────────────

(function colunasConferidasNaoMudam() {
    const state = { numeracoes: [] };
    const api = sandboxDoScript(state,
        ['colunasConferidasDaNumeracao'], 'colunasConferidasDaNumeracao');
    const num = numeracaoAntiga();
    const cols = api.colunasConferidasDaNumeracao(num);
    ok(cols.length === 2 && cols[0] === 'NOME' && cols[1] === 'CODIGO',
        'a numeracao antiga confere as duas colunas dela', cols);
})();

// ── 4. As duas telas continuam com a mesma regra ─────────────────────────────

(function aGemeaTemODesvioTambem() {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const pedido = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');
    const marca = 'banco_id';
    ok(script.includes(marca) === pedido.includes(marca),
        'script.js e pedido.js estao na MESMA versao da regra do banco do pedido',
        { script: script.includes(marca), pedido: pedido.includes(marca) });
})();

console.log((falhas ? 'FALHAS: ' + falhas + ' de ' : 'OK: ') + total + ' casos');
process.exit(falhas ? 1 : 0);
```

- [ ] **Passo 2: rodar contra o código ATUAL e ver passar**

```
node tests/banco_do_pedido_regressao_harness.js
```

Esperado: `OK: 7 casos`. Se falhar aqui, o harness está descrevendo errado o que existe
hoje — conserte o harness, nunca o `script.js`.

- [ ] **Passo 3: commit**

```bash
git add tests/banco_do_pedido_regressao_harness.js
git commit -m "test: congelar o comportamento de hoje dos modelos sem banco proprio"
```

---

## Tarefa 1 — as tabelas

**Arquivos:**
- Criar: `sql/pedidos_bancos.sql`
- Criar: `tests/pedidos_bancos_sql_harness.js`

**Interfaces:**
- Produz: as tabelas `pedidos_bancos` e `pedidos_modelos_banco`, consumidas na Tarefa 4

**Por que duas tabelas nossas, e nenhum `ALTER` na do parceiro:** `pedidos_modelos` é
tabela do Vibe. O `csv_selecao` mora lá porque essa exceção foi aberta em 11/08/2026 —
e uma exceção aberta não autoriza a seguinte. Guardando o vínculo em tabela nossa, voltar
atrás é apagar duas tabelas, sem encostar em nada do parceiro.

- [ ] **Passo 1: escrever o SQL**

```sql
-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: o banco de dados passa a ser um registro do PEDIDO
-- Execute no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- Ate aqui o CSV morava dentro da numeracao (producao_numeracoes.csv_data). Como
-- desenho e dado ficavam no mesmo registro, reusar uma peca em outro pedido
-- arrastaria o dado do pedido anterior — e a unica saida era duplicar a
-- numeracao. Em 27/08/2026 havia 171 numeracoes no catalogo, 138 delas nascidas
-- de dentro de um pedido e 77 que sao a mesma peca repetida.
--
-- O QUE MUDA
-- O banco vira um registro proprio, com dono no pedido (id_int). Um pedido pode
-- ter UM banco com varios modelos apontando para ele, ou VARIOS, um por modelo:
-- e a mesma mecanica, muda so quantos registros sao criados.
--
-- NADA E CONVERTIDO
-- Esta migracao e ADITIVA. Nenhuma linha de producao_numeracoes e lida ou
-- escrita aqui. Modelo sem linha em pedidos_modelos_banco continua lendo o CSV
-- de dentro da numeracao, que e o comportamento de todo pedido existente.
--
-- POR QUE NAO ALTERAR pedidos_modelos
-- Ela e do parceiro Vibe. O csv_selecao mora la por uma excecao aberta em
-- 11/08/2026, e uma excecao aberta nao autoriza a proxima. Aqui o vinculo fica
-- em tabela nossa: desfazer e apagar duas tabelas.

CREATE TABLE IF NOT EXISTS pedidos_bancos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_int       INTEGER NOT NULL,           -- o pedido dono, como em pedidos_modelos
    nome         TEXT NOT NULL DEFAULT '',
    csv_filename TEXT NOT NULL DEFAULT '',
    csv_headers  JSONB NOT NULL DEFAULT '[]',
    csv_data     JSONB,
    csv_url      TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_bancos_id_int ON pedidos_bancos (id_int);

-- Um modelo tem no maximo um banco: a chave primaria e o proprio modelo.
CREATE TABLE IF NOT EXISTS pedidos_modelos_banco (
    modelo_id  UUID PRIMARY KEY,             -- pedidos_modelos.id
    banco_id   UUID NOT NULL REFERENCES pedidos_bancos (id) ON DELETE CASCADE,
    csv_mapa   JSONB,                        -- { "coluna da peca": "coluna deste banco" }
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_modelos_banco_banco ON pedidos_modelos_banco (banco_id);
```

Note o `ON DELETE CASCADE`: apagar um banco desliga os modelos que o usavam, e eles caem
no caminho de hoje em vez de apontar para o vazio.

- [ ] **Passo 2: escrever o teste que prova que o SQL é inofensivo**

```js
// O SQL do banco do pedido nao pode encostar em nada que ja existe.
// Roda em node: `node tests/pedidos_bancos_sql_harness.js`.

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let falhas = 0, total = 0;
function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra ? '\n         ' + JSON.stringify(extra) : ''));
}

const sql = fs.readFileSync(path.join(RAIZ, 'sql', 'pedidos_bancos.sql'), 'utf8');
const codigo = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').toUpperCase();

ok(!/\bUPDATE\s+PRODUCAO_NUMERACOES\b/.test(codigo),
    'o SQL nao atualiza nenhuma numeracao existente');
ok(!/\bINSERT\s+INTO\s+PRODUCAO_NUMERACOES\b/.test(codigo),
    'o SQL nao insere em producao_numeracoes');
ok(!/\bDELETE\s+FROM\b/.test(codigo), 'o SQL nao apaga nada');
ok(!/\bDROP\b/.test(codigo), 'o SQL nao derruba nada');
ok(!/\bALTER\s+TABLE\s+PEDIDOS_MODELOS\b/.test(codigo),
    'o SQL nao mexe na tabela do parceiro');
ok(/CREATE TABLE IF NOT EXISTS PEDIDOS_BANCOS/.test(codigo), 'cria pedidos_bancos');
ok(/CREATE TABLE IF NOT EXISTS PEDIDOS_MODELOS_BANCO/.test(codigo), 'cria pedidos_modelos_banco');

console.log((falhas ? 'FALHAS: ' + falhas + ' de ' : 'OK: ') + total + ' casos');
process.exit(falhas ? 1 : 0);
```

- [ ] **Passo 3: rodar**

```
node tests/pedidos_bancos_sql_harness.js
```

Esperado: `OK: 7 casos`.

- [ ] **Passo 4: NÃO aplicar no Supabase**

O arquivo fica pronto para colar. Aplicar é ato do usuário, e nesta etapa nem é preciso:
as tarefas seguintes não leem o banco de verdade — os harnesses trabalham com dados de
mentira, e a leitura real só entra na Tarefa 4.

- [ ] **Passo 5: commit**

```bash
git add sql/pedidos_bancos.sql tests/pedidos_bancos_sql_harness.js
git commit -m "sql: tabelas do banco de dados por pedido (aditivas, nao aplicadas)"
```

---

## Tarefa 2 — as funções puras da resolução

**Arquivos:**
- Criar: `frontend/banco-do-modelo.js`
- Criar: `tests/banco_do_modelo_harness.js`
- Modificar: `frontend/index.html` (uma linha de `<script>`)

**Interfaces:**
- Produz: `window.BancoDoModelo` com as quatro funções do contrato, consumido na Tarefa 3

- [ ] **Passo 1: escrever o teste que falha**

```js
// As funcoes puras da resolucao do banco por modelo.
// Roda em node: `node tests/banco_do_modelo_harness.js`.

const path = require('path');
const RAIZ = path.join(__dirname, '..');

let falhas = 0, total = 0;
function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra ? '\n         ' + JSON.stringify(extra) : ''));
}

global.window = global.window || {};
require(path.join(RAIZ, 'frontend', 'banco-do-modelo.js'));
const B = global.window.BancoDoModelo;

const PECA = {
    id: 'num-1',
    csv_headers: ['NOME', 'CODIGO'],
    csv_data: [{ __id: 1, NOME: 'ANA', CODIGO: 'A01' }],
    elements: [
        { id: 'el_1', type: 'TEXT', source: 'database', csv_column: 'NOME' },
        { id: 'el_2', type: 'QR',   source: 'database', csv_column: 'CODIGO' },
        { id: 'el_3', type: 'QR',   source: 'database', csv_column: 'CODIGO' },
        { id: 'el_4', type: 'FIXED', fixed_value: 'CREDENCIAL' }
    ]
};

const BANCO = {
    id: 'b-1', id_int: 21202, nome: 'BACKSTAGE',
    csv_headers: ['NOME', '05/09', '06/09'],
    csv_data: [
        { __id: 1, NOME: 'ANA',   '05/09': 'A5C01', '06/09': 'B6C01' },
        { __id: 2, NOME: 'BRUNO', '05/09': 'A5C02', '06/09': 'B6C02' }
    ]
};

(function semBancoESemMapaDevolveOMesmoObjeto() {
    ok(B.numeracaoResolvida(PECA, null, null) === PECA,
        'sem banco e sem mapa, devolve a MESMA peca — sem copia');
    ok(B.numeracaoResolvida(PECA, null, {}) === PECA,
        'mapa vazio conta como ausente');
    ok(B.numeracaoResolvida(null, BANCO, null) === null,
        'sem peca nao inventa peca');
})();

(function oBancoSubstituiOCsvDaPeca() {
    const r = B.numeracaoResolvida(PECA, BANCO, null);
    ok(r !== PECA, 'com banco, a peca original nao e tocada');
    ok(PECA.csv_data.length === 1, 'e continua com o csv dela', PECA.csv_data.length);
    ok(r.csv_data.length === 2, 'a resolvida usa as linhas do banco', r.csv_data.length);
    ok(r.csv_headers.join(',') === 'NOME,05/09,06/09',
        'e o cabecalho do banco', r.csv_headers);
    ok(r.id === 'num-1', 'o resto da peca vem junto');
})();

(function oMapaTrocaTodosOsCamposDaMesmaColuna() {
    const r = B.numeracaoResolvida(PECA, BANCO, { 'CODIGO': '06/09' });
    const cols = r.elements.map(e => e.csv_column || null);
    ok(cols[0] === 'NOME', 'coluna sem entrada no mapa fica como esta');
    ok(cols[1] === '06/09' && cols[2] === '06/09',
        'os DOIS campos que liam CODIGO trocam juntos', cols);
    ok(r.elements[3].csv_column === undefined, 'campo fixo nao e tocado');

    ok(PECA.elements[1].csv_column === 'CODIGO',
        'a peca do catalogo nao foi alterada — a troca e so na copia');
})();

(function colunaDoModelo() {
    ok(B.colunaDoModelo(null, 'CODIGO') === 'CODIGO', 'sem mapa, a coluna e a pedida');
    ok(B.colunaDoModelo({ 'CODIGO': '11/09' }, 'CODIGO') === '11/09', 'com mapa, e a mapeada');
    ok(B.colunaDoModelo({ 'CODIGO': '' }, 'CODIGO') === 'CODIGO',
        'entrada vazia nao apaga a coluna — vale a pedida');
})();

(function bancoDoModelo() {
    const bancos = [BANCO, { id: 'b-2', nome: 'OUTRO' }];
    ok(B.bancoDoModelo({ banco_id: 'b-1' }, bancos) === BANCO, 'acha pelo id');
    ok(B.bancoDoModelo({ banco_id: 'b-9' }, bancos) === null,
        'vinculo apontando para banco que nao veio devolve null, nao o primeiro da lista');
    ok(B.bancoDoModelo(null, bancos) === null, 'sem vinculo, sem banco');
})();

console.log((falhas ? 'FALHAS: ' + falhas + ' de ' : 'OK: ') + total + ' casos');
process.exit(falhas ? 1 : 0);
```

- [ ] **Passo 2: rodar e ver falhar**

```
node tests/banco_do_modelo_harness.js
```

Esperado: erro de módulo não encontrado (`banco-do-modelo.js`).

- [ ] **Passo 3: escrever a implementação mínima**

```js
/**
 * De onde ESTE modelo tira o dado que vai para o papel.
 * ---------------------------------------------------------------------------
 *
 * Ate 27/08/2026 o CSV morava dentro da numeracao. Desenho e dado no mesmo
 * registro: reusar a peca em outro pedido arrastaria o dado do anterior, e a
 * saida era duplicar — 138 das 171 numeracoes do catalogo nasceram assim.
 *
 * Aqui o banco e um registro do pedido, e o modelo diz a qual deles se liga e
 * qual coluna do banco alimenta cada campo da peca.
 *
 * ── A regra que protege o que ja esta rodando ──────────────────────────────
 *
 * `numeracaoResolvida` sem banco e sem mapa devolve a PROPRIA peca, pela mesma
 * referencia. Nao e economia: o `garantirCsvDaNumeracao` guarda a referencia da
 * numeracao para escrever o `csv_data` nela quando o banco desce. Devolver uma
 * copia faria essa escrita cair num objeto que ninguem mais le, e o trabalho
 * sairia impresso com numero sequencial no lugar do nome da pessoa.
 */
(function (escopo) {
    'use strict';

    function _vazio(mapa) {
        return !mapa || typeof mapa !== 'object' || Object.keys(mapa).length === 0;
    }

    function bancoDoModelo(vinculo, bancos) {
        var id = vinculo && vinculo.banco_id;
        if (!id) return null;
        var achado = (bancos || []).find(function (b) {
            return b && String(b.id) === String(id);
        });
        return achado || null;
    }

    function colunaDoModelo(mapa, pedida) {
        if (_vazio(mapa)) return pedida;
        var destino = mapa[pedida];
        if (destino === null || destino === undefined) return pedida;
        destino = String(destino).trim();
        return destino === '' ? pedida : destino;
    }

    function elementosDoModelo(elements, mapa) {
        var lista = elements || [];
        if (_vazio(mapa)) return lista;
        return lista.map(function (el) {
            if (!el || el.source !== 'database') return el;
            var col = String(el.csv_column || '').trim();
            if (!col) return el;
            var novo = colunaDoModelo(mapa, col);
            if (novo === col) return el;
            return Object.assign({}, el, { csv_column: novo });
        });
    }

    function numeracaoResolvida(num, banco, mapa) {
        if (!num) return num;
        if (!banco && _vazio(mapa)) return num;   // o caminho de hoje, intacto
        var saida = Object.assign({}, num);
        if (banco) {
            saida.csv_data = banco.csv_data;
            saida.csv_headers = banco.csv_headers || [];
            saida.csv_filename = banco.csv_filename || '';
            saida.csv_url = banco.csv_url || '';
        }
        saida.elements = elementosDoModelo(num.elements, mapa);
        return saida;
    }

    escopo.BancoDoModelo = {
        bancoDoModelo: bancoDoModelo,
        colunaDoModelo: colunaDoModelo,
        elementosDoModelo: elementosDoModelo,
        numeracaoResolvida: numeracaoResolvida
    };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Passo 4: rodar e ver passar**

```
node tests/banco_do_modelo_harness.js
```

Esperado: `OK: 18 casos`.

- [ ] **Passo 5: carregar o arquivo na página**

Em `frontend/index.html`, junto dos outros módulos do mesmo tipo (`cor-numeracao-do-modelo.js`,
`qr-ideal-colunas.js`), **antes** do `script.js`:

```html
<script src="banco-do-modelo.js"></script>
```

- [ ] **Passo 6: a rede continua verde**

```
node tests/banco_do_pedido_regressao_harness.js
```

Esperado: `OK: 7 casos`. Esta tarefa não tocou no `script.js`, então tem de continuar igual.

- [ ] **Passo 7: commit**

```bash
git add frontend/banco-do-modelo.js tests/banco_do_modelo_harness.js frontend/index.html
git commit -m "feat: funcoes puras da resolucao do banco por modelo"
```

---

## Tarefa 3 — ligar no ponto de leitura

É a tarefa delicada. Toda a mudança de comportamento do painel cabe em dois desvios.

**Arquivos:**
- Modificar: `frontend/script.js` — `numeracaoDoModelo()` (linha ~16388) e o payload
  `multi_artes` (linha ~11955)
- Modificar: `frontend/pedido.js` — as gêmeas
- Modificar: `tests/banco_do_pedido_regressao_harness.js` (só o caso 4, que passa a exigir
  a marca nos dois arquivos)

**Interfaces:**
- Consome: `window.BancoDoModelo` (Tarefa 2)
- Produz: `numeracaoDoModelo(item)` devolvendo a numeração já resolvida; `state.bancosDoPedido`
  como lista lida na Tarefa 4

- [ ] **Passo 1: o desvio no `numeracaoDoModelo`**

O corpo de hoje fica inteiro; entra só o bloco final.

```js
function numeracaoDoModelo(item) {
    const nid = numeracaoIdDoItem(item);
    if (!nid) return null;
    const num = (state.numeracoes || []).find(n => String(n.id) === String(nid)) || null;

    // ── O desvio do banco do pedido (27/08/2026) ────────────────────────────
    // Modelo sem vinculo sai por aqui com a MESMA numeracao de sempre. Tudo o
    // que existia antes desta data cai neste return e nao enxerga o caminho
    // novo. Ver frontend/banco-do-modelo.js.
    const vinculo = vinculoDeBancoDoModelo(item);
    if (!num || !vinculo || !window.BancoDoModelo) return num;

    return window.BancoDoModelo.numeracaoResolvida(
        num,
        window.BancoDoModelo.bancoDoModelo(vinculo, state.bancosDoPedido || []),
        vinculo.csv_mapa
    );
}
```

E a função que lê o vínculo, ao lado dela:

```js
/**
 * O vinculo deste modelo com um banco do pedido, ou null.
 *
 * Mora em `pedidos_modelos_banco`, tabela nossa — e NAO em `pedidos_modelos`,
 * que e do parceiro. `state.vinculosDeBanco` e preenchido pelo
 * `carregarBancosDoPedido`; enquanto ele nao rodou, todo modelo e do caminho
 * antigo, que e o padrao seguro.
 */
function vinculoDeBancoDoModelo(item) {
    if (!item || !item.id) return null;
    const mapa = state.vinculosDeBanco || {};
    return mapa[String(item.id)] || null;
}
window.vinculoDeBancoDoModelo = vinculoDeBancoDoModelo;
```

- [ ] **Passo 2: o desvio no payload da imposição**

Em `script.js` (~linha 11955), o payload `multi_artes` busca a numeração direto em
`state.numeracoes` — não passa pelo `numeracaoDoModelo`. Trocar a busca:

```js
// Antes:
//   let numArte = state.numeracoes.find(n => String(n.id) === String(arte.num1_id)) || null;
// Depois: o modelo desta arte manda, porque e ele que sabe qual banco e quais
// colunas. Sem `_itemId` (arte montada a mao na Lista de Imposicao) nao ha
// modelo, e a busca antiga continua valendo.
const itArte = arte._itemId
    ? (state.osItens[arte._osId] || []).find(i => String(i.id) === String(arte._itemId))
    : null;
let numArte = itArte
    ? numeracaoDoModelo(itArte)
    : (state.numeracoes.find(n => String(n.id) === String(arte.num1_id)) || null);
```

O bloco seguinte, que aplica a fatia (`numArte.csv_data = fatiaCsvDoItem(itArte, numArte)`),
continua exatamente como está: ele já trabalha sobre uma cópia própria.

- [ ] **Passo 3: espelhar no `pedido.js`**

As mesmas duas mudanças, com os nomes locais daquele arquivo. Procure `numeracaoDoModelo`
e a montagem de `payloadMultiArtes` — em `pedido.js` a função de imposição chama-se
`runPedImposition`.

- [ ] **Passo 4: a rede tem de continuar verde**

```
node tests/banco_do_pedido_regressao_harness.js
node tests/csv_fatia_do_modelo_harness.js
node tests/modelos_somados_harness.js
node tests/csv_sob_demanda_harness.js
```

Esperado: todos `OK`. O caso 1 do primeiro harness — a comparação por `===` — é o que
prova que os modelos de hoje continuam recebendo o objeto original.

- [ ] **Passo 5: commit**

```bash
git add frontend/script.js frontend/pedido.js tests/banco_do_pedido_regressao_harness.js
git commit -m "feat: numeracaoDoModelo resolve o banco do pedido quando ha vinculo"
```

---

## Tarefa 4 — trazer os bancos do pedido

**Arquivos:**
- Modificar: `frontend/script.js` — `carregarBancosDoPedido()` (linha ~1012),
  `numeracoesSemBancoBaixado()` (linha ~989), `garantirCsvDoTrabalho()` (linha ~1041)
- Modificar: `frontend/pedido.js` — as gêmeas
- Modificar: `tests/banco_do_modelo_harness.js` (casos novos da trava)

**Interfaces:**
- Consome: as tabelas da Tarefa 1, `window.BancoDoModelo` (Tarefa 2)
- Produz: `state.bancosDoPedido` (lista) e `state.vinculosDeBanco` (mapa por
  `pedidos_modelos.id`), lidos na Tarefa 3

- [ ] **Passo 1: a leitura, ao lado da que já existe**

```js
/**
 * Os bancos de dados do pedido e o vinculo de cada modelo com eles.
 *
 * Duas consultas pequenas, uma por tabela. Sao poucas linhas de metadado — o
 * csv_data vem junto porque e ele que o desenho precisa, e e a mesma ordem de
 * grandeza do que o `garantirCsvDaNumeracao` ja baixa hoje.
 *
 * Pedido sem nenhum banco proprio devolve as duas estruturas vazias, e todo
 * modelo dele segue pelo caminho de hoje.
 */
async function carregarBancosDoPedidoNovo(osId, idInt) {
    state.bancosDoPedido = state.bancosDoPedido || [];
    state.vinculosDeBanco = state.vinculosDeBanco || {};
    if (!supabaseClient || !idInt) return 0;

    const { data: bancos, error: e1 } = await supabaseClient
        .from('pedidos_bancos').select('*').eq('id_int', idInt);
    if (e1) throw e1;
    state.bancosDoPedido = bancos || [];
    if (!state.bancosDoPedido.length) return 0;

    const ids = state.bancosDoPedido.map(b => b.id);
    const { data: vinculos, error: e2 } = await supabaseClient
        .from('pedidos_modelos_banco').select('*').in('banco_id', ids);
    if (e2) throw e2;
    const mapa = {};
    (vinculos || []).forEach(v => { if (v && v.modelo_id) mapa[String(v.modelo_id)] = v; });
    state.vinculosDeBanco = mapa;
    return state.bancosDoPedido.length;
}
window.carregarBancosDoPedidoNovo = carregarBancosDoPedidoNovo;
```

Não existe hoje um `idIntDoPedido`. O número da OS vem dos próprios modelos: o
`loadOSItens` grava `id_int` em cada item (`script.js:8363`). Uma linha ao lado:

```js
/** O numero da OS (pedidos_modelos.id_int), tirado dos modelos ja carregados. */
function idIntDoPedido(osId) {
    const itens = (state.osItens && state.osItens[osId]) || [];
    const com = itens.find(it => it && it.id_int);
    return com ? com.id_int : null;
}
window.idIntDoPedido = idIntDoPedido;
```

Chamar o carregamento de dentro do `carregarBancosDoPedido` existente, **antes** do laço
de hoje, sem alterar o laço:

```js
async function carregarBancosDoPedido(osId, aoChegar) {
    // Os bancos proprios do pedido primeiro: eles decidem quais numeracoes
    // ainda precisam do CSV de dentro delas.
    try { await carregarBancosDoPedidoNovo(osId, idIntDoPedido(osId)); } catch (e) { /* segue */ }

    const faltando = numeracoesSemBancoBaixado(osId);
    // … o resto exatamente como está …
}
```

- [ ] **Passo 2: a trava do trabalho vale para o banco do pedido também**

`garantirCsvDoTrabalho` existe porque o motor decide entre banco e numeração sequencial
pelo tamanho de `rows`: uma numeração cujo CSV não desceu chega com zero linhas e sai com
número impresso no lugar do nome, sem erro em tela nenhuma. A mesma armadilha existe no
caminho novo — modelo com vínculo cujo banco não desceu.

```js
/** Modelo com vinculo de banco que nao chegou. Lista vazia = pode imprimir. */
function modelosComBancoNaoBaixado(osId) {
    const itens = (state.osItens && state.osItens[osId]) || [];
    return itens.filter(it => {
        const v = vinculoDeBancoDoModelo(it);
        if (!v) return false;
        return !window.BancoDoModelo.bancoDoModelo(v, state.bancosDoPedido || []);
    });
}
window.modelosComBancoNaoBaixado = modelosComBancoNaoBaixado;
```

A imposição chama isso antes de montar o payload e recusa com recado próprio, na mesma
posição em que já usa `garantirCsvDoTrabalho`. O recado tem de dizer o que fazer — abrir o
pedido de novo — e não só que algo está faltando.

- [ ] **Passo 3: casos novos no harness**

```js
(function travaDoBancoQueNaoDesceu() {
    // Vinculo apontando para banco ausente NAO pode virar "sem banco": isso
    // devolveria a peca com o csv_data do catalogo e imprimiria o dado errado.
    ok(B.bancoDoModelo({ banco_id: 'b-9' }, [BANCO]) === null,
        'banco ausente devolve null, para a trava poder ver');
    ok(B.numeracaoResolvida(PECA, null, { 'CODIGO': '06/09' }).csv_data === PECA.csv_data,
        'sem banco, o csv continua sendo o da peca — quem barra e a trava, nao esta funcao');
})();
```

- [ ] **Passo 4: rodar tudo**

```
node tests/banco_do_modelo_harness.js
node tests/banco_do_pedido_regressao_harness.js
node tests/csv_sob_demanda_harness.js
node tests/banco_de_amostra_harness.js
```

- [ ] **Passo 5: commit**

```bash
git add frontend/script.js frontend/pedido.js tests/banco_do_modelo_harness.js
git commit -m "feat: carregar os bancos do pedido e travar o trabalho sem banco"
```

---

## Como conferir que a Etapa 1 não mudou nada

Ao fim das cinco tarefas, o caminho novo existe inteiro e **não pode ser alcançado**:
nenhuma tela grava em `pedidos_modelos_banco`, então `state.vinculosDeBanco` é sempre
vazio e todo modelo cai no `return num` da Tarefa 3. Isso é verificável, e não é questão
de confiança:

- [ ] `node tests/banco_do_pedido_regressao_harness.js` — o caso `===` prova a identidade
- [ ] `grep -rn "pedidos_modelos_banco" frontend/` deve achar **só leitura** — nenhum
      `insert`, `update` ou `upsert`
- [ ] Abrir um pedido real com numeração antiga e conferir que os cards mostram a mesma
      contagem de células de antes (a skill `rodar-app` sobe o app e dirige o navegador)
- [ ] `.\ferramentas\conferir.ps1` verde antes de qualquer publicação

O SQL da Tarefa 1 pode ficar sem aplicar até a Etapa 2: sem as tabelas, as consultas da
Tarefa 4 falham, o `try` engole, e o pedido segue pelo caminho de hoje. É o comportamento
correto — mas confirme isso no navegador em vez de confiar no `try`.

---

## O que fica para a Etapa 2 (plano à parte, ainda não escrito)

Nada aqui é visível ao operador. A etapa seguinte é que traz as telas, e cada item abaixo
depende de uma decisão que ainda não foi tomada:

- **Subir o CSV pelo pedido**, gravando em `pedidos_bancos` — hoje o upload vive no editor
  de numeração, dentro do catálogo.
- **O botão 🔤 Colunas** no card do modelo, gravando `csv_mapa`.
- **A conferência do par linha + coluna.** Com quatro modelos legitimamente nas mesmas
  linhas, `celulasRepetidasDoPedido` passa a acusar dia legítimo como ingresso duplicado.
  Precisa comparar o par, ou vira um aviso que todo mundo aprende a ignorar.
- **A trava da peça compartilhada.** É o risco que o recurso novo cria e a preservação não
  cobre: hoje cada pedido tem a sua cópia, então editar uma numeração nunca atravessa para
  outro trabalho. Peça reutilizável muda isso. As duas saídas estudadas — avisar e travar,
  ou versionar a peça — estão no artifact, e a escolha é do usuário.
- **A limpeza do catálogo.** Fora de escopo por decisão dele: as numerações antigas são
  preservadas obrigatoriamente enquanto estiverem em uso.
