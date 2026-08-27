# -*- coding: utf-8 -*-
"""Os cards de setor somam, nos dois paineis (21/08/2026).

Pedido do usuario: "tanto no painel de Acabamento quanto no Painel de Producao,
os cards dos Setores, permitir selecionar mais de 1 card por vez, listando os
pedidos dos cards somados".

Antes, clicar num card TROCAVA o setor escolhido: ver Flexo e PVC juntos era
impossivel. Agora os cards ligam e desligam, e a lista mostra a SOMA -- o pedido
entra se tiver item em qualquer um dos setores acesos.

Soma, e nao intersecao: exigir item nos dois setores ao mesmo tempo seria raro
e nao e o que o operador quer ver.

O grosso das regras e medido pelo harness em Node, que recorta as funcoes do
`script.js` de verdade e as executa. O que fica aqui e a LIGACAO -- que o HTML
dos dois paineis diz de quem e cada card, e que nada no repositorio ainda le o
filtro no formato antigo.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "setores_somados_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_dos_setores_somados_passa():
    assert os.path.exists(HARNESS), "o harness dos setores sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_os_dois_paineis_tem_a_mesma_regra():
    """As duas telas somam do mesmo jeito, e cada uma no seu estado.

    O Acabamento nao pode compartilhar `state.filtroSetores` com a Producao: sao
    dois recortes independentes, e um mexeria no outro. E a mesma razao pela
    qual a tela do acabamento guarda os proprios filtros desde que nasceu.
    """
    script = _ler("frontend/script.js")
    acab = _ler("frontend/acabamento.js")

    assert "state.filtroSetores" in script, "a Producao perdeu a lista de setores"
    assert "tela.setores" in acab, "o Acabamento perdeu a lista de setores"
    assert "state.filtroSetores" not in acab, (
        "o Acabamento nao pode usar o filtro da Producao: um mexeria no outro"
    )

    # Os dois somam: qualquer setor aceso serve, e nao todos ao mesmo tempo.
    assert "alvos.has(norm(item.setor || ''))" in script

    # No Acabamento a soma passou a correr dentro do RECORTE (27/08/2026): com
    # um card aceso, a linha inteira -- selo, progresso, itens, quantidade --
    # fala so daquele setor. A regra de somar nao mudou; mudou de quem ela
    # decide a vida. O `setorDoModelo` existe porque a lista e desenhada com
    # `modelosGlobais`, que nao traz setor nenhum: ele resolve pelo produto de
    # origem.
    assert "alvos.has(setorDoModelo(m, os))" in acab
    assert "function modelosDoRecorte(os)" in acab


def test_o_filtro_antigo_nao_sobrou_em_lugar_nenhum():
    """`filtroSetor` no singular era texto. Quem o ler agora acha `undefined`,
    e o recorte some sem erro nenhum no console -- o pior tipo de defeito.
    """
    for rel in ("frontend/script.js", "frontend/index.html", "frontend/producao.html"):
        conteudo = _ler(rel)
        for linha in conteudo.splitlines():
            if "filtroSetorArte" in linha:
                continue          # esse e outro filtro, e continua no singular
            assert "state.filtroSetor " not in linha and "state.filtroSetor;" not in linha, (
                "sobrou o filtro antigo em " + rel + ": " + linha.strip()[:100]
            )
            assert "state.filtroSetor)" not in linha, (
                "sobrou o filtro antigo em " + rel + ": " + linha.strip()[:100]
            )


def test_a_tela_diz_que_os_cards_somam():
    """Regra da casa: controle novo precisa se explicar na propria tela.

    A soma nao se descobre olhando -- um card aceso e outro apagado parecem a
    mesma coisa de antes. Por isso a linha de dica embaixo das duas grades.
    """
    html = _ler("frontend/index.html")
    assert html.count("prod-sectors-hint") == 2, "os dois paineis precisam da dica"
    assert "somar os pedidos" in html, "a dica nao diz o que acontece"

    # E o "Todos os Setores" precisa dizer que limpa a escolha.
    assert html.count("Limpar a escolha e mostrar todos os setores") == 2
