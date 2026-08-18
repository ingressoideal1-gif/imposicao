# -*- coding: utf-8 -*-
"""Carregar um pedido: a caixa com a ficha preenchida, 'juntar ao evento',
a senha, e a pergunta se este aparelho vai ler o evento -- sem pedir a senha
de novo, porque o servidor devolveu a elevacao. Decisoes de 17/08/2026."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from test_controle_tela import _no_navegador  # noqa: E402

DESVIO = """
    window.__chamadas = [];
    const pedirReal = AcessoConta.pedir;
    AcessoConta.pedir = async (caminho, opcoes) => {
        const corpo = opcoes && opcoes.body ? JSON.parse(opcoes.body) : null;
        window.__chamadas.push({ caminho, corpo, headers: (opcoes && opcoes.headers) || {} });
        if (caminho === '/meus-eventos') return { eventos: [
            { id: 'ev-a', nome_evento: 'Click', status: 'ativo' },
            { id: 'ev-fim', nome_evento: 'Velho', status: 'finalizado' } ] };
        if (caminho === '/pedidos/20272/carregar') return { evento_id: 'ev-novo', nome_evento: corpo.nome_evento || 'Click', novo: !corpo.evento_id,
            elevacao: { token: 'elev', expira_em: Math.floor(Date.now()/1000) + 900, minutos: 15 } };
        if (caminho === '/eventos/ev-novo') return { evento: { id: 'ev-novo', nome_evento: 'Click' }, setores: [{ id: 's1' }], aparelhos: [] };
        if (caminho === '/eventos/ev-novo/aparelhos/aqui') return { id: 'a-novo', nome: corpo.nome, token: 'tok' };
        return pedirReal(caminho, opcoes);
    };
    window.aparelhoAqui.assumir = (token, nome, dados) => { window.__assumiu = { token, nome, dados }; return Promise.resolve(); };
    localStorage.setItem('ideal_control_email', 'd@x.com');
    const SESSAO = { access_token: 'jwt', user: { email: 'd@x.com' } };
    const PEDIDO = { pedido: 20272, nome_evento: 'Click', data_evento: '2026-09-12T22:00:00Z', local_evento: 'Arena',
                     setores: [{ nome: 'PISTA', quantidade: 1500, impresso: true }] };
"""


def test_a_caixa_abre_com_a_ficha_preenchida_e_os_eventos_ativos_para_juntar():
    saida = _no_navegador(DESVIO + """
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        const destino = document.getElementById('carregar-destino');
        return {
            visivel: !document.getElementById('caixa-carregar').classList.contains('sumindo'),
            nome: document.getElementById('carregar-nome').value,
            local: document.getElementById('carregar-local').value,
            dataPreenchida: document.getElementById('carregar-data').value !== '',
            opcoes: Array.from(destino.options).map(o => o.textContent),
            email: document.getElementById('carregar-email').textContent,
        };
    """)
    assert saida["visivel"] is True
    assert saida["nome"] == "Click" and saida["local"] == "Arena" and saida["dataPreenchida"]
    assert saida["opcoes"][0].startswith("Criar um evento novo")
    assert any("Click" in o for o in saida["opcoes"][1:]) and not any("Velho" in o for o in saida["opcoes"])
    assert "d@x.com" in saida["email"]


def test_sem_senha_nao_manda_nada():
    saida = _no_navegador(DESVIO + """
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-senha').value = '';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 30));
        return { erro: document.getElementById('erro-carregar').textContent,
                 chamou: window.__chamadas.some(c => c.caminho.endsWith('/carregar')) };
    """)
    assert "senha" in saida["erro"].lower() and saida["chamou"] is False


def test_confirmar_manda_ficha_e_senha_e_recebe_a_elevacao():
    saida = _no_navegador(DESVIO + """
        window.caixaConfirmar.perguntar = async () => false;   // "Nao": so volta
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-nome').value = 'Click 2026';
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 80));
        const c = window.__chamadas.find(x => x.caminho === '/pedidos/20272/carregar');
        return { corpo: c.corpo, elevacao: JSON.parse(sessionStorage.getItem('acesso_elevacao') || 'null'),
                 caixaFechada: document.getElementById('caixa-carregar').classList.contains('sumindo') };
    """)
    assert saida["corpo"]["nome_evento"] == "Click 2026"
    assert saida["corpo"]["senha"] == "segredo1"
    assert saida["corpo"]["evento_id"] is None
    assert saida["corpo"]["local_evento"] == "Arena"
    assert saida["corpo"]["navegador"]
    assert saida["elevacao"]["evento_id"] == "ev-novo" and saida["elevacao"]["token"] == "elev"
    assert saida["caixaFechada"] is True


def test_juntar_a_um_evento_manda_o_evento_id():
    saida = _no_navegador(DESVIO + """
        window.caixaConfirmar.perguntar = async () => false;
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-destino').value = 'ev-a';
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 80));
        return window.__chamadas.find(x => x.caminho === '/pedidos/20272/carregar').corpo.evento_id;
    """)
    assert saida == "ev-a"


def test_sim_liga_este_aparelho_sem_pedir_a_senha_de_novo():
    saida = _no_navegador(DESVIO + """
        window.__perguntas = [];
        window.caixaConfirmar.perguntar = async (texto) => { window.__perguntas.push(texto); return true; };
        let pediuSenha = false;
        const original = document.getElementById('caixa-entrar-config');
        const obs = new MutationObserver(() => { if (!original.classList.contains('sumindo')) pediuSenha = true; });
        obs.observe(original, { attributes: true });
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 150));
        const aqui = window.__chamadas.find(x => x.caminho === '/eventos/ev-novo/aparelhos/aqui');
        return { pergunta: window.__perguntas[0], pediuSenha, headers: aqui && aqui.headers, corpo: aqui && aqui.corpo,
                 assumiu: window.__assumiu };
    """)
    assert "aparelho" in saida["pergunta"].lower()
    assert saida["pediuSenha"] is False
    assert saida["headers"]["X-Elevacao"] == "elev"
    assert saida["corpo"]["nome"] == "Aparelho 1"
    assert saida["assumiu"]["dados"]["evento_id"] == "ev-novo"


def test_sem_a_elevacao_do_servidor_o_Sim_PEDE_a_senha_em_vez_de_ligar_sem_ela():
    """O servidor pode devolver `elevacao: null`.

    O evento ja esta gravado nesse ponto -- so o bilhete de 15 minutos falhou.
    E uma resposta legitima, e nao um erro: perder o `evento_id` seria grave,
    perder a elevacao e recuperavel, e por isso o Task 5 a tornou "soft".

    Sem tratar isso aqui, o "Sim, usar este aparelho" chamaria o
    `virarPortao.criar` com `elevacao` nulo e o `X-Elevacao` sairia
    `undefined`: o servidor recusaria, e o dono veria o aparelho simplesmente
    nao ligar, sem nada para fazer a respeito. O caminho certo e o mesmo que a
    barra do evento ja usa -- `Controle.comSenha`, que pede a senha e eleva --,
    e a senha e uma saida que o dono TEM em maos.
    """
    saida = _no_navegador(DESVIO + """
        const comElevacao = AcessoConta.pedir;
        AcessoConta.pedir = async (caminho, opcoes) => {
            const r = await comElevacao(caminho, opcoes);
            if (caminho === '/pedidos/20272/carregar') { r.elevacao = null; }
            return r;
        };
        window.caixaConfirmar.perguntar = async () => true;
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 150));
        return {
            pediuSenha: !document.getElementById('caixa-entrar-config').classList.contains('sumindo'),
            ligou: window.__chamadas.some(x => x.caminho === '/eventos/ev-novo/aparelhos/aqui'),
            guardou: sessionStorage.getItem('acesso_elevacao'),
        };
    """)
    assert saida["pediuSenha"] is True, "o Sim seguiu sem elevacao nenhuma"
    assert saida["ligou"] is False, "o aparelho foi criado com X-Elevacao vazio"
    assert saida["guardou"] is None, "guardou uma elevacao que o servidor nao mandou"


def test_a_recusa_do_servidor_aparece_na_caixa_e_a_caixa_fica():
    saida = _no_navegador(DESVIO + """
        AcessoConta.pedir = async (caminho) => {
            if (caminho === '/meus-eventos') return { eventos: [] };
            const e = new Error('senha nao confere'); e.status = 401; throw e;
        };
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-senha').value = 'errada1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 60));
        return { erro: document.getElementById('erro-carregar').textContent,
                 aberta: !document.getElementById('caixa-carregar').classList.contains('sumindo') };
    """)
    assert "senha nao confere" in saida["erro"] and saida["aberta"] is True
