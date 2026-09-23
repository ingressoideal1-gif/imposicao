/* O QR vincula o aparelho ao evento. A edição exige o PIN da instalação. */
(function () {
    'use strict';
    var BASE = 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/portaria';
    var dialogo, aviso, video, fluxo, geracao = 0, ocupado = false, segredo = '', evento = null;
    function extrair(texto) {
        var m = /^IDEAL-CONTROL-EVENTO:1:([a-f0-9]{64})$/.exec(String(texto || '').trim());
        if (!m) throw new Error('Este não é um QR de evento do Ideal Control. Use o QR enviado pela gráfica.');
        return m[1];
    }
    function aleatorio() {
        return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
    }
    async function pedir(rota, dados) {
        var r = await fetch(BASE + '/' + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        var corpo = await r.json();
        if (!r.ok) throw new Error(corpo.detail || 'Não foi possível carregar. Confira a internet e tente novamente.');
        return corpo;
    }
    function parar() {
        geracao++;
        if (fluxo) fluxo.getTracks().forEach(function (t) { t.stop(); });
        fluxo = null;
        if (video) { video.srcObject = null; video.hidden = true; }
    }
    async function conferirFila() {
        if (await window.portariaDeposito.contarFila()) {
            throw new Error('Há leituras pendentes neste celular. Volte ao evento atual e sincronize antes de carregar outro QR.');
        }
    }
    async function ler(texto) {
        if (ocupado) return;
        ocupado = true; parar(); var rodada = geracao;
        evento = null; segredo = '';
        dialogo.querySelector('[data-evento-confirmar]').hidden = true;
        try {
            segredo = extrair(texto); aviso.textContent = 'Conferindo o evento…';
            var r = await pedir('consultar-qr-evento', { segredo: segredo });
            if (rodada !== geracao || !dialogo.open) return;
            if (!r.evento || !r.evento.id || typeof r.evento.nome !== 'string') throw new Error('Resposta incompleta do evento.');
            evento = r.evento;
            dialogo.querySelector('[data-evento-nome]').textContent = evento.nome;
            dialogo.querySelector('[data-evento-confirmar]').hidden = false;
            aviso.textContent = 'Confirme para preparar e baixar todos os ingressos neste celular.';
        } catch (e) { aviso.textContent = e.message; }
        finally { ocupado = false; }
    }
    function decodificar(fonte, largura, altura) {
        var canvas = document.createElement('canvas'), escala = Math.min(1, 1800 / Math.max(largura, altura));
        canvas.width = Math.round(largura * escala); canvas.height = Math.round(altura * escala);
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(fonte, 0, 0, canvas.width, canvas.height);
        var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var r = window.jsQR(pixels.data, pixels.width, pixels.height);
        return r && r.data;
    }
    async function camera() {
        if (ocupado) return;
        parar(); var rodada = geracao;
        aviso.textContent = 'Aponte para o QR do evento.';
        try {
            var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
            if (rodada !== geracao || !dialogo.open) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
            fluxo = stream; video.srcObject = stream; video.hidden = false; await video.play();
            function quadro() {
                if (rodada !== geracao || !dialogo.open) return;
                try {
                    var texto = video.videoWidth && decodificar(video, video.videoWidth, video.videoHeight);
                    if (texto) { ler(texto); return; }
                } catch (e) { parar(); aviso.textContent = 'Não foi possível ler pela câmera. Importe a imagem da galeria.'; return; }
                setTimeout(quadro, 180);
            }
            quadro();
        } catch (e) { parar(); aviso.textContent = 'Não foi possível abrir a câmera. Permita o acesso ou use Importar da galeria.'; }
    }
    async function importar(arquivo) {
        if (!arquivo || ocupado) return;
        parar(); var rodada = geracao;
        var url = URL.createObjectURL(arquivo), imagem = new Image();
        try {
            imagem.src = url; await imagem.decode();
            if (rodada !== geracao || !dialogo.open) return;
            var texto = decodificar(imagem, imagem.naturalWidth, imagem.naturalHeight);
            if (!texto) throw new Error('Não encontrei um QR nesta imagem. Escolha a imagem enviada pela gráfica.');
            await ler(texto);
        } catch (e) { aviso.textContent = e.message || 'Não foi possível abrir a imagem.'; }
        finally { URL.revokeObjectURL(url); }
    }
    async function ativar() {
        if (ocupado || !evento) return;
        ocupado = true; var botao = dialogo.querySelector('[data-evento-carregar]'); botao.disabled = true;
        try {
            await window.pinInstalacao.preparar();
            await conferirFila();
            var preparado;
            do {
                aviso.textContent = preparado ? 'Preparando ingressos: ' + preparado.prontos + ' de ' + preparado.total + '…' : 'Preparando os ingressos do evento…';
                preparado = await pedir('preparar-qr-evento', { segredo: segredo });
                if (typeof preparado.concluida !== 'boolean') throw new Error('Não foi possível confirmar a preparação dos ingressos.');
            } while (!preparado.concluida);
            var salvo = window.chaveiro.procurar(evento.id);
            var nome = dialogo.querySelector('[data-evento-aparelho]').value.trim();
            if (!nome || nome.length > 60) throw new Error('Dê um nome a este celular (até 60 caracteres).');
            // Só o token do aparelho é persistido. Repetir após falha de rede não cria outro aparelho.
            var chave = 'ideal_qr_ativacao:' + evento.id;
            var token = (salvo && salvo.token) || localStorage.getItem(chave) || aleatorio();
            localStorage.setItem(chave, token);
            aviso.textContent = 'Ativando este celular…';
            var r = await pedir('ativar-qr-evento', { segredo: segredo, token: token, nome: nome, navegador: window.AcessoConta.navegadorId(), chave: window.pinInstalacao.chave() });
            if (r.evento.id !== evento.id || !r.aparelho || !r.aparelho.id) throw new Error('Resposta incompatível com o evento escolhido.');
            window.pinInstalacao.encerrar();
            await conferirFila();
            window.chaveiro.guardarNomeDoAparelho(nome);
            localStorage.setItem('ideal_qr_baixar', r.evento.id);
            await window.aparelhoAqui.assumir(token, r.aparelho.nome, {
                evento_id: r.evento.id, nome_evento: r.evento.nome,
                aparelho_id: r.aparelho.id, nome_portao: r.aparelho.nome, token: token, por_qr: true,
            });
        } catch (e) { aviso.textContent = e.message || 'Não foi possível carregar. Confira a internet e tente novamente.'; }
        finally { ocupado = false; botao.disabled = false; }
    }
    function montar() {
        dialogo = document.getElementById('qr-evento-dialogo'); if (!dialogo) return;
        aviso = dialogo.querySelector('[data-evento-aviso]'); video = dialogo.querySelector('video');
        document.getElementById('btn-ler-qr-evento').onclick = function () {
            evento = null; segredo = ''; aviso.textContent = '';
            dialogo.querySelector('[data-evento-confirmar]').hidden = true;
            dialogo.querySelector('[data-evento-aparelho]').value = window.chaveiro.nomeDoAparelho() || 'Meu celular';
            dialogo.showModal();
        };
        dialogo.querySelector('[data-evento-camera]').onclick = camera;
        dialogo.querySelector('[data-evento-galeria]').onchange = function (e) { importar(e.target.files[0]); e.target.value = ''; };
        dialogo.querySelector('[data-evento-carregar]').onclick = ativar;
        dialogo.querySelector('[data-evento-fechar]').onclick = function () { if (!ocupado) dialogo.close(); };
        dialogo.addEventListener('cancel', function (e) { if (ocupado) e.preventDefault(); });
        dialogo.addEventListener('close', function () { parar(); segredo = ''; evento = null; });
        document.addEventListener('visibilitychange', function () { if (document.hidden) parar(); });
    }
    window.qrEvento = { extrair: extrair, ler: ler };
    document.addEventListener('DOMContentLoaded', montar);
})();
