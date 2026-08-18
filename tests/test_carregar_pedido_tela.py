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


def test_o_codigo_cru_do_servidor_nao_chega_ao_cliente():
    """Sem frase do servidor, o `acesso-conta.js` inventa um "Erro N". Esse
    texto nao informa nem oferece saida -- e o unico que nao pode chegar a
    tela. O numero fica, porque sem ele a grafica nao tem o que apurar."""
    saida = _no_navegador(DESVIO + """
        AcessoConta.pedir = async (caminho) => {
            if (caminho === '/meus-eventos') return { eventos: [] };
            const e = new Error('Erro 502'); e.status = 502; throw e;
        };
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 60));
        return document.getElementById('erro-carregar').textContent;
    """)
    assert "Erro 502" not in saida, "o texto inventado chegou ao cliente"
    assert "502" in saida, "sem o codigo, a grafica nao tem o que apurar"


def test_o_Enter_na_senha_envia():
    """A senha e o ultimo campo, e o Enter dela e o gesto natural de terminar.
    Sem o ouvinte, o teclado do celular oferece "Ir" e nada acontece."""
    saida = _no_navegador(DESVIO + """
        window.caixaConfirmar.perguntar = async () => false;
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        const campo = document.getElementById('carregar-senha');
        campo.value = 'segredo1';
        campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await new Promise(r => setTimeout(r, 80));
        return window.__chamadas.some(c => c.caminho === '/pedidos/20272/carregar');
    """)
    assert saida is True


# ── A caixa como sub-estado de Meus Pedidos ─────────────────────────────────


def test_abrir_esconde_meus_pedidos_e_mostra_a_caixa():
    saida = _no_navegador(DESVIO + """
        document.getElementById('meus-pedidos').classList.remove('sumindo');
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        const sumiu = id => document.getElementById(id).classList.contains('sumindo');
        return { pedidos: sumiu('meus-pedidos'), caixa: !sumiu('caixa-carregar'),
                 lista: sumiu('lista'), barra: sumiu('bloco-novo-evento') };
    """)
    assert saida == {"pedidos": True, "caixa": True, "lista": True, "barra": True}


def test_cancelar_volta_para_meus_pedidos_e_a_senha_nao_fica_no_DOM():
    """Cancelar volta para a LISTA DE PEDIDOS, e nao para a casa: e de la que a
    pessoa veio, e o pedido continua la para ser carregado depois. A senha do
    dono nao pode sobrar no campo, num celular que fica com o porteiro."""
    saida = _no_navegador(DESVIO + """
        const base = AcessoConta.pedir;
        AcessoConta.pedir = async (c, o) => (c === '/meus-pedidos'
            ? { pedidos: [], sem_cliente: false } : base(c, o));
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-cancelar').click();
        await new Promise(r => setTimeout(r, 150));
        const sumiu = id => document.getElementById(id).classList.contains('sumindo');
        return { caixa: sumiu('caixa-carregar'), pedidos: !sumiu('meus-pedidos'),
                 senha: document.getElementById('carregar-senha').value };
    """)
    assert saida == {"caixa": True, "pedidos": True, "senha": ""}


def test_a_frase_de_juntar_nomeia_o_evento_e_nao_deixa_espaco_solto():
    def _pergunta(desvio_extra=""):
        return _no_navegador(DESVIO + desvio_extra + """
            window.__perguntas = [];
            window.caixaConfirmar.perguntar = async (t) => { window.__perguntas.push(t); return false; };
            await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
            document.getElementById('carregar-destino').value = 'ev-a';
            document.getElementById('carregar-senha').value = 'segredo1';
            document.getElementById('btn-carregar-confirmar').click();
            await new Promise(r => setTimeout(r, 150));
            return window.__perguntas[0];
        """)

    com_nome = _pergunta()
    assert com_nome.startswith("Pedido juntado ao evento Click. ")
    assert "usar este aparelho" in com_nome

    # Sem nome na resposta, a frase nao pode virar "ao evento . Quer…".
    sem_nome = _pergunta("""
        const comNome = AcessoConta.pedir;
        AcessoConta.pedir = async (c, o) => {
            const r = await comNome(c, o);
            if (c === '/pedidos/20272/carregar') { r.nome_evento = ''; }
            return r;
        };
    """)
    assert sem_nome.startswith("Pedido juntado ao evento. ")
    assert "  " not in sem_nome and " ." not in sem_nome


# ── As duas travas que moram no `virar-portao.js`, e valem aqui tambem ──────


def test_o_aparelho_que_JA_le_o_evento_vai_LER_em_vez_de_criar_outro_portao():
    """O caso que o "juntar ao evento" existe para atender: o dono leu ontem, e
    hoje carrega o pedido complementar. `criar` ali registraria um segundo
    portao -- um "Aparelho 2" indistinguivel do primeiro na lista dele -- e
    deixaria o token antigo orfao. O que falta e so ir ler."""
    saida = _no_navegador(DESVIO + """
        window.chaveiro.procurar = (id) => (id === 'ev-novo' ? { evento_id: id, token: 't' } : null);
        window.virarPortao.abrir = (id, nome) => { window.__abriu = { id, nome }; return Promise.resolve(); };
        window.__perguntas = [];
        window.caixaConfirmar.perguntar = async (t, o) => { window.__perguntas.push({ t, o }); return true; };
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-destino').value = 'ev-a';
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 150));
        return { pergunta: window.__perguntas[0], abriu: window.__abriu,
                 criou: window.__chamadas.some(c => c.caminho === '/eventos/ev-novo/aparelhos/aqui') };
    """)
    assert "já lê" in saida["pergunta"]["t"]
    assert saida["pergunta"]["o"]["rotulo"] == "Ir para a leitura"
    assert saida["abriu"]["id"] == "ev-novo"
    assert saida["criou"] is False, "criou um segundo portao no mesmo aparelho"


def test_com_leitura_pendente_de_OUTRO_evento_nao_ha_Sim_nenhum():
    """Trocar o token agora faria as leituras do evento de ontem subirem
    contadas no evento de hoje -- a contagem que o cliente pagou para ter sai
    errada e ninguem descobre. Nao e pergunta: e recusa, com o numero exato e
    por onde ligar depois."""
    saida = _no_navegador(DESVIO + """
        window.chaveiro.carregado = () => 'ev-outro';
        window.portariaDeposito.contarFila = () => Promise.resolve(3);
        window.__perguntas = [];
        window.caixaConfirmar.perguntar = async (t) => { window.__perguntas.push(t); return true; };
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 200));
        const aviso = document.getElementById('erro-arranque');
        return { perguntou: window.__perguntas.length, texto: aviso.textContent,
                 visivel: !aviso.classList.contains('sumindo'),
                 criou: window.__chamadas.some(c => c.caminho === '/eventos/ev-novo/aparelhos/aqui') };
    """)
    assert saida["perguntou"] == 0, "ofereceu trocar de evento com leitura pendente"
    assert saida["criou"] is False
    assert saida["visivel"] is True
    assert "3 leitura" in saida["texto"]
    assert "Meus Eventos" in saida["texto"], "a trava nao disse por onde sair dela"


def test_a_fila_do_PROPRIO_evento_de_destino_nao_trava_nada():
    """A fila e DELE. Travar aqui pararia o portao por causa de um 4G ruim --
    que e exatamente quando a fila cresce. Mesma leitura do `decidirTroca`."""
    saida = _no_navegador(DESVIO + """
        window.chaveiro.carregado = () => 'ev-novo';
        window.portariaDeposito.contarFila = () => Promise.resolve(9);
        window.__perguntas = [];
        window.caixaConfirmar.perguntar = async (t) => { window.__perguntas.push(t); return false; };
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 150));
        return window.__perguntas.length;
    """)
    assert saida == 1


# -- "Entrar libera 15 minutos" ----------------------------------------------
#
# Decisao do usuario, 18/08/2026. Quem entrou na conta ha menos de 15 minutos
# tem um bilhete assinado (o `elevacaoConta()` do `acesso-conta.js`), e esta
# caixa deixa de pedir a senha: o campo sai da tela e o POST leva o bilhete nos
# cabecalhos, sem `senha` nenhuma no corpo.
#
# O campo que some sem explicacao faz a pessoa procurar o que ela deveria
# digitar -- por isso a frase entra no lugar dele. E o bilhete pode vencer com a
# caixa aberta: nesse caso o campo VOLTA, com o motivo escrito, que e a regra do
# projeto de toda trava dizer na propria tela como sair dela.

BILHETE = """
    sessionStorage.setItem('ideal_control_elevacao_conta', JSON.stringify({
        token: 'bilhete-da-conta', expira_em: Math.floor(Date.now() / 1000) + 900 }));
"""


def _escondido(id_):
    """O campo da senha mora dentro do `span.campo-senha` que o olho de
    mostrar/ocultar cria em tempo de execucao. Esconder so o input deixaria o
    botao "Mostrar" boiando sozinho na caixa -- por isso o teste olha para o
    envoltorio, e nao para o campo."""
    return ("(() => { const el = document.getElementById('" + id_ + "');"
            " const alvo = el.parentNode.classList.contains('campo-senha')"
            " ? el.parentNode : el;"
            " return alvo.classList.contains('sumindo'); })()")


def test_com_o_bilhete_da_conta_a_caixa_abre_SEM_o_campo_da_senha():
    saida = _no_navegador(DESVIO + BILHETE + """
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        const aviso = document.getElementById('carregar-sem-senha');
        return {
            campoEscondido: """ + _escondido("carregar-senha") + """,
            rotuloEscondido: document.querySelector('label[for="carregar-senha"]')
                .classList.contains('sumindo'),
            olhoEscondido: document.querySelector('#caixa-carregar .olho-senha')
                .closest('.campo-senha').classList.contains('sumindo'),
            avisoVisivel: !aviso.classList.contains('sumindo'),
            avisoTexto: aviso.textContent,
        };
    """)
    assert saida["campoEscondido"] is True
    assert saida["rotuloEscondido"] is True
    assert saida["olhoEscondido"] is True, "o olho ficou sozinho, ligado a um campo invisivel"
    assert saida["avisoVisivel"] is True
    assert "não precisa digitar a senha" in saida["avisoTexto"]


def test_com_o_bilhete_o_POST_leva_o_cabecalho_e_NAO_leva_senha():
    """`senha: ''` no corpo seria mandar uma senha errada: o servidor so olha
    para o bilhete quando o campo vem vazio de verdade."""
    saida = _no_navegador(DESVIO + BILHETE + """
        window.caixaConfirmar.perguntar = async () => false;
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 120));
        const c = window.__chamadas.find(x => x.caminho === '/pedidos/20272/carregar');
        return { corpo: c && c.corpo, headers: c && c.headers,
                 caixaFechada: document.getElementById('caixa-carregar')
                     .classList.contains('sumindo') };
    """)
    assert saida["corpo"], "o POST nao saiu sem a senha digitada"
    assert "senha" not in saida["corpo"], "mandou uma senha vazia junto com o bilhete"
    assert saida["headers"]["X-Elevacao"] == "bilhete-da-conta"
    assert saida["headers"]["X-Navegador"] == saida["corpo"]["navegador"], (
        "o navegador do cabecalho e o do corpo divergem; o servidor recusa"
    )
    assert saida["caixaFechada"] is True


def test_o_401_do_bilhete_traz_o_campo_da_senha_de_volta_com_o_motivo():
    """O bilhete pode vencer no caminho, ou a aba pode ter sido restaurada com
    um token velho. Nao ha o que tentar de novo sozinho: o que resolve e a
    senha, e ela precisa ter onde ser digitada."""
    saida = _no_navegador(DESVIO + BILHETE + """
        const base = AcessoConta.pedir;
        AcessoConta.pedir = async (c, o) => {
            if (c === '/pedidos/20272/carregar') {
                const e = new Error('senha nao confere'); e.status = 401; throw e;
            }
            return base(c, o);
        };
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 120));
        return {
            erro: document.getElementById('erro-carregar').textContent,
            campoDeVolta: !(""" + _escondido("carregar-senha") + """),
            avisoSumiu: document.getElementById('carregar-sem-senha')
                .classList.contains('sumindo'),
            aberta: !document.getElementById('caixa-carregar').classList.contains('sumindo'),
            bilhete: sessionStorage.getItem('ideal_control_elevacao_conta'),
            botaoLiberado: !document.getElementById('btn-carregar-confirmar').disabled,
        };
    """)
    assert "liberação venceu" in saida["erro"]
    assert "senha" in saida["erro"].lower(), "a trava nao disse por onde sair dela"
    assert saida["campoDeVolta"] is True, "pediu a senha com o campo escondido"
    assert saida["avisoSumiu"] is True
    assert saida["aberta"] is True
    assert saida["bilhete"] is None, "guardou um bilhete que o servidor ja recusou"
    assert saida["botaoLiberado"] is True, "ele nao consegue tentar de novo"


def test_a_segunda_tentativa_depois_do_401_vai_pelo_caminho_da_senha():
    """A saida tem de FUNCIONAR, e nao so aparecer: a segunda tentativa manda a
    senha digitada e nenhum cabecalho de bilhete."""
    saida = _no_navegador(DESVIO + BILHETE + """
        window.caixaConfirmar.perguntar = async () => false;
        // Contador proprio, e nao o `__chamadas` do DESVIO: a primeira
        // tentativa MORRE antes de chegar la, e o teste precisa ver as duas.
        window.__tentativas = [];
        const base = AcessoConta.pedir;
        AcessoConta.pedir = async (c, o) => {
            if (c === '/pedidos/20272/carregar') {
                window.__tentativas.push({ corpo: JSON.parse(o.body), headers: o.headers });
                if (window.__tentativas.length === 1) {
                    const e = new Error('nao'); e.status = 401; throw e;
                }
            }
            return base(c, o);
        };
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 120));
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 200));
        const ultima = window.__tentativas[window.__tentativas.length - 1];
        return { quantas: window.__tentativas.length,
                 corpo: ultima.corpo, headers: ultima.headers };
    """)
    assert saida["quantas"] == 2
    assert saida["corpo"]["senha"] == "segredo1"
    assert "X-Elevacao" not in saida["headers"], (
        "a segunda tentativa levou o bilhete que o servidor acabou de recusar"
    )


def test_o_bilhete_que_vence_com_a_caixa_ABERTA_devolve_o_campo_sem_mandar_nada():
    """Ele e lido no toque do botao, e nao guardado da abertura: a caixa pode
    ficar aberta mais tempo do que o bilhete dura, e mandar o POST assim
    gastaria uma viagem para receber o mesmo 401."""
    saida = _no_navegador(DESVIO + BILHETE + """
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        // O bilhete morre com a caixa na tela.
        AcessoConta.esquecerElevacaoConta();
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 80));
        return {
            mandou: window.__chamadas.some(c => c.caminho.endsWith('/carregar')),
            erro: document.getElementById('erro-carregar').textContent,
            campoDeVolta: !(""" + _escondido("carregar-senha") + """),
        };
    """)
    assert saida["mandou"] is False
    assert "liberação venceu" in saida["erro"]
    assert saida["campoDeVolta"] is True


def test_uma_senha_DIGITADA_vence_o_bilhete_e_vai_no_corpo():
    """A senha digitada tem precedencia. O servidor confere a que veio, e uma
    senha errada nao pode passar calada por causa de uma liberacao aberta --
    quem digitou espera que o que digitou tenha sido olhado."""
    saida = _no_navegador(DESVIO + BILHETE + """
        window.caixaConfirmar.perguntar = async () => false;
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        // O campo esta escondido, mas ele existe: o teste escreve nele como um
        // preenchimento automatico do navegador escreveria.
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 120));
        const c = window.__chamadas.find(x => x.caminho === '/pedidos/20272/carregar');
        return { corpo: c.corpo, headers: c.headers };
    """)
    assert saida["corpo"]["senha"] == "segredo1"
    assert "X-Elevacao" not in saida["headers"]


def test_sem_bilhete_a_caixa_continua_pedindo_a_senha():
    """O caminho de sempre, e ele nao pode ter mudado: sem liberacao aberta, o
    campo esta na tela e o aviso nao."""
    saida = _no_navegador(DESVIO + """
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        return {
            campoNaTela: !(""" + _escondido("carregar-senha") + """),
            rotuloNaTela: !document.querySelector('label[for="carregar-senha"]')
                .classList.contains('sumindo'),
            avisoEscondido: document.getElementById('carregar-sem-senha')
                .classList.contains('sumindo'),
        };
    """)
    assert saida == {"campoNaTela": True, "rotuloNaTela": True, "avisoEscondido": True}
