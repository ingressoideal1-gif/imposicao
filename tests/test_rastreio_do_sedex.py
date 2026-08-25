# -*- coding: utf-8 -*-
"""O número do conhecimento do SEDEX, clicável, na coluna Frete do Acabamento.

Pedido do usuário em 25/08/2026: *"quando já existir o link do número de
conhecimento do sedex, ao clicar abrir o rastreamento"*.

## O que já existia, e o que faltava

O código de rastreio já virava link — mas **só na aba de Entrega do link do
cliente**, onde eu o havia posto em 20/08/2026. Conferido no navegador antes de
escrever qualquer linha, no pedido 20975: `AD831882537BR ↗` apontando para
`rastreamento.correios.com.br` (HTTP 200).

Quem posta o pacote, porém, é a **gráfica** — e ela não via o código em tela
nenhuma. Uma varredura por `codigo_rastreamento` no `frontend/` devolvia um
arquivo só: `cliente-entrega.js`.

## Onde ele passou a aparecer

Na coluna **Frete** do Painel do Acabamento, embaixo da logo da transportadora.
É a tela onde o pedido é entregue à expedição (o botão EXPEDIÇÃO) e onde fica a
lista do que já foi despachado.

Sem código, **nada** é desenhado no lugar. Um traço embaixo da logo se leria como
"sem rastreio", quando a verdade é "ainda não despachou" — e é o estado da
maioria dos pedidos dessa tela.

## Duas decisões que os testes prendem

**A função mudou de casa.** `linkDeRastreio` saiu do `cliente-dados.js` e foi
para o `logo-do-frete.js`, que é o módulo que as duas telas já carregam e o lugar
temático — ali mora o que sabe de transportadora. Duas telas montando o endereço
dos Correios por conta própria é a mesma armadilha da regra de "pago", resolvida
do mesmo jeito.

**A consulta não é nova.** `propostas_os` já era lida no `loadOrdensFromVibecode`
pelo prazo de entrega; bastou pedir mais uma coluna. Uma segunda ida ao banco por
um campo de treze caracteres seria desperdício num painel que abre com milhares
de pedidos.
"""
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "logo_do_frete_harness.js")


def _ler(nome):
    with open(os.path.join(RAIZ, nome), encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_logo_do_frete_passa():
    """Ele cobre a logo e, desde 25/08/2026, o rastreio.

    Até este arquivo existir, o harness era ÓRFÃO: nenhum `test_*.py` o chamava,
    então as 31 conferências dele só rodavam se alguém digitasse `node` à mão.
    Um teste que não roda não prende nada.
    """
    assert os.path.exists(HARNESS), "o harness da logo do frete sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, "o harness falhou:\n" + saida
    assert "OK:" in saida, "o harness nao relatou sucesso:\n" + saida


def test_o_rastreio_mora_no_modulo_compartilhado():
    """Duas telas, uma definição do endereço dos Correios."""
    logo = _ler("frontend/logo-do-frete.js")
    dados = _ler("frontend/cliente-dados.js")

    assert "function linkDeRastreio(" in logo, "a função mora no módulo do frete"
    assert "function rastreioHtml(" in logo, "e o HTML do link também"
    assert "function linkDeRastreio(" not in dados, (
        "ela não pode ter ficado duplicada no cliente-dados.js"
    )
    assert "rastreamento.correios" not in dados, (
        "nem o endereço dos Correios solto por lá"
    )


def test_as_tres_paginas_carregam_o_modulo():
    """Arquivo não declarado no HTML é uma função que não existe na hora de desenhar."""
    for pagina in ("frontend/index.html", "frontend/producao.html", "frontend/cliente.html"):
        assert "logo-do-frete.js" in _ler(pagina), pagina + " nao carrega o modulo"

    import security_config
    assert "logo-do-frete.js" in security_config.PAINEL_ARQUIVOS, (
        "fora da lista de sincronismo, a estacao serviria a pagina com um 404"
    )


def test_o_painel_traz_o_codigo_na_consulta_que_ja_fazia():
    """Sem coluna nova na consulta, o painel nunca teria o número para mostrar."""
    script = _ler("frontend/script.js")

    assert re.search(
        r"\.from\('propostas_os'\)\s*\n\s*\.select\('id_int, data_termino, codigo_rastreamento'\)",
        script,
    ), "a consulta de `propostas_os` precisa trazer o codigo junto do prazo"

    assert "rastreioPorPedido[String(linha.id_int)] = codigo" in script, (
        "e guardar por pedido"
    )
    assert "codigo_rastreamento: rastreioPorPedido[String(key)] || null" in script, (
        "o pedido montado precisa carregar o codigo"
    )


def test_a_coluna_frete_do_acabamento_mostra_o_codigo():
    acabamento = _ler("frontend/acabamento.js")

    assert "rastreioHtml(os.codigo_rastreamento" in acabamento, (
        "a celula usa a funcao compartilhada, e nao monta o link por conta propria"
    )
    assert "typeof rastreioHtml === 'function'" in acabamento, (
        "com guarda: numa estacao com o arquivo antigo, a coluna de frete inteira "
        "sumiria se a funcao nao existisse"
    )
    assert "rastreamento.correios" not in acabamento, (
        "o endereco dos Correios nao se repete aqui"
    )
