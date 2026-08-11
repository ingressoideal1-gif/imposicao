# -*- coding: utf-8 -*-
"""
Linha desmarcada no editor de CSV nao vai para a impressao.

O editor de CSV (frontend/csv-editor.js) marca uma linha excluida gravando
`__ativo: false` dentro dela. A ausencia da chave significa ativa, para que
todo CSV salvo antes da v524 continue valendo sem migracao. O filtro mora num
ponto so, no ImpositionConfig, e e de la que saem tanto o total de itens quanto
a linha que cai em cada ticket.
"""
import pytest

from engine import ImpositionConfig

FORMATO = {
    "name": "Ticket 100x50",
    "width_mm": 100,
    "height_mm": 50,
    "cols": 2,
    "rows": 2,
    "gap_h_mm": 0,
    "gap_v_mm": 0,
    "offset_h_mm": 0,
    "offset_v_mm": 0,
    "rotations": {},
}

SAIDA = {"name": "A3", "width_mm": 300, "height_mm": 300}


def montar(csv_data):
    return ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf="output_csv_ativo_test.pdf",
        formato=FORMATO,
        numeracao={"tipo": "SEQUENCIAL", "elements": []},
        saida=SAIDA,
        csv_data=csv_data,
    )


def linhas(qtd, desmarcadas=()):
    """Gera `qtd` linhas; as de indice em `desmarcadas` saem com __ativo: False."""
    out = []
    for i in range(qtd):
        linha = {"Fila": "A", "Numero": str(i + 1)}
        if i in desmarcadas:
            linha["__ativo"] = False
        out.append(linha)
    return out


def test_csv_sem_a_chave_imprime_tudo():
    """CSV antigo, sem nenhum __ativo, continua imprimindo todas as linhas."""
    cfg = montar(linhas(10))
    assert cfg.total_items == 10
    assert len(cfg.csv_data) == 10


def test_linhas_desmarcadas_saem_do_total():
    cfg = montar(linhas(10, desmarcadas={2, 5, 7}))
    assert cfg.total_items == 7
    assert len(cfg.csv_data) == 7


def test_a_linha_certa_cai_no_ticket_certo():
    """
    Depois de tirar as desmarcadas, as restantes fecham a fila sem buraco:
    o ticket 1 recebe a primeira linha marcada, o ticket 2 a segunda, e assim
    por diante. Sem o filtro, o item 3 receberia a linha "3", que foi excluida.
    """
    cfg = montar(linhas(6, desmarcadas={2}))       # some a linha de Numero "3"
    assert [r["Numero"] for r in cfg.csv_data] == ["1", "2", "4", "5", "6"]
    assert cfg.csv_data[2]["Numero"] == "4"


def test_ativo_true_explicito_continua_valendo():
    csv_data = [
        {"Numero": "1", "__ativo": True},
        {"Numero": "2", "__ativo": False},
        {"Numero": "3"},
    ]
    cfg = montar(csv_data)
    assert cfg.total_items == 2
    assert [r["Numero"] for r in cfg.csv_data] == ["1", "3"]


def test_tudo_desmarcado_falha_com_recado_claro():
    """
    Sem esta guarda, o CSV vazio cairia no ramo sequencial e a Imposicao sairia
    com numeracao errada em vez de acusar o problema.
    """
    with pytest.raises(ValueError) as erro:
        montar(linhas(4, desmarcadas={0, 1, 2, 3}))
    assert "desmarcadas" in str(erro.value)


def test_sem_csv_nao_muda_nada():
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf="output_csv_ativo_test.pdf",
        formato=FORMATO,
        numeracao={"tipo": "SEQUENCIAL", "elements": []},
        saida=SAIDA,
        seq_start=1,
        seq_end=20,
    )
    assert cfg.csv_data is None
    assert cfg.total_items == 20
