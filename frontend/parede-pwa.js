/**
 * O Ideal Control so trabalha instalado.
 *
 * Decisao do usuario em 16/08/2026: "exige instalar sempre", com a ressalva
 * "deixar passar so nesse caso" quando o navegador nao souber instalar.
 *
 * As duas metades importam. A primeira e o pedido. A segunda existe porque
 * Firefox no PC, Safari no Mac e navegador embutido de outro aplicativo nao
 * instalam PWA -- e uma parede que nunca sai tranca o dono do lado de fora do
 * evento dele.
 *
 * ## Por que instalar importa de verdade, e nao e so estetica
 *
 * Instalado, o iOS DEIXA DE APAGAR o armazenamento do site depois de 7 dias
 * sem uso. A carga do evento e a fila de leituras que ainda nao subiram vivem
 * no IndexedDB: um celular parado entre um evento e outro pode acordar vazio.
 * O mesmo raciocinio ja esta escrito no `portaria.html`.
 */
(function () {
    'use strict';

    /** Ja instalado? Android e PC respondem pelo `display-mode`; o iPhone nao. */
    function instalado() {
        try {
            if (window.matchMedia
                && window.matchMedia('(display-mode: standalone)').matches) {
                return true;
            }
        } catch (e) { /* navegador sem matchMedia: cai no teste do iOS */ }
        // O Safari do iPhone nao implementa `display-mode`. Este e o unico
        // sinal que ele da de que o atalho da tela de inicio foi usado.
        return navigator.standalone === true;
    }

    function ehIphone() {
        var ua = navigator.userAgent || '';
        // `MSStream` exclui o Edge antigo do Windows Phone, que mentia dizendo
        // ser iPhone no user agent.
        return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    }

    /**
     * O que fazer, dado o que se sabe do aparelho.
     *
     *   'nada'   -- ja instalado, ou navegador que nao sabe instalar
     *   'prompt' -- da para instalar com um toque (Android, Chrome/Edge no PC)
     *   'iphone' -- so pelo menu Compartilhar, com instrucao em texto
     */
    function decidir(opcoes) {
        opcoes = opcoes || {};
        if (opcoes.instalado) { return 'nada'; }
        if (opcoes.temPrompt) { return 'prompt'; }
        if (opcoes.iphone) { return 'iphone'; }
        return 'nada';                 // a ressalva do usuario
    }

    var promptGuardado = null;

    function montar(modo) {
        var parede = document.createElement('div');
        parede.id = 'parede-pwa';
        // Estilo inline, e nao no `controle.css`: esta parede precisa aparecer
        // mesmo que a folha de estilo nao tenha carregado -- e sem folha a
        // tela por baixo dela ficaria visivel e clicavel.
        parede.setAttribute('style',
            'position:fixed;inset:0;z-index:9999;background:#0a0f1e;color:#e2e8f0;'
            + 'display:flex;flex-direction:column;align-items:center;'
            + 'justify-content:center;gap:16px;padding:32px;text-align:center;'
            + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;');

        var titulo = document.createElement('h1');
        titulo.textContent = 'Instale o Ideal Control';
        titulo.setAttribute('style', 'font-size:1.4rem;margin:0;');
        parede.appendChild(titulo);

        var frase = document.createElement('p');
        frase.setAttribute('style', 'font-size:.95rem;color:#94a3b8;margin:0;max-width:34ch;');
        frase.textContent = 'No portão o aparelho trabalha sem internet, e para '
            + 'isso ele precisa estar instalado neste celular. É rápido e não '
            + 'ocupa espaço.';
        parede.appendChild(frase);

        if (modo === 'iphone') {
            var passos = document.createElement('p');
            passos.setAttribute('style', 'font-size:1rem;margin:0;max-width:34ch;');
            // Em texto, e nao em icone: o icone de compartilhar do iPhone muda
            // de desenho entre versoes do iOS, e o dono esta lendo isto uma
            // vez so, com pressa.
            passos.textContent = 'Toque em Compartilhar, na barra de baixo do '
                + 'Safari, e escolha "Adicionar à Tela de Início".';
            parede.appendChild(passos);
        } else {
            var botao = document.createElement('button');
            botao.type = 'button';
            botao.textContent = 'Instalar agora';
            botao.setAttribute('style',
                'padding:16px 24px;font-size:1.05rem;font-weight:700;border:0;'
                + 'border-radius:10px;background:#14b8a6;color:#06231f;cursor:pointer;');
            botao.addEventListener('click', function () {
                if (!promptGuardado) { return; }
                promptGuardado.prompt();
            });
            parede.appendChild(botao);
        }

        document.body.appendChild(parede);
    }

    /**
     * A decisao, tomada quando a espera termina.
     *
     * Funcao com nome, e nao um corpo inline dentro do `setTimeout`: o teto de
     * 1,5 s precisa ficar visivel na mesma linha da chamada que o aplica, e nao
     * vinte linhas abaixo dela.
     */
    function decidirEMontar() {
        var modo = decidir({
            instalado: instalado(),
            temPrompt: !!promptGuardado,
            iphone: ehIphone()
        });
        if (modo !== 'nada') { montar(modo); }
    }

    /**
     * Espera pelo `beforeinstallprompt` COM TETO.
     *
     * O evento chega logo depois do carregamento nos navegadores que o tem, e
     * nunca nos outros. Sem o teto de 1,5 s, quem nao dispara deixaria a
     * decisao pendurada para sempre -- e a tela ficaria usavel por acidente
     * num caso e travada no outro, sem regra.
     */
    function vigiar() {
        if (instalado()) { return; }

        window.addEventListener('beforeinstallprompt', function (ev) {
            ev.preventDefault();
            promptGuardado = ev;
        });

        setTimeout(decidirEMontar, 1500);
    }

    window.paredePwa = {
        instalado: instalado, ehIphone: ehIphone,
        decidir: decidir, montar: montar
    };
    document.addEventListener('DOMContentLoaded', vigiar);
})();
