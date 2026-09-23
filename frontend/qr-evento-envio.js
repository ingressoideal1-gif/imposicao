/* Entrega dos dois QRs pela gráfica; o segredo só existe no QR emitido. */
(function () {
    'use strict';
    window.qrEventoEnvio = { montar: function (dialogo, pedir, eventoAtual) {
        var bloco = document.createElement('section');
        bloco.className = 'ic-qr-evento-entrega';
        bloco.innerHTML = '<hr><h3>2. Carregar o evento</h3><p>Depois de instalar, abra o aplicativo e toque em “Ler QR do evento”. No mesmo celular, use “Importar da galeria”.</p>'
            + '<p data-qr-nome></p><button class="btn btn-primary" type="button" data-qr-gerar>Gerar QR do evento</button>'
            + '<div data-qr-resultado hidden><canvas width="600" height="700" style="width:100%;max-width:300px"></canvas>'
            + '<p><button class="btn btn-secondary" type="button" data-qr-baixar>Baixar QR</button> <button class="btn btn-secondary" type="button" data-qr-enviar>Compartilhar QR</button></p></div>'
            + '<p><button class="btn btn-outline" type="button" data-qr-mensagem>Copiar instruções para o cliente</button></p>'
            + '<details><summary>Gerenciar QRs já enviados</summary><p><button class="btn btn-sm btn-danger" type="button" data-qr-revogar>Revogar QRs deste evento</button></p>'
            + '<p>Envie somente a quem deve acessar este evento. A edição usa a senha de 6 números do celular. Revogar o QR impede novas ativações; para desligar celulares já ativados, use Celulares e senhas.</p></details>'
            + '<p role="status" data-qr-aviso></p>';
        dialogo.appendChild(bloco);
        var buscar = function (s) { return bloco.querySelector(s); };
        var aviso = buscar('[data-qr-aviso]'), resultado = buscar('[data-qr-resultado]');
        var alvo = null, imagem = null, ocupado = false;
        function atualizar() {
            var ev = eventoAtual();
            if (!ev || !alvo || alvo.id !== ev.id) { resultado.hidden = true; imagem = null; }
            alvo = ev;
            buscar('[data-qr-nome]').textContent = ev ? (ev.nome_evento || 'Evento') + (ev.pendencia_qr ? ' · ' + ev.pendencia_qr : '') + (ev.status !== 'ativo' ? ' · evento inativo ou finalizado; confira a aba Evento.' : '') : 'Abra um pedido e prepare o evento para gerar seu QR.';
            buscar('[data-qr-gerar]').disabled = ocupado || !ev || ev.status !== 'ativo' || !!ev.pendencia_qr;
            buscar('[data-qr-mensagem]').disabled = !ev;
            buscar('[data-qr-revogar]').disabled = ocupado || !ev;
        }
        function baixar() {
            if (!imagem) return;
            var a = document.createElement('a');
            a.href = imagem; a.download = 'ideal-control-qr-evento.png'; a.click();
        }
        buscar('[data-qr-mensagem]').onclick = async function () {
            var ev = eventoAtual(); if (!ev) return;
            var mensagem = 'Ideal Control — ' + (ev.nome_evento || 'Evento') + '\n'
                + '1. Instale o aplicativo: https://imposition.ai-ideal.com.br/ic/\n'
                + '2. No primeiro uso, escolha uma senha de edição de 6 números. Cada celular tem sua própria senha.\n'
                + '3. Abra o aplicativo e toque em “Ler QR do evento”. Se a imagem chegou neste celular, use “Importar da galeria”.\n'
                + '4. Aguarde o carregamento completo do evento com internet antes de usar na portaria.';
            try { await navigator.clipboard.writeText(mensagem); aviso.textContent = 'Instruções copiadas. Cole na conversa e anexe a imagem do QR deste evento.'; }
            catch (_) { aviso.textContent = 'Não foi possível copiar. Envie o link de instalação e a imagem do QR com as orientações acima.'; }
        };
        buscar('[data-qr-baixar]').onclick = baixar;
        buscar('[data-qr-enviar]').onclick = async function () {
            if (!imagem) return;
            var blob = await (await fetch(imagem)).blob();
            var arquivo = new File([blob], 'ideal-control-qr-evento.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
                try { await navigator.share({ files: [arquivo], title: 'Ideal Control', text: 'Instale o aplicativo em https://imposition.ai-ideal.com.br/ic/ e importe este QR em “Ler QR do evento”.' }); }
                catch (e) { if (e.name !== 'AbortError') aviso.textContent = 'Não foi possível compartilhar. Use Baixar QR e anexe a imagem à mensagem.'; }
            } else { baixar(); aviso.textContent = 'QR baixado. Anexe a imagem à conversa do cliente junto com o link de instalação.'; }
        };
        buscar('[data-qr-gerar]').onclick = async function () {
            atualizar(); if (!alvo || ocupado || alvo.status !== 'ativo' || alvo.pendencia_qr) return;
            var ev = alvo; ocupado = true; atualizar(); aviso.textContent = 'Gerando QR…';
            resultado.hidden = true; imagem = null;
            try {
                var r = await pedir('/eventos/' + ev.id + '/qr', { method: 'POST' });
                if (!eventoAtual() || eventoAtual().id !== ev.id || !dialogo.open) return;
                if (!/^IDEAL-CONTROL-EVENTO:1:[a-f0-9]{64}$/.test(r.conteudo)) throw new Error('O servidor não devolveu um QR válido.');
                var canvas = buscar('canvas'), ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 600, 700);
                ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.font = 'bold 26px sans-serif';
                ctx.fillText('Ideal Control · QR do evento', 300, 40, 560);
                ctx.font = '22px sans-serif'; ctx.fillText(ev.nome_evento || 'Evento', 300, 78, 560);
                window.renderQRCodeOnCtx(ctx, r.conteudo, 300, 355, 480);
                ctx.fillStyle = '#111'; ctx.font = '20px sans-serif';
                ctx.fillText('No aplicativo: Ler QR do evento', 300, 632, 560);
                ctx.fillText('ou Importar da galeria', 300, 665, 560);
                imagem = canvas.toDataURL('image/png'); resultado.hidden = false;
                aviso.textContent = 'Envie esta imagem ao cliente. Guarde-a para reenviar o mesmo QR.';
            } catch (e) { aviso.textContent = e.message || 'Não foi possível gerar o QR.'; }
            finally { ocupado = false; atualizar(); }
        };
        buscar('[data-qr-revogar]').onclick = async function () {
            atualizar(); if (!alvo || ocupado) return;
            if (!window.confirm('Impedir novas ativações por TODOS os QRs já emitidos deste evento? Os aparelhos já ativados continuam funcionando.')) return;
            var ev = alvo; ocupado = true; atualizar();
            try {
                await pedir('/eventos/' + ev.id + '/qr', { method: 'DELETE' });
                resultado.hidden = true; imagem = null; aviso.textContent = 'QRs revogados. Gere outro para novas ativações.';
            } catch (e) { aviso.textContent = e.message; }
            finally { ocupado = false; atualizar(); }
        };
        dialogo.addEventListener('close', function () { resultado.hidden = true; imagem = null; aviso.textContent = ''; });
        new MutationObserver(atualizar).observe(dialogo, { attributes: true, attributeFilter: ['open'] });
        return atualizar;
    } };
})();
