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
    # `and`, e nao `or`: com `or` entre dois negativos bastava a frase nao ter
    # UMA das duas palavras para o teste passar -- ele aprovaria "enviamos o
    # link" desde que a palavra "e-mail" nao aparecesse junto.
    assert "e-mail" not in saida["frase"].lower() and "link" not in saida["frase"].lower(), (
        "a frase volta a prometer uma mensagem que o projeto nao envia"
    )


# ── As telas nao se empilham (revisao de 17/08/2026) ────────────────────────
#
# A tela inicial tinha DOIS donos sem contrato entre si: o `menu-geral.js`, que
# a escondia atras do olho, e o `conta.js`, que a escondia atras das telas de
# conta. Nenhum sabia dos blocos do outro, e o portao que nao se escapa tinha
# uma saida pelo olho.


def test_com_a_troca_obrigatoria_aberta_o_olho_nao_tem_saida():
    """O portao da senha provisoria nao se escapa.

    Tocar no olho abria o menu por cima da troca obrigatoria, e o "← Voltar" de
    la devolvia a lista com o portao ainda aberto -- ou seja, a tela que existe
    para nao ser pulada era pulada em dois toques.
    """
    saida = _no_navegador(DESVIO + """
        window.__minhaConta.precisa_trocar_senha = true;
        await window.conta.depoisDeEntrar({ access_token: 'jwt' });
        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 80));
        const sumiu = (id) => document.getElementById(id).classList.contains('sumindo');
        return {
            olhoTravado: document.getElementById('btn-menu-geral').disabled,
            menuAberto: !sumiu('menu-geral'),
            listaVisivel: !sumiu('lista'),
            portaoNaFrente: !sumiu('trocar-senha'),
        };
    """)
    assert saida["olhoTravado"] is True
    assert saida["menuAberto"] is False, "o olho abriu o menu por cima do portao"
    assert saida["listaVisivel"] is False, "a lista voltou com o portao aberto"
    assert saida["portaoNaFrente"] is True


def test_o_menu_nao_consegue_transformar_a_troca_obrigatoria_em_opcional():
    """Com o portao aberto, "Trocar minha senha" redesenhava a MESMA tela com o
    Cancelar a vista -- e de quebra orfanava a promessa da primeira, que era
    quem levaria a pessoa para a casa depois de trocar."""
    saida = _no_navegador(DESVIO + """
        window.__minhaConta.precisa_trocar_senha = true;
        await window.conta.depoisDeEntrar({ access_token: 'jwt' });
        const primeira = window.conta.mostrarTrocarSenha({ obrigatoria: false });
        await new Promise(r => setTimeout(r, 30));
        return {
            cancelarEscondido: document.getElementById('btn-cancelar-trocar-senha')
                .classList.contains('sumindo'),
            titulo: document.getElementById('trocar-senha-titulo').textContent,
            atualEscondida: document.getElementById('bloco-senha-atual')
                .classList.contains('sumindo'),
        };
    """)
    assert saida["cancelarEscondido"] is True, "o portao virou opcional pelo menu"
    assert saida["titulo"] == "Escolha a sua senha"
    assert saida["atualEscondida"] is True


def test_o_entrar_chamado_pelo_menu_tem_Cancelar_e_ele_devolve_a_lista():
    """Sem Cancelar, o "Trocar minha senha" de um celular que ja e aparelho e
    nao tem sessao era uma sala sem porta: a lista ficava escondida atras e
    nenhum gesto a trazia de volta.

    Na abertura FORCADA o botao nao aparece -- ali nao ha para onde cancelar.
    """
    saida = _no_navegador(DESVIO + """
        const cancelar = document.getElementById('btn-cancelar-entrar');
        window.conta.mostrarEntrar({ depois: function () { return null; } });
        const comDepois = !cancelar.classList.contains('sumindo');
        cancelar.click();
        await new Promise(r => setTimeout(r, 30));
        const voltou = {
            entrar: document.getElementById('bloco-entrar').classList.contains('sumindo'),
            lista: !document.getElementById('lista').classList.contains('sumindo'),
        };
        window.conta.mostrarEntrar();
        return { comDepois, voltou, rotulo: cancelar.textContent,
                 semDepois: !cancelar.classList.contains('sumindo') };
    """)
    assert saida["comDepois"] is True
    assert "Cancelar" in saida["rotulo"]
    assert saida["voltou"] == {"entrar": True, "lista": True}
    assert saida["semDepois"] is False, "a abertura forcada nao tem para onde cancelar"


def test_a_sessao_restaurada_tambem_passa_pela_troca_obrigatoria():
    """O portao vivia so no caminho do login, e sessao no celular dura dias: na
    segunda abertura o cliente entrava direto na lista com a senha que a
    grafica passou ainda valendo.

    E UMA pergunta por abertura, nao uma por redesenho da lista.
    """
    saida = _no_navegador(DESVIO + """
        window.__minhaConta.precisa_trocar_senha = true;
        await window.listaEventos.recarregar();
        await new Promise(r => setTimeout(r, 60));
        await window.listaEventos.recarregar();
        await new Promise(r => setTimeout(r, 60));
        return {
            visivel: !document.getElementById('trocar-senha').classList.contains('sumindo'),
            cancelarEscondido: document.getElementById('btn-cancelar-trocar-senha')
                .classList.contains('sumindo'),
            perguntou: window.__chamadas.filter(c => c.caminho === '/minha-conta').length,
        };
    """)
    assert saida["visivel"] is True
    assert saida["cancelarEscondido"] is True
    assert saida["perguntou"] == 1, "a conferencia e uma so por abertura do aplicativo"


# ── Sair da conta ───────────────────────────────────────────────────────────


def _sair_com_chaveiro(semear):
    return _no_navegador(DESVIO + """
        localStorage.clear();
        """ + semear + """
        let saiu = false;
        window.supabaseClient = { auth: {
            getSession: async () => ({ data: { session: null } }),
            signOut: async () => { saiu = true; return {}; },
        } };
        await window.conta.sair();
        await new Promise(r => setTimeout(r, 30));
        return { saiu,
                 entrarVisivel: !document.getElementById('bloco-entrar')
                     .classList.contains('sumindo'),
                 listaVisivel: !document.getElementById('lista')
                     .classList.contains('sumindo') };
    """)


def test_sair_da_conta_sem_aparelho_devolve_a_tela_de_entrar():
    """Sem conta e sem aparelho nao sobra casa nenhuma: a tela de entrar e o
    unico lugar util."""
    saida = _sair_com_chaveiro("")
    assert saida["saiu"] is True
    assert saida["entrarVisivel"] is True
    assert saida["listaVisivel"] is False


def test_sair_da_conta_com_aparelho_no_chaveiro_deixa_a_lista():
    """O celular do porteiro nao pode cair numa tela de login ao sair da conta
    do dono: ele nao tem conta nenhuma, e o evento que ele le continua no
    chaveiro."""
    saida = _sair_com_chaveiro("""
        window.chaveiro.guardar({ evento_id: 'ev-1', nome_evento: 'Click',
                                  aparelho_id: 'a1', nome_portao: 'Aparelho 1',
                                  token: 't' });
    """)
    assert saida["saiu"] is True
    assert saida["entrarVisivel"] is False
    assert saida["listaVisivel"] is True


def test_a_lista_nao_reaparece_atras_da_troca_obrigatoria():
    """A fuga que sobrou da primeira rodada, e ela nao precisava de nenhum
    toque: o `esconderEntrar()` roda a cada `carregar()` com sessao, entao o
    SEGUNDO `recarregar()` devolvia `#lista` e `#bloco-novo-evento` atras do
    portao -- em fluxo normal, tocaveis. A pessoa nem via que estava escapando.
    """
    saida = _no_navegador(DESVIO + """
        window.__minhaConta.precisa_trocar_senha = true;
        await window.listaEventos.recarregar();
        await new Promise(r => setTimeout(r, 60));
        await window.listaEventos.recarregar();
        await new Promise(r => setTimeout(r, 60));
        const sumiu = (id) => document.getElementById(id).classList.contains('sumindo');
        return { lista: sumiu('lista'), novoEvento: sumiu('bloco-novo-evento'),
                 portaoNaFrente: !sumiu('trocar-senha') };
    """)
    assert saida["portaoNaFrente"] is True
    assert saida["lista"] is True, "a lista reapareceu atras do portao"
    assert saida["novoEvento"] is True, '"Novo Evento" reapareceu atras do portao'


def test_o_olho_nao_abre_o_menu_por_baixo_da_tela_de_entrar():
    """O menu nascia ATRAS do cartao de login: o painel abria, a tela inicial
    sumia junto, e a pessoa tocava no vazio."""
    saida = _no_navegador(DESVIO + """
        localStorage.clear();
        window.supabaseClient = { auth: { getSession: async () => ({ data: { session: null } }) } };
        await window.listaEventos.recarregar();
        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 80));
        const sumiu = (id) => document.getElementById(id).classList.contains('sumindo');
        return { entrarNaFrente: !sumiu('bloco-entrar'), menuAberto: !sumiu('menu-geral') };
    """)
    assert saida["entrarNaFrente"] is True
    assert saida["menuAberto"] is False, "o menu abriu por baixo da tela de entrar"


def test_o_olho_nao_abre_o_menu_por_baixo_da_troca_de_senha():
    """Vale tambem para a troca OPCIONAL, que nao trava o olho: de la o
    "← Voltar" do menu devolvia a lista com a troca ainda aberta."""
    saida = _no_navegador(DESVIO + """
        window.conta.mostrarTrocarSenha({ obrigatoria: false });
        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 80));
        const sumiu = (id) => document.getElementById(id).classList.contains('sumindo');
        return { trocaNaFrente: !sumiu('trocar-senha'), menuAberto: !sumiu('menu-geral'),
                 olhoTravado: document.getElementById('btn-menu-geral').disabled };
    """)
    assert saida["trocaNaFrente"] is True
    assert saida["olhoTravado"] is False, "a troca opcional nao trava o olho"
    assert saida["menuAberto"] is False, "o menu abriu por baixo da troca de senha"
