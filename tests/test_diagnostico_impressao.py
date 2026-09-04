# -*- coding: utf-8 -*-
"""A estacao conta no heartbeat se consegue imprimir no modo GDI.

## Por que isto existe

Em 04/09/2026 uma estacao recusou a impressao dizendo que faltava o `win32ui`.
Duas versoes do agente sairam tentando adivinhar qual DLL faltava, porque daqui
nao havia como olhar: a mensagem que chegava era a mesma nos dois casos
possiveis -- "a DLL nao veio no instalador" e "a DLL veio e nao carregou porque
falta outra da cadeia" --, e a maquina de quem compila TEM o Visual C++
instalado, entao ali tudo funciona de qualquer jeito.

O usuario perguntou se eu conseguia entrar na estacao por acesso remoto. Nao
consigo. O que da para fazer e o que o `diagnostico_fontes()` ja fazia pelas
fontes, pelo mesmo motivo escrito la ("nem sempre ha acesso fisico as estacoes
da grafica"): a propria estacao conta, no sinal que ela ja manda, o que eu
precisaria ir ate la ver.

## O que ele responde, e por que cada campo

- `win32ui` / `win32print`: os dois modulos do pywin32 falham separado. Uma
  estacao pode listar impressoras normalmente (win32print) e nao imprimir
  (win32ui).
- `erro`: o ImportError original. E ele que diz QUAL DLL o Windows nao achou --
  a diferenca entre os dois casos que a mensagem da tela nao distinguia.
- `mfc_no_sistema`: a `mfc140u.dll` esta no System32 daquela maquina? E' o que
  separa a estacao que recebeu o "Visual C++ Redistributable" em algum momento
  da vida da que nunca recebeu. Foi a correlacao com "Windows 11" que o usuario
  notou, e a causa verdadeira por tras dela.
- `dlls_do_bundle`: quais DLLs o executavel extraiu ao lado do `win32ui.pyd`.
  Diz se a estacao ja esta rodando a versao com o conserto, sem depender do
  numero da versao.

## O que ele NAO pode fazer

Quebrar o heartbeat. Um campo a mais que estoure uma excecao tiraria a estacao
do painel inteiro (o `last_seen` para de ser atualizado e ela some da lista),
que e' muito pior do que o diagnostico que ele traz. Por isso a funcao devolve
dicionario em qualquer situacao, inclusive quando o `print_service` nem pode ser
importado.
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "ferramentas"))

import agent_worker
import estacoes


def test_o_diagnostico_responde_as_tres_perguntas():
    d = agent_worker.diagnostico_impressao()
    assert isinstance(d, dict)
    for campo in ("win32ui", "win32print", "mfc_no_sistema", "dlls_do_bundle"):
        assert campo in d, f"falta o campo {campo} no diagnostico de impressao"
    assert isinstance(d["win32ui"], bool)
    assert isinstance(d["win32print"], bool)
    assert isinstance(d["dlls_do_bundle"], list)


def test_o_erro_so_aparece_quando_ha_erro():
    """Campo vazio em toda estacao sadia e' ruido que ensina a ignorar a lista."""
    d = agent_worker.diagnostico_impressao()
    if d["win32ui"]:
        assert "erro" not in d or not d["erro"]
    else:
        assert d.get("erro"), "sem win32ui, o motivo tem de vir junto"


def test_o_diagnostico_nao_derruba_o_heartbeat(monkeypatch):
    """Se ele estourar, a estacao some do painel -- e ai ninguem imprime nada."""
    class ModuloQuebrado:
        def __getattr__(self, nome):
            raise RuntimeError("modulo em pedacos")

    monkeypatch.setitem(sys.modules, "print_service", ModuloQuebrado())
    d = agent_worker.diagnostico_impressao()
    assert isinstance(d, dict), "o diagnostico precisa devolver dicionario sempre"


def test_o_heartbeat_carrega_o_diagnostico():
    """A ligacao: a funcao existir e nao ir junto no sinal nao serve de nada."""
    fonte = open(os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "agent_worker.py"), encoding="utf-8").read()
    i = fonte.index("printers_json = {")
    bloco = fonte[i:fonte.index("}", i)]
    assert "diagnostico_impressao()" in bloco, (
        "o diagnostico de impressao precisa viajar no printers_json, que e o "
        "unico caminho por onde a estacao fala com quem investiga"
    )


# ---------------------------------------------------------------------------
# O outro lado: de nada adianta a estacao contar se a conferencia nao le.
# ---------------------------------------------------------------------------

def test_a_conferencia_aponta_a_estacao_que_nao_imprime():
    achadas = estacoes.sem_gdi([
        {"nome": "LASER-09", "impressao": {"win32ui": False,
                                           "erro": "DLL load failed: VCRUNTIME140_1.dll"}},
        {"nome": "LASER-02", "impressao": {"win32ui": True}},
    ])
    assert len(achadas) == 1
    assert "LASER-09" in achadas[0]
    assert "VCRUNTIME140_1" in achadas[0], "a causa precisa vir junto do nome"


def test_estacao_que_nao_informa_nao_vira_alarme():
    """Agente antigo nao manda o campo, e "nao sei" nao e "esta quebrada".

    Alarme que se repete e que ninguem pode atender ensina a passar o olho pela
    lista inteira -- o mesmo motivo pelo qual as bancadas de teste sao marcadas
    em vez de gritarem todo dia.
    """
    assert estacoes.sem_gdi([{"nome": "ANTIGA", "impressao": {}}]) == []
    assert estacoes.sem_gdi([{"nome": "ANTIGA"}]) == []


def test_bancada_de_teste_nao_entra_no_alarme():
    assert estacoes.sem_gdi([
        {"nome": "CESAR-CPD", "impressao": {"win32ui": False, "erro": "x"}}]) == []
