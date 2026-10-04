(function () {
    'use strict';
    if (location.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(location.hostname)
        || location.port !== '9001') return;
    let dados = null, ultima = 0, painel, controles, gerenciamento, mensagem = '', comandoAtivo = false;
    const podeGerenciar = () => window._currentPerms?.perm_producao_edit === true
        || window._currentPerms?.perm_admin_edit === true;
    async function comando(corpo) {
        if (comandoAtivo) return;
        comandoAtivo = true;
        try {
            const r = await fetch('/api/pacotes-locais/controle-painel', {
                method:'POST', headers:{'Content-Type':'application/json','X-Piloto-Painel':'1'}, body:JSON.stringify(corpo),
                signal:AbortSignal.timeout(20000)
            });
            if (r.status === 403) {
                mensagem = 'Seu acesso precisa da permissão de editar Produção para controlar a cópia local.';
                return;
            }
            if (!r.ok) throw Error();
            mensagem = corpo.acao === 'preferir' ? 'Preferência salva nesta estação.'
                : corpo.acao === 'pausar' ? 'Cópia pausada.' : 'Cópia solicitada; aguardando disponibilidade da estação.';
            await consultar();
        } catch (_) { mensagem = 'Não foi possível confirmar o comando. Confira a conexão com o agente e tente novamente.'; }
        finally { comandoAtivo = false; pintar(); }
    }
    async function consultar() {
        const r = await fetch('/api/pacotes-locais/resumo-painel', {cache:'no-store', signal:AbortSignal.timeout(5000)});
        if (!r.ok) throw Error();
        dados = await r.json(); ultima = Date.now();
    }
    const copias = new Set(['local_validado', 'recursos_antecipados', 'fotos_fontes_locais', 'dependencias_pendentes']);
    const bytes = n => Number.isFinite(n) ? (n / 1048576).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' MB' : 'não medido';
    function ligarAbertura() {
        const original = window.abrirImposicaoDoPedido;
        if (typeof original !== 'function' || original.pilotoAtualizaAoAbrir) return;
        const abrir = function(osId, numeroOS, ...resto) {
            const fonte = typeof state !== 'undefined' ? state : null;
            const pedido = String(fonte?.ordens?.find(os => String(os.id) === String(osId))?.numero || numeroOS || '');
            if (/^[1-9][0-9]{0,14}$/.test(pedido)) {
                fetch('/api/pacotes-locais/controle-painel', {
                    method:'POST',headers:{'Content-Type':'application/json','X-Piloto-Painel':'1'},
                    body:JSON.stringify({acao:'abrir',pedido}),signal:AbortSignal.timeout(10000)
                }).then(r => { if (!r.ok) throw Error(); }).catch(() => {
                    mensagem = 'Pedido aberto; não foi possível solicitar a atualização da cópia local.';
                    pintar();
                });
            }
            return original.call(this, osId, numeroOS, ...resto);
        };
        abrir.pilotoAtualizaAoAbrir = true;
        window.abrirImposicaoDoPedido = abrir;
    }
    function pintar() {
        ligarAbertura();
        const tabela = document.getElementById('table-impressao');
        if (!tabela) return;
        const fresco = dados && Date.now() - ultima < 45000;
        const fonte = typeof state !== 'undefined' ? state : null;
        tabela.querySelectorAll('tr.os-row').forEach(linha => {
            const id = linha.getAttribute('onclick')?.match(/abrirImposicaoDoPedido\('([^']+)'/)?.[1];
            const pedido = fonte?.ordens?.find(os => String(os.id) === id);
            if (!pedido) return;
            const numero = String(pedido.numero || '');
            if (/^[1-9][0-9]{0,14}$/.test(numero) && linha.cells[0]) {
                let check = linha.cells[0].querySelector('[data-piloto-preferir]');
                if (!check) {
                    check = document.createElement('input'); check.type = 'checkbox';
                    check.dataset.pilotoPreferir = numero;
                    check.title = 'Priorizar download deste pedido nesta estação';
                    check.setAttribute('aria-label', 'Priorizar download do pedido ' + numero);
                    check.style.cssText = 'margin-right:8px;cursor:pointer;width:16px;height:16px';
                    check.addEventListener('click', e => e.stopPropagation());
                    check.addEventListener('change', () => comando({acao:'preferir',pedido:numero,marcado:check.checked}));
                    linha.cells[0].prepend(check);
                }
                check.disabled = !fresco || comandoAtivo || !podeGerenciar();
                check.checked = (dados?.preferenciais || []).includes(numero);
            }
            const globais = fonte.modelosGlobais?.[parseInt(pedido.numero)];
            const modelos = globais?.length ? globais : fonte.osItens?.[pedido.id] || [];
            const celula = linha.cells[4];
            if (!celula) return;
            let selo = celula.querySelector('[data-piloto-modelos]');
            if (!selo) { selo = document.createElement('span'); celula.appendChild(selo); }
            selo.dataset.pilotoPrateleira = String(modelos.length > 0 && modelos.every(m => m._produto_prateleira === true));
            selo.dataset.pilotoModelos = modelos.filter(m => m._produto_prateleira !== true).map(m => String(m._pedidoModeloId || m.id || '')).filter(id => /^\d+$/.test(id)).join(',');
        });
        if (!gerenciamento?.isConnected) {
            const filtros = document.getElementById('filter-container-status');
            const titulo = filtros?.previousElementSibling;
            if (filtros && titulo?.classList.contains('prod-metrics-title')) {
                titulo.textContent = 'Gerenciamento Local';
                filtros.hidden = true;
                filtros.style.setProperty('display', 'none', 'important');
                gerenciamento = document.createElement('section');
                gerenciamento.id = 'gerenciamento-local';
                gerenciamento.setAttribute('aria-label', 'Gerenciamento Local');
                gerenciamento.style.cssText = 'flex-shrink:0;min-width:0;background:var(--card-bg,#1e293b);border:1px solid #475569;border-radius:10px;padding:10px;color:var(--text-main,#e2e8f0);font-size:12px';
                titulo.after(gerenciamento);
            }
        }
        if (!controles?.isConnected) {
            controles = document.createElement('div'); controles.id = 'controles-copia-local';
            controles.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0;min-width:0';
            controles.innerHTML = '<button type="button" data-iniciar>Iniciar cópia local</button><button type="button" data-pausar>Pausar</button><span role="status"></span>';
            controles.querySelector('[data-iniciar]').onclick = () => comando({acao:'iniciar'});
            controles.querySelector('[data-pausar]').onclick = () => comando({acao:'pausar'});
            controles.querySelector('[role=status]').style.cssText = 'grid-column:1/-1;color:#94a3b8;font-size:11px;line-height:1.5;overflow-wrap:anywhere';
            controles.querySelectorAll('button').forEach(b => {
                b.className = 'prod-filter-status filter-btn-pill';
                b.style.cssText = 'white-space:normal;min-width:0;justify-content:center;padding:8px;font-size:11px';
            });
            if (gerenciamento) gerenciamento.appendChild(controles);
            else tabela.closest('.prod-table-card').insertBefore(controles, tabela.closest('.prod-table-body'));
        }
        const iniciar = controles.querySelector('[data-iniciar]');
        const ativo = fresco && (dados.fila.ativo || dados.coleta?.estado === 'consultando');
        const textoBotao = dados?.fila.pausado ? 'Retomar cópia local' : ativo ? 'Copiando…' : 'Iniciar cópia local';
        if (iniciar.textContent !== textoBotao) iniciar.textContent = textoBotao;
        iniciar.disabled = !fresco || comandoAtivo || !podeGerenciar() || ativo && !dados.fila.pausado;
        controles.querySelector('[data-pausar]').disabled = !fresco || comandoAtivo || !podeGerenciar() || dados.fila.pausado;
        const aviso = controles.querySelector('[role=status]');
        const avisoTexto = fresco && !podeGerenciar()
            ? 'Acompanhamento disponível. Para controlar a cópia, seu acesso precisa da permissão de editar Produção.'
            : mensagem || 'Marque ao lado do número os pedidos preferenciais. A seleção vale nesta estação.';
        if (aviso.textContent !== avisoTexto) aviso.textContent = avisoTexto;
        if (!painel?.isConnected) {
            painel = document.createElement('details');
            painel.id = 'estatisticas-piloto-local';
            painel.open = true;
            painel.style.cssText = 'margin:10px 0 0;padding-top:10px;border-top:1px solid #475569;line-height:1.6;overflow-wrap:anywhere;font-size:11px';
            painel.innerHTML = '<summary>Arquivos nesta estação</summary><p role="status"></p>';
            painel.querySelector('summary').style.cssText = 'cursor:pointer;font-weight:700;color:#67e8f9';
            painel.querySelector('p').style.cssText = 'white-space:pre-line;margin:8px 0 0';
            if (gerenciamento) gerenciamento.appendChild(painel);
            else tabela.closest('.prod-table-card').insertBefore(painel, tabela.closest('.prod-table-body'));
        }
        if (gerenciamento) {
            if (controles.parentElement !== gerenciamento) gerenciamento.appendChild(controles);
            if (painel.parentElement !== gerenciamento) gerenciamento.appendChild(painel);
        }
        const e = dados?.estatisticas;
        const resumo = painel.querySelector('summary');
        const titulo = fresco ? `Arquivos nesta estação · ${e.arquivos_cache ?? '—'} no cache · ${bytes(e.bytes_cache)}` : 'Arquivos nesta estação · sem confirmação';
        if (resumo.textContent !== titulo) resumo.textContent = titulo;
        const ensaio = dados?.ensaio_impressos;
        const texto = fresco ? [
            `Setor prioritário: ${dados.setor || 'não informado'} · Pedidos preferenciais: ${dados.preferenciais?.length || 0}`,
            `Arquivos no cache: ${e.arquivos_cache ?? 'não medido'} · Espaço: ${bytes(e.bytes_cache)}`,
            `Modelos no catálogo: ${e.modelos_catalogados} · Fila: ${dados.fila.pendentes} · Revisões com falha: ${e.revisoes_com_falha}`,
            `Disco livre: ${bytes(e.bytes_livres)} · Preparação: ${dados.fila.pausado ? 'pausada' : dados.fila.ocupado ? 'aguardando produção' : 'ativa'}`,
            `Última consulta: ${dados.coleta?.ultima_consulta ? new Date(dados.coleta.ultima_consulta).toLocaleString('pt-BR') : 'ainda não concluída'}`,
            `Coleta: ${dados.coleta?.estado === 'concluida' ? 'varredura concluída' : dados.coleta?.estado === 'consultando' ? 'consultando · ' + (dados.coleta.fase || 'catálogo') : dados.coleta?.estado || 'não informada'}`,
            `Lotes consultados nesta varredura: ${dados.coleta?.lotes_consultados ?? '—'} · Catálogo geral: ${dados.coleta?.lotes_catalogo ?? '—'}`,
            dados.coleta?.motivo || '',
            ensaio ? `Ensaio separado de impressos: ${ensaio.arquivos} arquivos · ${bytes(ensaio.bytes)} · download ${ensaio.download_segundos.toFixed(2)} s · leitura local com cache ${ensaio.leitura_segundos.toFixed(3)} s · falhas ${ensaio.falhas}` : '',
            'Contagem por arquivo único. Arquivo em cache não significa modelo pronto para imprimir.'
        ].filter(Boolean).join('\n\n') : 'Estatísticas locais indisponíveis. A impressão mantém o fluxo atual.';
        const alvo = painel.querySelector('p');
        if (alvo.textContent !== texto) alvo.textContent = texto;
        const mapa = new Map();
        for (const m of fresco ? dados.modelos : []) {
            if (!mapa.has(String(m.modelo))) mapa.set(String(m.modelo), []);
            mapa.get(String(m.modelo)).push(m);
        }
        document.querySelectorAll('[data-piloto-modelos]').forEach(el => {
            const ids = [...new Set(el.dataset.pilotoModelos.split(',').filter(Boolean))];
            const locais = ids.filter(id => (mapa.get(id) || []).some(m => (m.copia_local_presente || copias.has(m.estado)))).length;
            const estados = ids.flatMap(id => mapa.get(id) || []);
            const label = el.dataset.pilotoPrateleira === 'true' ? 'Não se aplica — prateleira'
                : !fresco || !ids.length ? 'Local não verificado'
                : locais ? `Cópia local: ${locais}/${ids.length} · atualização ao abrir`
                : estados.some(m => m.estado.startsWith('falha_')) ? 'Falha na cópia · iniciar para tentar novamente'
                : estados.some(m => m.estado === 'preparando_local') ? 'Baixando arquivos…'
                : estados.some(m => m.estado === 'preparacao_pausada') ? 'Cópia pausada · aguardando disponibilidade'
                : estados.some(m => m.estado === 'aguardando_preparacao') ? 'Aguardando cópia local'
                : estados.length ? 'Atualização ou verificação local pendente' : 'Web · cópia local não confirmada';
            if (el.textContent !== label) el.textContent = label;
            el.style.cssText = 'display:block;font-size:10px;margin-top:5px;color:' + (label.startsWith('Cópia local:') ? '#4ade80' : '#e7c56b');
            el.title = 'Cópia presente no disco. Atualização ao abrir o pedido ou após 30 minutos sem impressão. A cor não autoriza impressão offline nem indica a origem usada na impressão.';
        });
    }
    async function atualizar() {
        try { await consultar(); }
        catch (_) { dados = null; ultima = 0; }
        finally { pintar(); setTimeout(atualizar, 15000); }
    }
    new MutationObserver(pintar).observe(document.body, {childList:true, subtree:true});
    atualizar();
})();
