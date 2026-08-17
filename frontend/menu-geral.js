/**
 * O menu geral, atras do olho do cabecalho.
 *
 * Terceiro estado desta pagina, ao lado de `#lista` e `#engrenagem`, e como
 * eles nunca aparece junto com os outros.
 *
 * ## O que vai aqui, e o que nao vai
 *
 * O que e da TELA. A configuracao de um EVENTO continua na engrenagem ao lado
 * da barra dele -- misturar as duas faria o dono procurar os setores de um
 * evento dentro de um menu que nao sabe de que evento se trata.
 *
 * O primeiro morador sao os eventos finalizados, que vieram da tela inicial em
 * 17/08/2026 por decisao do usuario. La eles ocupavam o fim da tela e
 * empurravam para baixo a unica coisa que o porteiro precisa achar com pressa:
 * a barra do evento que ele vai ler.
 *
 * ## Por que nao ha conflito com a engrenagem
 *
 * Os dois escondem `#lista`, e a primeira leitura e que um poderia deixar o
 * outro meio aberto. Nao pode: a engrenagem so e alcancavel PELA lista, entao
 * com o menu aberto nao ha como abri-la. O caminho de volta e um so, o
 * "← Voltar" daqui.
 */
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    /** O olho, desenhado aqui. SVG embutido pelo mesmo motivo dos outros
     *  icones desta tela: ela precisa abrir sem rede, e cada arquivo de imagem
     *  e mais uma requisicao que pode faltar. */
    function iconeOlho() {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z',
         'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'].forEach(function (d) {
            var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', d);
            svg.appendChild(p);
        });
        return svg;
    }

    /**
     * A tela inicial inteira, e nao so a lista de eventos.
     *
     * "Novo Evento" entra aqui porque ele fica FORA do `#lista` de proposito --
     * o porteiro nao tem conta, e a barra precisa aparecer acima do login. Sem
     * escondê-lo junto, ele sobrava em cima dos eventos finalizados, oferecendo
     * ler um QR numa tela que nao e a de ler QR.
     */
    var DA_TELA_INICIAL = ['lista', 'bloco-novo-evento'];

    function mostrarInicial(mostrar) {
        DA_TELA_INICIAL.forEach(function (id) {
            var el = $(id);
            if (el) { el.classList.toggle('sumindo', !mostrar); }
        });
    }

    /** Um estado de topo esta na tela? */
    function naFrente(id) {
        var el = $(id);
        return !!el && !el.classList.contains('sumindo');
    }

    function abrir() {
        if (!$('menu-geral')) { return; }
        // AS TELAS DE CONTA VENCEM O MENU. `#bloco-entrar` e `#trocar-senha`
        // (do `conta.js`) ficam na frente da tela inicial, e o menu nascia por
        // BAIXO delas: o painel abria escondido atras do cartao de login, e a
        // pessoa tocava no vazio. Com a troca obrigatoria era pior -- o olho ja
        // fica travado nesse caso, mas a troca opcional nao trava, e de la o
        // "← Voltar" do menu devolvia a lista com a troca ainda aberta.
        if (naFrente('bloco-entrar') || naFrente('trocar-senha')) { return; }
        // A camera pode estar aberta atras: sair da tela sem desliga-la deixa o
        // aparelho filmando e gastando bateria num painel onde nao ha o que ler.
        if (window.lerQR) { window.lerQR.fechar(); }
        $('menu-geral').classList.remove('sumindo');
        mostrarInicial(false);
    }

    function fechar() {
        if (!$('menu-geral')) { return; }
        $('menu-geral').classList.add('sumindo');
        mostrarInicial(true);
    }

    function aberto() {
        var m = $('menu-geral');
        return !!m && !m.classList.contains('sumindo');
    }

    function ligar() {
        var olho = $('btn-menu-geral');
        if (!olho) { return; }          // outra pagina serve o arquivo
        olho.appendChild(iconeOlho());
        // O olho ALTERNA: quem entrou por ele tenta sair por ele. O "← Voltar"
        // continua existindo porque e o rotulo em texto, e nem todo mundo
        // percebe que um icone e um interruptor.
        olho.addEventListener('click', function () {
            if (aberto()) { fechar(); } else { abrir(); }
        });

        var voltar = $('btn-voltar-menu');
        if (voltar) { voltar.addEventListener('click', fechar); }
    }

    window.menuGeral = { abrir: abrir, fechar: fechar, aberto: aberto };
    document.addEventListener('DOMContentLoaded', ligar);
})();
