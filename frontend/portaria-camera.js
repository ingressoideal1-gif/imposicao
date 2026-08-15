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

    function ligar() {
        if (rodando) return;
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

        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }, audio: false,
        }).then(function (fluxo) {
            video.srcObject = fluxo;
            return video.play();
        }).then(quadro).catch(function () {
            rodando = false;   // sem camera a tela continua util pelo "Digitar o numero"
        });
    }

    function desligar() {
        rodando = false;
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(function (t) { t.stop(); });
            video.srcObject = null;
        }
    }

    function achou(texto) {
        var agora = Date.now();
        // O mesmo ingresso fica na frente da camera por segundos. Sem esta
        // trava a tela dispararia dezenas de leituras iguais e a fila encheria
        // de lixo.
        if (texto === ultimo && agora - ultimoEm < 3000) return;
        ultimo = texto; ultimoEm = agora;
        desligar();
        window.portaria.validarTexto(texto);
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

    window.portariaCamera = { ligar: ligar, desligar: desligar };
})();
