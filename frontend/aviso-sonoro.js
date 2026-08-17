/**
 * O aviso de cada leitura do portao: um bipe e uma vibracao.
 *
 * O porteiro segura o aparelho, mas nem sempre olha para ele -- e no portao o
 * som some no barulho da fila. Por isso os dois avisos andam juntos, e por isso
 * eles precisam ser distinguiveis DE OUVIDO:
 *
 *   liberado  agudo e curto,  uma vibracao curta
 *   barrado   grave e longo,  duas vibracoes longas
 *
 * Se os dois soassem igual, o som nao serviria para nada e o porteiro voltaria
 * a depender da tela -- que e exatamente o que a tela nova quer parar de exigir.
 *
 * ## Por que o som e GERADO aqui, e nao baixado
 *
 * Esta tela abre sem rede. Um `.mp3` seria um download no caminho de uma
 * leitura e, no portao onde ele falhasse, um aviso mudo sem ninguem perceber.
 * O Web Audio sintetiza o bipe no proprio aparelho, de graca e sem byte nenhum.
 *
 * ## Por que existe `liberar()`
 *
 * Navegador nenhum toca audio antes de a pessoa encostar na tela, e ler QR nao
 * conta como encostar. A leitura abre com um "Toque para comecar a ler"; esse
 * toque chama `liberar()`, que cria o `AudioContext` e toca um som SILENCIOSO
 * de duracao zero -- o suficiente para o navegador considerar o audio
 * destravado. A alternativa, tentar tocar sem permissao, falha em silencio.
 *
 * ## A regra que governa o arquivo inteiro
 *
 * NADA daqui pode lancar. iPhone nao tem `navigator.vibrate`; navegador antigo
 * nao tem `AudioContext`; e o proprio audio pode estar suspenso. Som e enfeite,
 * e enfeite nao pode derrubar a leitura do portao. Todo caminho vai em
 * `try/catch` e, na duvida, o aviso simplesmente nao acontece.
 *
 * PURO de proposito: sem DOM e sem rede. Quem chama e o `portaria.js`.
 */
(function () {
    'use strict';

    /**
     * Liberado: agudo e curto. E confirmacao, nao alarme -- quem passou ja
     * passou, e o proximo da fila ja esta na frente da camera.
     */
    var LIBERADO = {
        frequencia: 1320,      // Hz -- mi agudo, atravessa a conversa da fila
        duracao: 0.08,         // s
        volume: 0.28,
        tipo: 'square',        // quadrada corta melhor o ruido que a senoide
        vibracao: [40]         // ms -- um toque, e so
    };

    /**
     * Barrado: grave e longo, e vibra bem mais. Grave e a convencao de erro e
     * e o que sobra do som quando o portao esta cheio; a vibracao dupla e o
     * aviso que chega mesmo com o aparelho no bolso.
     */
    var BARRADO = {
        frequencia: 220,       // Hz -- la grave
        duracao: 0.45,         // s -- mais de cinco vezes o bipe de liberado
        volume: 0.35,
        tipo: 'square',
        vibracao: [200, 120, 200]   // dois toques longos, com pausa no meio
    };

    /** Criado so no gesto do usuario. Antes disso, tocar nao adianta. */
    var contexto = null;

    function fabrica() {
        try { return window.AudioContext || window.webkitAudioContext || null; }
        catch (e) { return null; }
    }

    /**
     * O toque que destrava o audio.
     *
     * Toca um buffer de UMA amostra em silencio -- nao um bipe. Um bipe aqui
     * seria um aviso que nao corresponde a leitura nenhuma, na tela em que o
     * porteiro ainda nem comecou.
     *
     * Chamar de novo (o porteiro saiu da leitura e voltou) reaproveita o
     * contexto: cada `AudioContext` e um recurso do aparelho, e o navegador
     * limita quantos existem ao mesmo tempo.
     *
     * @returns {boolean} true se da para apitar daqui em diante.
     */
    function liberar() {
        if (!contexto) {
            var Fabrica = fabrica();
            if (!Fabrica) { return false; }     // navegador sem Web Audio
            try { contexto = new Fabrica(); }
            catch (e) { contexto = null; return false; }
            try {
                var fonte = contexto.createBufferSource();
                fonte.buffer = contexto.createBuffer(1, 1, 22050);
                fonte.connect(contexto.destination);
                fonte.start(0);
            } catch (e) { /* destravar falhou; o `resume` abaixo ainda pode dar */ }
        }
        // Voltar de segundo plano deixa o contexto suspenso: sem isto o bipe
        // seria agendado e nunca ouvido.
        try {
            if (contexto.state === 'suspended' && contexto.resume) { contexto.resume(); }
        } catch (e) { /* enfeite */ }
        return pronto();
    }

    /** O aparelho ja pode apitar? A tela usa isto para decidir se pede o toque. */
    function pronto() {
        try { return !!contexto && contexto.state !== 'closed'; }
        catch (e) { return false; }
    }

    /**
     * Um bipe, com uma queda rapida no fim para nao estalar no alto-falante.
     *
     * Sem contexto nao ha o que fazer: ninguem tocou a tela ainda, ou o
     * navegador nao tem Web Audio. Sai calado, e a leitura segue.
     */
    function apitar(padrao) {
        if (!pronto()) { return false; }
        try {
            var agora = contexto.currentTime;
            var fim = agora + padrao.duracao;
            var osc = contexto.createOscillator();
            var ganho = contexto.createGain();
            osc.type = padrao.tipo;
            osc.frequency.setValueAtTime(padrao.frequencia, agora);
            ganho.gain.setValueAtTime(padrao.volume, agora);
            // Exponencial nao chega a zero; 0.0001 e silencio na pratica.
            ganho.gain.exponentialRampToValueAtTime(0.0001, fim);
            osc.connect(ganho);
            ganho.connect(contexto.destination);
            osc.start(agora);
            osc.stop(fim);
            return true;
        } catch (e) { return false; }
    }

    /**
     * A vibracao e independente do audio: no iPhone ela nao existe, e no bolso
     * ela e o unico aviso que chega. Uma nao pode custar a outra.
     */
    function vibrar(padrao) {
        try {
            if (!navigator || typeof navigator.vibrate !== 'function') { return false; }
            navigator.vibrate(padrao.vibracao);
            return true;
        } catch (e) { return false; }
    }

    function avisar(padrao) {
        // Os dois, sempre, e cada um por sua conta: perder a vibracao nao pode
        // levar o som junto, nem o contrario.
        var soou = apitar(padrao);
        var tremeu = vibrar(padrao);
        return soou || tremeu;
    }

    function liberado() { return avisar(LIBERADO); }
    function barrado() { return avisar(BARRADO); }

    window.avisoSonoro = {
        liberar: liberar,
        pronto: pronto,
        liberado: liberado,
        barrado: barrado,
        LIBERADO: LIBERADO,
        BARRADO: BARRADO
    };
})();
