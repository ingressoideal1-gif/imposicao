/**
 * O convite para instalar o aplicativo.
 *
 * Não existe "link que instala": o link é a URL, e quem instala é o navegador.
 * O que faltava era a tela PEDIR. Sem isso a pessoa precisa saber abrir o menu
 * do navegador e procurar a opção — e, no iPhone, saber que o caminho é o botão
 * de compartilhar. Numa gráfica, isso vira uma ligação para o dono do evento.
 *
 * A caixa é opcional: a página que quiser o convite declara um elemento com
 * `id="convite-instalar"`. Quem não declarar simplesmente não convida, e nada
 * quebra — é assim que a portaria fica de fora sem precisar de exceção.
 */
(function () {
    'use strict';

    var guardado = null;

    function caixa() { return document.getElementById('convite-instalar'); }

    /**
     * Já está instalado?
     *
     * `display-mode: standalone` responde no Android e no iOS moderno;
     * `navigator.standalone` é o jeito antigo do Safari, e ainda há iPhone com
     * ele na gráfica. Sem esta pergunta, o convite continuaria aparecendo
     * DENTRO do aplicativo já instalado, oferecendo instalar o que já está.
     */
    function jaInstalado() {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || window.navigator.standalone === true;
    }

    function ehIPhone() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    window.addEventListener('beforeinstallprompt', function (e) {
        // Segurar o evento é o que permite oferecer no NOSSO botão, na hora em
        // que a pessoa está olhando a tela — em vez de numa faixa do navegador
        // que aparece e some sem ela entender o que era.
        e.preventDefault();
        guardado = e;

        var c = caixa();
        if (!c || jaInstalado()) { return; }

        c.innerHTML = '';
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Instalar aplicativo';
        b.onclick = function () {
            if (!guardado) { return; }
            guardado.prompt();
            guardado.userChoice.then(function () {
                // Some independentemente da resposta: quem recusou não quer ser
                // perguntado de novo na mesma visita.
                c.classList.add('sumindo');
                guardado = null;
            });
        };
        c.appendChild(b);
        c.classList.remove('sumindo');
    });

    window.addEventListener('appinstalled', function () {
        var c = caixa();
        if (c) { c.classList.add('sumindo'); }
        guardado = null;
    });

    document.addEventListener('DOMContentLoaded', function () {
        // O iPhone não dispara evento nenhum: ou se escreve o caminho, ou a
        // pessoa não descobre. Só no Safari de iOS, e só fora do aplicativo já
        // instalado — dentro dele a instrução seria mentira.
        var c = caixa();
        if (!c || !ehIPhone() || jaInstalado()) { return; }
        c.className = 'aviso';
        c.textContent = 'Para instalar: toque em Compartilhar e depois em '
            + '"Adicionar à Tela de Início".';
    });
})();
