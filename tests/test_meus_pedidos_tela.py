# -*- coding: utf-8 -*-
"""'Meus Pedidos': a barra que era 'Novo Evento', a lista dos pedidos ja
impressos e o botao Carregar. Decisoes de 17/08/2026."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from test_controle_tela import _no_navegador  # noqa: E402

PEDIDOS = {"pedidos": [
    {"pedido": 20272, "id_cliente": 14, "data": "2026-08-12", "nome_evento": "Click",
     "data_evento": "2026-09-12T22:00:00Z", "local_evento": "Arena",
     "setores": [{"modelo_id": 1, "nome": "PISTA", "quantidade": 1500, "impresso": True},
                 {"modelo_id": 2, "nome": "VIP", "quantidade": 300, "impresso": False}]},
    {"pedido": 20281, "id_cliente": 14, "data": "2026-08-15", "nome_evento": "Pedido 20281",
     "data_evento": None, "local_evento": None,
     "setores": [{"modelo_id": 3, "nome": "CAMAROTE", "quantidade": 80, "impresso": True}]},
], "sem_cliente": False}

DESVIO = """
    window.__chamadas = [];
    const pedirReal = AcessoConta.pedir;
    AcessoConta.pedir = async (caminho, opcoes) => {
        window.__chamadas.push(caminho);
        if (caminho === '/meus-pedidos') return window.__pedidos;
        if (caminho === '/minha-conta') return { clientes: [{ id_cliente: 14, nome: 'X' }], precisa_trocar_senha: false };
        if (caminho === '/meus-eventos') return { eventos: [] };
        return pedirReal(caminho, opcoes);
    };
    window.__pedidos = %s;
    window.supabaseClient = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt', user: { email: 'd@x.com' } } } }) } };
    window.carregarPedido = { abrir: (pedido, sessao) => { window.__carregou = pedido; return Promise.resolve(); } };
"""


def _desvio(pedidos=PEDIDOS):
    import json
    return DESVIO % json.dumps(pedidos)


def test_a_barra_do_topo_e_meus_pedidos_e_nao_ha_mais_camera():
    saida = _no_navegador("""
        return {
            barra: document.getElementById('btn-meus-pedidos').textContent.trim(),
            mais: !!document.getElementById('btn-meus-pedidos-mais'),
            camera: !!document.getElementById('caixa-qr'),
            lerQr: !!window.lerQR,
            antigo: !!document.getElementById('btn-ler-qr'),
        };
    """)
    assert saida["barra"] == "Meus Pedidos"
    assert saida["mais"] is True
    assert saida["camera"] is False and saida["lerQr"] is False and saida["antigo"] is False


def test_tocar_na_barra_com_sessao_desenha_os_cartoes():
    saida = _no_navegador(_desvio() + """
        document.getElementById('btn-meus-pedidos').click();
        await new Promise(r => setTimeout(r, 80));
        const c = document.getElementById('pedido-20272');
        return {
            visivel: !document.getElementById('meus-pedidos').classList.contains('sumindo'),
            listaEscondida: document.getElementById('lista').classList.contains('sumindo'),
            quantos: document.querySelectorAll('#pedidos .cartao-pedido').length,
            texto: c.textContent,
            botao: document.getElementById('carregar-20272').textContent.trim(),
        };
    """)
    assert saida["visivel"] is True and saida["listaEscondida"] is True
    assert saida["quantos"] == 2
    t = saida["texto"]
    assert "20272" in t and "Click" in t and "PISTA" in t and "1.500" in t and "VIP" in t
    assert "impresso" in t and "aguardando impressão" in t
    assert saida["botao"] == "Carregar"


def test_sem_sessao_a_barra_pede_para_entrar_primeiro():
    saida = _no_navegador(_desvio() + """
        window.supabaseClient = { auth: { getSession: async () => ({ data: { session: null } }) } };
        document.getElementById('btn-meus-pedidos').click();
        await new Promise(r => setTimeout(r, 50));
        return {
            entrar: !document.getElementById('bloco-entrar').classList.contains('sumindo'),
            pedidos: !document.getElementById('meus-pedidos').classList.contains('sumindo'),
        };
    """)
    assert saida == {"entrar": True, "pedidos": False}


def test_o_vazio_e_o_sem_cliente_tem_frase():
    vazio = _no_navegador(_desvio({"pedidos": [], "sem_cliente": False}) + """
        await window.meusPedidos.abrir();
        return document.getElementById('sem-pedidos').textContent;
    """)
    assert "imprimir" in vazio
    sem = _no_navegador(_desvio({"pedidos": [], "sem_cliente": True}) + """
        await window.meusPedidos.abrir();
        return document.getElementById('sem-pedidos').textContent;
    """)
    assert "não está ligada a um cliente" in sem and "gráfica" in sem


def test_carregar_chama_a_caixa_com_o_numero_do_pedido():
    saida = _no_navegador(_desvio() + """
        await window.meusPedidos.abrir();
        document.getElementById('carregar-20281').click();
        await new Promise(r => setTimeout(r, 30));
        return window.__carregou;
    """)
    assert saida == 20281


def test_voltar_refaz_a_lista_de_eventos():
    saida = _no_navegador(_desvio() + """
        await window.meusPedidos.abrir();
        window.__chamadas = [];
        document.getElementById('btn-voltar-pedidos').click();
        await new Promise(r => setTimeout(r, 50));
        return {
            lista: !document.getElementById('lista').classList.contains('sumindo'),
            releu: window.__chamadas.includes('/meus-eventos'),
        };
    """)
    assert saida == {"lista": True, "releu": True}


def test_sem_supabase_o_toque_na_barra_nao_estoura():
    """`AcessoConta.sessao()` LANCA de forma sincrona quando o `supabaseClient`
    e nulo -- sem rede na primeira abertura, ou no modo offline deliberado do
    `supabase-config.js`. Um throw solto no ouvinte do toque nao aparece na
    tela: o dono toca na barra e nao acontece absolutamente nada.

    O `_no_navegador` reprova qualquer erro de pagina, entao o proprio arnes e
    metade deste teste; a outra metade e a tela de entrar aparecer, que e o que
    esta barra faz quando nao ha sessao.
    """
    saida = _no_navegador(_desvio() + """
        window.supabaseClient = null;
        document.getElementById('btn-meus-pedidos').click();
        await new Promise(r => setTimeout(r, 50));
        return {
            entrar: !document.getElementById('bloco-entrar').classList.contains('sumindo'),
            pedidos: !document.getElementById('meus-pedidos').classList.contains('sumindo'),
        };
    """)
    assert saida == {"entrar": True, "pedidos": False}
