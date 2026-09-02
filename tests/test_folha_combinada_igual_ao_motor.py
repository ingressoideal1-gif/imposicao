# -*- coding: utf-8 -*-
"""A janela do Pedido monta a folha combinada como o motor monta.

## O que estava errado (02/09/2026)

Somar modelos numa folha só é o esquema `multi_artes`. O motor o trata como um
esquema simples: enfileira as peças de todos os modelos e as distribui coluna a
coluna, misturando modelos na mesma folha — que é a razão de o recurso existir.

A prévia do Pedido, porém, mandava `multi_artes` para o **plano de montagem**
(`buildStrictAssemblySets`), que reserva uma pilha por modelo. Medido com as
artes do pedido 21408:

| cenário | a prévia mostrava | o motor imprime |
|---|---|---|
| 2 modelos × 2 peças, 4 poses | 2 sets, 1 folha cada, 2 poses usadas | 1 folha, 4 poses |
| 1000739 (25) + 1000740 (20) | Set 1 com 7 folhas só do primeiro, Set 2 com 5 só do segundo | 12 folhas, a primeira já misturada |

O papel sempre saiu certo — conferido rodando o motor. Era a janela que
prometia outra folha.

A prévia **já tinha** o ramo correto escrito, igual ao do motor; ele era
inalcançável, porque o ramo do plano de montagem o interceptava antes.

## Por que a tela de Imposição não tinha o problema

Porque ela nunca chamou o `buildStrictAssemblySets`: em `script.js` o modo
estrito só liga com `cutstackMode === 'strict'`, e o `multi_artes` cai no
mapeamento simples. As duas prévias do projeto discordavam entre si, e a do
Pedido era a que estava fora.

## O que este arquivo guarda

A regra do MOTOR, exercitando-o de verdade, e a forma da tela — que o
`multi_artes` decida antes do modo de cut stack, e que não construa mais plano
de montagem nenhum.
"""
import io
import os

import fitz
import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MM = 2.8346


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _arte(caminho, rotulo, w_mm, h_mm):
    d = fitz.open()
    p = d.new_page(width=w_mm * MM, height=h_mm * MM)
    p.insert_text((10, 40), rotulo, fontsize=22)
    d.save(caminho)
    d.close()


def _impor(tmp_path, q1, q2):
    """Roda o motor no esquema somado e devolve o texto de cada folha, pose a pose."""
    from engine import ImpositionConfig, ImpositionEngine

    a1 = str(tmp_path / "a1.pdf")
    a2 = str(tmp_path / "a2.pdf")
    # Os tamanhos das artes reais do 21408, que sao diferentes entre si
    _arte(a1, "UM", 104.35, 158.35)
    _arte(a2, "DOIS", 110.70, 164.70)

    out = str(tmp_path / "saida.pdf")
    cfg = ImpositionConfig(
        base_file="", out_pdf=out, numeracao=None, seq_start=1, seq_end=100,
        seq_increment=1, layout_schema="multi_artes",
        formato={"name": "Credencial", "width_mm": 105, "height_mm": 148,
                 "cols": 2, "rows": 2, "gap_h_mm": 0, "gap_v_mm": 0,
                 "offset_h_mm": 0, "offset_v_mm": 0, "rotations": {}},
        saida={"name": "SRA3", "width_mm": 320, "height_mm": 450, "file_format": "pdf"},
        multi_artes=[{"qtd": str(q1), "local_path": a1, "pdf_url": "local_file"},
                     {"qtd": str(q2), "local_path": a2, "pdf_url": "local_file"}],
    )
    ImpositionEngine(cfg).process()

    doc = fitz.open(out)
    folhas = [" ".join(p.get_text("text").split()) for p in doc]
    n = doc.page_count
    doc.close()
    return n, folhas


def test_o_motor_soma_os_modelos_na_MESMA_folha(tmp_path):
    """A regra do usuário: total de células ÷ células do formato, sem reservar
    folha por modelo. Duas peças de cada modelo cabem numa folha de 4 poses."""
    n, folhas = _impor(tmp_path, 2, 2)

    assert n == 1, f"o motor deixou de somar numa folha só: {n} folhas"
    assert folhas[0].split() == ["UM", "DOIS", "UM", "DOIS"], (
        "o motor mudou a ordem das poses da folha somada; a prévia copia esta "
        f"ordem e precisa ser revista junto: {folhas[0]}"
    )


def test_o_motor_ja_mistura_os_modelos_na_primeira_folha(tmp_path):
    """As quantidades reais do 21408. A primeira folha não é 'só o primeiro modelo'."""
    n, folhas = _impor(tmp_path, 25, 20)

    assert n == 12, f"o motor deixou de fazer 12 folhas com 45 peças em 4 poses: {n}"
    assert "UM" in folhas[0] and "DOIS" in folhas[0], (
        f"a primeira folha deixou de misturar os dois modelos: {folhas[0]}"
    )


def test_a_previa_do_pedido_nao_monta_pilha_por_modelo_no_somado():
    """`multi_artes` fora do caminho estrito, nas DUAS condições.

    Tirar só a de dentro não resolve: o `multi_artes` desceria para o ramo
    estrito e o total viraria `sets_needed × stack_size` — 50 folhas no lugar
    das 12 do 21408.
    """
    pedido = _ler("frontend/pedido.js")

    assert 'if (schema === "multi_artes" || cutstackMode === \'strict\'' not in pedido, (
        "o modo somado voltou a ligar o modo estrito da prévia"
    )
    assert "cutstackMode === 'strict_assembly' || schema === \"multi_artes\"" not in pedido, (
        "o modo somado voltou a construir plano de montagem; o motor não constrói "
        "nenhum em multi_artes"
    )
    assert "buildStrictAssemblySets" in pedido, (
        "o plano de montagem foi apagado junto; ele continua valendo para o "
        "cut_stack strict_assembly, onde o motor também o usa"
    )


def test_o_somado_decide_antes_do_modo_de_cut_stack():
    """O esquema vem primeiro, como no motor.

    No `engine.py` o `multi_artes` é um caso próprio do `layout_schema`, testado
    sem olhar o `cut_stack_mode`. Se na tela ele continuar depois das perguntas
    de cut stack, uma máquina com o modo 'strict' salvo no formato levaria a
    folha somada para o mapeamento errado.
    """
    pedido = _ler("frontend/pedido.js")
    i = pedido.index('} else if (schema === "cut_stack" || schema === "multi_artes") {')
    trecho = pedido[i:i + 2500]

    pos_somado = trecho.index('if (schema === "multi_artes") {')
    pos_strict = trecho.index("cutstackMode === 'strict'")
    assert pos_somado < pos_strict, (
        "o ramo do modo somado ficou depois das perguntas de cut stack; ele tem "
        "de decidir primeiro, como o motor faz"
    )


def test_as_duas_telas_fazem_a_mesma_conta():
    """A prévia do Pedido e a da Imposição, e o motor: uma conta só.

    Ela ja estava certa nas outras duas — era a do Pedido que não chegava a ela.
    """
    conta_js = "const P_col_first = col * rows + row;"
    for arquivo in ("frontend/pedido.js", "frontend/script.js"):
        assert conta_js in _ler(arquivo), f"{arquivo} perdeu a conta da folha somada"

    engine = _ler("engine.py")
    assert "P_col_first = col * rows + row" in engine, (
        "o motor mudou a conta da folha somada; as duas telas copiam esta e "
        "precisam ser revistas junto"
    )


def test_o_plano_de_montagem_nao_sobra_de_um_pedido_para_o_outro():
    """`window.currentAssemblySets` nunca era limpo.

    Ele fica pendurado no navegador: aberto um pedido que o construiu, um pedido
    seguinte que NÃO deveria ter plano nenhum era desenhado com o plano do
    anterior — as três leituras dele (`visible_sheets`, o cálculo de `S` e o
    mapeamento) perguntam só se ele existe. É a mesma armadilha já documentada
    no código para o `state.impMultiArtes`.
    """
    pedido = _ler("frontend/pedido.js")
    assert "window.currentAssemblySets = null;" in pedido, (
        "o plano de montagem não é mais zerado quando o trabalho não tem plano; "
        "ele volta a vazar de um pedido para o outro"
    )
