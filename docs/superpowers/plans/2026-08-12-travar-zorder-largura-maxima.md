# Travar, Frente/Trás e Largura Máxima — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elementos de numeração ganham trava anti-arrasto e controle de sobreposição (frente/trás); elementos TEXT de coluna do banco (CSV) ganham largura máxima em mm com dois modos de ajuste (reduzir fonte / quebrar linha) e alinhamento — idênticos na tela e no papel.

**Architecture:** A ordem do array `state.numElements` já é a ordem de desenho em todos os renderizadores e no `engine.py`, então frente/trás é só reordenar o array. A trava é um campo `locked` filtrado no arrasto do canvas. O ajuste de largura é UMA função pura espelhada em dois lugares — `frontend/texto-ajuste.js` (novo arquivo, carregado por `index.html` e `cliente.html`) e `_ajustar_texto_na_largura` no `engine.py` — chamada por todos os renderizadores de texto.

**Tech Stack:** Vanilla JS (frontend), Python + PyMuPDF/fitz (engine), pytest.

**Spec:** `docs/superpowers/specs/2026-08-12-travar-zorder-largura-maxima-design.md`

## Global Constraints

- Trabalhar direto na branch `main` (preferência registrada do usuário). Commits com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Todo texto de interface em PT-BR, controles novos com rótulo em texto (não só emoji).
- `line_height = 1.2 × corpo` em todo desenho multilinha (idêntico ao engine).
- Campos novos no elemento: `locked` (bool, ausente = destravado), `max_width_mm` (número, 0/ausente = livre), `overflow` (`"shrink"` padrão | `"wrap"`), `text_align` (`"center"` padrão | `"left"` | `"right"`). Nunca inverter essas polaridades — elementos antigos não têm os campos.
- O algoritmo de ajuste JS e Python devem ser ESPELHOS exatos (mesmas decisões de quebra), com folga de 0,5% (`alvo = larguraMax * 0.995`).
- `engine.py` muda ⇒ ao publicar, site e agente saem JUNTOS (ação do usuário; o plano só prepara).
- Não tocar em `frontend/producao.html` (cópia morta — `app.py` redireciona).
- Suíte existente `python -m pytest tests/ -q` deve continuar verde em todo commit.

---

### Task 1: Motor — função pura `_ajustar_texto_na_largura` (TDD)

**Files:**
- Modify: `engine.py` (função módulo-nível, logo após as constantes `ASCENDER_FRACTIONS`/`DESCENDER_FRACTIONS`/`MM2PT` no topo)
- Test: `tests/test_engine_ajuste_texto.py` (novo)

**Interfaces:**
- Produces: `_ajustar_texto_na_largura(medir, texto, corpo, largura_max, modo) -> (corpo, linhas)` onde `medir(texto, corpo) -> largura float` é callback; `modo` é `"shrink"` ou `"wrap"`; qualquer `largura_max` falsy/≤0 devolve `(corpo, texto.split("\n"))` intacto.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/test_engine_ajuste_texto.py`:

```python
# -*- coding: utf-8 -*-
"""
Ajuste de texto variavel num espaco limitado (max_width_mm do elemento).

A funcao e um espelho exato de window.ajustarTextoNaLargura do frontend
(frontend/texto-ajuste.js): shrink reduz o corpo na razao exata (largura de
texto e linear no corpo), wrap quebra por palavra com fallback por caractere
para palavra maior que o espaco. Folga de 0,5% para a mesma palavra nao
quebrar diferente entre a regua do canvas e a do fitz.
"""
import fitz
import pytest

from engine import _ajustar_texto_na_largura


def medir_helv(texto, corpo):
    return fitz.get_text_length(texto, fontname="helv", fontsize=corpo)


def test_sem_largura_devolve_intacto():
    corpo, linhas = _ajustar_texto_na_largura(medir_helv, "Nome Grande", 12, 0, "shrink")
    assert corpo == 12
    assert linhas == ["Nome Grande"]


def test_shrink_reduz_ate_caber():
    alvo = 40.0
    corpo, linhas = _ajustar_texto_na_largura(
        medir_helv, "NOME COMPRIDO DEMAIS", 12, alvo, "shrink")
    assert linhas == ["NOME COMPRIDO DEMAIS"]
    assert corpo < 12
    assert medir_helv(linhas[0], corpo) <= alvo


def test_shrink_nao_mexe_quando_cabe():
    corpo, linhas = _ajustar_texto_na_largura(medir_helv, "AB", 12, 500, "shrink")
    assert corpo == 12


def test_shrink_multilinha_usa_a_linha_mais_larga():
    corpo, linhas = _ajustar_texto_na_largura(
        medir_helv, "A\nNOME COMPRIDO DEMAIS", 12, 40.0, "shrink")
    assert linhas == ["A", "NOME COMPRIDO DEMAIS"]
    assert medir_helv("NOME COMPRIDO DEMAIS", corpo) <= 40.0


def test_wrap_quebra_por_palavra_e_todas_cabem():
    alvo = 80.0
    corpo, linhas = _ajustar_texto_na_largura(
        medir_helv, "Um nome bem comprido para caber", 12, alvo, "wrap")
    assert corpo == 12
    assert len(linhas) > 1
    for linha in linhas:
        assert medir_helv(linha, corpo) <= alvo
    assert " ".join(linhas).split() == "Um nome bem comprido para caber".split()


def test_wrap_palavra_gigante_quebra_no_caractere():
    alvo = 40.0
    corpo, linhas = _ajustar_texto_na_largura(
        medir_helv, "WOLFESCHLEGELSTEINHAUSEN", 12, alvo, "wrap")
    assert len(linhas) > 1
    for linha in linhas:
        assert medir_helv(linha, corpo) <= alvo
    assert "".join(linhas) == "WOLFESCHLEGELSTEINHAUSEN"


def test_wrap_preserva_paragrafo_vazio():
    corpo, linhas = _ajustar_texto_na_largura(medir_helv, "A\n\nB", 12, 500, "wrap")
    assert linhas == ["A", "", "B"]


def test_wrap_que_ja_cabe_nao_quebra():
    corpo, linhas = _ajustar_texto_na_largura(medir_helv, "AB CD", 12, 500, "wrap")
    assert linhas == ["AB CD"]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/test_engine_ajuste_texto.py -q`
Expected: FAIL — `ImportError: cannot import name '_ajustar_texto_na_largura'`

- [ ] **Step 3: Implementar a função no `engine.py`**

Localizar o bloco de constantes do topo (procurar `DESCENDER_FRACTIONS`; MM2PT já existe perto). Logo após, inserir:

```python
def _ajustar_texto_na_largura(medir, texto, corpo, largura_max, modo):
    """Ajusta texto variavel a um espaco de largura fixa.

    Espelho exato de window.ajustarTextoNaLargura (frontend/texto-ajuste.js);
    mudou aqui, muda la. `medir(texto, corpo)` e a regua de quem chama.
    Devolve (corpo, linhas). Folga de 0,5% para a mesma palavra nao quebrar
    diferente entre a regua do canvas e a do fitz.
    """
    paragrafos = str(texto).split("\n")
    try:
        largura_max = float(largura_max or 0)
        corpo = float(corpo)
    except (TypeError, ValueError):
        return corpo, paragrafos
    if largura_max <= 0 or corpo <= 0:
        return corpo, paragrafos
    alvo = largura_max * 0.995

    if modo == "wrap":
        linhas = []
        for p in paragrafos:
            if not p:
                linhas.append("")
                continue
            atual = ""
            for palavra in p.split(" "):
                while len(palavra) > 1 and medir(palavra, corpo) > alvo:
                    if atual:
                        linhas.append(atual)
                        atual = ""
                    corte = len(palavra) - 1
                    while corte > 1 and medir(palavra[:corte], corpo) > alvo:
                        corte -= 1
                    linhas.append(palavra[:corte])
                    palavra = palavra[corte:]
                tentativa = (atual + " " + palavra) if atual else palavra
                if atual and medir(tentativa, corpo) > alvo:
                    linhas.append(atual)
                    atual = palavra
                else:
                    atual = tentativa
            linhas.append(atual)
        return corpo, linhas

    # shrink (padrao): largura de texto e linear no corpo — uma divisao basta.
    maior = 0.0
    for p in paragrafos:
        w = medir(p, corpo)
        if w > maior:
            maior = w
    if maior > alvo:
        return corpo * (alvo / maior), paragrafos
    return corpo, paragrafos
```

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/test_engine_ajuste_texto.py -q`
Expected: 8 passed

- [ ] **Step 5: Suíte completa e commit**

Run: `python -m pytest tests/ -q` — Expected: tudo verde.

```bash
git add engine.py tests/test_engine_ajuste_texto.py
git commit -m "feat(engine): funcao de ajuste de texto a largura maxima (shrink/wrap)"
```

---

### Task 2: Motor — aplicar ajuste e alinhamento em `_render_element` (TDD)

**Files:**
- Modify: `engine.py:586-766` (ramo TEXT/FIXED/TEATRO_/CAMAROTE_ de `_render_element`)
- Test: `tests/test_engine_largura_maxima.py` (novo)

**Interfaces:**
- Consumes: `_ajustar_texto_na_largura` (Task 1).
- Produces: `_render_element` honra `el["max_width_mm"]`, `el["overflow"]`, `el["text_align"]` para QUALQUER elemento da família texto que tenha `max_width_mm > 0` (a UI só oferece em TEXT de banco, mas o motor não distingue — mecanismo geral, UI restrita).

- [ ] **Step 1: Descobrir o nome da classe dona de `_render_element`**

Run: `python -c "import re; s=open('engine.py',encoding='utf-8').read(); i=s.find('def _render_element'); print([m for m in re.findall(r'class (\w+)', s[:i])][-1])"`
Expected: imprime o nome (usar no teste; o texto abaixo assume `ImpositionEngine` — trocar pelo real).

Conferir também como o ramo TEXT resolve `source: database` (antes da linha 586): `python -c "s=open('engine.py',encoding='utf-8').read(); i=s.find('def _render_element'); print(s[i:i+3500])"` — anotar a chave do `csv_row` usada (deve ser `el.get('csv_column')`).

- [ ] **Step 2: Escrever o teste de integração que falha**

Criar `tests/test_engine_largura_maxima.py`:

```python
# -*- coding: utf-8 -*-
"""
max_width_mm no elemento TEXT limita o texto DESENHADO no PDF.

Renderiza um elemento direto numa pagina fitz via _render_element e mede as
palavras desenhadas (page.get_text). E o mesmo caminho da impressao real: o
que passar aqui e o que sai no papel.
"""
import fitz
import pytest

from engine import ImpositionEngine, MM2PT  # nome da classe conferido no Step 1


def _desenhar(el, csv_row=None, val=1):
    doc = fitz.open()
    page = doc.new_page(width=400, height=300)
    eng = object.__new__(ImpositionEngine)  # _render_element nao usa estado do self p/ fonte Base-14
    eng._render_element(page, el, 0, 0, val, csv_row)
    return doc, page


def _larguras_das_linhas(page):
    """Largura (pt) e quantidade de linhas de texto desenhadas na pagina."""
    linhas = {}
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            y = round(l["bbox"][1], 1)
            x0 = min(s["bbox"][0] for s in l["spans"])
            x1 = max(s["bbox"][2] for s in l["spans"])
            linhas[y] = max(linhas.get(y, 0), x1 - x0)
    return list(linhas.values())


def _el_base(**extra):
    el = {
        "type": "TEXT", "source": "database", "csv_column": "Nome",
        "x_mm": 70, "y_mm": 50, "font_size": 14, "color": "#000000",
        "prefix": "", "suffix": "", "rotation": 0, "_centerAnchor": True,
    }
    el.update(extra)
    return el


LINHA = {"Nome": "NOME MUITO COMPRIDO PARA O ESPACO"}


def test_sem_largura_nao_muda_nada():
    doc, page = _desenhar(_el_base(), LINHA)
    livre = _larguras_das_linhas(page)
    assert len(livre) == 1
    assert livre[0] > 20 * MM2PT  # sem limite, estoura os 20 mm de proposito


def test_shrink_o_texto_cabe_na_largura():
    doc, page = _desenhar(_el_base(max_width_mm=20, overflow="shrink"), LINHA)
    larguras = _larguras_das_linhas(page)
    assert len(larguras) == 1
    assert larguras[0] <= 20 * MM2PT * 1.02  # 2% de tolerancia de medicao


def test_wrap_quebra_e_cada_linha_cabe():
    doc, page = _desenhar(_el_base(max_width_mm=25, overflow="wrap"), LINHA)
    larguras = _larguras_das_linhas(page)
    assert len(larguras) > 1
    for w in larguras:
        assert w <= 25 * MM2PT * 1.02


def test_alinhamento_esquerda_encosta_na_borda_da_caixa():
    cx = 70 * MM2PT
    caixa = 40 * MM2PT
    doc, page = _desenhar(
        _el_base(max_width_mm=40, overflow="wrap", text_align="left",
                 csv_column="Nome"),
        {"Nome": "Ana Bia Carlos"})
    xs = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            xs.append(min(s["bbox"][0] for s in l["spans"]))
    for x0 in xs:
        assert abs(x0 - (cx - caixa / 2)) < 2.0  # toda linha nasce na borda esquerda
```

Nota: se o Step 1 mostrar que `_render_element` converte `x_mm` de outro jeito (ex.: cx vem de `el_x + w/2`), ajustar a constante `cx` do último teste para a mesma conta — o teste deve espelhar a geometria real, não forçá-la.

- [ ] **Step 3: Rodar e ver falhar**

Run: `python -m pytest tests/test_engine_largura_maxima.py -q`
Expected: FAIL nos testes de shrink/wrap/alinhamento (o de "sem largura" já passa — comportamento atual).

- [ ] **Step 4: Aplicar o ajuste no `_render_element`**

Em `engine.py`, dentro do ramo `if t in ("TEXT", "FIXED") or ...` (linha ~586), DEPOIS do bloco que monta `insert_kwargs` (termina ~693) e ANTES do comentário "Medir largura real do texto" (~695), inserir:

```python
            # ── Largura maxima do elemento (max_width_mm) ─────────────────
            # Ajusta ANTES de line_height/baseline: shrink muda o corpo,
            # wrap muda as linhas. Espelho exato do frontend
            # (window.desenharTextoAjustado em frontend/texto-ajuste.js).
            try:
                _max_w_mm = float(el.get("max_width_mm") or 0)
            except (TypeError, ValueError):
                _max_w_mm = 0.0
            _align = None
            if _max_w_mm > 0:
                if font_file:
                    _medir = lambda s, fs: fs * 0.55 * len(s)
                else:
                    _medir = lambda s, fs: fitz.get_text_length(
                        s, fontname=font_name, fontsize=fs)
                _modo = "wrap" if el.get("overflow") == "wrap" else "shrink"
                font_size, _linhas_aj = _ajustar_texto_na_largura(
                    _medir, val_str, font_size, _max_w_mm * MM2PT, _modo)
                insert_kwargs["fontsize"] = font_size
                val_str = "\n".join(_linhas_aj)
                _align = el.get("text_align")
```

E no laço de linhas (~737-748), trocar a linha `origin_x = cx - text_width / 2.0` por:

```python
                if _align == "left":
                    origin_x = cx - (_max_w_mm * MM2PT) / 2.0
                elif _align == "right":
                    origin_x = cx + (_max_w_mm * MM2PT) / 2.0 - text_width
                else:
                    origin_x = cx - text_width / 2.0
```

Atenção: `_align`/`_max_w_mm` são definidos SEMPRE (com `_align = None` e `0.0` como padrão) antes do `if _max_w_mm > 0`, para o laço não quebrar quando não há largura.

- [ ] **Step 5: Rodar e ver passar**

Run: `python -m pytest tests/test_engine_largura_maxima.py tests/test_engine_ajuste_texto.py -q`
Expected: tudo verde.

- [ ] **Step 6: Suíte completa e commit**

Run: `python -m pytest tests/ -q` — Expected: tudo verde.

```bash
git add engine.py tests/test_engine_largura_maxima.py
git commit -m "feat(engine): max_width_mm com shrink/wrap e alinhamento no elemento de texto"
```

---

### Task 3: Frontend — `frontend/texto-ajuste.js` (espelho JS + desenhador comum)

**Files:**
- Create: `frontend/texto-ajuste.js`
- Modify: `frontend/index.html` (tag `<script>` antes da tag do `script.js`)
- Modify: `frontend/cliente.html` (tag `<script>` antes da tag do `cliente.js`)

**Interfaces:**
- Produces:
  - `window.ajustarTextoNaLargura(medir, texto, corpo, larguraMax, modo) -> {corpo, linhas}` — espelho exato do Python.
  - `window.desenharTextoAjustado(ctx, el, label, fsBase, pxPorMm, montarFonte) -> {corpo, linhas, larguraPx}` — desenha o texto (com ajuste, alinhamento e multilinha 1.2) ancorado no centro (0,0), assumindo o `ctx` já transladado/rotacionado. `montarFonte(fsPx) -> string` monta o valor de `ctx.font`. Devolve também `larguraPx` (linha mais larga no corpo final) para sublinhado de seleção e hit-box.
- Consumido por: Tasks 6 e 7 (todos os renderizadores).

- [ ] **Step 1: Criar o arquivo**

```javascript
// texto-ajuste.js — ajuste de texto variavel a um espaco de largura fixa.
//
// window.ajustarTextoNaLargura e ESPELHO EXATO de _ajustar_texto_na_largura
// do engine.py: mudou aqui, muda la, senao a tela quebra a linha num lugar e
// o papel em outro. Folga de 0,5% pela mesma razao (reguas diferentes).
// Arquivo proprio (padrao csv-editor.js) porque index.html e cliente.html
// carregam scripts distintos e uma copia em cada um driftaria.

(function () {
    'use strict';

    function ajustarTextoNaLargura(medir, texto, corpo, larguraMax, modo) {
        const paragrafos = String(texto).split('\n');
        larguraMax = Number(larguraMax) || 0;
        corpo = Number(corpo) || 0;
        if (larguraMax <= 0 || corpo <= 0) return { corpo: corpo, linhas: paragrafos };
        const alvo = larguraMax * 0.995;

        if (modo === 'wrap') {
            const linhas = [];
            for (const p of paragrafos) {
                if (!p) { linhas.push(''); continue; }
                let atual = '';
                for (let palavra of p.split(' ')) {
                    while (palavra.length > 1 && medir(palavra, corpo) > alvo) {
                        if (atual) { linhas.push(atual); atual = ''; }
                        let corte = palavra.length - 1;
                        while (corte > 1 && medir(palavra.slice(0, corte), corpo) > alvo) corte--;
                        linhas.push(palavra.slice(0, corte));
                        palavra = palavra.slice(corte);
                    }
                    const tentativa = atual ? atual + ' ' + palavra : palavra;
                    if (atual && medir(tentativa, corpo) > alvo) {
                        linhas.push(atual);
                        atual = palavra;
                    } else {
                        atual = tentativa;
                    }
                }
                linhas.push(atual);
            }
            return { corpo: corpo, linhas: linhas };
        }

        // shrink (padrao): largura de texto e linear no corpo — uma divisao basta.
        let maior = 0;
        for (const p of paragrafos) {
            const w = medir(p, corpo);
            if (w > maior) maior = w;
        }
        if (maior > alvo) return { corpo: corpo * (alvo / maior), linhas: paragrafos };
        return { corpo: corpo, linhas: paragrafos };
    }

    function desenharTextoAjustado(ctx, el, label, fsBase, pxPorMm, montarFonte) {
        const maxPx = (el && Number(el.max_width_mm) > 0) ? Number(el.max_width_mm) * pxPorMm : 0;
        const medir = function (t, fs) { ctx.font = montarFonte(fs); return ctx.measureText(t).width; };
        const modo = (el && el.overflow === 'wrap') ? 'wrap' : 'shrink';
        const aj = ajustarTextoNaLargura(medir, label, fsBase, maxPx, modo);

        ctx.font = montarFonte(aj.corpo);
        let larguraPx = 0;
        for (const linha of aj.linhas) {
            const w = ctx.measureText(linha).width;
            if (w > larguraPx) larguraPx = w;
        }

        let alinhar = 'center', xTexto = 0;
        if (maxPx > 0 && el.text_align === 'left') { alinhar = 'left'; xTexto = -maxPx / 2; }
        else if (maxPx > 0 && el.text_align === 'right') { alinhar = 'right'; xTexto = maxPx / 2; }

        ctx.textAlign = alinhar;
        ctx.textBaseline = 'middle';
        const lineHeight = aj.corpo * 1.2;   // igual ao engine.py
        if (aj.linhas.length > 1) {
            const totalH = aj.linhas.length * lineHeight;
            const blockTop = -totalH / 2;
            aj.linhas.forEach(function (linha, i) {
                ctx.fillText(linha, xTexto, blockTop + i * lineHeight + lineHeight / 2);
            });
        } else {
            ctx.fillText(aj.linhas[0], xTexto, 0);
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        return { corpo: aj.corpo, linhas: aj.linhas, larguraPx: larguraPx };
    }

    window.ajustarTextoNaLargura = ajustarTextoNaLargura;
    window.desenharTextoAjustado = desenharTextoAjustado;
})();
```

- [ ] **Step 2: Smoke test no node (espelha os casos do pytest)**

Run (Git Bash, na raiz):

```bash
node -e "
global.window = {};
require('./frontend/texto-ajuste.js');
const f = window.ajustarTextoNaLargura;
const medir = (t, c) => t.length * c * 0.5;          // regua sintetica linear
const ok = (nome, cond) => { if (!cond) { console.error('FALHOU: ' + nome); process.exit(1); } };

let r = f(medir, 'ABCDEFGHIJ', 10, 0, 'shrink');
ok('sem largura intacto', r.corpo === 10 && r.linhas.join() === 'ABCDEFGHIJ');

r = f(medir, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 10, 100, 'shrink');  // 150 > 99.5
ok('shrink reduz', r.corpo < 10 && medir(r.linhas[0], r.corpo) <= 100);

r = f(medir, 'AAAA BBBB CCCC', 10, 25, 'wrap');       // cada palavra = 20
ok('wrap por palavra', r.corpo === 10 && r.linhas.length === 3);

r = f(medir, 'AAAAAAAAAA', 10, 12, 'wrap');           // palavra 50 > 11.94
ok('wrap por caractere', r.linhas.length > 1 && r.linhas.join('') === 'AAAAAAAAAA');

r = f(medir, 'A\n\nB', 10, 500, 'wrap');
ok('paragrafo vazio', JSON.stringify(r.linhas) === JSON.stringify(['A','','B']));
console.log('texto-ajuste.js OK');
"
```

Expected: `texto-ajuste.js OK`

- [ ] **Step 3: Incluir nos dois HTML**

Em `frontend/index.html`, localizar a tag que carrega `script.js` e inserir NA LINHA ANTERIOR:

```html
<script src="texto-ajuste.js"></script>
```

Em `frontend/cliente.html`, mesma coisa antes da tag do `cliente.js`. Conferir o padrão de caminho das tags vizinhas (se usam `/app/...` ou relativo) e seguir o mesmo.

- [ ] **Step 4: Commit**

```bash
git add frontend/texto-ajuste.js frontend/index.html frontend/cliente.html
git commit -m "feat(front): texto-ajuste.js - ajuste de texto a largura maxima, espelho do engine"
```

---

### Task 4: Editor — Travar elemento (`locked`)

**Files:**
- Modify: `frontend/script.js` — `onCanvasMouseDown` (~4141), `alignSelectedElement` (~4467), `renderElementsList` (templates dos cartões, ~5334 PICOTE e ~5576 comum), novas funções perto de `window.updateEl` (~5755)

**Interfaces:**
- Produces: `window.toggleElLock(id)`, `avisarElementoTravado()` (interna). Campo `el.locked`.
- Regras: seleção com QUALQUER elemento travado não inicia arrasto (grupo inteiro parado + toast); alinhamento pula travados e avisa se todos estavam travados; campos do cartão continuam editáveis; duplicar copia a trava.

- [ ] **Step 1: Funções novas**

Em `frontend/script.js`, logo antes de `window.updateEl` (~5755), inserir:

```javascript
let _ultimoAvisoTravado = 0;
function avisarElementoTravado() {
    const agora = Date.now();
    if (agora - _ultimoAvisoTravado < 2500) return;   // não metralhar a cada mousedown
    _ultimoAvisoTravado = agora;
    toast('🔒 Elemento travado — destrave no cartão para mover', 'error');
}

window.toggleElLock = function (id) {
    const el = state.numElements.find(e => e.id === id);
    if (!el) return;
    if (el.locked) delete el.locked; else el.locked = true;
    saveNumHistory();
    renderElementsList();
    drawCanvas();
};
```

- [ ] **Step 2: Filtrar o arrasto em `onCanvasMouseDown`**

Substituir o bloco que monta `state.dragging` (linhas ~4140-4152):

```javascript
        // Configurar o arraste para todos os elementos atualmente selecionados
        state.dragging = {
            targets: state.selectedElIds.map(id => {
                const el = state.numElements.find(item => item.id === id);
                return el ? {
                    elId: id,
                    startX: el.x_mm,
                    startY: el.y_mm
                } : null;
            }).filter(Boolean),
            downX: x,
            downY: y
        };
```

por:

```javascript
        // Configurar o arraste para todos os elementos atualmente selecionados.
        // Travado não arrasta — e seleção/grupo com UM travado para inteira,
        // senão o arrasto quebraria o layout relativo do grupo.
        const alvosSelecionados = state.selectedElIds
            .map(id => state.numElements.find(item => item.id === id))
            .filter(Boolean);
        if (alvosSelecionados.some(el => el.locked)) {
            state.dragging = null;
            avisarElementoTravado();
        } else {
            state.dragging = {
                targets: alvosSelecionados.map(el => ({
                    elId: el.id,
                    startX: el.x_mm,
                    startY: el.y_mm
                })),
                downX: x,
                downY: y
            };
        }
```

- [ ] **Step 3: Alinhamento pula travados**

Em `alignSelectedElement` (~4467): antes do forEach, `let pulados = 0;`. Na primeira linha do corpo do forEach, depois de `if (!el) return;`, inserir `if (el.locked) { pulados++; return; }`. Depois do forEach, antes de `if (mutated) saveNumHistory();`, inserir:

```javascript
    if (pulados > 0 && !mutated) avisarElementoTravado();
```

- [ ] **Step 4: Botão nos dois templates de cartão**

No template comum (~5590, o `<div style="display:flex; gap:4px;">` com Duplicar/Excluir), inserir ANTES do botão Duplicar:

```javascript
                    <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 1rem;${el.locked ? 'color:#f59e0b;border-color:#f59e0b;' : ''}" onclick="toggleElLock('${el.id}');event.stopPropagation()" title="${el.locked ? 'Travado: não é arrastado no desenho. Clique para destravar.' : 'Clique para travar e impedir arrasto por engano. Os campos continuam editáveis.'}">${el.locked ? '🔒 Travado' : '🔓'}</button>
```

No template do PICOTE (~5346, mesmo `<div style="display:flex; gap:4px;">`), inserir o MESMO botão (copiar o snippet acima).

- [ ] **Step 5: Verificação manual mínima + commit**

Run: `node --check frontend/script.js`
Expected: sem erro de sintaxe.

```bash
git add frontend/script.js
git commit -m "feat(editor): travar elemento - bloqueia arrasto e alinhamento, nao a edicao"
```

---

### Task 5: Editor — Frente/trás (ordem de sobreposição)

**Files:**
- Modify: `frontend/script.js` — nova função perto de `window.toggleElLock` (Task 4), botões nos dois templates de cartão

**Interfaces:**
- Produces: `window.moverElOrdem(id, direcao)` com `direcao` `'frente'` ou `'tras'` — troca o elemento com o vizinho no array `state.numElements` (array = ordem de desenho em TODOS os renderizadores e no engine; nada mais muda).

- [ ] **Step 1: Função**

Logo após `window.toggleElLock`, inserir:

```javascript
window.moverElOrdem = function (id, direcao) {
    // A ordem do array E a ordem de desenho (tela, papel e hit-test):
    // trocar de posicao aqui muda a sobreposicao em todas as janelas.
    const i = state.numElements.findIndex(e => e.id === id);
    if (i < 0) return;
    const j = direcao === 'frente' ? i + 1 : i - 1;
    if (j < 0 || j >= state.numElements.length) {
        toast(direcao === 'frente' ? 'Já está na frente de todos' : 'Já está atrás de todos');
        return;
    }
    const tmp = state.numElements[i];
    state.numElements[i] = state.numElements[j];
    state.numElements[j] = tmp;
    saveNumHistory();
    drawCanvas();
};
```

- [ ] **Step 2: Botões nos dois templates**

Nos MESMOS `<div style="display:flex; gap:4px;">` da Task 4 (template comum e PICOTE), inserir antes do botão de travar:

```javascript
                    <button class="btn btn-secondary btn-sm" style="padding: 2px 8px;" onclick="moverElOrdem('${el.id}','frente');event.stopPropagation()" title="Trazer para frente: este elemento passa a ficar POR CIMA na sobreposição">⬆</button>
                    <button class="btn btn-secondary btn-sm" style="padding: 2px 8px;" onclick="moverElOrdem('${el.id}','tras');event.stopPropagation()" title="Enviar para trás: este elemento passa a ficar POR BAIXO na sobreposição">⬇</button>
```

- [ ] **Step 3: Verificação + commit**

Run: `node --check frontend/script.js`
Expected: sem erro.

```bash
git add frontend/script.js
git commit -m "feat(editor): trazer para frente / enviar para tras nos cartoes de elemento"
```

---

### Task 6: Editor — caixa 📏 no cartão TEXT + desenho com ajuste no canvas do editor

**Files:**
- Modify: `frontend/script.js` — template do cartão (~5658-5680, bloco "Coluna do CSV"), `updateElSource` (~5830), `drawElement` ramo texto (~3694-3778), `getElementSizeMM` (~4384-4451)

**Interfaces:**
- Consumes: `window.desenharTextoAjustado`, `window.ajustarTextoNaLargura` (Task 3).
- Produces: UI grava `el.max_width_mm` (número; 0 = livre), `el.overflow`, `el.text_align` — só em elementos `TEXT` com `source === 'database'`.

- [ ] **Step 1: Caixa 📏 no template**

Em `renderElementsList`, logo DEPOIS do `</div>` do form-group "Coluna do CSV" (~5678) e ainda DENTRO do bloco `${(el.type !== 'FIXED' && el.type !== 'SVG') ? ... }`, inserir:

```javascript
                ${el.type === 'TEXT' ? `
                <div class="form-group el-full" style="${el.source === 'database' ? '' : 'display:none;'} background: rgba(0,168,255,0.05); border-radius: 6px; padding: 8px;">
                    <label>📏 Espaço do texto (dado variável)</label>
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 4px;">
                        <div>
                            <label style="font-size:0.72rem;">Largura máxima (mm)</label>
                            <input class="form-control" type="number" min="0" max="1000" step="0.5" value="${el.max_width_mm > 0 ? el.max_width_mm : ''}" placeholder="livre" onchange="updateEl('${el.id}','max_width_mm', this.value === '' ? 0 : Math.max(0, +this.value))">
                        </div>
                        <div>
                            <label style="font-size:0.72rem;">Se não couber</label>
                            <select class="form-control" onchange="updateEl('${el.id}','overflow',this.value)">
                                <option value="shrink" ${el.overflow !== 'wrap' ? 'selected' : ''}>Reduzir a fonte até caber</option>
                                <option value="wrap" ${el.overflow === 'wrap' ? 'selected' : ''}>Quebrar em linhas</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.72rem;">Alinhamento</label>
                            <select class="form-control" onchange="updateEl('${el.id}','text_align',this.value)">
                                <option value="center" ${!el.text_align || el.text_align === 'center' ? 'selected' : ''}>Centro</option>
                                <option value="left" ${el.text_align === 'left' ? 'selected' : ''}>Esquerda</option>
                                <option value="right" ${el.text_align === 'right' ? 'selected' : ''}>Direita</option>
                            </select>
                        </div>
                    </div>
                    <div style="font-size:0.72rem; color:var(--text-dim); margin-top:4px;">
                        Deixe vazio para texto livre. Com largura definida, o dado que não couber reduz a fonte ou quebra a linha — igual na tela e na impressão. Com o elemento selecionado, o espaço aparece tracejado no desenho.
                    </div>
                </div>
                ` : ''}
```

- [ ] **Step 2: `updateElSource` limpa os campos ao sair de "database"**

Dentro do `if (value !== 'database') {` (~5838), junto do `delete el.csv_column;`, acrescentar:

```javascript
        delete el.max_width_mm;
        delete el.overflow;
        delete el.text_align;
```

- [ ] **Step 3: `drawElement` desenha via `desenharTextoAjustado` + guia tracejada**

No ramo texto de `drawElement` (~3739-3778), substituir TODO o bloco de desenho (do `ctx.textAlign = 'center';` até o `ctx.textBaseline = 'alphabetic';` finais, MANTENDO o cálculo de `label` acima intacto) por:

```javascript
        // Desenho centralizado (multilinha 1.2 = engine.py) com ajuste de
        // largura maxima — a mesma funcao usada por todas as janelas.
        const aj = window.desenharTextoAjustado(
            ctx, el, label, fs, S,
            (fsPx) => buildCanvasFont(fsPx, el.font_name)
        );

        // Guia do espaço delimitado: só no editor e só com o elemento selecionado.
        if (isSelected && Number(el.max_width_mm) > 0) {
            const guiaW = el.max_width_mm * S;
            const guiaH = Math.max(aj.linhas.length * aj.corpo * 1.2, aj.corpo * 1.2);
            ctx.strokeStyle = 'rgba(59,130,246,0.55)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 3]);
            ctx.strokeRect(-guiaW / 2, -guiaH / 2, guiaW, guiaH);
            ctx.setLineDash([]);
        }

        // Indicador de seleção: underline sutil (sem box tracejado)
        if (isSelected) {
            const mw = aj.larguraPx;
            const halfH = aj.linhas.length > 1 ? (aj.linhas.length * aj.corpo * 1.2) / 2 : aj.corpo / 2;
            ctx.strokeStyle = el.locked ? '#f59e0b' : '#3b82f6';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-mw / 2, halfH + 3);
            ctx.lineTo(mw / 2, halfH + 3);
            ctx.stroke();
        }
```

(O underline âmbar para `locked` é o aviso visual da trava no canvas.)

- [ ] **Step 4: `getElementSizeMM` respeita a largura máxima**

No ramo texto (~4430-4441), depois de `w = mw_px / S; h = el.font_size / 2.8346;`, inserir:

```javascript
            // Largura maxima: a caixa de clique/alinhamento nao passa do espaço,
            // e a altura acompanha as linhas quebradas.
            if (Number(el.max_width_mm) > 0 && typeof window.ajustarTextoNaLargura === 'function') {
                const maxPx = el.max_width_mm * S;
                const medir = (t, fsPx) => { ctx.font = buildCanvasFont(fsPx, el.font_name); return ctx.measureText(t).width; };
                const aj = window.ajustarTextoNaLargura(medir, label, fs, maxPx, el.overflow === 'wrap' ? 'wrap' : 'shrink');
                w = Math.min(w, el.max_width_mm);
                h = aj.linhas.length > 1 ? (aj.linhas.length * aj.corpo * 1.2) / S : aj.corpo / S;
            }
```

(Este trecho fica ANTES do `ctx.restore()` do ramo.)

- [ ] **Step 5: Verificação + commit**

Run: `node --check frontend/script.js`
Expected: sem erro.

```bash
git add frontend/script.js
git commit -m "feat(editor): caixa Espaco do texto (largura maxima) e desenho ajustado no canvas"
```

---

### Task 7: Os outros nove renderizadores passam pelo `desenharTextoAjustado`

**Files:**
- Modify: `frontend/script.js` — `drawVdpElements` (~7707), `onAmostraNumeracaoSelect` (~14720), `drawNumeracaoElementsOverCanvas` (~23627), `drawAmostraFace` (~24370), `criarCanvasNumeracaoRasterizada` (~29405)
- Modify: `frontend/pedido.js` — `drawVdpElements` (~1804)
- Modify: `frontend/cliente.js` — `drawAmostraFace` (~2660), `drawNumeracaoElementsOverCanvas` (~3120)
- Modify: `frontend/criador-arte.js` — `renderEditorLayer2Numeracao` (~633)

**Interfaces:**
- Consumes: `window.desenharTextoAjustado(ctx, el, label, fsBase, pxPorMm, montarFonte)` (Task 3).

Em CADA sítio, substituir o bloco de desenho do ramo da família texto — de `ctx.textAlign = 'center'` (inclusive) até `ctx.textBaseline = 'alphabetic'` (inclusive; nos sítios que não restauram, até o fim do `fillText`/`else`) — pela chamada única, SEM tocar no cálculo do `label`/`val_str` acima. O fator px/mm de cada sítio (derivado da conversão que o próprio sítio já usa para `x_mm`/`font_size`):

| Sítio | ctx | corpo base | pxPorMm | montarFonte |
|---|---|---|---|---|
| script.js `drawVdpElements` ~7707 | `ctx` | `fs` (= pt × scale) | `scale * 2.8346` | `(f) => buildCanvasFont(f, el.font_name)` |
| script.js `onAmostraNumeracaoSelect` ~14771 | `ctx` | `fs` | `S` | idem |
| script.js `drawNumeracaoElementsOverCanvas` ~23680 | `ctx` | `fs` | `Sx` (horizontal; `x = el.x_mm * Sx`) | `(f) => typeof buildCanvasFont === 'function' ? buildCanvasFont(f, el.font_name) : f + 'px ' + (el.font_name \|\| 'monospace')` |
| script.js `drawAmostraFace` ~24425 | `numCtx` | `fs` | `S` | idem (com fallback) |
| script.js `criarCanvasNumeracaoRasterizada` ~29405 | `numCtx` | `fs` | `S` | idem (com fallback) |
| pedido.js `drawVdpElements` ~1812 | `ctx` | `fs` (= pt × scale) | `scale * 2.8346` | `(f) => buildCanvasFont(f, el.font_name)` |
| cliente.js `drawAmostraFace` | `numCtx` (conferir nome local) | `fs` | `S` | conferir se cliente.js tem `buildCanvasFont`; usar o mesmo builder que a linha `ctx.font = ...` original usava |
| cliente.js `drawNumeracaoElementsOverCanvas` | `ctx` (conferir) | `fs` | `Sx` (conferir nome) | idem |
| criador-arte.js `renderEditorLayer2Numeracao` ~633 | `ctx` | `fs` | `scalePx` | `(f) => typeof buildCanvasFont === 'function' ? buildCanvasFont(f, el.font_name) : f + 'px ' + (el.font_name \|\| 'monospace')` |

- [ ] **Step 1: script.js — os cinco sítios**

Forma da substituição (exemplo com `drawVdpElements`; nos demais trocar ctx/fator conforme a tabela). O bloco atual:

```javascript
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        // ... fillText simples ou laço de 2+ linhas ...
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'alphabetic';
```

vira:

```javascript
                        window.desenharTextoAjustado(
                            ctx, el, val_str, fs, scale * 2.8346,
                            (f) => buildCanvasFont(f, el.font_name)
                        );
```

Atenções pontuais:
- Em `onAmostraNumeracaoSelect` (~14773) o bloco atual só desenha `lines[0]`/`lines[1]` com passo `fs` (mais apertado que o papel). A troca pela função comum CORRIGE isso de tabela — é esperado que TEATRO_COMBO de 2 linhas fique 20% mais espaçado, igual ao engine.
- Em `drawAmostraFace` e `criarCanvasNumeracaoRasterizada` o nome do contexto é `numCtx`, não `ctx`.
- A variável do rótulo é `label` em uns sítios e `val_str` em outros — usar a do sítio.
- NÃO mexer nos ramos QR/BARCODE/SVG/PDF/PICOTE.

- [ ] **Step 2: pedido.js, cliente.js e criador-arte.js**

Mesma substituição nos quatro sítios restantes, conforme a tabela. Em `cliente.js`, conferir ANTES os nomes locais (`ctx` vs `numCtx`, `S` vs `Sx`, builder de fonte) lendo o bloco em volta das linhas 2660-2700 e 3120-3160 — os dois são cópias declaradas do `script.js`, a estrutura é a mesma.

- [ ] **Step 3: Sintaxe dos quatro arquivos**

Run: `node --check frontend/script.js && node --check frontend/pedido.js && node --check frontend/cliente.js && node --check frontend/criador-arte.js`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add frontend/script.js frontend/pedido.js frontend/cliente.js frontend/criador-arte.js
git commit -m "feat(front): todas as janelas desenham texto de banco com ajuste de largura"
```

---

### Task 8: Verificação de ponta a ponta, docs e fechamento

**Files:**
- Modify: `docs/lista_de_numeracoes.md` (seção curta: travar, frente/trás, espaço do texto)
- Modify: `docs/superpowers/specs/2026-08-12-travar-zorder-largura-maxima-design.md` (trocar "cópia no cliente.js" por "arquivo compartilhado frontend/texto-ajuste.js")
- Modify: `CHANGELOG.md` (se existir na raiz ou em docs/ — conferir com `ls` e seguir o formato das entradas anteriores)

- [ ] **Step 1: Suíte Python completa**

Run: `python -m pytest tests/ -q`
Expected: tudo verde (as suítes novas inclusas).

- [ ] **Step 2: Verificação visual com a skill `rodar-app`**

Usar a skill `rodar-app` para subir o app e, via Puppeteer (lembrar: dentro de `page.evaluate` usar `state` nu, nunca `window.state`):

1. Abrir o editor de numeração, semear um CSV (`state.numCsvHeaders = ['Nome']; state.numCsvData = [{Nome: 'NOME MUITO COMPRIDO PARA CABER NO ESPACO'}]`) e criar elemento TEXT `source: 'database'`, `csv_column: 'Nome'`.
2. Definir `max_width_mm = 20` + `overflow = 'shrink'` via cartão; screenshot: o texto deve caber e a guia tracejada aparecer com o elemento selecionado.
3. Trocar para `overflow = 'wrap'`; screenshot: o texto quebra em linhas dentro da guia.
4. Travar o elemento (🔒) e arrastar no canvas: a posição (`el.x_mm`) NÃO muda e o toast aparece; destravar e arrastar: muda.
5. Criar dois elementos sobrepostos e clicar ⬆/⬇: a ordem em `state.numElements` muda (conferir por `evaluate`).
6. Conferir o card do pedido (Lista de Arte) com a mesma numeração: o desenho da amostra respeita a largura (é o renderizador canônico `drawAmostraFace`).

Expected: os seis pontos confirmados (screenshots nos passos 2, 3 e 6).

- [ ] **Step 3: Docs**

- `docs/lista_de_numeracoes.md`: acrescentar seção curta descrevendo os três recursos, os campos novos do elemento e a regra "array = ordem de desenho" (com a observação de que o ajuste vive em `frontend/texto-ajuste.js` + `_ajustar_texto_na_largura` no engine e que os dois são espelhos).
- Spec: ajustar a linha da "cópia no cliente.js" para o arquivo compartilhado.
- CHANGELOG: entrada no formato do arquivo.

- [ ] **Step 4: Commit final e recado de publicação**

```bash
git add docs/ CHANGELOG.md
git commit -m "docs: travar, frente/tras e largura maxima de coluna CSV"
```

Avisar o usuário: mudança toca `engine.py` ⇒ quando ele decidir publicar, é `.\publicar.ps1 "..."` E `.\publicar_agente.ps1 <versão nova>` na mesma leva (regra permanente do projeto). NÃO publicar por conta própria.
