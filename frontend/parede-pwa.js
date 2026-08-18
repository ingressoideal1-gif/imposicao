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
        //
        // E a PRIMEIRA tela que o cliente ve depois de ler o QR de instalacao,
        // entao ela carrega a identidade inteira: o brilho verde-agua → azul do
        // icone, o proprio icone, a fonte. A fonte vem por nome ('Manrope'):
        // se o `controle.css` ja a declarou, ela vale; se nao, a lista cai na
        // do sistema.
        parede.setAttribute('style',
            'position:fixed;inset:0;z-index:9999;color:#eef2f8;'
            + 'background:radial-gradient(900px 520px at 20% -8%,rgba(20,184,166,.28),transparent 62%),'
            + 'radial-gradient(760px 480px at 100% -4%,rgba(59,130,246,.22),transparent 60%),#0a0f1e;'
            + 'display:flex;flex-direction:column;align-items:center;'
            + 'justify-content:center;gap:14px;padding:32px 28px;text-align:center;'
            + 'font-family:Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
            + '-webkit-font-smoothing:antialiased;');

        // O icone do aplicativo, o mesmo que vai parar na tela de inicio: e o
        // que a pessoa vai procurar depois de instalar, entao ela ja o ve aqui.
        var icone = document.createElement('img');
        icone.src = 'icones/portaria-192.png';
        icone.alt = '';
        icone.setAttribute('style',
            'width:96px;height:96px;border-radius:24px;'
            + 'box-shadow:0 22px 46px -18px rgba(20,184,166,.7),0 0 0 1px rgba(255,255,255,.08);'
            + 'margin-bottom:6px;');
        parede.appendChild(icone);

        var marca = document.createElement('div');
        marca.setAttribute('style',
            'font-size:.72rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;'
            + 'color:#2dd4bf;');
        marca.textContent = 'Ideal Control';
        parede.appendChild(marca);

        var titulo = document.createElement('h1');
        titulo.textContent = 'Instale o Ideal Control';
        titulo.setAttribute('style',
            'font-size:1.55rem;font-weight:800;letter-spacing:-.02em;line-height:1.2;margin:0;');
        parede.appendChild(titulo);

        var frase = document.createElement('p');
        frase.setAttribute('style', 'font-size:.98rem;line-height:1.55;color:#9aa6bb;margin:0;max-width:34ch;');
        frase.textContent = 'O aparelho trabalha sem internet, e para '
            + 'isso ele precisa estar instalado neste celular. É rápido e não '
            + 'ocupa espaço.';
        parede.appendChild(frase);

        if (modo === 'iphone') {
            // Em texto, e nao em icone: o icone de compartilhar do iPhone muda
            // de desenho entre versoes do iOS, e o dono esta lendo isto uma
            // vez so, com pressa. Num cartao, para se separar da explicacao
            // acima -- isto e a INSTRUCAO, o resto e o motivo.
            var passos = document.createElement('p');
            passos.setAttribute('style',
                'font-size:1rem;line-height:1.5;margin:8px 0 0;max-width:36ch;'
                + 'padding:14px 16px;border-radius:14px;'
                + 'background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.3);');
            passos.textContent = 'Toque em Compartilhar, na barra de baixo do '
                + 'Safari, e escolha "Adicionar à Tela de Início".';
            parede.appendChild(passos);
        } else {
            var botao = document.createElement('button');
            botao.type = 'button';
            botao.textContent = 'Instalar agora';
            botao.setAttribute('style',
                'margin-top:10px;width:100%;max-width:340px;padding:16px 24px;'
                + 'font-size:1.05rem;font-weight:700;font-family:inherit;border:0;'
                + 'border-radius:12px;color:#04201c;cursor:pointer;min-height:54px;'
                + 'background:linear-gradient(135deg,#2dd4bf,#14b8a6 55%,#0ea5a0);'
                + 'box-shadow:0 12px 26px -12px rgba(20,184,166,.8),inset 0 1px 0 rgba(255,255,255,.22);');
            botao.addEventListener('click', function () {
                if (!promptGuardado) { return; }
                promptGuardado.prompt();
            });
            parede.appendChild(botao);
        }

        // A assinatura da marca no rodape da parede: quem faz, em letra
        // pequena, como no rodape da casa.
        var rodape = document.createElement('div');
        rodape.setAttribute('style',
            'position:absolute;left:0;right:0;bottom:calc(22px + env(safe-area-inset-bottom));'
            + 'font-size:.72rem;color:#64718a;');
        rodape.textContent = 'Ingresso Ideal · Controle de Acesso';
        parede.appendChild(rodape);

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
