/* Conferencia da grafica no celular. Somente GETs; nunca assume um portao. */
(function () {
    'use strict';
    var BASE = 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/acesso-interno';
    var $ = function (id) { return document.getElementById(id); };
    var geracao = 0;

    function limpar() {
        geracao++;
        if ($('conferencia-resultado')) { $('conferencia-resultado').replaceChildren(); }
        if ($('conferencia-aviso')) { $('conferencia-aviso').textContent = ''; }
    }

    async function pedir(caminho) {
        var sessao = await window.AcessoConta.sessao();
        if (!sessao) { throw new Error('Entre com sua conta da gráfica.'); }
        var resposta = await fetch(BASE + caminho, {
            method: 'GET', cache: 'no-store',
            headers: { Authorization: 'Bearer ' + sessao.access_token }
        });
        var atual = await window.AcessoConta.sessao();
        if (!atual || atual.user.id !== sessao.user.id) {
            throw new Error('A conta mudou. Abra a conferência novamente.');
        }
        if (resposta.status === 401 || resposta.status === 403) {
            throw new Error('Use uma conta da gráfica com permissão de Administrador ou Atendimento. A conta do cliente não permite esta conferência.');
        }
        var dados = await resposta.json();
        if (!resposta.ok) { throw new Error(typeof dados.detail === 'string' ? dados.detail : 'Não consegui consultar. Tente novamente.'); }
        return dados;
    }

    function texto(pai, tag, valor) {
        var el = document.createElement(tag);
        el.textContent = valor;
        pai.appendChild(el);
        return el;
    }

    function botao(pai, rotulo, acao) {
        var b = texto(pai, 'button', rotulo);
        b.type = 'button';
        b.className = 'secundario';
        b.addEventListener('click', acao);
        return b;
    }

    async function consultar(caminho, desenhar) {
        limpar();
        var rodada = geracao;
        $('conferencia-aviso').textContent = 'Consultando…';
        try {
            var dados = await pedir(caminho);
            if (rodada !== geracao) { return; }
            $('conferencia-aviso').textContent = '';
            desenhar(dados);
        } catch (e) {
            if (rodada === geracao) { $('conferencia-aviso').textContent = e.message || 'Confira a conexão e tente novamente.'; }
        }
    }

    function listaPedidos(dados) {
        var caixa = $('conferencia-resultado');
        if (dados.cliente) { texto(caixa, 'h2', dados.cliente.nome || 'Cliente'); }
        var pedidos = dados.pedidos || [];
        if (!pedidos.length) { texto(caixa, 'p', 'Nenhum pedido nesta consulta. Você também pode buscar pelo número do pedido.'); }
        pedidos.forEach(function (p) {
            var card = texto(caixa, 'div', ''); card.className = 'cartao';
            texto(card, 'strong', 'Pedido ' + p.pedido_id_int);
            texto(card, 'p', p.nome_evento || 'Evento ainda não configurado');
            botao(card, 'Conferir pedido ' + p.pedido_id_int, function () { abrirPedido(p.pedido_id_int); });
        });
        texto(caixa, 'p', 'Lista limitada aos pedidos recentes. Use a busca por número para localizar outro pedido.');
    }

    function detalhe(p) {
        var caixa = $('conferencia-resultado');
        texto(caixa, 'h2', 'Pedido ' + p.pedido);
        texto(caixa, 'p', 'Cliente: ' + (p.cliente && p.cliente.nome || 'Não vinculado'));
        texto(caixa, 'p', p.evento ? 'Evento: ' + p.evento.nome_evento + ' · ' + p.evento.status : 'O cliente ainda não carregou este pedido em um evento.');
        var pub = p.publicacao || {};
        texto(caixa, 'p', 'Códigos publicados: ' + Number(pub.total_credenciais || 0).toLocaleString('pt-BR'));
        if (!pub.total_credenciais) { texto(caixa, 'p', 'Confira a publicação dos códigos pelo NewProd. A impressão física não confirma o envio à nuvem.'); }
        (p.modelos || []).forEach(function (m) {
            var card = texto(caixa, 'div', ''); card.className = 'cartao';
            texto(card, 'strong', m.nome);
            texto(card, 'p', Number(m.quantidade || 0).toLocaleString('pt-BR') + ' unidades · ' + (m.sobe_ao_controle ? 'modelo com código de acesso' : 'modelo sem código de acesso compatível'));
        });
        texto(caixa, 'p', 'Aparelhos do evento: ' + (p.aparelhos || []).length);
        texto(caixa, 'p', 'Conferência somente leitura: nenhum ingresso será consumido e este celular não será vinculado ao evento.');
        botao(caixa, 'Testar PWA neste aparelho', testarAparelho);
    }

    async function testarAparelho() {
        var rodada = geracao;
        $('conferencia-aviso').textContent = 'Conferindo a instalação…';
        try {
            var reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
            var inicioEmCache = false;
            if (reg && reg.active && 'caches' in window) {
                var nomes = await caches.keys();
                for (var nome of nomes.filter(function (n) { return n.indexOf('ideal-control-') === 0; })) {
                    var c = await caches.open(nome);
                    if (await c.match(new URL('/ic/', location.href).href)) { inicioEmCache = true; break; }
                }
            }
            if (rodada !== geracao) { return; }
            $('conferencia-aviso').textContent = inicioEmCache
                ? 'A tela inicial está guardada no aparelho. Teste reabrir pelo ícone em modo avião, com Wi-Fi desligado. Os dados deste pedido não foram baixados para leitura.'
                : 'A preparação offline do aplicativo ainda não foi confirmada. Abra pelo ícone com internet e tente novamente.';
        } catch (e) {
            if (rodada === geracao) { $('conferencia-aviso').textContent = 'Não consegui conferir o armazenamento do aparelho. Abra com internet e tente novamente.'; }
        }
    }

    function abrirPedido(numero) {
        if (!/^\d+$/.test(String(numero))) { return; }
        return consultar('/pedidos/' + numero, detalhe);
    }

    function buscar() {
        var valor = $('conferencia-busca').value.trim();
        if ($('conferencia-tipo').value === 'pedido') {
            if (!/^\d+$/.test(valor)) { limpar(); $('conferencia-aviso').textContent = 'Digite o número do pedido.'; return; }
            return abrirPedido(valor);
        }
        if (valor.length < 2) { limpar(); $('conferencia-aviso').textContent = 'Digite pelo menos duas letras do nome do cliente.'; return; }
        return consultar('/clientes?busca=' + encodeURIComponent(valor), function (r) {
            var caixa = $('conferencia-resultado');
            (r.clientes || []).forEach(function (c) {
                botao(caixa, c.nome, function () { consultar('/clientes/' + c.id_cliente, listaPedidos); });
            });
            if (!(r.clientes || []).length) { texto(caixa, 'p', 'Nenhum cliente encontrado.'); }
            texto(caixa, 'p', 'Até 30 resultados. Refine o nome se necessário.');
        });
    }

    function abrir() {
        return Promise.resolve().then(function () { return window.AcessoConta.sessao(); }).then(function (s) {
            if (!s) { window.conta.mostrarEntrar({ depois: abrir }); return; }
            window.conta.esconderTelaInicial(true);
            $('conferencia-pedidos').classList.remove('sumindo');
            return consultar('/pedidos?limite=30', listaPedidos);
        }).catch(function () { window.conta.mostrarEntrar({ depois: abrir }); });
    }

    function fechar() {
        limpar();
        $('conferencia-pedidos').classList.add('sumindo');
        window.conta.esconderTelaInicial(false);
        return window.listaEventos.recarregar();
    }

    document.addEventListener('DOMContentLoaded', function () {
        ['btn-conferencia-menu', 'btn-conferencia-login', 'btn-conferencia-pedidos'].forEach(function (id) {
            if ($(id)) { $(id).addEventListener('click', abrir); }
        });
        $('btn-conferencia-voltar').addEventListener('click', fechar);
        $('conferencia-form').addEventListener('submit', function (ev) { ev.preventDefault(); buscar(); });
        if (typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.auth.onAuthStateChange === 'function') {
            var usuario = null;
            supabaseClient.auth.onAuthStateChange(function (evento, sessao) {
                var id = sessao && sessao.user.id;
                if (evento === 'SIGNED_OUT' || (usuario && usuario !== id)) { limpar(); }
                usuario = id;
            });
        }
    });
    window.conferenciaPedidos = { abrir: abrir, fechar: fechar, limpar: limpar };
})();
