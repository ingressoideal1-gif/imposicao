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
    // A casa ABRE na tela de entrar quando nao ha aparelho nem sessao, entao
    // "o login esta na tela" e o estado inicial do arnes -- um teste que so
    // olhasse para isso passaria com a barra desligada. Contar a chamada e o
    // que prova que foi o TOQUE que pediu para entrar.
    window.__pediuEntrar = 0;
    const entrarReal = window.conta.mostrarEntrar;
    window.conta.mostrarEntrar = function (opcoes) {
        window.__pediuEntrar++;
        return entrarReal.call(window.conta, opcoes);
    };
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
        // Sair do login e voltar para a casa ANTES do toque: sem isto o teste
        // mediria o estado em que o arnes ja nasce, e passaria mesmo com a
        // barra sem ouvinte nenhum.
        window.conta.esconderEntrar();
        const antes = {
            entrar: !document.getElementById('bloco-entrar').classList.contains('sumindo'),
            pediu: window.__pediuEntrar,
        };
        document.getElementById('btn-meus-pedidos').click();
        await new Promise(r => setTimeout(r, 50));
        return {
            antes,
            entrar: !document.getElementById('bloco-entrar').classList.contains('sumindo'),
            pedidos: !document.getElementById('meus-pedidos').classList.contains('sumindo'),
            pediu: window.__pediuEntrar,
        };
    """)
    assert saida["antes"] == {"entrar": False, "pediu": 0}, "o teste comecou ja no login"
    assert saida["entrar"] is True and saida["pedidos"] is False
    assert saida["pediu"] == 1, "quem levou a tela de entrar nao foi o toque na barra"


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
        window.conta.esconderEntrar();
        const antes = {
            entrar: !document.getElementById('bloco-entrar').classList.contains('sumindo'),
            pediu: window.__pediuEntrar,
        };
        document.getElementById('btn-meus-pedidos').click();
        await new Promise(r => setTimeout(r, 50));
        return {
            antes,
            entrar: !document.getElementById('bloco-entrar').classList.contains('sumindo'),
            pedidos: !document.getElementById('meus-pedidos').classList.contains('sumindo'),
            pediu: window.__pediuEntrar,
        };
    """)
    assert saida["antes"] == {"entrar": False, "pediu": 0}, "o teste comecou ja no login"
    assert saida["entrar"] is True and saida["pedidos"] is False
    assert saida["pediu"] == 1, "quem levou a tela de entrar nao foi o toque na barra"


# ── A engrenagem, que e a unica tela com senha por tras ─────────────────────


def test_tocar_na_barra_com_a_engrenagem_aberta_FECHA_a_engrenagem():
    """A barra do topo vive FORA do `#lista`, e por isso sobrava por cima da
    configuracao -- uma saida da engrenagem que NAO passava pelo
    `fecharEngrenagem()`, o unico lugar que apaga a elevacao de 15 minutos e
    desfaz o login relampago. Em dois toques (Meus Pedidos, depois "← Voltar")
    o dono voltava para a casa com a configuracao ainda liberada, num celular
    que fica com o porteiro.

    A engrenagem e aberta pelo caminho de verdade: com uma elevacao viva no
    `sessionStorage`, o `abrirEngrenagem` dispensa a senha -- e assim o teste
    tambem cobre que ela esconde a barra do topo junto com a lista.
    """
    saida = _no_navegador(_desvio() + """
        window.conta.esconderEntrar();
        sessionStorage.setItem('acesso_elevacao', JSON.stringify({
            token: 'el-1', evento_id: 'ev-1',
            expira_em: Math.floor(Date.now() / 1000) + 900
        }));
        await Controle.abrirEngrenagem('ev-1', 'Click');
        const sumiu = (id) => document.getElementById(id).classList.contains('sumindo');
        const naEngrenagem = {
            aberta: !sumiu('engrenagem'), lista: sumiu('lista'),
            barra: sumiu('bloco-novo-evento'),
        };

        document.getElementById('btn-meus-pedidos').click();
        await new Promise(r => setTimeout(r, 200));
        return {
            naEngrenagem,
            engrenagem: sumiu('engrenagem'),
            elevacao: Controle.estado.elevacao,
            pedidos: !sumiu('meus-pedidos'),
            lista: sumiu('lista'),
        };
    """)
    assert saida["naEngrenagem"] == {"aberta": True, "lista": True, "barra": True}, (
        "a engrenagem deixou a barra do topo por cima dela"
    )
    assert saida["engrenagem"] is True, "a engrenagem ficou aberta atras dos pedidos"
    assert saida["elevacao"] is None, (
        "a elevacao de 15 minutos sobreviveu a saida da engrenagem"
    )
    assert saida["pedidos"] is True and saida["lista"] is True


# ── O que a tela faz quando a busca falha ───────────────────────────────────


def test_sessao_vencida_leva_a_entrar_de_novo_em_vez_de_Erro_401():
    """Sessao no celular dura dias, e o cliente abre o aplicativo semanas
    depois: 401 e a falha MAIS provavel desta tela. "Erro 401" nao diz nada e
    nao oferece saida nenhuma -- entrar de novo E a saida, e o `depois` traz a
    pessoa de volta para os pedidos sem ela tocar em mais nada."""
    saida = _no_navegador(_desvio() + """
        window.conta.esconderEntrar();
        const pedirAtual = AcessoConta.pedir;
        AcessoConta.pedir = async (caminho, opcoes) => {
            if (caminho === '/meus-pedidos') {
                const e = new Error('Erro 401');
                e.status = 401;
                throw e;
            }
            return pedirAtual(caminho, opcoes);
        };
        await window.meusPedidos.abrir();
        await new Promise(r => setTimeout(r, 30));
        return {
            entrar: !document.getElementById('bloco-entrar').classList.contains('sumindo'),
            pedidos: !document.getElementById('meus-pedidos').classList.contains('sumindo'),
            texto: document.getElementById('sem-pedidos').textContent,
            pediu: window.__pediuEntrar,
        };
    """)
    assert saida["entrar"] is True and saida["pedidos"] is False
    assert saida["pediu"] == 1
    assert "401" not in saida["texto"], "o codigo cru do servidor foi parar na tela"


def _falhando(corpo):
    return _no_navegador(_desvio() + """
        const pedirAtual = AcessoConta.pedir;
        AcessoConta.pedir = async (caminho, opcoes) => {
            if (caminho === '/meus-pedidos') { """ + corpo + """ }
            return pedirAtual(caminho, opcoes);
        };
        await window.meusPedidos.abrir();
        await new Promise(r => setTimeout(r, 30));
        const p = document.getElementById('sem-pedidos');
        return { texto: p.textContent, visivel: !p.classList.contains('sumindo') };
    """)


def test_a_falha_da_busca_sempre_diz_o_que_fazer():
    """Sem status foi a rede que faltou; com status e sem frase do servidor, o
    `acesso-conta.js` inventa um "Erro N" que nao informa nem oferece saida.
    Nos dois casos a tela nao pode ficar em "Buscando…" para sempre -- e a
    frase que o servidor ESCREVEU continua chegando inteira ao dono."""
    sem_rede = _falhando("throw new TypeError('Failed to fetch');")
    assert sem_rede["visivel"] is True
    assert "internet" in sem_rede["texto"]

    sem_frase = _falhando("const e = new Error('Erro 502'); e.status = 502; throw e;")
    assert sem_frase["visivel"] is True
    assert "Erro 502" not in sem_frase["texto"], "o texto inventado chegou ao dono"
    assert "502" in sem_frase["texto"], "sem o codigo, a grafica nao tem o que apurar"

    com_frase = _falhando(
        "const e = new Error('Este pedido nao e do seu cliente.'); "
        "e.status = 403; throw e;")
    assert com_frase["texto"] == "Este pedido nao e do seu cliente."
