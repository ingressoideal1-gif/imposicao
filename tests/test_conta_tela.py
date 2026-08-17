# -*- coding: utf-8 -*-
"""A conta do cliente na casa do aplicativo: entrar ao abrir, trocar a senha
provisoria, sair. Decisoes de 17/08/2026."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from test_controle_tela import _no_navegador  # noqa: E402

DESVIO = """
    window.__chamadas = [];
    window.__minhaConta = { clientes: [{ id_cliente: 14, nome: 'Cliente Teste' }], precisa_trocar_senha: false };
    const pedirReal = AcessoConta.pedir;
    AcessoConta.pedir = async (caminho, opcoes) => {
        window.__chamadas.push({ caminho, corpo: opcoes && opcoes.body ? JSON.parse(opcoes.body) : null });
        if (caminho === '/minha-conta') return window.__minhaConta;
        if (caminho === '/minha-conta/senha') return { ok: true };
        if (caminho === '/meus-eventos') return { eventos: [] };
        if (caminho === '/meus-pedidos') return { pedidos: [] };
        return pedirReal(caminho, opcoes);
    };
"""


def test_decidir_abertura_e_pura():
    saida = _no_navegador("""
        return {
            semNada: window.conta.decidirAbertura(null, false),
            comAparelho: window.conta.decidirAbertura(null, true),
            comSessao: window.conta.decidirAbertura({ access_token: 'x' }, false),
        };
    """)
    assert saida == {"semNada": "entrar", "comAparelho": "lista", "comSessao": "lista"}


def test_sem_aparelho_e_sem_sessao_a_casa_abre_na_tela_de_entrar():
    saida = _no_navegador(DESVIO + """
        localStorage.clear();
        window.supabaseClient = { auth: { getSession: async () => ({ data: { session: null } }) } };
        await window.listaEventos.recarregar();
        const entrar = document.getElementById('bloco-entrar');
        return {
            entrarVisivel: !entrar.classList.contains('sumindo'),
            listaVisivel: !document.getElementById('lista').classList.contains('sumindo'),
            barraVisivel: !document.getElementById('bloco-novo-evento').classList.contains('sumindo'),
            texto: entrar.textContent,
        };
    """)
    assert saida["entrarVisivel"] is True
    assert saida["listaVisivel"] is False and saida["barraVisivel"] is False
    assert "Peça à gráfica" in saida["texto"], "quem nao tem acesso precisa saber a quem pedir"
    assert "Esqueci minha senha" in saida["texto"]


def test_com_aparelho_no_chaveiro_a_casa_abre_na_lista_sem_pedir_login():
    saida = _no_navegador(DESVIO + """
        localStorage.clear();
        window.chaveiro.guardar({ evento_id: 'ev-1', nome_evento: 'Click', aparelho_id: 'a1',
                                  nome_portao: 'Aparelho 1', token: 't' });
        window.supabaseClient = { auth: { getSession: async () => ({ data: { session: null } }) } };
        await window.listaEventos.recarregar();
        return {
            entrarVisivel: !document.getElementById('bloco-entrar').classList.contains('sumindo'),
            listaVisivel: !document.getElementById('lista').classList.contains('sumindo'),
        };
    """)
    assert saida == {"entrarVisivel": False, "listaVisivel": True}


def test_senha_provisoria_obriga_a_trocar_antes_de_qualquer_coisa():
    saida = _no_navegador(DESVIO + """
        window.__minhaConta.precisa_trocar_senha = true;
        await window.conta.depoisDeEntrar({ access_token: 'jwt', user: { email: 'd@x.com' } });
        const tela = document.getElementById('trocar-senha');
        const visivel = !tela.classList.contains('sumindo');
        const atualEscondida = document.getElementById('campo-senha-atual').closest('label, div')
            .classList.contains('sumindo');
        document.getElementById('campo-senha-nova').value = 'novasenha123';
        document.getElementById('campo-senha-confirma').value = 'novasenha123';
        document.getElementById('btn-trocar-senha').click();
        await new Promise(r => setTimeout(r, 50));
        return {
            visivel, atualEscondida,
            depois: !document.getElementById('trocar-senha').classList.contains('sumindo'),
            chamada: window.__chamadas.find(c => c.caminho === '/minha-conta/senha'),
        };
    """)
    assert saida["visivel"] is True
    assert saida["atualEscondida"] is True, "com senha provisoria nao se pede a senha atual"
    assert saida["depois"] is False
    assert saida["chamada"]["corpo"] == {"senha_atual": "", "senha_nova": "novasenha123"}


def test_a_senha_nova_precisa_ser_confirmada_e_ter_oito():
    saida = _no_navegador(DESVIO + """
        window.conta.mostrarTrocarSenha({ obrigatoria: false });
        document.getElementById('campo-senha-atual').value = 'antiga123';
        document.getElementById('campo-senha-nova').value = 'curta';
        document.getElementById('campo-senha-confirma').value = 'curta';
        document.getElementById('btn-trocar-senha').click();
        await new Promise(r => setTimeout(r, 30));
        const erro1 = document.getElementById('erro-trocar-senha').textContent;
        document.getElementById('campo-senha-nova').value = 'novasenha123';
        document.getElementById('campo-senha-confirma').value = 'outracoisa';
        document.getElementById('btn-trocar-senha').click();
        await new Promise(r => setTimeout(r, 30));
        return { erro1, erro2: document.getElementById('erro-trocar-senha').textContent,
                 chamou: window.__chamadas.some(c => c.caminho === '/minha-conta/senha') };
    """)
    assert "8" in saida["erro1"]
    assert "iguais" in saida["erro2"] or "conferem" in saida["erro2"]
    assert saida["chamou"] is False


def test_o_menu_do_olho_tem_trocar_senha_e_sair_da_conta():
    saida = _no_navegador("""
        return {
            trocar: document.getElementById('btn-trocar-minha-senha').textContent,
            sair: document.getElementById('btn-sair-conta').textContent,
        };
    """)
    assert "Trocar minha senha" in saida["trocar"]
    assert "Sair da conta" in saida["sair"]


def test_esqueci_minha_senha_manda_falar_com_a_grafica_e_nao_promete_email():
    saida = _no_navegador("""
        const frase = await AcessoConta.esqueciSenha('x@y.com');
        return { frase };
    """)
    assert "gráfica" in saida["frase"]
    assert "e-mail" not in saida["frase"].lower() or "link" not in saida["frase"].lower()
