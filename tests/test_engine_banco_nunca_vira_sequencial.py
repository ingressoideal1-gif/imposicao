# -*- coding: utf-8 -*-
"""Campo com origem "banco de dados" nunca imprime o contador sequencial.

## O defeito, medido no pedido 21460 (02/09/2026)

O `_render_element` montava o valor assim:

    elif el.get("source") == "database" and csv_row is not None:
        val_str = str(csv_row.get(el.get("csv_column", ""), ""))
    ...
    else:
        val_str = f"{prefix}{str(val).zfill(pad)}{suffix}"

Repare no `and csv_row is not None`. Sem linha, o elemento nao parava: ele
escorregava para o `else` e imprimia o NUMERO DO ITEM, com prefixo, sufixo e
zeros a esquerda — do jeito que uma numeracao sequencial comum sairia.

Nada denuncia isso. O QR sai bonito e legivel; so o conteudo esta errado. No
21460 sao 6.950 credenciais da Expointer cujo codigo de 12 digitos veio do
cliente: o material sairia com 0001, 0002, 0003 dentro do QR, e quem
descobriria seria a portaria do evento, com a fila na porta.

O painel ja foi consertado por dois caminhos (o `garantirCsvDoTrabalho`, para o
banco que mora dentro da numeracao, e o `garantirBancosDoTrabalho` da v791, para
o banco que e do pedido). O que este teste protege e a CLASSE: qualquer caminho
que chegue ao motor sem a linha para o trabalho, em vez de inventar um valor.

E a mesma regra que o QR Ideal ja seguia — preferir o trabalho parado ao
trabalho errado —, agora valendo para todo campo que le do banco.
"""
import fitz
import pytest

import engine
from engine import ImpositionEngine, MM2PT

CX_PT, CY_PT = 120.0, 90.0


def _qr(**extra):
    el = {
        "type": "QR", "source": "database", "csv_column": "EXPOSITOR",
        "_x": CX_PT, "_y": CY_PT, "_size": 20 * MM2PT,
        "color": "#000000", "rotation": 0, "pad": 4,
    }
    el.update(extra)
    return el


def _texto(**extra):
    el = {
        "type": "TEXT", "source": "database", "csv_column": "NOME",
        "_x": CX_PT, "_y": CY_PT, "font_size": 12, "font_name": "helv",
        "color": "#000000", "rotation": 0, "pad": 5,
    }
    el.update(extra)
    return el


def _desenhar(el, csv_row, val=1):
    doc = fitz.open()
    page = doc.new_page(width=400, height=300)
    eng = object.__new__(ImpositionEngine)
    eng._font_buffer_cache = {}
    eng._render_element(page, el, 0, 0, val, csv_row)
    return doc, page


def _conteudo_do_qr(monkeypatch, el, csv_row, val=1):
    """O que EXATAMENTE foi gravado dentro do QR."""
    visto = []
    original = engine._generate_qr
    monkeypatch.setattr(engine, "_generate_qr",
                        lambda texto, cor: visto.append(texto) or original(texto, cor))
    _desenhar(el, csv_row, val)
    assert len(visto) == 1, "o QR devia ter sido gerado uma vez"
    return visto[0]


# ── O defeito ───────────────────────────────────────────────────────────────

def test_qr_do_banco_sem_linha_para_o_trabalho():
    """Era aqui que saia 0001 dentro do QR do 21460."""
    with pytest.raises(ValueError) as erro:
        _desenhar(_qr(id="el_1"), None, val=1)

    frase = str(erro.value)
    assert "el_1" in frase, "a recusa precisa dizer QUAL elemento parou o trabalho"
    assert "sequencial" in frase, "a recusa precisa dizer o que sairia errado"


def test_a_recusa_diz_ao_operador_como_sair_dela():
    """Trava que impede de seguir tem de oferecer a saida na propria frase."""
    with pytest.raises(ValueError) as erro:
        _desenhar(_qr(id="el_1"), None)

    frase = str(erro.value)
    assert "banco de dados esta anexado ao modelo" in frase
    assert "imprimir de novo" in frase


def test_vale_para_qualquer_campo_do_banco_nao_so_o_qr():
    """O QR foi o sintoma; a regra e da origem, nao do tipo do elemento.

    Um campo de TEXTO que le o nome da pessoa e cai no sequencial imprime
    '00007' na credencial. Nao chega a portaria, mas chega ao papel.
    """
    with pytest.raises(ValueError):
        _desenhar(_texto(id="el_nome"), None, val=7)


# ── O que NAO pode mudar ────────────────────────────────────────────────────

def test_com_a_linha_o_qr_leva_o_codigo_do_banco(monkeypatch):
    linha = {"EXPOSITOR": "301013536972"}
    assert _conteudo_do_qr(monkeypatch, _qr(id="el_1"), linha, val=1) == "301013536972"


def test_numeracao_sequencial_de_verdade_continua_intacta(monkeypatch):
    """Elemento SEM origem de banco imprime o contador, como sempre imprimiu.

    Este e o trabalho de todo dia da grafica, e ele nao pode nem hesitar por
    causa do conserto acima: sem `source`, `csv_row is None` e o normal.
    """
    el = _qr(id="el_1", pad=6, prefix="A")
    el.pop("source")
    assert _conteudo_do_qr(monkeypatch, el, None, val=42) == "A000042"


def test_foto_sem_linha_continua_desistindo_em_silencio():
    """FOTO nasce SEMPRE com origem 'banco de dados' e tem tratamento proprio.

    Uma foto que nao varia por linha e arte de fundo, nao foto variavel — por
    isso o editor nunca oferece "Sequencial" a ela. Sem linha (a previa da
    numeracao sem banco) ela desiste de pintar, e quem recusa a impressao de
    verdade e o `_conferir_e_aquecer_fotos`, que lista todas as pendencias de
    uma vez. Fazer a FOTO cair na recusa acima trocaria uma lista util por um
    erro de um item so.
    """
    doc, page = _desenhar(
        {"type": "FOTO", "source": "database", "csv_column": "FOTO", "id": "el_f",
         "_x": CX_PT, "_y": CY_PT, "width_mm": 25, "height_mm": 32,
         "color": "#000000", "rotation": 0},
        None,
    )
    assert not page.get_images(), "a previa sem linha nao pinta foto nenhuma"


# ── A celula vazia (quarto relato do 21460, 02/09/2026) ─────────────────────

def test_qr_do_banco_com_celula_vazia_para_o_trabalho():
    """O painel mandava o banco inteiro (3.000 linhas) para um modelo de 200:
    as 2.800 pecas alem da tiragem tinham a coluna do modelo em branco, e cada
    uma saia com um QR "de nada" — legivel, e que nao abre porta nenhuma."""
    with pytest.raises(ValueError) as erro:
        _desenhar(_qr(id="el_1", csv_column="VEICULO"), {"VEICULO": "   ", "EXPOSITOR": "301013536972"}, val=201)
    frase = str(erro.value)
    assert "el_1" in frase and "VEICULO" in frase and "201" in frase,         "a recusa precisa dizer qual QR, qual coluna e qual item"
    assert "tiragem" in frase, "a recusa precisa apontar a causa provavel: tiragem maior que o banco"


def test_texto_do_banco_com_celula_vazia_continua_imprimindo_vazio():
    """A regra e' do QR. Um campo de texto em branco e' normal ('complemento',
    'observacao'), e fazer o trabalho parar por ele seria regressao."""
    doc, page = _desenhar(_texto(id="el_obs", csv_column="OBS"), {"OBS": ""}, val=3)
    assert page.get_text().strip() == "", "texto vazio sai vazio, sem erro"
