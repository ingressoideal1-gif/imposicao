"""A preparacao simplificada reaproveita as travas de identidade e elevacao."""
from test_carregar_pedido_tela import DESVIO
from test_controle_tela import _no_navegador
import pytest


def test_prepara_com_uma_confirmacao_e_preserva_pedido_complementar():
    r = _no_navegador(DESVIO + """
        window.caixaConfirmar.perguntar = async () => { throw Error('Confirmacao extra'); };
        await carregarPedido.abrir(20272, SESSAO, PEDIDO, true);
        document.getElementById('carregar-senha').value = 'ficticia';
        document.getElementById('carregar-destino').value = 'ev-a';
        document.getElementById('preparar-nome-aparelho').value = 'Celular teste';
        document.getElementById('btn-carregar-confirmar').click();
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 100));
        return { calls: window.__chamadas, assumiu: window.__assumiu };
    """)
    loads = [x for x in r["calls"] if x["caminho"].endswith('/carregar')]
    assert len(loads) == 1
    assert loads[0]["corpo"]["evento_id"] == "ev-a"
    assert r["assumiu"]["nome"] == "Celular teste"


@pytest.mark.parametrize("fila", ["async () => 2", "async () => { throw Error('IndexedDB indisponivel'); }"])
def test_preparacao_nao_troca_aparelho_com_leitura_pendente(fila):
    r = _no_navegador(DESVIO + "window.portariaDeposito.contarFila = " + fila + ";" + """
        window.caixaConfirmar.perguntar = async () => { throw Error('Confirmacao extra'); };
        window.chaveiro.carregado = () => 'outro';
        await carregarPedido.abrir(20272, SESSAO, PEDIDO, true);
        document.getElementById('carregar-senha').value = 'ficticia';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 100));
        return {assumiu:!!window.__assumiu,calls:window.__chamadas};
    """)
    assert r["assumiu"] is False
    assert not any(x["caminho"].endswith('/aparelhos/aqui') for x in r["calls"])


def test_preparacao_reutiliza_aparelho_do_evento_sem_criar_outro():
    r = _no_navegador(DESVIO + """
        window.chaveiro.procurar = () => ({evento_id:'ev-novo'});
        window.virarPortao.abrir = async id => { window.__abriu = id; };
        await carregarPedido.abrir(20272, SESSAO, PEDIDO, true);
        document.getElementById('carregar-senha').value = 'ficticia';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 100));
        return {abriu:window.__abriu,calls:window.__chamadas};
    """)
    assert r["abriu"] == "ev-novo"
    assert not any(x["caminho"].endswith('/aparelhos/aqui') for x in r["calls"])
