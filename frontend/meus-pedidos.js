/* Meus Pedidos: histórico de eventos encerrados/inativados. Carga somente por QR. */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };

    /**
     * O icone de lista da barra do topo.
     *
     * SVG embutido, e nao PNG, pelo mesmo motivo dos icones do
     * `lista-eventos.js`: esta tela precisa abrir sem rede, e cada arquivo de
     * imagem e mais uma requisicao que pode faltar. `aria-hidden` porque o
     * rotulo em texto esta ao lado, dentro do proprio botao -- anunciado duas
     * vezes, o leitor de tela leria "lista Meus Pedidos".
     */
    function iconeLista() {
        var el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        el.setAttribute('viewBox', '0 0 24 24');
        el.setAttribute('width', '24');
        el.setAttribute('height', '24');
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke', 'currentColor');
        el.setAttribute('stroke-width', '2');
        el.setAttribute('stroke-linecap', 'round');
        el.setAttribute('stroke-linejoin', 'round');
        el.setAttribute('aria-hidden', 'true');
        ['M8 6h13', 'M8 12h13', 'M8 18h13',
         'M3 6h.01', 'M3 12h.01', 'M3 18h.01'].forEach(function (d) {
            var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', d);
            el.appendChild(p);
        });
        return el;
    }

    function fecharEngrenagemSeAberta() {
        return Promise.resolve().then(function () {
            var eng = $('engrenagem');
            if (!eng || eng.classList.contains('sumindo')) { return; }
            if (!window.Controle || !window.Controle.fecharEngrenagem) { return; }
            return window.Controle.fecharEngrenagem();
        });
    }

    function abrir() {
        return fecharEngrenagemSeAberta().then(function () {
            window.conta.esconderTelaInicial(true);
            $('meus-pedidos').classList.remove('sumindo');
            return window.listaEventos.atualizarHistorico();
        });
    }

    function fechar() {
        // `sumindo` em si mesmo ANTES de pedir a tela inicial de volta: e o que
        // o contrato do `conta.js` exige de quem fecha um estado de topo --
        // senao o `NA_FRENTE` dela ve esta tela na frente e nao devolve nada.
        $('meus-pedidos').classList.add('sumindo');
        window.menuGeral.abrir();
    }

    function ligar() {
        if (!$('meus-pedidos')) { return; }
        // O icone entra ANTES do rotulo, e por JS: o `controle.html` nao
        // carrega SVG solto em lugar nenhum, e as barras de evento ja desenham
        // os icones delas assim. O rotulo em texto continua no HTML -- o icone
        // nao substitui palavra nenhuma nesta tela.
        var barra = $('btn-meus-pedidos');
        if (barra && !barra.querySelector('.icone-lista')) {
            var caixa = document.createElement('span');
            caixa.className = 'icone-lista';
            caixa.appendChild(iconeLista());
            barra.insertBefore(caixa, barra.firstChild);
        }
        // As duas portas da MESMA acao: a barra e o rotulo em texto, o `+`
        // fecha a coluna da direita onde cada evento tem a sua engrenagem.
        ['btn-meus-pedidos', 'btn-meus-pedidos-mais'].forEach(function (id) {
            var b = $(id);
            if (b) { b.addEventListener('click', function () { abrir(); }); }
        });
        $('btn-voltar-pedidos').addEventListener('click', function () { fechar(); });

        // "Atualizar": refaz a mesma busca de dentro da tela, sem ir e voltar
        // pela lista de eventos. O cliente carregou um pedido agora mesmo na
        // gráfica e quer ver se ele já entrou -- pedir para sair e entrar de
        // novo seria dois toques a mais para a mesma coisa.
        var atualizar = $('btn-atualizar-pedidos');
        if (atualizar) {
            atualizar.addEventListener('click', function () {
                window.botaoEspera.comecar(atualizar, 'Atualizando…');
                Promise.resolve(window.listaEventos.atualizarHistorico()).then(function () {
                    window.botaoEspera.terminar(atualizar);
                }, function () {
                    window.botaoEspera.terminar(atualizar);
                });
            });
        }
    }

    window.meusPedidos = { abrir: abrir, fechar: fechar };
    document.addEventListener('DOMContentLoaded', ligar);
})();
