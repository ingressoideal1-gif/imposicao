/* Independente do script.js, das filas de producao e do status comercial. */
(() => {
    'use strict';
    const $ = id => document.getElementById('exp-' + id);
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    const base = local && ['9000', '9001', '9002', '8080'].includes(location.port)
        ? location.origin : 'http://127.0.0.1:9000';
    let busy = false;
    let attempted = false;
    let ready = false;
    let driverReady = false;
    let printerRevision = 0;
    const status = message => { $('status').textContent = message; };
    if (local && location.port === '9002') {
        $('stop').hidden = false;
        $('stop').addEventListener('click', async () => {
            if (busy) { status('Aguarde o envio terminar antes de encerrar.'); return; }
            try {
                await json(`${base}/api/print/experimental/encerrar`, {
                    method: 'POST', headers: {'X-NewProd-Experimental': '1'}
                });
                $('fields').disabled = true;
                $('new').hidden = true;
                $('stop').disabled = true;
                status('Experimento encerrado. O NewProd normal continua funcionando.');
            } catch (error) { status(error.message); }
        });
    }
    const number = name => Number($(name).value);
    const options = () => $('mode').value === 'pdf_raw' ? {
        experimental: true, modo: 'pdf_raw', copies: 1, raw_confirmado: $('raw').checked
    } : ({
        experimental: true, modo: $('mode').value, dpi: number('dpi'), copies: 1,
        paper_size: number('paper'), tray: number('tray'), duplex: number('duplex'),
        color: number('color'), orientation: number('orientation')
    });
    function updateMode() {
        const mode = $('mode').value;
        const raw = mode === 'pdf_raw';
        $('driver').hidden = raw;
        // display:grid explicito nao deve sobrepor hidden.
        $('driver').style.display = raw ? 'none' : '';
        for (const name of ['paper', 'tray', 'duplex', 'color', 'orientation', 'dpi']) $(name).disabled = raw;
        $('dpi-label').hidden = mode !== 'experimental_gdi';
        $('dpi').disabled = mode !== 'experimental_gdi';
        $('raw-label').hidden = !raw;
        $('raw').required = raw;
        $('raw').disabled = !raw;
        $('description').textContent = raw
            ? 'O PDF será enviado intacto. O RIP precisa aceitar PDF nativo. Papel, bandeja, duplex, cópias, escala e cores dependem do preset do RIP; as configurações e o perfil de cor do NewProd não são aplicados.'
            : mode === 'gdi_atual'
                ? 'Usa a resolução informada pelo driver e a mesma conversão PDF → imagem → PNG do GDI atual. Pode gerar um spool grande.'
                : mode === 'experimental_gdi'
                    ? 'Usa imagens RGB a 300 ou 600 DPI, sem a etapa PNG. Mantém a escala 100% e as opções do driver.'
                    : 'Selecione o modo de envio para ver as opções.';
        ready = !!mode && !!$('printer').value && (raw || driverReady);
        $('send').disabled = !ready || busy || attempted;
    }
    $('mode').addEventListener('change', () => {
        $('confirm').checked = false;
        $('raw').checked = false;
        updateMode();
    });
    async function json(url, init) {
        const headers = new Headers(init?.headers);
        // Mesma sessao e mesmas permissoes do painel; nunca usar o token do atualizador.
        if (local && location.port !== '9002') {
            try {
                const session = JSON.parse(sessionStorage.getItem('newprod_acesso_local') || 'null');
                if (session?.token) headers.set('X-NewProd-Sessao', session.token);
            } catch (_) { /* sessao ausente sera recusada pelo agente */ }
        }
        const response = await fetch(url, {...init, headers});
        if (!response.ok) {
            if (response.status === 401) throw new Error('Entre no painel do NewProd e abra novamente a impressão experimental pelo link do painel.');
            let detail;
            try { detail = (await response.json()).detail; } catch (_) { /* erro sem JSON */ }
            throw new Error(typeof detail === 'string' ? detail : `Agente indisponível ou sem modo experimental (HTTP ${response.status}).`);
        }
        return response.json();
    }
    function fill(name, rows, selected) {
        $(name).replaceChildren();
        for (const row of rows || []) {
            const option = document.createElement('option');
            option.value = String(row.id);
            option.textContent = row.name;
            option.selected = row.id === selected;
            $(name).appendChild(option);
        }
    }
    async function printersChanged() {
        const revision = ++printerRevision;
        ready = false;
        driverReady = false;
        $('send').disabled = true;
        $('confirm').checked = false;
        $('raw').checked = false;
        fill('paper', []);
        fill('tray', []);
        updateMode();
        if (!$('printer').value) return;
        try {
            const data = await json(`${base}/api/printers/${encodeURIComponent($('printer').value)}/capabilities`, {signal: AbortSignal.timeout(15000)});
            if (revision !== printerRevision) return;
            if (!data.papers?.length || !data.trays?.length) throw new Error('O driver não forneceu papel e bandeja. Teste bloqueado.');
            fill('paper', data.papers, data.defaults?.paper_size);
            fill('tray', data.trays, data.defaults?.tray);
            $('duplex').value = String(data.defaults?.duplex || 1);
            $('color').value = String(data.defaults?.color || 2);
            driverReady = true;
            updateMode();
            status('Escolha o modo e o PDF. Confira as opções do driver ou o preset do RIP. Nada foi enviado.');
        } catch (error) {
            if (revision === printerRevision) {
                updateMode();
                status(error.message + ' GDI indisponível; PDF RAW depende da confirmação do RIP.');
            }
        }
    }
    $('printer').addEventListener('change', printersChanged);
    $('form').addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || attempted || !ready || !$('confirm').checked || ($('mode').value === 'pdf_raw' && !$('raw').checked)) return;
        const file = $('file').files[0];
        if (!file) return;
        busy = true;
        $('fields').disabled = true;
        $('send').disabled = true;
        try {
            const selected = options();
            const printer = $('printer').value;
            const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
            selected.integridade_sha256 = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
            selected.gestao_envio_id = crypto.randomUUID();
            const form = new FormData();
            form.append('file', file, file.name);
            form.append('printer_name', printer);
            form.append('options', JSON.stringify(selected));
            attempted = true; // qualquer resposta perdida exige conferencia, nunca retry automatico
            status(`Enviando teste ${selected.gestao_envio_id.slice(0, 8)} — ${$('mode').selectedOptions[0].textContent}…`);
            const result = await json(`${base}/api/print/experimental/submit`, {
                method: 'POST', body: form, headers: {'X-NewProd-Experimental': '1'}, signal: AbortSignal.timeout(600000)
            });
            const details = result.modo === 'pdf_raw'
                ? `PDF intacto enviado: ${(result.raw_bytes / 1048576).toFixed(2)} MiB. O processamento depende do RIP.\n`
                : `${result.dpi} DPI; driver ${result.driver_dpi.join(' × ')} DPI.\n` +
                  `Volume RGB calculado: ${(result.raster_rgb_bytes / 1048576).toFixed(2)} MiB — não é o tamanho da fila.\n` +
                  `Preparação das imagens: ${result.render_seconds}s.\n`;
            status(`Teste entregue ao Windows. ID da fila: ${result.spool_id}\n` +
                `Modo: ${$('mode').selectedOptions[0].textContent}\n` +
                `${result.paginas} página(s). PDF: ${(result.pdf_bytes / 1048576).toFixed(2)} MiB.\n` + details +
                `Preparação e envio ao Windows: ${result.envio_seconds}s.\n` +
                'Confira o tamanho na fila e o tempo até sair papel. O envio não comprova impressão física.');
        } catch (error) {
            status(`${error.message}\nNenhum reenvio automático foi feito. Confira a fila e as folhas antes de preparar outro teste.`);
        } finally {
            busy = false;
            $('confirm').checked = false;
            $('new').hidden = false;
        }
    });
    $('new').addEventListener('click', () => {
        if (busy) return;
        attempted = false;
        $('fields').disabled = false;
        $('confirm').checked = false;
        $('raw').checked = false;
        updateMode();
        $('new').hidden = true;
        status('Novo teste preparado. Confira novamente as opções antes de enviar.');
    });
    async function init() {
        try {
            const caps = await json(`${base}/api/print/experimental/capabilities`, {signal: AbortSignal.timeout(5000)});
            if (caps.schema !== 2 || !['gdi_atual', 'experimental_gdi', 'pdf_raw'].every(mode => caps.modos?.includes(mode))) throw new Error('Agente sem os três modos experimentais. Atualize o pacote de teste.');
            const data = await json(`${base}/api/printers`, {signal: AbortSignal.timeout(15000)});
            for (const printer of data.printers || data) {
                const name = typeof printer === 'string' ? printer : printer.name;
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                $('printer').appendChild(option);
            }
            $('fields').disabled = false;
            updateMode();
            status('Modo experimental disponível nesta estação. Selecione a impressora.');
        } catch (error) { status(error.message + '\nA impressão normal permanece disponível no painel.'); }
    }
    init();
})();
