/**
 * "Meus Pedidos": os pedidos ja impressos do cliente, e o Carregar.
 *
 * O servidor decide o que e "apto" (impresso, legivel, nao cancelado, ainda
 * nao carregado); esta tela so desenha e manda para a caixa do Carregar.
 * Sem sessao, pede para entrar primeiro e volta para ca.
 *
 * ## O quinto estado de topo da casa
 *
 * `#meus-pedidos` entra ao lado de `#lista` + `#bloco-novo-evento`, do
 * `#menu-geral`, da `#engrenagem` e das duas telas de conta -- e, como eles,
 * nunca convive com os outros. O contrato escrito no `conta.js` vale aqui:
 * quem abre esconde os outros, e quem fecha so devolve a tela inicial se nao
 * houver mais nada na frente dela. Por isso `abrir()` fecha o menu e esconde a
 * tela inicial, e o `conta.js` esconde ESTA tela quando uma das dele aparece.
 */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var DA_TELA_INICIAL = ['lista', 'bloco-novo-evento'];

    function mostrarInicial(mostrar) {
        DA_TELA_INICIAL.forEach(function (id) {
            var el = $(id);
            if (el) { el.classList.toggle('sumindo', !mostrar); }
        });
    }
    function numero(n) { return Number(n || 0).toLocaleString('pt-BR'); }
    function dataCurta(iso) {
        if (!iso) { return ''; }
        // "2026-08-12" sem hora e lido como meia-noite em UTC, e no Brasil isso
        // volta um dia a menos -- em silencio. O meio-dia local resolve sem
        // depender do fuso de quem esta olhando.
        var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
    }
    function texto(pai, tag, conteudo, classe) {
        var el = document.createElement(tag);
        el.textContent = conteudo;          // escrito por gente ou pelo ERP: TEXTO
        if (classe) { el.className = classe; }
        pai.appendChild(el);
        return el;
    }

    function cartaoDePedido(p, sessao) {
        var c = document.createElement('div');
        c.className = 'cartao cartao-pedido';
        c.id = 'pedido-' + p.pedido;
        var topo = document.createElement('div');
        topo.className = 'pedido-topo';
        texto(topo, 'strong', 'Pedido ' + p.pedido);
        texto(topo, 'span', dataCurta(p.data), 'pedido-data');
        c.appendChild(topo);
        texto(c, 'div', p.nome_evento, 'pedido-nome');
        var setores = document.createElement('div');
        setores.className = 'pedido-setores';
        (p.setores || []).forEach(function (s) {
            var linha = document.createElement('div');
            linha.className = 'pedido-setor';
            texto(linha, 'span', s.nome + ' · ' + numero(s.quantidade));
            texto(linha, 'span', s.impresso ? 'impresso' : 'aguardando impressão',
                  'selo-impressao ' + (s.impresso ? 'sim' : 'nao'));
            setores.appendChild(linha);
        });
        c.appendChild(setores);
        var acoes = document.createElement('div');
        acoes.className = 'pedido-acoes';
        var b = document.createElement('button');
        b.type = 'button';
        b.id = 'carregar-' + p.pedido;
        b.textContent = 'Carregar';
        b.setAttribute('aria-label', 'Carregar o pedido ' + p.pedido);
        b.addEventListener('click', function () {
            if (!window.carregarPedido) { return; }
            window.carregarPedido.abrir(p.pedido, sessao, p);
        });
        acoes.appendChild(b);
        c.appendChild(acoes);
        return c;
    }

    function desenhar(resposta, sessao) {
        var caixa = $('pedidos');
        var vazio = $('sem-pedidos');
        caixa.innerHTML = '';
        var lista = (resposta && resposta.pedidos) || [];
        lista.forEach(function (p) { caixa.appendChild(cartaoDePedido(p, sessao)); });
        // O vazio precisa de frase, e sao DUAS frases diferentes: "ainda nao
        // imprimimos nada seu" e "esta conta nao esta ligada a cliente nenhum"
        // mandam o cliente fazer coisas diferentes.
        if (resposta && resposta.sem_cliente) {
            vazio.textContent = 'Sua conta ainda não está ligada a um cliente. Peça à gráfica para liberar o seu acesso.';
        } else {
            vazio.textContent = 'Nenhum pedido impresso para carregar. Assim que a gráfica imprimir um pedido seu, ele aparece aqui.';
        }
        vazio.classList.toggle('sumindo', lista.length > 0);
    }

    function abrir() {
        // `Promise.resolve().then(...)` e nao a chamada direta: `AcessoConta.sessao()`
        // LANCA de forma sincrona quando o `supabaseClient` e nulo -- sem rede na
        // primeira abertura, ou no modo offline deliberado do `supabase-config.js`.
        // Um throw solto aqui sairia do ouvinte do toque como erro nao tratado, e o
        // dono tocaria na barra sem ver acontecer absolutamente nada. E a mesma
        // protecao que o `lista-eventos.js` ja tem no arranque dele.
        return Promise.resolve().then(function () {
            return window.AcessoConta.sessao();
        }).catch(function () { return null; }).then(function (s) {
            if (!s) {
                // Um so `depois`: entrou, volta para ca. Sem sessao nao ha o
                // que buscar, e mandar a pessoa para a lista depois do login
                // faria ela procurar de novo o botao em que acabou de tocar.
                window.conta.mostrarEntrar({ depois: function () { return abrir(); } });
                return;
            }
            if (window.menuGeral) { window.menuGeral.fechar(); }
            mostrarInicial(false);
            $('meus-pedidos').classList.remove('sumindo');
            $('pedidos').innerHTML = '';
            var vazio = $('sem-pedidos');
            vazio.textContent = 'Buscando os seus pedidos…';
            vazio.classList.remove('sumindo');
            return window.AcessoConta.pedir('/meus-pedidos', {
                headers: { Authorization: 'Bearer ' + s.access_token }
            }).then(function (r) { desenhar(r, s); }).catch(function (e) {
                // Erro COM status veio do servidor e ja tem frase escrita la;
                // sem status a rede e que faltou, e a frase tem de dizer o que
                // fazer -- a tela nao pode ficar so com "Buscando…" para sempre.
                vazio.textContent = (e && e.status)
                    ? ((e.message) || 'Não consegui buscar os seus pedidos agora.')
                    : 'Preciso de internet para buscar os seus pedidos. Confira a conexão e tente de novo.';
                vazio.classList.remove('sumindo');
            });
        });
    }

    function fechar() {
        // `sumindo` em si mesmo ANTES de pedir a tela inicial de volta: e o que
        // o contrato do `conta.js` exige de quem fecha um estado de topo.
        $('meus-pedidos').classList.add('sumindo');
        mostrarInicial(true);
        return window.listaEventos.recarregar();
    }

    function ligar() {
        if (!$('meus-pedidos')) { return; }
        // As duas portas da MESMA acao: a barra e o rotulo em texto, o `+`
        // fecha a coluna da direita onde cada evento tem a sua engrenagem.
        ['btn-meus-pedidos', 'btn-meus-pedidos-mais'].forEach(function (id) {
            var b = $(id);
            if (b) { b.addEventListener('click', function () { abrir(); }); }
        });
        $('btn-voltar-pedidos').addEventListener('click', function () { fechar(); });
    }

    window.meusPedidos = { abrir: abrir, fechar: fechar, desenhar: desenhar };
    document.addEventListener('DOMContentLoaded', ligar);
})();
