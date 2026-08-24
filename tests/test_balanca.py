# -*- coding: utf-8 -*-
"""A leitura da balanca Urano CP 3/0.5 POP, no agente da estacao.

## De onde saem os numeros deste arquivo

Do manual de operacao da linha CP POP da Urano, item 11.13.2 ("Configuracao da
saida serial padrao e USB", senha 191249). O modelo CP 3/0.5 POP esta na tabela
de capacidades do mesmo manual: 0 a 3000 g, divisao de 0,5 g.

    Protocolo: 9600 bps, 8 data bits, sem paridade, 2 stop bits.
    O computador pede o peso mandando um caracter de comando (04 ou 05 em
    hexadecimal). Tao logo a balanca receba este comando, a mesma ira
    transmitir a informacao.

E o quadro que ela transmite:

    [sinal][estavel] DD/MM/AA _ <descricao, 20 caracteres> _ TTTTTTg _ LLLLLLg
      __ MMM,MMMg _ PPPPPP <CR><LF><CK><CK>

com o peso liquido (LLLLLL) em GRAMAS, e o checksum de dois bytes somando tudo
que vem a esquerda dele.

## Por que o parser olha os dois primeiros caracteres como CONJUNTO

Porque o desenho do manual poe o sinal e a marca de estavel nas duas primeiras
posicoes, mas nao diz qual vem primeiro -- as duas chaves do desenho apontam para
a mesma dupla de casas. Apostar numa ordem e depois descobrir que era a outra
daria um peso "sempre instavel" ou "sempre negativo", e o operador nao teria como
saber por que. Olhando o par junto, nao ha aposta a errar.

## Por que o checksum NAO recusa o quadro

Ele e calculado e mostrado no diagnostico, e so. Se a minha leitura de "somatorio
de todos os bytes a esquerda" estiver deslocada de um byte, recusar por checksum
transformaria uma balanca que funciona numa que nunca le -- e sem nada na tela
que explicasse. Os campos numericos ja provam que o quadro e um quadro.
"""
import io
import os
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

import balanca  # noqa: E402


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def quadro(liquido_g, estavel=True, negativo=False, tara_g=0,
           medio="000,000", pecas=0, descricao="", checksum=True):
    """Monta um quadro como o da balanca, byte a byte, do jeito do manual."""
    sinal = "-" if negativo else "+"
    est = "*" if estavel else " "
    corpo = ("{}{}24/08/26 {:<20} {:06d}g {:06d}g  {}g {:06d}"
             .format(sinal, est, descricao[:20], tara_g, liquido_g, medio, pecas))
    dados = corpo.encode("latin-1") + b"\x0d\x0a"
    if not checksum:
        return dados
    soma = sum(dados) & 0xFFFF
    return dados + bytes([(soma >> 8) & 0xFF, soma & 0xFF])


# ─── O quadro ────────────────────────────────────────────────────────────────


def test_o_peso_liquido_vem_em_gramas_e_sai_em_quilos():
    r = balanca.interpretar_quadro(quadro(1234))
    assert r["gramas"] == 1234
    assert r["peso_kg"] == 1.234


def test_o_asterisco_e_o_peso_estavel():
    assert balanca.interpretar_quadro(quadro(1234, estavel=True))["estavel"] is True
    assert balanca.interpretar_quadro(quadro(1234, estavel=False))["estavel"] is False


def test_a_ordem_do_sinal_e_do_estavel_nao_importa():
    """O parser olha as duas primeiras casas como conjunto -- ver o cabecalho."""
    trocado = quadro(1234, estavel=True)
    invertido = bytes([trocado[1], trocado[0]]) + trocado[2:]
    r = balanca.interpretar_quadro(invertido)
    assert r["estavel"] is True
    assert r["peso_kg"] == 1.234


def test_peso_negativo_sai_negativo():
    r = balanca.interpretar_quadro(quadro(500, negativo=True))
    assert r["peso_kg"] == -0.5


def test_sobrecarga_e_dita_por_nome():
    """O manual: peso acima da capacidade acende `888888` no visor.

    A balanca e de 3 kg. Caixa mais pesada que isso nao e defeito de software, e
    o operador precisa ouvir a palavra `sobrecarga` em vez de ver 888,888 kg.
    """
    r = balanca.interpretar_quadro(quadro(888888))
    assert r["sobrecarga"] is True
    assert r["peso_kg"] is None


def test_a_descricao_com_espacos_nao_confunde_os_campos():
    r = balanca.interpretar_quadro(quadro(2500, descricao="CAIXA 12 STAFF DIA 2"))
    assert r["peso_kg"] == 2.5


def test_a_tara_e_o_total_de_pecas_tambem_sao_lidos():
    r = balanca.interpretar_quadro(quadro(2500, tara_g=180, pecas=40))
    assert r["tara_kg"] == 0.18
    assert r["pecas"] == 40


def test_quadro_sem_checksum_ainda_e_lido():
    r = balanca.interpretar_quadro(quadro(1000, checksum=False))
    assert r["peso_kg"] == 1.0


def test_o_checksum_e_conferido_mas_so_como_informacao():
    bom = quadro(1000)
    ruim = bom[:-2] + b"\x00\x00"
    assert balanca.interpretar_quadro(bom)["checksum_confere"] is True
    r = balanca.interpretar_quadro(ruim)
    assert r["checksum_confere"] is False
    assert r["peso_kg"] == 1.0, "checksum errado NAO pode recusar o peso"


def test_lixo_na_porta_nao_vira_peso():
    for cru in (b"", b"\x00\x00\x00", b"nada a ver com peso\r\n",
                quadro(1234)[:12]):
        with pytest.raises(ValueError):
            balanca.interpretar_quadro(cru)


def test_o_bruto_volta_junto_para_o_diagnostico():
    """Sem os bytes crus na tela nao ha como calibrar contra o visor."""
    r = balanca.interpretar_quadro(quadro(1234))
    assert "001234g" in r["bruto"]


# ─── A conversa com a porta ──────────────────────────────────────────────────


class _PortaDeMentira:
    """Uma porta serial que responde o que o teste mandar, na ordem."""

    def __init__(self, respostas, porta="COM9"):
        self.respostas = list(respostas)
        self.porta = porta
        self.escrito = b""
        self.fechada = False

    def reset_input_buffer(self):
        pass

    def write(self, dados):
        self.escrito += dados

    def read_until(self, fim):
        if not self.respostas:
            return b""
        atual = self.respostas[0]
        corte = atual.find(fim)
        if corte == -1:
            self.respostas.pop(0)
            return atual
        self.respostas[0] = atual[corte + len(fim):]
        return atual[:corte + len(fim)]

    def read(self, n):
        if not self.respostas:
            return b""
        atual = self.respostas[0]
        if len(atual) <= n:
            self.respostas.pop(0)
            return atual
        self.respostas[0] = atual[n:]
        return atual[:n]

    def close(self):
        self.fechada = True


@pytest.fixture
def porta_falsa(monkeypatch):
    """Troca o `serial.Serial` por uma porta de mentira e guarda o que abriu."""
    abertas = []

    def montar(respostas):
        def _abrir(porta, timeout=None):
            p = _PortaDeMentira(list(respostas), porta)
            abertas.append(p)
            return p
        monkeypatch.setattr(balanca, "_abrir_porta", _abrir)
        return abertas

    return montar


def test_o_pedido_de_peso_e_o_byte_do_manual(porta_falsa):
    abertas = porta_falsa([quadro(1500)])
    r = balanca.ler_peso(porta="COM9")
    assert r["ok"] is True
    assert r["peso_kg"] == 1.5
    assert abertas[0].escrito == b"\x05", "o manual manda 0x04 ou 0x05"
    assert abertas[0].fechada is True, "porta serial aberta e porta que trava a proxima"


def test_a_leitura_espera_o_peso_estabilizar(porta_falsa):
    """Instavel e o peso ainda balancando: pedir de novo custa 250 ms."""
    porta_falsa([quadro(1200, estavel=False), quadro(1490, estavel=False),
                 quadro(1500, estavel=True)])
    r = balanca.ler_peso(porta="COM9", segundos=4.0)
    assert r["ok"] is True
    assert r["estavel"] is True
    assert r["peso_kg"] == 1.5


def test_peso_que_nunca_estabiliza_volta_dizendo_isso(porta_falsa):
    porta_falsa([quadro(1200, estavel=False)] * 40)
    r = balanca.ler_peso(porta="COM9", segundos=0.6)
    assert r["ok"] is False
    assert r["estavel"] is False
    assert "instáv" in r["motivo"].lower() or "instav" in r["motivo"].lower()
    assert r["peso_kg"] == 1.2, "o numero medido volta junto, para a tela mostrar"


def test_porta_muda_diz_que_nao_achou_a_balanca(porta_falsa):
    porta_falsa([b""])
    r = balanca.ler_peso(porta="COM9")
    assert r["ok"] is False
    assert r["comoResolver"], "toda trava precisa dizer, na propria tela, como sair dela"


def test_sobrecarga_chega_a_tela_como_sobrecarga(porta_falsa):
    porta_falsa([quadro(888888)])
    r = balanca.ler_peso(porta="COM9")
    assert r["ok"] is False
    assert "sobrecarga" in r["motivo"].lower()


def test_sem_porta_guardada_ela_e_procurada_e_guardada(monkeypatch, tmp_path):
    """Achar a balanca uma vez basta: a proxima leitura ja vai direto."""
    monkeypatch.setattr(balanca, "ARQUIVO_DE_CONFIG", str(tmp_path / "balanca_config.json"))
    monkeypatch.setattr(balanca, "portas_disponiveis",
                        lambda: [{"porta": "COM1", "descricao": "mouse"},
                                 {"porta": "COM7", "descricao": "USB Serial"}])

    def _abrir(porta, timeout=None):
        if porta != "COM7":
            raise OSError("porta ocupada")
        return _PortaDeMentira([quadro(2000)], porta)

    monkeypatch.setattr(balanca, "_abrir_porta", _abrir)

    r = balanca.ler_peso()
    assert r["ok"] is True
    assert r["porta"] == "COM7"
    assert balanca.porta_guardada() == "COM7"


def test_maquina_sem_porta_nenhuma_explica_o_conector_opcional(monkeypatch, tmp_path):
    """Na CP POP a saida serial/USB e OPCIONAL -- e isso precisa estar dito."""
    monkeypatch.setattr(balanca, "ARQUIVO_DE_CONFIG", str(tmp_path / "balanca_config.json"))
    monkeypatch.setattr(balanca, "portas_disponiveis", lambda: [])
    r = balanca.ler_peso()
    assert r["ok"] is False
    assert "opcional" in (r["motivo"] + r["comoResolver"]).lower()


def test_o_diagnostico_conta_o_que_cada_porta_respondeu(monkeypatch, tmp_path):
    monkeypatch.setattr(balanca, "ARQUIVO_DE_CONFIG", str(tmp_path / "balanca_config.json"))
    monkeypatch.setattr(balanca, "portas_disponiveis",
                        lambda: [{"porta": "COM1", "descricao": "Comunicações"},
                                 {"porta": "COM7", "descricao": "USB Serial"}])

    def _abrir(porta, timeout=None):
        if porta == "COM1":
            raise OSError("Acesso negado")
        return _PortaDeMentira([quadro(2000)], porta)

    monkeypatch.setattr(balanca, "_abrir_porta", _abrir)

    achado = balanca.procurar()
    por_porta = {p["porta"]: p for p in achado["portas"]}
    assert por_porta["COM1"]["respondeu"] is False
    assert "Acesso negado" in por_porta["COM1"]["detalhe"]
    assert por_porta["COM7"]["respondeu"] is True
    assert por_porta["COM7"]["peso_kg"] == 2.0
    assert achado["porta"] == "COM7"


def test_a_configuracao_fica_ao_lado_do_executavel():
    """Como o `print_configs.json`: qual porta e a balanca e propriedade FISICA
    daquela maquina, e precisa sobreviver a atualizacao do agente."""
    fonte = _ler("balanca.py")
    assert "DB_DIR" in fonte or "sys.executable" in fonte
    assert "balanca_config.json" in fonte


# ─── A ligacao: rota, dependencia, empacotamento ─────────────────────────────


def test_as_tres_rotas_existem_no_agente():
    ap = _ler("app.py")
    assert '@app.get("/api/balanca/peso")' in ap
    assert '@app.get("/api/balanca/portas")' in ap
    assert '@app.post("/api/balanca/porta")' in ap


def test_as_rotas_da_balanca_pedem_o_acesso_local():
    """`get_current_user` em todas -- a porta da estacao nao fica aberta."""
    ap = _ler("app.py")
    i = ap.index('@app.get("/api/balanca/peso")')
    trecho = ap[i:i + 2600]
    assert trecho.count("get_current_user") >= 3, trecho[:600]


def test_a_rota_do_peso_nao_devolve_erro_de_servidor_quando_nao_ha_balanca():
    """Nao achar balanca e estado de operacao, e o operador precisa LER o motivo.

    Um 502 chegaria a tela como "erro interno" e esconderia justamente a parte
    util: que a saida serial da balanca pode estar em "Deslig".
    """
    ap = _ler("app.py")
    i = ap.index('@app.get("/api/balanca/peso")')
    trecho = ap[i:ap.index('@app.get("/api/balanca/portas")')]
    assert "HTTPException" not in trecho, trecho


def test_o_pyserial_esta_nas_dependencias():
    assert "pyserial" in _ler("requirements.txt")


def test_o_pyserial_vai_dentro_do_executavel_do_agente():
    """Sem o hiddenimport o agente COMPILA e so falha na estacao, sem aviso.

    O PyInstaller nao acha o backend do Windows varrendo o codigo: o `serial`
    escolhe `serial.serialwin32` em tempo de execucao.
    """
    spec = _ler("agent_tray.spec")
    for nome in ("'serial'", "'serial.tools.list_ports'", "'serial.serialwin32'"):
        assert nome in spec, "falta {} nos hiddenimports".format(nome)
