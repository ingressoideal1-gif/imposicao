# -*- coding: utf-8 -*-
"""Entregar cada bloco enquanto o trabalho e gerado (27/08/2026).

O usuario relatou o modelo de 14.000 celulas do pedido 21202 -- 1.400 folhas que
o motor montava inteiras na memoria antes de sair a primeira:

    "ele imposiciona todas as 1400 folhas antes de jogar para a impressora ou
     fazer os pdf, qual a alternativa para que ele imponha e gere cada folha,
     uma a uma, e jogue para impressora ou hotfolder"

A esteira de entregar enquanto gera JA existia e ja roda na grafica: o
`on_file_generated` dispara a cada `generated_files.append`, o `app.py` empurra o
arquivo para a resposta em streaming, e o frontend manda cada um para o hotfolder
ou para a impressora conforme chegam. Faltava o CORTE -- sem capa, o motor
definia o bloco como o pedido inteiro (`stack_size = total_sheets`), o laco nunca
cruzava uma fronteira e nada era gravado no meio.

O que estes testes medem e o comportamento novo E as tres recusas que o tornam
seguro. A mais importante delas e o Refazer Celula: sem capa o pedido inteiro e
um bloco so, entao "refazer folhas 5 a 10" sao folhas ABSOLUTAS; com o corte
ligado elas virariam "folhas 5 a 10 do bloco tal", e o operador reimprimiria
papel errado sem nenhum aviso.
"""
import os

import pytest

from engine import ImpositionConfig, ImpositionEngine

FORMATO = {
    "name": "Ticket 100x50",
    "width_mm": 100, "height_mm": 50,
    "cols": 2, "rows": 2,
    "gap_h_mm": 0, "gap_v_mm": 0,
    "offset_h_mm": 0, "offset_v_mm": 0,
    "rotations": {},
}
FORMATO_COM_CAPA = dict(FORMATO, has_cover=True)
SAIDA = {"name": "A3", "width_mm": 300, "height_mm": 300}


def montar(tmp_path, itens, **extra):
    """Um trabalho de `itens` celulas. 4 por folha -> itens/4 folhas."""
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf=str(tmp_path / "saida.pdf"),
        formato=extra.pop("formato", FORMATO),
        numeracao={"tipo": "SEQUENCIAL", "elements": []},
        saida=SAIDA,
        seq_start=1,
        seq_end=itens,
        **extra,
    )
    return cfg


def gerar(cfg):
    """Roda o motor e devolve (arquivos, folhas_entregues)."""
    engine = ImpositionEngine(cfg)
    engine.process()
    return list(engine.generated_files), engine.folhas_entregues


# ─── A decisao de cortar ou nao ────────────────────────────────────────────

def test_o_MOTOR_so_corta_se_alguem_pedir(tmp_path):
    """Na tela a caixa nasce marcada; aqui o padrao e nao cortar.

    Os dois nao se contradizem. A tela manda a escolha em todo trabalho -- o
    usuario pediu que ela venha marcada depois de ver a medicao do modelo
    1000567. Este `False` e a resposta para quem chamar o motor SEM dizer nada:
    um script, um teste, um caminho novo do app.py. Cortar a tiragem de quem nao
    pediu mudaria o que chega na impressora sem ninguem ter escolhido.
    """
    cfg = montar(tmp_path, 40)
    assert cfg.entregar_por_bloco is False
    engine = ImpositionEngine(cfg)
    assert engine._folhas_por_lote(cfg, refazendo=False) == 0


def test_ligado_corta_pelo_bloco_do_modelo(tmp_path):
    cfg = montar(tmp_path, 40, sheets_per_block=3, entregar_por_bloco=True)
    engine = ImpositionEngine(cfg)
    assert engine._folhas_por_lote(cfg, refazendo=False) == 3


def test_a_profundidade_do_bloco_entra_na_conta(tmp_path):
    """Mesma formula do caminho com capa: o numero significa a mesma coisa."""
    cfg = montar(tmp_path, 40, sheets_per_block=3, block_depth=2,
                 entregar_por_bloco=True)
    engine = ImpositionEngine(cfg)
    assert engine._folhas_por_lote(cfg, refazendo=False) == 6


def test_trabalho_com_capa_nao_e_cortado_de_novo(tmp_path):
    """Este caminho JA corta por set e ja entrega.

    Cortar duas vezes brigaria com a capa e a contracapa, que pertencem ao set.
    """
    cfg = montar(tmp_path, 40, formato=FORMATO_COM_CAPA,
                 sheets_per_block=3, entregar_por_bloco=True)
    engine = ImpositionEngine(cfg)
    assert engine._folhas_por_lote(cfg, refazendo=False) == 0


def test_REFAZER_nao_e_cortado(tmp_path):
    """A recusa que protege o papel.

    Sem capa, o pedido inteiro e um bloco so, entao a faixa que o operador
    digita em Refazer sao folhas ABSOLUTAS. Com o corte ligado ela viraria
    "folhas 5 a 10 do bloco tal" -- e sairia papel errado, sem aviso nenhum.
    """
    cfg = montar(tmp_path, 40, sheets_per_block=3, entregar_por_bloco=True)
    engine = ImpositionEngine(cfg)
    assert engine._folhas_por_lote(cfg, refazendo=True) == 0


def test_sem_numero_de_bloco_nao_ha_corte(tmp_path):
    cfg = montar(tmp_path, 40, sheets_per_block=0, entregar_por_bloco=True)
    engine = ImpositionEngine(cfg)
    assert engine._folhas_por_lote(cfg, refazendo=False) == 0


# ─── O que sai de verdade ──────────────────────────────────────────────────

def test_desligado_produz_UM_arquivo_no_fim(tmp_path):
    """O comportamento de hoje, intocado."""
    cfg = montar(tmp_path, 40, sheets_per_block=3)      # 10 folhas
    arquivos, entregues = gerar(cfg)
    assert len(arquivos) == 1
    assert arquivos[0]["type"] == "single"
    assert entregues == 0
    assert os.path.exists(arquivos[0]["path"])


def test_ligado_entrega_um_arquivo_por_bloco(tmp_path):
    """40 itens, 4 por folha = 10 folhas; bloco de 3 -> 4 lotes (3+3+3+1)."""
    cfg = montar(tmp_path, 40, sheets_per_block=3, entregar_por_bloco=True)
    arquivos, entregues = gerar(cfg)

    assert [a["type"] for a in arquivos] == ["lote"] * 4, [a["name"] for a in arquivos]
    assert entregues == 10, "toda folha gerada tem de ter sido entregue"
    for a in arquivos:
        assert os.path.exists(a["path"]), a["name"]


def test_nenhuma_folha_se_perde_no_corte(tmp_path):
    """A soma das paginas dos lotes tem de ser a tiragem inteira.

    O laco fecha e reabre o documento na fronteira do bloco. Um `elif` no lugar
    errado ali descartaria o lote em vez de grava-lo, e o operador so descobriria
    contando papel.
    """
    import fitz
    cfg = montar(tmp_path, 40, sheets_per_block=3, entregar_por_bloco=True)
    arquivos, _ = gerar(cfg)
    total = 0
    for a in arquivos:
        with fitz.open(a["path"]) as d:
            total += len(d)
    assert total == 10


def test_os_lotes_saem_em_ordem_no_nome(tmp_path):
    """A ordem dos arquivos no RIP e a ordem do papel.

    Por isso o numero vai com zeros a esquerda: `_lote002` tem de vir depois de
    `_lote001` e antes de `_lote010` em qualquer ordenacao alfabetica.
    """
    cfg = montar(tmp_path, 88, sheets_per_block=2, entregar_por_bloco=True)
    arquivos, _ = gerar(cfg)
    nomes = [a["name"] for a in arquivos]
    assert nomes == sorted(nomes), nomes
    assert "_lote001.pdf" in nomes[0]


def test_a_entrega_acontece_DURANTE_a_geracao(tmp_path):
    """O ponto inteiro do recurso.

    Nao basta terminar com N arquivos: eles tem de chegar a esteira ENQUANTO o
    motor ainda desenha. E o `on_file_generated` que dispara isso, e e ele que o
    `app.py` usa para empurrar cada arquivo para a resposta em streaming.

    Aqui isso e medido pela ordem dos eventos: o primeiro lote e anunciado antes
    de o motor terminar. Sem o corte havia UM anuncio, no fim.
    """
    anuncios = []
    cfg = montar(tmp_path, 40, sheets_per_block=3, entregar_por_bloco=True)
    engine = ImpositionEngine(cfg, on_file_generated=lambda f: anuncios.append(f["name"]))
    engine.process()

    assert len(anuncios) == 4, anuncios
    assert anuncios == sorted(anuncios), "os lotes tem de ser anunciados em ordem"


def test_o_motor_nao_segura_a_tiragem_inteira(tmp_path):
    """A memoria fica limitada ao lote, e nao a tiragem.

    E o que resolve o caso do usuario: 1.400 folhas montadas de uma vez. Aqui a
    tiragem e pequena, entao o que se mede e a INVARIANTE -- nenhum lote gravado
    tem mais paginas que o bloco configurado.
    """
    import fitz
    cfg = montar(tmp_path, 100, sheets_per_block=4, entregar_por_bloco=True)
    arquivos, _ = gerar(cfg)
    for a in arquivos:
        with fitz.open(a["path"]) as d:
            assert len(d) <= 4, f"{a['name']} tem {len(d)} paginas, o bloco e 4"


def test_a_caixa_da_tela_nasce_MARCADA():
    """Decisao do usuario, 27/08/2026.

    Ele viu a medicao do modelo 1000567 do pedido 21202 -- primeira folha
    entregue aos 4,2 s em vez de 534,6 s, e o trabalho inteiro em 118 s em vez
    de 535 s -- e pediu que a entrega por bloco fosse o padrao da tela.

    O teste existe porque o padrao de uma caixa e uma decisao de produto que
    some facil numa edicao de HTML: sem ele, um `checked` removido sem querer
    devolveria a grafica aos nove minutos de espera sem ninguem perceber.
    """
    import io as _io
    import os as _os
    raiz = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    with _io.open(_os.path.join(raiz, "frontend", "index.html"), encoding="utf-8") as f:
        html = f.read()
    i = html.index('id="ped-entregar-por-bloco"')
    marca = html[i:html.index(">", i)]
    assert "checked" in marca, (
        "a caixa 'Entregar cada bloco enquanto gera' voltou a nascer desmarcada"
    )
