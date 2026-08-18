# -*- coding: utf-8 -*-
"""O estado de espera de um botao: texto trocado, disabled e aria-busy
enquanto uma chamada de rede corre -- e a volta garantida ao rotulo original,
mesmo quando a resposta e erro. Decisao de 18/08/2026."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from test_controle_tela import _no_navegador  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


# ── `comecar` / `terminar`, isolados ────────────────────────────────────────


def test_comecar_troca_o_texto_desabilita_e_marca_aria_busy():
    saida = _no_navegador("""
        const botao = document.getElementById('btn-entrar');
        const original = botao.textContent;
        window.botaoEspera.comecar(botao, 'Entrando…');
        const durante = {
            texto: botao.textContent, disabled: botao.disabled,
            busy: botao.getAttribute('aria-busy'),
        };
        window.botaoEspera.terminar(botao);
        const depois = {
            texto: botao.textContent, disabled: botao.disabled,
            busy: botao.getAttribute('aria-busy'),
        };
        return { original, durante, depois };
    """)
    assert saida["durante"] == {"texto": "Entrando…", "disabled": True, "busy": "true"}
    assert saida["depois"] == {"texto": saida["original"], "disabled": False, "busy": None}


def test_uma_segunda_chamada_de_comecar_nao_perde_o_rotulo_original():
    """Idempotente: se `comecar` guardasse o rotulo A CADA chamada, uma
    segunda espera sobre o mesmo botao (nao deveria acontecer, mas a garantia
    e desta funcao) devolveria o texto DA ESPERA anterior, e nao o original."""
    saida = _no_navegador("""
        const botao = document.getElementById('btn-entrar');
        window.botaoEspera.comecar(botao, 'Entrando…');
        window.botaoEspera.comecar(botao, 'Entrando de novo…');
        window.botaoEspera.terminar(botao);
        return { texto: botao.textContent, disabled: botao.disabled };
    """)
    assert saida["texto"] == "Entrar"
    assert saida["disabled"] is False


def test_terminar_e_idempotente():
    saida = _no_navegador("""
        const botao = document.getElementById('btn-entrar');
        window.botaoEspera.comecar(botao, 'Entrando…');
        window.botaoEspera.terminar(botao);
        window.botaoEspera.terminar(botao);   // uma segunda vez, sem nada pendente
        return { texto: botao.textContent, disabled: botao.disabled,
                 busy: botao.getAttribute('aria-busy') };
    """)
    assert saida == {"texto": "Entrar", "disabled": False, "busy": None}


def test_aceita_null_e_elemento_inexistente_sem_lancar():
    """A tela que some no meio da espera (o "Entrar" que o `esconderEntrar()`
    esconde assim que o login da certo) ainda pode ter `terminar` chamado
    sobre ela sem quebrar nada."""
    saida = _no_navegador("""
        let erro = null;
        try {
            window.botaoEspera.comecar(null, 'x');
            window.botaoEspera.terminar(null);
            window.botaoEspera.terminar(document.getElementById('nao-existe'));
        } catch (e) { erro = String(e); }
        return { erro };
    """)
    assert saida["erro"] is None


# ── No botao de verdade, com a rede que demora ──────────────────────────────
#
# O caso do brief: `#btn-entrar` chama `AcessoConta.entrar`, que chama
# `supabaseClient.auth.signInWithPassword`. Uma versao falsa dele que fica
# PENDENTE por 300ms prova que o botao mostra a espera enquanto a rede nao
# respondeu -- e nao so num teste que resolve tudo no mesmo microtask.

DESVIO = """
    window.__chamadas = [];
    const pedirReal = AcessoConta.pedir;
    AcessoConta.pedir = async (caminho, opcoes) => {
        window.__chamadas.push(caminho);
        if (caminho === '/minha-conta') return { precisa_trocar_senha: false };
        if (caminho === '/meus-eventos') return { eventos: [] };
        return pedirReal(caminho, opcoes);
    };
"""


def _entrar_com_demora(resultado_js, espera_ms=300):
    """`signInWithPassword` fica PENDENTE por `espera_ms` antes de resolver
    com `resultado_js` -- o mesmo formato de resposta que o SDK do Supabase
    devolve (`{ data: { session } }` ou `{ error }`)."""
    return ("""
        window.supabaseClient.auth.signInWithPassword = () => new Promise((resolver) => {
            setTimeout(() => resolver(""" + resultado_js + """), """ + str(espera_ms) + """);
        });
        window.supabaseClient.auth.getSession = async () => ({ data: { session: null } });
    """)


def test_btn_entrar_fica_Entrando_e_desabilitado_durante_a_espera_e_volta_depois():
    saida = _no_navegador(DESVIO + _entrar_com_demora(
        "{ data: { session: { access_token: 'jwt', user: { email: 'd@x.com' } } } }"
    ) + """
        const botao = document.getElementById('btn-entrar');
        const original = botao.textContent;
        document.getElementById('email').value = 'd@x.com';
        document.getElementById('senha').value = 'segredo123';
        botao.click();
        await new Promise(r => setTimeout(r, 100));
        const durante = { texto: botao.textContent, disabled: botao.disabled,
                           busy: botao.getAttribute('aria-busy') };
        await new Promise(r => setTimeout(r, 400));
        const depois = { texto: botao.textContent, disabled: botao.disabled,
                          busy: botao.getAttribute('aria-busy') };
        return { original, durante, depois };
    """)
    assert saida["durante"] == {"texto": "Entrando…", "disabled": True, "busy": "true"}, (
        "o botao nao mostrou a espera enquanto a rede nao respondeu"
    )
    assert saida["depois"] == {"texto": saida["original"], "disabled": False, "busy": None}


def test_btn_entrar_volta_ao_normal_mesmo_quando_a_resposta_e_erro():
    saida = _no_navegador(DESVIO + _entrar_com_demora(
        "{ error: { message: 'Invalid login credentials' } }"
    ) + """
        const botao = document.getElementById('btn-entrar');
        document.getElementById('email').value = 'd@x.com';
        document.getElementById('senha').value = 'errada';
        botao.click();
        await new Promise(r => setTimeout(r, 100));
        const durante = { texto: botao.textContent, disabled: botao.disabled };
        await new Promise(r => setTimeout(r, 400));
        const depois = { texto: botao.textContent, disabled: botao.disabled,
                          busy: botao.getAttribute('aria-busy') };
        const erro = document.getElementById('erro-login').textContent;
        return { durante, depois, erro };
    """)
    assert saida["durante"] == {"texto": "Entrando…", "disabled": True}
    assert saida["depois"] == {"texto": "Entrar", "disabled": False, "busy": None}, (
        "a senha errada deixou o botao preso na espera"
    )
    assert saida["erro"], "a senha errada nao disse nada na tela"


# ── `travarCampos()` nao pode reabilitar um botao em espera ────────────────
#
# Achado de revisao de codigo, 18/08/2026: `travarCampos()` roda a cada
# `desenhar()` E a cada 20s pelo `setInterval` da faixa (`controle.js`), e faz
# `el.disabled = leitura` em todo `.so-com-senha` -- inclusive num botao que
# `botaoEspera.comecar()` acabou de desabilitar. Com elevacao valida
# (`leitura = false`) isso REABILITAVA "Gravando..."/"Salvando..."/
# "Carregando..." no meio da propria espera: o dono via o botao solto de
# novo, tocava outra vez, e mandava um SEGUNDO PATCH -- o defeito exato que a
# espera existe para evitar, e rede fraca no portao passa facil dos 20s entre
# redesenhos.


def test_travar_campos_nao_reabilita_um_botao_em_espera():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };

        const botao = document.getElementById('btn-gravar-evento');
        window.botaoEspera.comecar(botao, 'Gravando…');
        // `desenhar()` chama `travarCampos()` por dentro -- e o `setInterval`
        // da faixa chama exatamente a mesma funcao, entao exercitar `desenhar()`
        // aqui prova os dois caminhos de uma vez.
        Controle.desenhar();
        const durante = { texto: botao.textContent, disabled: botao.disabled };

        window.botaoEspera.terminar(botao);
        Controle.desenhar();
        const depoisComElevacao = botao.disabled;

        Controle.estado.elevacao = null;
        Controle.desenhar();
        const depoisSemElevacao = botao.disabled;

        return { durante, depoisComElevacao, depoisSemElevacao };
    """)
    assert saida["durante"] == {"texto": "Gravando…", "disabled": True}, (
        "travarCampos() reabilitou um botao que ainda esperava resposta de rede"
    )
    # `terminar` devolveu o botao ao normal, e dali em diante quem governa
    # `disabled` volta a ser a trava de elevacao -- nos dois sentidos.
    assert saida["depoisComElevacao"] is False, "desenhar() nao voltou a governar o botao apos terminar"
    assert saida["depoisSemElevacao"] is True


# ── Registro ─────────────────────────────────────────────────────────────


def test_os_tres_lugares_citam_o_arquivo_novo():
    """Sem os tres, `botao-espera.js` da 404 na estacao, fica congelado na
    versao do build, ou nem chega a carregar no navegador."""
    import security_config

    assert "botao-espera.js" in security_config.PAINEL_ARQUIVOS
    assert "botao-espera.js" in _ler("frontend/sw.js")
    assert "botao-espera.js" in _ler("frontend/controle.html")


def test_o_arquivo_carrega_antes_do_conta_js():
    """`conta.js` usa `window.botaoEspera` no "Entrar" e no "Salvar a senha";
    carregar depois dele deixaria os dois globais indefinidos."""
    html = _ler("frontend/controle.html")
    assert html.index('src="botao-espera.js') < html.index('src="conta.js')
