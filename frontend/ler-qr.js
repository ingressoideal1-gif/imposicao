/**
 * O "+ Novo Evento": uma câmera, dois tipos de QR.
 *
 * Ela mora na casa do aplicativo — a lista "Seus eventos" do `controle.html` —
 * e existe porque, sem ela, a tela dizia "Leia o QR que a gráfica enviou" e não
 * oferecia câmera nenhuma. O cliente precisava sair do aplicativo, abrir a
 * câmera do sistema, achar o QR no WhatsApp e tocar num link.
 *
 * NÃO existe seletor de modo. O próprio QR diz o que ele é:
 *
 *     ?t=<token>      o QR do Pedido   ->  evento.html   (cadastrar o evento)
 *     ?e=<evento_id>  o QR do portão   ->  portaria.html (ligar este aparelho)
 *
 * Um seletor seria mais uma decisão para o usuário errar — e errar aqui manda
 * o dono para a tela do porteiro, ou o porteiro para a tela de cadastro.
 *
 * A câmera é a MESMA da portaria (`portaria-camera.js`), que já resolve os dois
 * leitores: `BarcodeDetector` nativo onde existe, `jsQR` vendorizado no iPhone.
 * Um segundo leitor herdaria os defeitos que o primeiro já corrigiu.
 */
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    /**
     * As origens que sao NOSSAS.
     *
     * Copia da regra que o `security_config.ALLOWED_ORIGINS` e o
     * `_compartilhado/cors.ts` ja aplicam nos dois outros lados. O sistema
     * atende por MAIS DE UM endereco, e isso nao e acidente.
     *
     * Ate 17/08/2026 esta tela exigia origem IDENTICA a da pagina. O QR do
     * Pedido era cunhado com `https://imposicao.vercel.app` e o aplicativo
     * instalado do dono abre em `https://ideal-imposition.vercel.app`, entao a
     * tela recusava o QR legitimo que a propria grafica acabara de mandar por
     * WhatsApp, com a frase "Este QR nao e do Ideal Control" -- acusando o dono
     * de ler o QR errado quando ele lera o certo. Nao havia como cadastrar
     * evento nenhum pelo aplicativo instalado.
     *
     * O `PAINEL_PADRAO` do `acesso-pedido` passou a cunhar com
     * `ideal-imposition` no mesmo dia, mas isso NAO dispensa esta regra: todo QR
     * emitido antes carrega o endereco antigo, esta impresso e ja foi enviado
     * por WhatsApp. Aceitar as duas origens e o que os mantem validos.
     *
     * ANCORADA de proposito, pela licao que o `cors.ts` ja registra: sem o `^` e
     * o `$`, `https://ideal-imposition.vercel.app.exemplo.com` passaria -- um
     * dominio que qualquer um registra.
     */
    var NOSSAS_ORIGENS = new RegExp(
        '^(https://(ideal-imposition|imposicao)(-[a-z0-9-]+)?\\.vercel\\.app'
        + '|http://(localhost|127\\.0\\.0\\.1)(:\\d+)?)$'
    );

    function nossa(origem) {
        // A origem da propria pagina, sempre: na estacao da gráfica o agente
        // serve estas telas num endereço de rede local que regra nenhuma aqui
        // teria como prever, e um QR cunhado com o endereço da página que o
        // está lendo é, por definição, nosso.
        return origem === window.location.origin || NOSSAS_ORIGENS.test(origem);
    }

    function esconder(id) { $(id).classList.add('sumindo'); }
    function mostrar(id) { $(id).classList.remove('sumindo'); }

    function recusar() {
        var aviso = $('erro-qr');
        // O texto diz o que fazer, e não só o que deu errado: quem está com o
        // celular na mão precisa saber qual QR procurar.
        aviso.textContent = 'Este QR não é do Ideal Control. Leia o QR que a '
            + 'gráfica enviou por WhatsApp.';
        mostrar('erro-qr');
    }

    /**
     * Recebe o texto lido e decide a tela.
     *
     * Exposta de propósito: é ela que o teste exercita, sem câmera nenhuma.
     */
    function despachar(texto) {
        var url;
        // O QR carrega uma URL inteira. `new URL` com base resolve tanto a
        // forma absoluta quanto uma relativa que alguém tenha gerado.
        try { url = new URL(texto, window.location.href); } catch (e) { return recusar(); }

        // Origem nossa, sempre. Sem esta conferência, um QR qualquer de rua
        // faria a tela abrir um fluxo com dado estranho dentro. Nossa é
        // qualquer um dos endereços do sistema — ver `nossa()`, e por que
        // exigir um só quebrava o QR que a gráfica manda.
        if (!nossa(url.origin)) { return recusar(); }

        var t = url.searchParams.get('t');
        if (t) {
            window.location.href = 'evento.html?t=' + encodeURIComponent(t);
            return;
        }
        var e = url.searchParams.get('e');
        if (e) {
            window.location.href = 'portaria.html?e=' + encodeURIComponent(e);
            return;
        }
        return recusar();
    }

    function fechar() {
        if (window.portariaCamera) { window.portariaCamera.desligar(); }
        esconder('caixa-qr');
    }

    function abrir() {
        esconder('erro-qr');
        mostrar('caixa-qr');
        return window.portariaCamera.ligar(function (texto) {
            esconder('caixa-qr');
            despachar(texto);
        }).then(function () {
            // Só agora dá para perguntar: antes de o getUserMedia resolver não
            // há trilha de vídeo, e a resposta seria sempre "não tem".
            $('btn-lanterna-qr').classList.toggle(
                'sumindo', !window.portariaCamera.temLanterna());
        });
    }

    function ligarBotoes() {
        if (!$('btn-ler-qr')) { return; }
        $('btn-ler-qr').onclick = abrir;
        $('btn-fechar-qr').onclick = fechar;
        $('btn-lanterna-qr').onclick = function () {
            window.portariaCamera.alternarLanterna().then(function (acesa) {
                $('btn-lanterna-qr').textContent = acesa ? 'Lanterna acesa' : 'Lanterna';
            });
        };
    }

    window.lerQR = { abrir: abrir, fechar: fechar, despachar: despachar };
    document.addEventListener('DOMContentLoaded', ligarBotoes);
})();
