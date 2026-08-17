/**
 * A camera do aparelho da portaria.
 *
 * Dois leitores, porque nenhum sozinho cobre os celulares da grafica:
 *
 *   BarcodeDetector -- nativo, rapido, e le CODIGO DE BARRAS alem de QR. Existe
 *                      no Chrome do Android. Nao existe no Safari do iPhone.
 *   jsQR            -- reserva, vendorizada aqui dentro (a CSP e o offline
 *                      proibem CDN). So le QR.
 *
 * No iPhone, portanto, codigo de barras nao e lido pela camera -- e para isso
 * existe o "Digitar o numero" na tela, que passa pelas mesmas seis regras.
 */
(function () {
    'use strict';

    var video = null, canvas = null, ctx = null, detector = null;
    var rodando = false, ultimo = '', ultimoEm = 0;
    // A camera para sozinha ao achar um codigo? A casa do aplicativo quer que
    // sim -- ela le UM QR e vai embora. A portaria, desde 16/08/2026, quer que
    // nao: a camera fica ligada e a fila anda sem ninguem tocar em nada. O
    // padrao e o comportamento antigo, para que quem nao pedir nada continue
    // recebendo o que sempre recebeu.
    var pararAoAchar = true;
    // O fluxo em variavel propria, e nao so em `video.srcObject`: o `desligar`
    // precisa apagar a lanterna DEPOIS de soltar o video da tela e ANTES de
    // parar a trilha, e nesse meio o `srcObject` ja foi a nulo.
    var fluxo = null, acesa = false;
    // Quem ligou a camera e que decide o que fazer com o texto lido. Duas telas
    // leem QR: a portaria, que valida o ingresso, e a casa do aplicativo, que
    // despacha entre cadastrar evento e ligar aparelho. Chamar uma delas pelo
    // nome daqui fazia deste arquivo o leitor de UMA tela so.
    var aoLerAtual = null;

    function ligar(aoLer, opcoes) {
        if (rodando) return Promise.resolve();
        aoLerAtual = aoLer || null;
        pararAoAchar = !opcoes || opcoes.pararAoAchar !== false;
        rodando = true;
        video = document.getElementById('cam');
        canvas = canvas || document.createElement('canvas');
        ctx = ctx || canvas.getContext('2d', { willReadFrequently: true });

        if (!detector && window.BarcodeDetector) {
            try {
                detector = new window.BarcodeDetector({
                    formats: ['qr_code', 'code_128', 'ean_13'],
                });
            } catch (e) { detector = null; }
        }

        // Devolve a promessa: quem chama precisa saber QUANDO a camera abriu,
        // para so entao perguntar se este aparelho tem lanterna.
        return navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }, audio: false,
        }).then(function (f) {
            fluxo = f;
            video.srcObject = f;
            return video.play();
        }).then(quadro).catch(function () {
            rodando = false;   // sem camera a tela continua util pelo "Digitar o numero"
        });
    }

    function desligar() {
        rodando = false;
        var f = fluxo;
        fluxo = null;
        if (video && video.srcObject) video.srcObject = null;
        if (!f) return;

        // Apagar a lanterna ANTES de parar a trilha, e esperar de verdade:
        // parar a trilha com a luz acesa deixa a lanterna do celular ligada em
        // varios aparelhos Android, e nao sobra tela nenhuma para apaga-la.
        var apagando = Promise.resolve();
        if (acesa) {
            var t = f.getVideoTracks()[0];
            if (t && t.applyConstraints) {
                try {
                    apagando = t.applyConstraints({ advanced: [{ torch: false }] });
                } catch (e) { /* aparelho que nao aceita: a parada resolve */ }
            }
        }
        acesa = false;
        apagando.catch(function () { }).then(function () {
            f.getTracks().forEach(function (t) { t.stop(); });
        });
    }

    // ── Lanterna ────────────────────────────────────────────────────────────
    // So o Chrome no Android expoe isto (`torch` nas capacidades da trilha).
    // No iPhone nao existe para pagina nenhuma -- e por isso `temLanterna()` e
    // uma pergunta, e nao uma suposicao: quem chama tem de perguntar antes de
    // mostrar botao.
    function temLanterna() {
        var t = fluxo ? fluxo.getVideoTracks()[0] : null;
        if (!t || !t.getCapabilities) return false;
        return !!t.getCapabilities().torch;
    }

    function alternarLanterna() {
        if (!temLanterna()) return Promise.resolve(false);
        var t = fluxo.getVideoTracks()[0];
        var alvo = !acesa;
        return t.applyConstraints({ advanced: [{ torch: alvo }] })
            .then(function () { acesa = alvo; return acesa; })
            .catch(function () { return acesa; });
    }

    function achou(texto) {
        var agora = Date.now();
        // O mesmo ingresso fica na frente da camera por segundos. Sem esta
        // trava a tela dispararia dezenas de leituras iguais e a fila encheria
        // de lixo.
        //
        // A contagem recomeca a CADA aparicao, e nao so na que valeu. Com ela
        // parada na primeira leitura, o papel deixado na frente da lente
        // disparava de novo tres segundos depois -- e, com a camera agora ligada
        // o tempo todo, esse disparo cairia em `ja_entrou` e pintaria a tela de
        // VERMELHO para um ingresso BOM. Assim, o codigo so volta a valer tres
        // segundos depois de SAIR do quadro.
        var repetido = texto === ultimo && agora - ultimoEm < 3000;
        ultimo = texto; ultimoEm = agora;
        if (repetido) return;
        if (pararAoAchar) { desligar(); }
        if (aoLerAtual) { aoLerAtual(texto); }
    }

    function quadro() {
        if (!rodando) return;
        if (video.readyState < 2) return requestAnimationFrame(quadro);

        if (detector) {
            detector.detect(video).then(function (achados) {
                if (achados && achados.length) achou(achados[0].rawValue);
            }).catch(function () { }).then(function () {
                if (rodando) requestAnimationFrame(quadro);
            });
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var r = window.jsQR ? window.jsQR(img.data, img.width, img.height) : null;
        if (r && r.data) achou(r.data);
        requestAnimationFrame(quadro);
    }

    window.portariaCamera = {
        ligar: ligar, desligar: desligar,
        temLanterna: temLanterna, alternarLanterna: alternarLanterna,
    };
})();
