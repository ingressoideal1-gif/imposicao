/**
 * O registro do service worker — comum às três telas do aplicativo.
 *
 * Morava dentro do `portaria.html`, e ali ele bastava enquanto o portão era o
 * único aplicativo instalável. Não basta mais: `/ic/` abre o `controle.html`,
 * e o Chrome só oferece **Instalar aplicativo** numa página que tenha service
 * worker registrado. Sem isto na casa, o botão de instalar nunca apareceria —
 * que é justamente o ponto do aplicativo.
 *
 * Uma cópia por página divergiria, e divergência aqui é do tipo calado: a tela
 * que ficasse para trás pararia de abrir sem rede, e ninguém descobre isso
 * antes do portão.
 */
(function () {
    'use strict';

    // A versão vem da tag que carregou ESTE arquivo, e não de uma constante:
    // o `publicar.ps1` renumera `.js?v=` sozinho, e uma constante aqui teria de
    // ser lembrada a cada release — a que ninguém lembra é a que envelhece.
    function versaoDeste() {
        var eu = document.currentScript;
        if (!eu) {
            var todos = document.getElementsByTagName('script');
            eu = todos[todos.length - 1];
        }
        var casou = /[?&]v=(\d+)/.exec(eu && eu.src ? eu.src : '');
        return casou ? casou[1] : 'dev';
    }

    var VERSAO = versaoDeste();

    // SÓ sob o prefixo `/ic/`. A estação serve estas mesmas páginas na RAIZ, e
    // lá o `scope: './'` resolveria para `/` -- fazendo este service worker
    // assumir também o index.html e o producao.html do painel da gráfica, que é
    // exatamente o que o escopo estreito sempre existiu para impedir.
    //
    // E não há o que perder: o service worker existe para o aplicativo
    // INSTALADO, e o aplicativo só mora em `/ic/`. Na estação não há o que
    // instalar.
    if (!('serviceWorker' in navigator) || window.location.pathname.indexOf('/ic/') !== 0) {
        return;
    }

    // Registrar DEPOIS de tudo carregar: um service worker que instala no meio
    // do carregamento pode guardar resposta pela metade.
    window.addEventListener('load', function () {
        // Endereço e escopo RELATIVOS, os dois. Servida em `/ic/`, a página
        // registra `/ic/sw.js` com escopo `/ic/` -- o do aplicativo inteiro,
        // que é o que permite ao service worker guardar as três telas.
        navigator.serviceWorker.register('sw.js?v=' + VERSAO, { scope: './' })
            .then(function (reg) {
                // Instalado na tela de início, o aplicativo não tem barra de
                // endereço: sem este aviso o porteiro não tem COMO recarregar,
                // e ficaria na versão do dia da instalação até alguém
                // desinstalar.
                //
                // E nunca recarregar sozinho: a câmera pode estar aberta e a
                // fila andando. A tela avisa; a hora é dele.
                //
                // A faixa é OPCIONAL: a página que a quiser declara
                // `id="faixa-atualizacao"`. Quem não declarar apenas não avisa.
                var faixa = document.getElementById('faixa-atualizacao');
                if (!faixa) { return; }

                faixa.addEventListener('click', function () { location.reload(); });

                function vigiar(trabalhador) {
                    if (!trabalhador) { return; }
                    trabalhador.addEventListener('statechange', function () {
                        // `navigator.serviceWorker.controller` existir é o que
                        // separa ATUALIZAÇÃO de PRIMEIRA instalação -- sem esse
                        // teste, a faixa apareceria na estreia, oferecendo
                        // recarregar uma página que acabou de carregar.
                        if (trabalhador.state === 'installed'
                            && navigator.serviceWorker.controller) {
                            faixa.classList.remove('sumindo');
                        }
                    });
                }

                vigiar(reg.installing);
                reg.addEventListener('updatefound', function () { vigiar(reg.installing); });
            })
            .catch(function (e) {
                // Silencioso aqui seria o pior lugar para silenciar: "por que
                // este aparelho não abre offline" é a pergunta que esta tela
                // existe para responder.
                console.error('service worker nao registrou -- o aparelho nao vai abrir sem rede:', e);
            });
    });
})();
