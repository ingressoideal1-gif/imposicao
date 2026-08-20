# Portal do Pedido — plano de implementação

> **Para quem executa:** usar `superpowers:executing-plans` (execução nesta sessão)
> ou `superpowers:subagent-driven-development`. Os passos usam `- [ ]` para
> marcação.

**Objetivo:** transformar a página do link do cliente, hoje um funil de aprovação
de arte, no Portal do Pedido — cinco seções sempre abertas (Arte, Entrega,
Faturamento, Orçamento, Pagamento), desenhado para celular, sem perder nada do
que já funciona na aprovação.

**Arquitetura:** uma função `SECURITY DEFINER` no banco entrega, num JSON só, tudo
o que as cinco abas precisam, exigindo o par número+token — no mesmo padrão da
`link_cliente_abrir` que já valida o link. O `cliente.js` (3.489 linhas) se divide
por responsabilidade; o motor de desenho da arte é **movido sem alteração**. A
navegação é uma barra de abas no rodapé, e a troca de aba não refaz consulta.

**Tecnologias:** JavaScript sem framework (o projeto inteiro é assim), Supabase
(PostgREST + funções plpgsql), CSS com as variáveis já existentes em
`frontend/style.css`, testes em pytest + harnesses em node.

**Spec:** `docs/superpowers/specs/2026-08-20-portal-do-pedido-design.md`

## Restrições globais

- **Celular primeiro.** Toda decisão de layout se avalia numa tela de 360px de
  largura. Alvo de toque ≥ 44px. `font-size: 16px` em `input`/`textarea`/`select`
  (menor que isso, o iOS dá zoom ao focar). Nenhuma rolagem horizontal na página.
  Folga no topo e no rodapé com `env(safe-area-inset-*)`.
- **Nada regride na aprovação de arte.** O código que compõe a peça
  (`drawAmostraFace`, `renderItemAmostraCombinada`, o viewer de PDF com a fila
  `pdfRenderQueue`, o lightbox, o seletor de página do CSV) é movido de arquivo
  **sem uma linha alterada**. Refatoração de oportunidade ali é proibida.
- **Nenhuma escrita nova em tabela do parceiro.** A página continua escrevendo só
  em `pedidos_artes` (jsonb `observacoes` e `entrega_dados`), em
  `pedidos_modelos`/`produtos_proposta` pelo caminho que já existe, e o status pela
  função `link_cliente_status`.
- **`qtd`, valor e preço são de leitura.** Nada da aba Orçamento volta ao banco.
- **Texto vindo do banco é escapado** antes de virar HTML. Só o negrito do
  WhatsApp (`*assim*`) é interpretado, e por substituição controlada.
- **O arquivo SQL sai completo e pronto para colar** no editor do Supabase, e roda
  por `.\ferramentas\rodar_sql.ps1 sql\<arquivo>.sql`.
- **Versão:** ao terminar, subir a query string dos scripts em `cliente.html` para
  `v656` e registrar no `CHANGELOG.md`. Publicar é ato do usuário, e o agente sai
  na mesma leva.
- **Ciclo de teste curto:** durante o trabalho, rodar só o teste da tarefa
  (`node tests/<harness>.js` ou `pytest tests/<arquivo>.py -q`). A suíte inteira
  fica para antes de publicar.

---

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `sql/link_cliente_pedido.sql` | **novo** — a função que entrega o JSON do pedido pelo par número+token |
| `frontend/cliente.html` | **muda** — cabeçalho, as cinco `<section>`, a barra de abas, a ordem dos scripts |
| `frontend/cliente.js` | **encolhe** — fica só com a rota, o `clienteState` e o arranque |
| `frontend/cliente-dados.js` | **novo** — a chamada da RPC e o mapeamento para o formato da tela |
| `frontend/cliente-shell.js` | **novo** — cabeçalho, selo de status, barra de abas, troca de seção |
| `frontend/cliente-arte.js` | **novo** — a aprovação inteira, movida sem alteração |
| `frontend/cliente-entrega.js` | **novo** — endereço, envio, prazo, rastreio, confirmar/alterar |
| `frontend/cliente-faturamento.js` | **novo** — dados de nota fiscal, confirmar/alterar |
| `frontend/cliente-orcamento.js` | **novo** — o resumo do orçamento, só leitura |
| `frontend/cliente-pagamento.js` | **novo** — o link do parceiro e os dois estados |
| `frontend/cliente-gravacao.js` | **novo** — `gravarStatusDoLink`, `gravarCorrecaoDoCliente`, `saveAmostraToDB` |
| `frontend/style.css` | **muda** — bloco novo do portal, celular primeiro |
| `frontend/script.js` | **muda** — a caixa do painel passa a mostrar as três chaves de correção |

---

### Task 1: A função do banco entrega o pedido inteiro pelo token

**Arquivos:**
- Criar: `sql/link_cliente_pedido.sql`
- Criar: `tests/test_portal_do_pedido.py`

**Interfaces:**
- Produz: `public.link_cliente_pedido(p_numero text, p_token text) RETURNS jsonb`,
  chamável por `anon` e `authenticated`. Devolve `NULL` quando o par não confere.
  Chaves do JSON: `pedido`, `cliente`, `endereco`, `itens`, `os`, `entrega`.

- [ ] **Passo 1: escrever o teste que falha**

Em `tests/test_portal_do_pedido.py`:

```python
# -*- coding: utf-8 -*-
"""A porta do Portal do Pedido: um JSON so, exigindo numero+token."""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL = os.path.join(RAIZ, "sql", "link_cliente_pedido.sql")


def _ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def test_a_funcao_nasce_com_os_cuidados_de_security_definer():
    sql = _ler(SQL)
    assert "SECURITY DEFINER" in sql
    assert "SET search_path = public" in sql


def test_a_funcao_exige_o_par_numero_e_token():
    sql = _ler(SQL)
    assert "l.numero_pedido = p_numero" in sql
    assert "l.token = p_token" in sql
    assert "l.ativo IS TRUE" in sql


def test_a_funcao_nao_devolve_o_token():
    sql = _ler(SQL)
    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.link_cliente_pedido"):]
    assert "'token'" not in corpo


def test_a_funcao_nao_devolve_dado_financeiro_do_cadastro():
    """`select('*')` em `clientes` trazia limite de credito, risco e total de
    compras para uma pagina publica. A funcao lista os campos um a um."""
    sql = _ler(SQL)
    for proibido in ("limite_credito", "risco_credito", "total_compras", "credito"):
        assert proibido not in sql, f"{proibido} nao pode sair para o cliente"


def test_o_arquivo_e_aditivo():
    """Fechar privilegio de tabela do parceiro nao e decisao deste projeto."""
    sql = _ler(SQL)
    for perigoso in ("REVOKE", "DROP TABLE", "ALTER TABLE", "TRUNCATE"):
        assert perigoso not in sql.upper(), f"{perigoso} nao pertence a este arquivo"
```

- [ ] **Passo 2: rodar e ver falhar**

`pytest tests/test_portal_do_pedido.py -q` → FAIL (arquivo SQL não existe).

- [ ] **Passo 3: escrever `sql/link_cliente_pedido.sql`**

Cabeçalho explicando o porquê (padrão do projeto), depois a função. O corpo:

```sql
CREATE OR REPLACE FUNCTION public.link_cliente_pedido(
    p_numero text,
    p_token  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_link      pedidos_links_cliente%ROWTYPE;
    v_num_int   bigint;
    v_prop      propostas%ROWTYPE;
    v_cliente   clientes%ROWTYPE;
    v_end       enderecos%ROWTYPE;
    v_os        propostas_os%ROWTYPE;
    v_arte      pedidos_artes%ROWTYPE;
    v_itens     jsonb;
BEGIN
    SELECT l.* INTO v_link
      FROM pedidos_links_cliente l
     WHERE l.numero_pedido = p_numero
       AND l.token = p_token
       AND l.ativo IS TRUE
     LIMIT 1;

    IF v_link.id IS NULL THEN
        RETURN NULL;
    END IF;

    v_num_int := p_numero::bigint;

    SELECT p.* INTO v_prop FROM propostas p WHERE p.id_int = v_num_int LIMIT 1;

    SELECT c.* INTO v_cliente
      FROM clientes c
     WHERE c.id_cliente = COALESCE(v_prop.id_faturado, v_prop.id_cliente)
     LIMIT 1;

    SELECT e.* INTO v_end
      FROM enderecos e
     WHERE e.id::text = v_prop.id_endereco_ent
     LIMIT 1;

    SELECT o.* INTO v_os FROM propostas_os o WHERE o.id_int = v_num_int LIMIT 1;

    SELECT a.* INTO v_arte FROM pedidos_artes a WHERE a.id_int = v_num_int LIMIT 1;

    SELECT jsonb_agg(jsonb_build_object(
               'id',              pp.id,
               'nome_produto',    pp.nome_produto,
               'modelo_descri',   pp.modelo_descri,
               'qtd',             pp.qtd,
               'valor_unt',       pp.valor_unt,
               'fixo',            pp.fixo,
               'valor_sub_total', pp.valor_sub_total,
               'prazo',           pr.prazo
           ) ORDER BY pp.id)
      INTO v_itens
      FROM produtos_proposta pp
      LEFT JOIN produtos pr ON pr.id_produto = pp.id_produto
     WHERE pp.id_int = v_num_int;

    RETURN jsonb_build_object(
        'pedido', jsonb_build_object(
            'numero',           v_link.numero_pedido,
            'os_id',            v_link.os_id,
            'status_arte',      v_link.status_arte,
            'cliente',          v_prop.cliente,
            'valor_total',      v_prop.valor_total,
            'valor_frete',      v_prop.valor_frete,
            'frete_escolhido',  v_prop.frete_escolhido,
            'modalidade_frete', v_prop.modalidade_frete,
            'texto_whatsapp',   v_prop.texto_whatsapp,
            'volume',           v_prop.volume,
            'id_cliente',       COALESCE(v_prop.id_faturado, v_prop.id_cliente)
        ),
        'cliente', CASE WHEN v_cliente.id IS NULL THEN NULL ELSE jsonb_build_object(
            'nome',         COALESCE(NULLIF(v_cliente.nome, ''), v_cliente.fantasia),
            'documento',    v_cliente.documento,
            'ins_estadual', v_cliente.ins_estadual,
            'email',        COALESCE(NULLIF(v_cliente.email_financeiro, ''),
                                     NULLIF(v_cliente.email_contato, ''), v_cliente.email),
            'telefone',     COALESCE(NULLIF(v_cliente.whatsapp_1, ''), v_cliente.telefone_fixo)
        ) END,
        'endereco', CASE WHEN v_end.id IS NULL THEN NULL ELSE jsonb_build_object(
            'recebedor',     v_end.recebedor,
            'cpf_recebedor', v_end.cpf_recebedor,
            'endereco',      v_end.endereco,
            'numero',        v_end.numero,
            'complemento',   v_end.complemento,
            'bairro',        v_end.bairro,
            'cidade',        v_end.cidade,
            'uf',            v_end.uf,
            'cep',           v_end.cep
        ) END,
        'itens', COALESCE(v_itens, '[]'::jsonb),
        'os', CASE WHEN v_os.id IS NULL THEN NULL ELSE jsonb_build_object(
            'data_termino',        v_os.data_termino,
            'codigo_rastreamento', v_os.codigo_rastreamento,
            'link_pagamento',      v_os.link_pagamento,
            'forma_pagamento',     v_os.forma_pagamento,
            'status_pagamento',    v_os.status_pagamento
        ) END,
        'entrega', jsonb_build_object(
            'entrega_dados', v_arte.entrega_dados,
            'observacoes',   v_arte.observacoes
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_cliente_pedido(text, text) TO anon, authenticated;
```

- [ ] **Passo 4: rodar o teste e ver passar**

`pytest tests/test_portal_do_pedido.py -q` → PASS.

- [ ] **Passo 5: subir a função para o banco e conferir com dado real**

```
.\ferramentas\rodar_sql.ps1 sql\link_cliente_pedido.sql
```

Depois, um arquivo de conferência no scratchpad chamando a função com um par
número+token real (tirado de `pedidos_links_cliente`) e com um token errado. O
esperado: JSON preenchido no primeiro, `null` no segundo.

- [ ] **Passo 6: commit**

```bash
git add sql/link_cliente_pedido.sql tests/test_portal_do_pedido.py
git commit -m "sql: uma funcao entrega o pedido inteiro ao cliente pelo token"
```

---

### Task 2: A divisão dos arquivos, sem mudar comportamento

**Arquivos:**
- Criar: `frontend/cliente-arte.js`, `frontend/cliente-gravacao.js`
- Modificar: `frontend/cliente.js`, `frontend/cliente.html`
- Modificar: `tests/test_link_do_cliente_pelo_token.py`, `tests/link_do_cliente_harness.js`,
  `tests/arte_de_aprovacao_harness.js`, `tests/correcao_do_cliente_harness.js`
  (passam a ler o conjunto dos arquivos `cliente*.js`)

**Interfaces:**
- Produz: `cliente-arte.js` com `renderAmostrasOSItens`, `renderItemAmostraCombinada`,
  `drawAmostraFace`, `openClienteLightbox`, `closeClienteLightbox`, `initPdfViewer`,
  `decisionAmostraItem`, `atualizarBarraFinalCliente` e as auxiliares de CSV/QR/foto,
  todas em `window`.
- Produz: `cliente-gravacao.js` com `gravarStatusDoLink(status)`,
  `gravarCorrecaoDoCliente(numPedInt, texto, statusEntrega)` e
  `saveAmostraToDB(itemId, osId, dataToUpdate)`.

- [ ] **Passo 1: separar os testes do caminho**

Nos três harnesses e no `test_link_do_cliente_pelo_token.py`, trocar a leitura de
um arquivo pela leitura de todos:

```python
import glob
CLIENTE_JS = sorted(glob.glob(os.path.join(RAIZ, "frontend", "cliente*.js")))

def _ler_cliente():
    return "\n".join(_ler(c) for c in CLIENTE_JS)
```

E no node:

```js
const CLIENTE = fs.readdirSync(path.join(RAIZ, 'frontend'))
    .filter(f => /^cliente.*\.js$/.test(f)).sort()
    .map(f => fs.readFileSync(path.join(RAIZ, 'frontend', f), 'utf8'))
    .join('\n');
```

- [ ] **Passo 2: rodar os testes e ver que continuam passando**

```
pytest tests/test_link_do_cliente_pelo_token.py tests/test_link_do_cliente.py tests/test_correcao_do_cliente.py tests/test_arte_de_aprovacao.py -q
```
Esperado: PASS (nada foi movido ainda; o teste só passou a ler mais arquivos).

- [ ] **Passo 3: mover, sem alterar**

Recortar de `cliente.js` para `cliente-arte.js`: as linhas 15–60 (auxiliares de
desenho), 169–804 (`escapeHtml`…`renderAmostrasOSItens`), 1830–3489 (lightbox,
viewer, canvas, CSV, QR). Recortar para `cliente-gravacao.js`: `saveAmostraToDB`,
`gravarStatusDoLink`, `gravarCorrecaoDoCliente`. **Nenhuma linha alterada** — só
mudou de arquivo. Onde uma função era chamada por `onclick=""` no HTML gerado,
ela precisa continuar em `window`.

- [ ] **Passo 4: declarar os arquivos no HTML, na ordem certa**

Em `cliente.html`, antes de `cliente.js`:

```html
<script src="/cliente-gravacao.js?v=656"></script>
<script src="/cliente-arte.js?v=656"></script>
```

- [ ] **Passo 5: rodar os testes e ver que continuam passando**

Mesma linha do Passo 2. Esperado: PASS.

- [ ] **Passo 6: commit**

```bash
git add frontend/cliente*.js frontend/cliente.html tests/
git commit -m "cliente: a aprovacao de arte sai do arquivo de 3.489 linhas"
```

---

### Task 3: A carga passa pela função nova, e o nome do cliente aparece

**Arquivos:**
- Criar: `frontend/cliente-dados.js`, `tests/portal_dados_harness.js`
- Modificar: `frontend/cliente.js`, `frontend/cliente.html`, `tests/test_portal_do_pedido.py`

**Interfaces:**
- Consome: `link_cliente_pedido` da Task 1.
- Produz: `window.portalDados` — objeto com o JSON da função — e
  `carregarPortal(numero, token)` que o preenche e devolve; `rotuloDoFrete(pedido)`,
  `prazoDeEnvio(os, itens)`, `enderecoEmLinhas(endereco)`, todas puras e testáveis.

- [ ] **Passo 1: escrever o harness que falha**

`tests/portal_dados_harness.js` no molde dos outros (recorta a função do fonte e
executa). Casos:

```js
// rotuloDoFrete
ok(rotuloDoFrete({frete_escolhido: 'SEDEX', valor_frete: '20.12'}) === 'SEDEX — R$ 20,12', 'sedex com valor');
ok(rotuloDoFrete({frete_escolhido: 'RETIRADA', valor_frete: '0.00'}) === 'Retirada no local — sem custo', 'retirada');
ok(rotuloDoFrete({frete_escolhido: null, valor_frete: null}) === 'A combinar', 'sem frete escolhido');

// prazoDeEnvio: a data do parceiro vence; sem ela, o prazo do produto
ok(prazoDeEnvio({data_termino: '2026-08-21T00:00:00'}, []) === '21/08/2026', 'data do parceiro');
ok(prazoDeEnvio(null, [{prazo: '1 dia util'}]) === '1 dia util', 'cai no prazo do produto');
ok(prazoDeEnvio(null, []) === null, 'sem prazo nenhum devolve nulo');
```

- [ ] **Passo 2: rodar e ver falhar** — `node tests/portal_dados_harness.js`.

- [ ] **Passo 3: escrever `cliente-dados.js`**

`carregarPortal` chama `supabaseClient.rpc('link_cliente_pedido', {p_numero, p_token})`,
guarda em `window.portalDados` e devolve. As três funções puras acima ficam no
mesmo arquivo. O `initClientePage` do `cliente.js` passa a:

1. chamar `link_cliente_abrir` (validação e contagem de acesso — continua igual);
2. chamar `carregarPortal`;
3. preencher o cabeçalho com `portalDados.pedido.cliente` — **é aqui que o nome do
   cliente passa a aparecer**; a leitura de `propData.cliente_nome` sai;
4. seguir carregando os itens (`pedidos_modelos`) como já faz.

As consultas diretas a `propostas`, `clientes` e `enderecos` saem do `cliente.js`.

- [ ] **Passo 4: rodar e ver passar** — `node tests/portal_dados_harness.js`.

- [ ] **Passo 5: prender o conserto do nome com teste**

Em `tests/test_portal_do_pedido.py`:

```python
def test_o_nome_do_cliente_vem_da_coluna_que_existe():
    """`cliente_nome` nao existe em `propostas` -- a coluna e `cliente`. Por
    isso o cabecalho da pagina ficou vazio desde sempre."""
    fonte = _ler_cliente()
    assert "cliente_nome" not in fonte
    assert "portalDados.pedido.cliente" in fonte or "pedido.cliente" in fonte


def test_a_pagina_do_cliente_nao_le_mais_o_cadastro_direto():
    fonte = _ler_cliente()
    assert "from('clientes')" not in fonte
    assert "from('enderecos')" not in fonte
    assert "rpc('link_cliente_pedido'" in fonte
```

- [ ] **Passo 6: commit**

```bash
git add frontend/cliente-dados.js frontend/cliente.js frontend/cliente.html tests/
git commit -m "cliente: os dados do pedido vem por uma funcao so, com o token"
```

---

### Task 4: O casco — cabeçalho, selo de status e a barra de abas

**Arquivos:**
- Criar: `frontend/cliente-shell.js`, `tests/portal_abas_harness.js`
- Modificar: `frontend/cliente.html`, `frontend/style.css`

**Interfaces:**
- Produz: `montarPortal()`, `abrirSecao(nome)` (`arte|entrega|faturamento|orcamento|pagamento`),
  `seloDoStatus(statusArte)` → `{texto, cor, chave}`, `registrarSecao(nome, fn)` —
  cada aba registra a função que a desenha na primeira abertura.

- [ ] **Passo 1: escrever o harness que falha**

`tests/portal_abas_harness.js`, casos de `seloDoStatus` lidos do fonte:

```js
ok(seloDoStatus('Enviar Arte').chave === 'aprovar', 'enviar arte pede aprovacao');
ok(seloDoStatus('Aguard. Aprovação').chave === 'aprovar', 'com acento tambem');
ok(seloDoStatus('APROVADO').chave === 'aprovado', 'aprovado');
ok(seloDoStatus('Em Alteração').chave === 'correcao', 'em alteracao');
ok(seloDoStatus('EM PRODUCAO').chave === 'producao', 'em producao');
ok(seloDoStatus('Em Arte').chave === 'preparando', 'em arte');
ok(seloDoStatus(null).chave === 'preparando', 'sem status');
```

Mais: `abrirSecao` aceita as cinco chaves e recusa qualquer outra sem quebrar.

- [ ] **Passo 2: rodar e ver falhar** — `node tests/portal_abas_harness.js`.

- [ ] **Passo 3: o HTML do portal**

Em `cliente.html`, dentro de `#cliente-content`, cinco seções e a barra:

```html
<main id="portal-secoes">
  <section id="secao-arte"        class="portal-secao" data-secao="arte"></section>
  <section id="secao-entrega"     class="portal-secao" data-secao="entrega" hidden></section>
  <section id="secao-faturamento" class="portal-secao" data-secao="faturamento" hidden></section>
  <section id="secao-orcamento"   class="portal-secao" data-secao="orcamento" hidden></section>
  <section id="secao-pagamento"   class="portal-secao" data-secao="pagamento" hidden></section>
</main>

<nav id="portal-abas" class="portal-abas" aria-label="Seções do pedido">
  <button type="button" class="portal-aba ativa" data-abre="arte">
      <span class="portal-aba-icone" aria-hidden="true">🎨</span><span class="portal-aba-rotulo">Arte</span></button>
  <button type="button" class="portal-aba" data-abre="entrega">
      <span class="portal-aba-icone" aria-hidden="true">📦</span><span class="portal-aba-rotulo">Entrega</span></button>
  <button type="button" class="portal-aba" data-abre="faturamento">
      <span class="portal-aba-icone" aria-hidden="true">🧾</span><span class="portal-aba-rotulo">Nota</span></button>
  <button type="button" class="portal-aba" data-abre="orcamento">
      <span class="portal-aba-icone" aria-hidden="true">💰</span><span class="portal-aba-rotulo">Orçamento</span></button>
  <button type="button" class="portal-aba" data-abre="pagamento">
      <span class="portal-aba-icone" aria-hidden="true">💳</span><span class="portal-aba-rotulo">Pagar</span></button>
</nav>
```

O rótulo em texto embaixo do ícone é obrigatório: controle novo neste projeto não
se explica por ícone sozinho.

- [ ] **Passo 4: o CSS, celular primeiro**

Bloco novo em `style.css`, depois do bloco `.cliente-*`:

```css
.portal-abas {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
    display: grid; grid-template-columns: repeat(5, 1fr);
    background: rgba(10, 15, 30, 0.96);
    border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom, 0);
    backdrop-filter: blur(8px);
}
.portal-aba {
    min-height: 56px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 2px;
    background: none; border: 0; color: var(--text-dim);
    font-size: 0.68rem; line-height: 1.1; cursor: pointer;
}
.portal-aba.ativa { color: var(--blue); }
.portal-aba-icone { font-size: 1.25rem; }
/* o conteúdo nunca fica embaixo da barra */
.cliente-container { padding-bottom: calc(72px + env(safe-area-inset-bottom, 0)); }
.cliente-header { padding-top: calc(20px + env(safe-area-inset-top, 0)); }

@media (min-width: 900px) {
    .portal-abas {
        position: sticky; top: 24px; bottom: auto; left: auto; right: auto;
        grid-template-columns: 1fr; border: 1px solid var(--border);
        border-radius: var(--radius); width: 190px; align-self: flex-start;
    }
    .portal-aba { flex-direction: row; justify-content: flex-start; gap: 10px;
                  padding: 0 16px; font-size: 0.9rem; }
    .cliente-container { padding-bottom: 24px; }
}
```

- [ ] **Passo 5: `cliente-shell.js`**

`abrirSecao` esconde as outras, marca a aba ativa, grava
`location.hash = '#' + nome` sem recarregar, e chama a função registrada da seção
uma vez (guardando que já desenhou). `montarPortal` lê o hash inicial e abre a
seção certa; sem hash, abre `arte`. O selo do status vai no cabeçalho.

- [ ] **Passo 6: rodar o harness e ver passar** — `node tests/portal_abas_harness.js`.

- [ ] **Passo 7: ver na tela**

Usar a skill `rodar-app` para abrir a página num navegador de 390×844 e conferir:
as cinco abas cabem, o rótulo não quebra, a barra não cobre o botão de aprovar.

- [ ] **Passo 8: commit**

```bash
git add frontend/cliente-shell.js frontend/cliente.html frontend/style.css tests/portal_abas_harness.js
git commit -m "cliente: barra de abas no rodape, no jeito de aplicativo"
```

---

### Task 5: A aba da Arte, com estado por status

**Arquivos:**
- Modificar: `frontend/cliente-arte.js`, `frontend/cliente.js`
- Modificar: `tests/portal_abas_harness.js`

**Interfaces:**
- Consome: `seloDoStatus` (Task 4), `portalDados` (Task 3).
- Produz: `desenharSecaoArte()`, registrada como a seção `arte`.

- [ ] **Passo 1: teste que falha** — no harness das abas, `estadoDaArte(status, itens)`
devolve `'aprovar'` para `Enviar Arte`; `'aprovado_leitura'` para `APROVADO`;
`'correcao'` para `Em Alteração`; `'producao'` para `EM PRODUCAO`;
`'preparando'` para `Em Arte` e para nulo.

- [ ] **Passo 2: rodar e ver falhar.**

- [ ] **Passo 3: implementar `desenharSecaoArte`** — ela decide pelo estado e:
`aprovar` chama `renderAmostrasOSItens(osId)` como hoje; `aprovado_leitura` e
`producao` chamam a mesma função com `somenteLeitura = true` (sem os botões de
decisão e sem a barra final, mantendo o lightbox); `correcao` mostra o texto que o
cliente escreveu, lido de `portalDados.entrega.observacoes`; `preparando` mostra a
mensagem de preparação. O `mostrarResultadoCliente` deixa de esconder a página
inteira: ele passa a escrever dentro da seção da arte.

Ao terminar a aprovação das artes, a página **leva o cliente para a aba Entrega**
(`abrirSecao('entrega')`) com um aviso do que ainda falta conferir — é o que
substitui a tela sequencial `mostrarConfirmacaoDadosCliente`, que sai.

- [ ] **Passo 4: rodar o harness e ver passar.**

- [ ] **Passo 5: rodar os testes da aprovação** —
`pytest tests/test_arte_de_aprovacao.py tests/test_link_do_cliente.py -q` → PASS.

- [ ] **Passo 6: commit**

```bash
git add frontend/cliente-arte.js frontend/cliente.js tests/portal_abas_harness.js
git commit -m "cliente: a aba da arte tem cara para cada status do pedido"
```

---

### Task 6: A aba de Entrega, com forma e prazo de envio

**Arquivos:**
- Criar: `frontend/cliente-entrega.js`, `tests/portal_confirmacoes_harness.js`
- Modificar: `frontend/cliente-gravacao.js`, `frontend/cliente.html`,
  `tests/portal_dados_harness.js`

**Interfaces:**
- Consome: `portalDados.endereco`, `portalDados.pedido`, `portalDados.os`,
  `portalDados.itens`, `rotuloDoFrete`, `prazoDeEnvio`.
- Produz: `desenharSecaoEntrega()`, registrada como a seção `entrega`;
  `window.confirmarEntrega(ok)` e `window.salvarCorrecaoEntrega()`.
- **Muda a assinatura:** `gravarCorrecaoDoCliente(numPedInt, textos, statusEntrega)`
  passa a receber `textos = {entrega, faturamento}` e a gravar as chaves
  `correcao_entrega` e `correcao_faturamento` dentro de
  `pedidos_artes.observacoes`, **preservando** a chave antiga
  `correcao_entrega_faturamento` quando ela já existir. É esta tarefa que faz a
  mudança; a Task 7 só passa a usar o outro campo. Os três pontos de chamada
  atuais (`salvarCorrecaoTexto`, `finalizarConfirmacaoCliente` e o botão 💾)
  mudam junto.

- [ ] **Passo 1: teste que falha (gravação)** — `tests/portal_confirmacoes_harness.js`
roda `gravarCorrecaoDoCliente` contra um banco de mentira (molde do
`correcao_do_cliente_harness.js`) e prende:
  - as duas confirmadas → `entrega_dados = 'APROVADO'` e nenhuma chave de correção;
  - só a de entrega com texto → `entrega_dados = 'CORRIGIR'`, chave
    `correcao_entrega` preenchida, `correcao_faturamento` ausente;
  - a chave antiga `correcao_entrega_faturamento` que já existia no jsonb **não é
    apagada**;
  - o retorno continua sendo `{ok: false, erro: …}` quando o UPDATE não acha linha.

- [ ] **Passo 1b: teste que falha (tela)** — no harness dos dados, `linhasDaEntrega(dados)`
devolve, em ordem: recebedor (quando houver), rua e número, complemento (quando
houver), bairro, cidade/UF, CEP; e nunca devolve uma linha com valor vazio.
Mais: `linkDeRastreio('AD816558575BR')` aponta para os Correios e
`linkDeRastreio(null)` devolve `null`.

- [ ] **Passo 2: rodar e ver falhar.**

- [ ] **Passo 3: implementar `cliente-entrega.js`** — três cartões: **Endereço**
(as linhas acima), **Envio** (`rotuloDoFrete` + `prazoDeEnvio` + rastreio quando
houver) e a decisão **CONFIRMAR / ALTERAR** com a caixa de texto e o botão
💾 Salvar Correção, que grava na chave `correcao_entrega`.

- [ ] **Passo 4: rodar e ver passar.**

- [ ] **Passo 5: commit**

```bash
git add frontend/cliente-entrega.js frontend/cliente.html tests/portal_dados_harness.js
git commit -m "cliente: a aba de entrega mostra forma de envio, prazo e rastreio"
```

---

### Task 7: A aba de Faturamento, com decisão própria

**Arquivos:**
- Criar: `frontend/cliente-faturamento.js`
- Modificar: `frontend/script.js`, `frontend/cliente.html`,
  `tests/portal_confirmacoes_harness.js`, `tests/dados_de_entrega_harness.js`

**Interfaces:**
- Consome: `gravarCorrecaoDoCliente(numPedInt, {entrega, faturamento}, statusEntrega)`,
  já com a assinatura nova da Task 6.
- Produz: `desenharSecaoFaturamento()`; `window.confirmarFaturamento(ok)`;
  `window.salvarCorrecaoFaturamento()`; `linhasDoFaturamento(cliente)` — nome/razão,
  CPF/CNPJ, I.E. (vazio vira `ISENTO`), e-mail e telefone, pulando linha vazia.

- [ ] **Passo 1: teste que falha** — em `portal_confirmacoes_harness.js`:
só o faturamento com texto → `entrega_dados = 'CORRIGIR'` e a chave
`correcao_faturamento` preenchida com `correcao_entrega` ausente; e
`linhasDoFaturamento({ins_estadual: ''})` devolve a linha da I.E. com `ISENTO`.

- [ ] **Passo 2: rodar e ver falhar.**

- [ ] **Passo 3: implementar** — o arquivo da aba.

- [ ] **Passo 4: rodar e ver passar.**

- [ ] **Passo 5: o painel passa a mostrar as três chaves**

Em `loadDadosEntregaInterno` (`script.js`), ler `correcao_entrega`,
`correcao_faturamento` e `correcao_entrega_faturamento`, rotuladas, e só cair na
frase genérica quando as três estiverem vazias. Ajustar
`tests/dados_de_entrega_harness.js` para prender as três leituras.

- [ ] **Passo 6: rodar** — `node tests/dados_de_entrega_harness.js` → PASS.

- [ ] **Passo 7: commit**

```bash
git add frontend/cliente-faturamento.js frontend/cliente-gravacao.js frontend/script.js frontend/cliente.html tests/
git commit -m "cliente: entrega e faturamento passam a ter confirmacao propria"
```

---

### Task 8: A aba de Orçamento

**Arquivos:**
- Criar: `frontend/cliente-orcamento.js`, `tests/portal_orcamento_harness.js`
- Modificar: `frontend/cliente.html`

**Interfaces:**
- Produz: `desenharSecaoOrcamento()`; `negritoDoWhatsapp(texto)` → HTML seguro;
  `linhasDoOrcamento(itens, pedido)` → lista para o caso sem `texto_whatsapp`;
  `emReal(valor)` → `'R$ 71,50'`.

- [ ] **Passo 1: teste que falha**

```js
ok(negritoDoWhatsapp('*150* Pulseira') === '<b>150</b> Pulseira', 'negrito vira <b>');
ok(negritoDoWhatsapp('<script>alert(1)</script>').indexOf('<script') < 0, 'tag do banco nao vira tag');
ok(negritoDoWhatsapp('R$ 71,50') === 'R$ 71,50', 'texto simples passa inteiro');
ok(negritoDoWhatsapp(null) === '', 'nulo nao quebra');
ok(emReal(71.5) === 'R$ 71,50', 'real com duas casas');
ok(emReal('1215.57') === 'R$ 1.215,57', 'milhar com ponto');
ok(emReal(null) === '--', 'sem valor');
// sem texto do whatsapp, monta pelos itens
const l = linhasDoOrcamento([{nome_produto:'Pulseira ColorBand', qtd:450, valor_unt:0.21, fixo:40, valor_sub_total:134.5}],
                            {valor_frete:'20.12', frete_escolhido:'SEDEX', valor_total:154.62});
ok(l.itens[0].texto.indexOf('450') >= 0, 'a quantidade aparece');
ok(l.total === 'R$ 154,62', 'o total vem do pedido');
```

- [ ] **Passo 2: rodar e ver falhar.**

- [ ] **Passo 3: implementar** — `desenharSecaoOrcamento` mostra o total em
destaque e, abaixo, o `texto_whatsapp` renderizado (escapado, com o negrito
traduzido), cortando a saudação inicial e a frase final de venda. Sem
`texto_whatsapp`, monta pelos itens.

- [ ] **Passo 4: rodar e ver passar.**

- [ ] **Passo 5: commit**

```bash
git add frontend/cliente-orcamento.js frontend/cliente.html tests/portal_orcamento_harness.js
git commit -m "cliente: a aba do orcamento mostra o mesmo resumo que ele recebeu"
```

---

### Task 9: A aba do Link para pagamento

**Arquivos:**
- Criar: `frontend/cliente-pagamento.js`
- Modificar: `frontend/cliente.html`, `tests/portal_orcamento_harness.js`

**Interfaces:**
- Produz: `desenharSecaoPagamento()`; `estadoDoPagamento(os)` →
  `'liberado' | 'aguardando'`.

- [ ] **Passo 1: teste que falha**

```js
ok(estadoDoPagamento({link_pagamento: 'https://pag.com/x'}) === 'liberado', 'com link');
ok(estadoDoPagamento({link_pagamento: ''}) === 'aguardando', 'link vazio');
ok(estadoDoPagamento(null) === 'aguardando', 'sem linha de OS');
ok(mostraStatusDePagamento({status_pagamento: 'APROVADO', link_pagamento: ''}) === false,
   'nao anuncia pagamento aprovado enquanto o campo for padrao do parceiro');
```

- [ ] **Passo 2: rodar e ver falhar.**

- [ ] **Passo 3: implementar** — estado `liberado`: valor total, forma de
pagamento quando houver e o botão "Pagar agora" (`target="_blank"`,
`rel="noopener noreferrer"` — aqui o destino é externo e desconhecido). Estado
`aguardando`: o valor total, a frase de que o link ainda não foi liberado e **o
que fazer** ("fale com seu atendimento"), nunca um botão morto.

- [ ] **Passo 4: rodar e ver passar.**

- [ ] **Passo 5: commit**

```bash
git add frontend/cliente-pagamento.js frontend/cliente.html tests/portal_orcamento_harness.js
git commit -m "cliente: a aba de pagamento abre o link do parceiro, e diz o que fazer sem ele"
```

---

### Task 10: Os catálogos param de vir inteiros

**Arquivos:**
- Modificar: `frontend/cliente-dados.js`
- Criar: `tests/portal_catalogo_harness.js`

**Interfaces:**
- Produz: `idsDoCatalogoDoPedido(itens)` → `{cores: [...], numeracoes: [...], formatos: [...]}`.

- [ ] **Passo 1: teste que falha** — `idsDoCatalogoDoPedido` devolve os ids de cor
e numeração de todos os modelos do pedido, **inclusive** a numeração customizada
(`is_custom` com `Cli_Num`), e ignora nulos sem quebrar.

- [ ] **Passo 2: rodar e ver falhar.**

- [ ] **Passo 3: implementar** — as quatro consultas ganham `.in('id', ids)`. O
filtro é montado **depois** de `cor-numeracao-do-modelo.js` resolver nome × id: a
regra pode escolher a cor pelo **nome**, e filtrar antes deixaria a cor certa de
fora.

- [ ] **Passo 4: rodar e ver passar** — `node tests/portal_catalogo_harness.js` e
`Invoke-Pester tests/CorNumeracaoDoModelo.Tests.ps1` → PASS nos dois.

- [ ] **Passo 5: a conferência que decide se a tarefa fica**

Abrir um pedido real pela skill `rodar-app` e comparar a arte desenhada com a de
antes da mudança. Se a cor sair diferente, **esta tarefa é revertida** e fica para
depois: arte na cor errada na tela do cliente é pior do que 200 KB a mais.

- [ ] **Passo 6: commit**

```bash
git add frontend/cliente-dados.js tests/portal_catalogo_harness.js
git commit -m "cliente: o catalogo vem so do que o pedido usa"
```

---

### Task 11: Fechamento — documentação, versão e suíte inteira

**Arquivos:**
- Modificar: `CHANGELOG.md`, `docs/fluxo_aprovacao_arte.md`, `frontend/cliente.html`

- [ ] **Passo 1: subir a query string** dos scripts de `cliente.html` para `v656`.
- [ ] **Passo 2: `docs/fluxo_aprovacao_arte.md`** ganha a seção do Portal e a
      tabela de status atualizada (a de hoje descreve status que o banco não usa:
      os reais são `Enviar Arte`, `Aguard. Aprovação`, `APROVADO`, `Em Alteração`,
      `EM PRODUCAO`, `Em Arte`).
- [ ] **Passo 3: `CHANGELOG.md`** com a entrada da v656.
- [ ] **Passo 4: a suíte inteira** — `pytest -q` e todos os harnesses.
- [ ] **Passo 5: `.\ferramentas\conferir.ps1`** e relatar os pontos de atenção.
- [ ] **Passo 6: commit**

```bash
git add CHANGELOG.md docs/ frontend/cliente.html
git commit -m "changelog: o link do cliente vira o Portal do Pedido (v656)"
```

- [ ] **Passo 7: avisar o usuário** que está pronto para publicar, lembrando que o
      agente sai na mesma leva (`.\publicar.ps1 "…" -Sim` e
      `.\publicar_agente.ps1 1.2.151`). **Publicar é ato dele.**
