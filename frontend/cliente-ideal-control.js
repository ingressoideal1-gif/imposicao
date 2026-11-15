(function () {
    'use strict';
    var contexto = null, ocupado = false, rodada = 0, intervalo = null;
    var mensagens = {
        aguardando_impressao: 'Disponível após a impressão do pedido.',
        preparando: 'Seu evento está sendo preparado. Você pode continuar de onde parou.',
        sem_codigos: 'Este pedido não possui ingressos compatíveis com o Ideal Control.',
        indisponivel: 'Ideal Control indisponível para este pedido. Fale com seu atendimento.',
        evento_indisponivel: 'Este evento está inativo ou finalizado. Confira no aplicativo ou com seu atendimento.',
        conferir_emissao: 'Precisamos conferir os códigos deste pedido. Fale com seu atendimento.',
        conferir_evento: 'Precisamos conferir este evento. Fale com seu atendimento.',
        acesso_revogado: 'Este acesso foi revogado. Fale com seu atendimento.'
    };
    function el(tag, texto) {
        var n = document.createElement(tag);
        if (texto) n.textContent = texto;
        return n;
    }
    function aba() { return document.getElementById('portal-ideal-control-aba'); }
    function caixa() { return document.getElementById('secao-ideal-control'); }
    function limpar() { if (caixa()) caixa().replaceChildren(); }
    function visivel(sim) {
        if (!aba()) return;
        aba().hidden = !sim;
        var secoes = window.SECOES;
        if (secoes) {
            var indice = secoes.indexOf('ideal-control');
            if (sim && indice < 0) secoes.push('ideal-control');
            if (!sim && indice >= 0) secoes.splice(indice, 1);
        }
        if (!sim) {
            limpar();
            if (caixa() && !caixa().hidden && window.abrirSecao) window.abrirSecao('arte', { substituir: true });
            if (caixa()) caixa().hidden = true;
        }
    }
    function botao(texto, acao) {
        var b = el('button', texto); b.type = 'button'; b.className = 'btn btn-primary';
        b.addEventListener('click', acao); return b;
    }
    function desenhar(d) {
        limpar();
        var cartao = el('div'); cartao.className = 'portal-cartao';
        cartao.appendChild(el('h2', 'Ideal Control'));
        if (d.estado === 'pronto' || d.estado === 'evento_existente') {
            cartao.appendChild(el('p', d.estado === 'pronto'
                ? 'Crie o evento para receber o QR e instalar o aplicativo.'
                : 'Seu evento já existe. Obtenha o QR para usar o aplicativo.'));
            cartao.appendChild(botao(d.estado === 'pronto' ? 'Criar evento' : 'Obter QR do evento', function () { consultar(true); }));
        } else if (d.estado === 'criado' && /^IDEAL-CONTROL-EVENTO:1:[a-f0-9]{64}$/.test(d.qr || '')) {
            cartao.appendChild(el('p', d.nome_evento || 'Evento'));
            var instalar = el('a', 'Instalar Ideal Control');
            instalar.href = 'https://imposition.ai-ideal.com.br/ic/';
            instalar.target = '_blank'; instalar.rel = 'noopener noreferrer'; instalar.className = 'btn btn-primary';
            cartao.appendChild(instalar);
            var canvas = el('canvas'); canvas.width = 600; canvas.height = 700;
            canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'QR de acesso ao evento');
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 600, 700);
            ctx.fillStyle = '#111'; ctx.font = '24px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('Ideal Control · QR do evento', 300, 40, 560);
            ctx.fillText(d.nome_evento || 'Evento', 300, 78, 560);
            window.renderQRCodeOnCtx(ctx, d.qr, 300, 355, 480);
            ctx.fillStyle = '#111'; ctx.font = '20px sans-serif';
            ctx.fillText('No aplicativo: Ler QR do evento', 300, 632, 560);
            ctx.fillText('ou Importar da galeria', 300, 665, 560);
            cartao.appendChild(canvas);
            cartao.appendChild(botao('Baixar QR', function () {
                var a = el('a'); a.download = 'ideal-control-qr-evento.png';
                a.href = canvas.toDataURL('image/png'); a.click();
            }));
            cartao.appendChild(el('p', 'Compartilhe este QR apenas com pessoas autorizadas a operar o evento.'));
            cartao.appendChild(el('p', 'As configurações ficam no aplicativo ou com seu atendimento.'));
        } else {
            cartao.appendChild(el('p', mensagens[d.estado] || 'Não foi possível carregar o Ideal Control. Tente novamente.'));
            cartao.appendChild(botao(d.estado === 'preparando' ? 'Continuar preparação' : 'Atualizar', function () { consultar(d.estado === 'preparando'); }));
        }
        caixa().appendChild(cartao);
    }
    async function consultar(criar) {
        if (!contexto || ocupado || !caixa()) return;
        ocupado = true; var atual = ++rodada; var c = contexto;
        limpar();
        var aviso = el('p', criar ? 'Preparando seu evento…' : 'Consultando disponibilidade…');
        aviso.setAttribute('role', 'status'); caixa().appendChild(aviso);
        try {
            var r;
            for (var lote = 0; lote < 20; lote++) {
                r = await supabaseClient.functions.invoke('ideal-control-portal', {
                    body: { numero: c.numero, token: c.token, criar: !!criar }
                });
                if (atual !== rodada || contexto !== c) return;
                if (r.error || !r.data || !criar || r.data.estado !== 'preparando' || !r.data.disponivel) break;
                aviso.textContent = 'Preparando os ingressos do seu evento…';
            }
            if (atual !== rodada || contexto !== c) return;
            if (r.error || !r.data) throw new Error('indisponivel');
            if (r.data.disponivel !== true) { visivel(false); return; }
            visivel(true); desenhar(r.data);
        } catch (_) {
            if (atual !== rodada) return;
            // Não registrar argumentos, token ou conteúdo do QR em logs.
            limpar();
            if (!aba().hidden) {
                caixa().appendChild(el('p', 'Não foi possível confirmar o acesso. Tente novamente.'));
                caixa().appendChild(botao('Tentar novamente', function () { consultar(!!criar); }));
            }
        } finally { if (atual === rodada) ocupado = false; }
    }
    window.PortalIdealControl = { iniciar: function (numero, token) {
        contexto = { numero: String(numero), token: String(token) };
        rodada++; ocupado = false; visivel(false);
        consultar(false);
        if (intervalo) clearInterval(intervalo);
        intervalo = setInterval(function () { if (!document.hidden && aba() && !aba().hidden) consultar(false); }, 60000);
    } };
    window.addEventListener('focus', function () { consultar(false); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) consultar(false); });
})();
