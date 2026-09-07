"""Conferencia no celular sem gravar pedidos, ingressos ou tokens de portao."""
from test_controle_tela import _no_navegador

BASE = """
    let sessaoAtual = { access_token: 'ficticio', user: { id: 'admin-teste' } };
    AcessoConta.sessao = async () => sessaoAtual;
    window.__gets = [];
    window.fetch = async (url, opcoes) => {
        if (opcoes.method !== 'GET') throw Error('Escrita inesperada');
        window.__gets.push(url);
        let data = { pedidos: [{ pedido_id_int: 900, nome_evento: 'Evento ficticio' }] };
        if (url.endsWith('/pedidos/900')) data = { pedido: 900, cliente: { nome: '<Cliente ficticio>' },
            modelos: [{ nome: 'Pista', quantidade: 20, sobe_ao_controle: true }],
            publicacao: { total_credenciais: 20 }, aparelhos: [] };
        if (url.includes('/clientes?')) data = { clientes: [{ id_cliente: 3, nome: 'Cliente ficticio' }] };
        if (url.endsWith('/clientes/3')) data = { cliente: { nome: 'Cliente ficticio' }, pedidos: [{ pedido_id_int: 900 }] };
        return { ok: true, status: 200, json: async () => data };
    };
"""


def test_consulta_pedido_e_cliente_sem_escrita_e_sem_html_injetado():
    r = _no_navegador(BASE + """
        await conferenciaPedidos.abrir();
        document.querySelector('#conferencia-resultado button').click();
        await new Promise(r => setTimeout(r, 40));
        const detalhe = document.getElementById('conferencia-resultado').textContent;
        document.getElementById('conferencia-tipo').value = 'cliente';
        document.getElementById('conferencia-busca').value = 'Cliente ficticio';
        document.getElementById('conferencia-form').dispatchEvent(new Event('submit', {cancelable: true}));
        await new Promise(r => setTimeout(r, 40));
        document.querySelector('#conferencia-resultado button').click();
        await new Promise(r => setTimeout(r, 40));
        return { detalhe, calls: window.__gets, tela: document.getElementById('conferencia-resultado').textContent,
                 chaveiro: localStorage.getItem('ideal_portaria_token') };
    """)
    assert "<Cliente ficticio>" in r["detalhe"]
    assert "20" in r["detalhe"] and "somente leitura" in r["detalhe"]
    assert "Pedido 900" in r["tela"]
    assert len(r["calls"]) == 4
    assert r["chaveiro"] is None


def test_conta_sem_permissao_nao_ve_pedidos():
    r = _no_navegador(BASE + """
        window.fetch = async () => ({ ok: false, status: 403 });
        await conferenciaPedidos.abrir();
        return { aviso: document.getElementById('conferencia-aviso').textContent,
                 dados: document.getElementById('conferencia-resultado').textContent };
    """)
    assert "Administrador ou Atendimento" in r["aviso"]
    assert r["dados"] == ""


def test_resposta_atrasada_nao_reaparece_depois_de_sair_da_tela():
    r = _no_navegador(BASE + """
        let responder;
        window.fetch = () => new Promise(r => { responder = r; });
        const abrindo = conferenciaPedidos.abrir();
        await new Promise(r => setTimeout(r, 30));
        conta.esconderTelaInicial(true);
        responder({ ok: true, status: 200, json: async () => ({pedidos:[{pedido_id_int:900}]}) });
        await abrindo;
        return document.getElementById('conferencia-resultado').textContent;
    """)
    assert r == ""


def test_troca_de_conta_descarta_resposta_do_usuario_anterior():
    r = _no_navegador(BASE + """
        window.fetch = async () => {
            sessaoAtual = {access_token:'outro', user:{id:'cliente-teste'}};
            return {ok:true,status:200,json:async()=>({pedidos:[{pedido_id_int:900}]})};
        };
        await conferenciaPedidos.abrir();
        return {dados:document.getElementById('conferencia-resultado').textContent,
                aviso:document.getElementById('conferencia-aviso').textContent};
    """)
    assert r["dados"] == ""
    assert "conta mudou" in r["aviso"]
