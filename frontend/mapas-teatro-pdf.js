// Pranchas por setor a partir do mapa persistido. Usa PDF-lib já incluído no painel.
(function () {
    const cache = new Map();
    let fecharAtual = null;
    const slug = v => String(v || 'sem-nome').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'sem-nome';
    const ordenado = v => Array.isArray(v) ? v.map(ordenado) : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordenado(v[k])])) : v;
    const ativos = s => Object.entries(s.cadeiras || {}).filter(([, c]) => c && c.tipo !== 'Apagado' && !c.isErased);

    function preparar(mapa) {
        if (!mapa?.id || String(mapa.id).startsWith('local_')) throw Error('Salve o mapa antes de gerar os PDFs.');
        if (Object.keys(mapa.config?.cadeiras || {}).length) throw Error('Revise as cadeiras antigas sem setor antes de gerar os PDFs.');
        const setores = (mapa.config?.setores || []).map((s, idx) => {
            const cadeiras = ativos(s).map(([key, c]) => {
                const coordenadas = key.split(',');
                const [x, y] = coordenadas.map(Number);
                if (coordenadas.length !== 2 || coordenadas.some(v => !v.trim()) || !Number.isFinite(x) || !Number.isFinite(y)) throw Error('Posição inválida no setor ' + s.nome + '.');
                return { key, x, y, label: String(c.prefixo ?? '') + String(c.num ?? ''), tipo: c.tipo || 'Normal' };
            });
            const filas = new Map(), tipos = new Map();
            for (const t of mapa.config.tiposAssento || []) tipos.set(t.id, { ...t, quantidade: 0 });
            const padroes = { Normal: ['Normal', '#3498db'], PCD: ['Cadeirante', '#f1c40f'], Obeso: ['Obeso', '#e67e22'], Acompanhante: ['Acompanhante', '#2ecc71'] };
            for (const c of cadeiras) {
                const fila = String((s.cadeiras[c.key].prefixo ?? '') || 'Sem prefixo');
                filas.set(fila, (filas.get(fila) || 0) + 1);
                if (!tipos.has(c.tipo)) tipos.set(c.tipo, { id: c.tipo, nome: padroes[c.tipo]?.[0] || c.tipo, cor: padroes[c.tipo]?.[1] || '#51657d', quantidade: 0 });
                tipos.get(c.tipo).quantidade++;
            }
            const bounds = cadeiras.reduce((b, c) => ({ minX: Math.min(b.minX, c.x), maxX: Math.max(b.maxX, c.x), minY: Math.min(b.minY, c.y), maxY: Math.max(b.maxY, c.y) }),
                { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
            const codigos = { Normal: 'N', PCD: 'C', Obeso: 'O', Acompanhante: 'A' };
            [...tipos.values()].forEach((t, i) => { t.codigo = codigos[t.id] || 'T' + (i + 1); });
            return { id: String(s.id || 'setor-' + (idx + 1)), nome: String(s.nome || 'Setor ' + (idx + 1)), cadeiras, bounds: cadeiras.length ? bounds : null,
                filas: [...filas].sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true })),
                tipos: [...tipos.values()].filter(t => t.quantidade), quantidade: cadeiras.length,
                arquivo: slug(mapa.name) + '--' + slug(s.nome) + '--setor-' + (idx + 1) + '.pdf' };
        });
        return { id: String(mapa.id), nome: String(mapa.name || 'Mapa sem nome'), setores,
            total: setores.reduce((n, s) => n + s.quantidade, 0) };
    }

    async function gerar(mapa) {
        const plano = preparar(mapa);
        const chave = JSON.stringify(ordenado({ id: mapa.id, name: mapa.name, config: mapa.config }));
        if (cache.has(chave)) return cache.get(chave);
        const trabalho = construir(plano, chave);
        cache.set(chave, trabalho);
        while (cache.size > 3) cache.delete(cache.keys().next().value);
        try { return await trabalho; } catch (e) { cache.delete(chave); throw e; }
    }

    async function construir(plano, chave) {
        if (!window.PDFLib?.PDFDocument || !window.MAPA_TEATRO_LOGO_PNG) throw Error('Os recursos de PDF não carregaram. Atualize a página e tente novamente.');
        const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(chave));
        const revisao = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
        const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
        const arquivos = [];
        const completo = await PDFDocument.create();
        completo.setTitle(plano.nome + ' — Ingresso Ideal');
        completo.setAuthor('Ingresso Ideal');
        for (const setor of plano.setores.length ? plano.setores : [{ id: '', nome: 'Mapa sem setores', cadeiras: [], filas: [], tipos: [], quantidade: 0, arquivo: slug(plano.nome) + '.pdf' }]) {
            const doc = await PDFDocument.create();
            doc.setTitle(plano.nome + ' — ' + setor.nome);
            doc.setAuthor('Ingresso Ideal');
            doc.setSubject('Mapa ' + plano.id + '; setor ' + setor.id + '; revisão ' + revisao);
            const normal = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
            const logo = await doc.embedPng(window.MAPA_TEATRO_LOGO_PNG);
            const tinta = rgb(.12, .21, .29), cinza = rgb(.40, .49, .56), verde = rgb(.07, .59, .57);
            const cor = hex => {
                const h = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#51657d';
                return rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
            };
            const largura = (texto, size, font = normal) => font.widthOfTextAtSize(String(texto), size);
            function texto(page, valor, x, y, size = 10, font = normal, max = Infinity, color = tinta) {
                const t = String(valor);
                const w = largura(t, size, font);
                page.drawText(t, { x, y, size: w > max ? size * max / w : size, font, color });
            }
            const b = setor.bounds;
            const cols = b ? b.maxX - b.minX + 1 : 1, rows = b ? b.maxY - b.minY + 1 : 1;
            const horizontal = cols / rows > 1.15;
            const W = horizontal ? 1190.55 : 841.89, H = horizontal ? 841.89 : 1190.55;
            const area = { x: 34, y: 137, w: W - 249, h: H - 304 };
            const maxFilas = Math.max(1, Math.floor((area.h - 100) / 17));
            const legenda = setor.tipos.map(t => ({ ...t, label: t.codigo + ' · ' + t.nome + (t.sufixo ? ' (' + t.sufixo + ')' : '') + ': ' + t.quantidade }));
            const legendaWidth = legenda.reduce((n, t) => n + largura(t.label, 9) + 34, 0);
            const resumoExtra = setor.filas.length > maxFilas || legendaWidth > W - 68;
            const maxLabel = setor.cadeiras.reduce((v, c) => Math.max(v, largura(c.label, 8, bold)), 0);
            // A cadeira ocupa .74 do passo; o texto usa .85 dessa largura.
            // A margem .62 garante ao menos 8 pontos também nos rótulos longos.
            const minStep = Math.max(24, maxLabel / .62);
            const stepGeral = Math.min((area.w - 20) / cols, (area.h - 20) / rows);
            const precisaDetalhes = setor.quantidade > 0 && stepGeral < minStep;
            const partes = [{ cadeiras: setor.cadeiras, minX: b?.minX || 0, minY: b?.minY || 0, cols, rows, titulo: precisaDetalhes ? 'Visão geral — rótulos nas páginas de detalhe' : 'Desenho do setor', rotulos: !precisaDetalhes }];
            if (precisaDetalhes) {
                const nx = Math.max(1, Math.floor((area.w - 20) / minStep)), ny = Math.max(1, Math.floor((area.h - 20) / minStep));
                const grupos = new Map();
                for (const c of setor.cadeiras) {
                    const tx = Math.floor((c.x - b.minX) / nx), ty = Math.floor((c.y - b.minY) / ny), key = tx + ',' + ty;
                    if (!grupos.has(key)) grupos.set(key, { tx, ty, cadeiras: [] });
                    grupos.get(key).cadeiras.push(c);
                }
                if (grupos.size > 500) throw Error('Este setor exige mais de 500 páginas de detalhe. Revise sua distribuição antes de gerar o PDF.');
                [...grupos.values()].sort((a, c) => a.ty - c.ty || a.tx - c.tx).forEach((g, i) => partes.push({ cadeiras: g.cadeiras, minX: b.minX + g.tx * nx, minY: b.minY + g.ty * ny,
                    cols: nx, rows: ny, titulo: 'Detalhe ' + (i + 1) + ' de ' + grupos.size, rotulos: true }));
            }
            function base(titulo) {
                const page = doc.addPage([W, H]);
                page.drawImage(logo, { x: 34, y: H - 66, width: 160, height: 160 * logo.height / logo.width });
                texto(page, 'MAPA DE TEATRO', W - 200, H - 43, 11, bold, 165, verde);
                texto(page, plano.nome, 34, H - 99, 17, normal, W - 195);
                texto(page, setor.nome, 34, H - 132, 28, bold, W - 210);
                texto(page, setor.quantidade, W - 130, H - 122, 35, bold, 100, verde);
                texto(page, 'ASSENTOS', W - 130, H - 138, 9, normal, 100, cinza);
                page.drawLine({ start: { x: 34, y: H - 155 }, end: { x: W - 34, y: H - 155 }, thickness: 2, color: verde });
                texto(page, titulo, 34, H - 178, 10, bold, W - 68, cinza);
                page.drawLine({ start: { x: 34, y: 64 }, end: { x: W - 34, y: 64 }, thickness: .5, color: cinza });
                texto(page, 'Mapa: ' + plano.id + ' · Setor: ' + setor.id, 34, 48, 8, normal, W - 68, cinza);
                texto(page, 'Ingresso Ideal · ' + data + ' (Brasília) · Revisão ' + revisao.slice(0, 12), 34, 32, 8, normal, W - 68, cinza);
                return page;
            }
            for (const parte of partes) {
                const page = base(parte.titulo);
                page.drawRectangle({ x: area.x, y: area.y, width: area.w, height: area.h, borderWidth: .6, borderColor: rgb(.87, .91, .94), color: rgb(.99, .995, 1) });
                const step = Math.min((area.w - 20) / parte.cols, (area.h - 20) / parte.rows), side = step * .74;
                const ox = (area.w - ((parte.cols - 1) * step + side)) / 2, oy = (area.h - ((parte.rows - 1) * step + side)) / 2;
                let n = 0;
                for (const c of parte.cadeiras) {
                    const x = area.x + ox + (c.x - parte.minX) * step, y = area.y + area.h - oy - (c.y - parte.minY) * step - side;
                    const t = setor.tipos.find(t => t.id === c.tipo), color = cor(t?.cor);
                    page.drawRectangle({ x, y, width: side, height: side, borderWidth: .8, borderColor: color, color, opacity: .10, borderOpacity: 1 });
                    page.drawLine({ start: { x: x + side * .16, y: y + side * .14 }, end: { x: x + side * .84, y: y + side * .14 }, thickness: .9, color });
                    if (parte.rotulos) {
                        const size = Math.min(12, side * .46, side * .85 / Math.max(1, largura(c.label, 1, bold)));
                        texto(page, c.label, x + (side - largura(c.label, size, bold)) / 2, y + side * .48 - size * .30, size, bold);
                        if (c.tipo !== 'Normal') {
                            page.drawCircle({ x: x + side, y: y + side, size: side * .16, color });
                            const badgeSize = Math.min(side * .18, side * .28 / Math.max(1, largura(t.codigo, 1, bold)));
                            texto(page, t.codigo, x + side - largura(t.codigo, badgeSize, bold) / 2, y + side - badgeSize * .30, badgeSize, bold);
                        }
                    }
                    if (++n % 500 === 0) await new Promise(r => setTimeout(r, 0));
                }
                if (!setor.quantidade) texto(page, 'Não há assentos cadastrados neste setor.', area.x + 20, area.y + area.h / 2, 13);
                const sx = W - 190;
                texto(page, 'ASSENTOS POR FILA', sx, H - 205, 10, bold, 156, cinza);
                setor.filas.slice(0, maxFilas).forEach(([fila, qtd], i) => {
                    texto(page, 'Fila ' + fila, sx, H - 231 - i * 17, 11, normal, 112);
                    texto(page, qtd, W - 61, H - 231 - i * 17, 11, bold, 30);
                });
                if (setor.filas.length > maxFilas) texto(page, 'Lista completa no resumo.', sx, 170, 9, normal, 156, cinza);
                texto(page, 'Total do mapa: ' + plano.total, sx, 146, 10, bold, 156);
                texto(page, 'Espaços vazios preservados. Desenho esquemático, sem escala métrica.', 34, 115, 10, normal, W - 68, cinza);
                texto(page, 'Palco e orientação física não informados no cadastro.', 34, 99, 9, normal, W - 68, cinza);
                if (legendaWidth <= W - 68) {
                    let lx = 34;
                    for (const t of legenda) {
                        page.drawRectangle({ x: lx, y: 82, width: 10, height: 10, color: cor(t.cor) });
                        texto(page, t.label, lx + 15, 83, 9);
                        lx += largura(t.label, 9) + 34;
                    }
                } else texto(page, 'Legenda completa no resumo do setor.', 34, 83, 9, normal, W - 68, cinza);
            }
            // Resumo paginado: todas as filas e tipos, sem cortar listas longas.
            const linhas = [['Assentos por fila', ''], ...setor.filas.map(([f, n]) => ['Fila ' + f, n]),
                ['Tipos de assento', ''], ...setor.tipos.map(t => [String(t.nome) + (t.sufixo ? ' (' + t.sufixo + ')' : ''), t.quantidade]),
                ['Total do setor', setor.quantidade], ['Total do mapa', plano.total]];
            const porPagina = Math.floor((H - 270) / 21);
            for (let inicio = 0; resumoExtra && inicio < linhas.length; inicio += porPagina) {
                const page = base('Resumo do setor — contagem e legenda');
                linhas.slice(inicio, inicio + porPagina).forEach(([nome, qtd], i) => {
                    const y = H - 214 - i * 21;
                    texto(page, nome, 45, y, 12, qtd === '' ? bold : normal, W - 150);
                    texto(page, qtd, W - 100, y, 12, bold, 55);
                    const tipo = setor.tipos.find(t => String(t.nome) + (t.sufixo ? ' (' + t.sufixo + ')' : '') === nome);
                    if (tipo) page.drawRectangle({ x: W - 137, y: y - 1, width: 12, height: 12, color: cor(tipo.cor) });
                });
            }
            const bytes = await doc.save();
            arquivos.push({ ...setor, bytes, paginas: doc.getPageCount() });
            const paginas = await completo.copyPages(doc, doc.getPageIndices());
            paginas.forEach(p => completo.addPage(p));
        }
        return { ...plano, revisao, arquivos, bytes: await completo.save(), arquivo: slug(plano.nome) + '--' + slug(plano.id).slice(0, 12) + '.pdf' };
    }

    function abrir(resultado) {
        if (fecharAtual) fecharAtual();
        const anterior = document.activeElement;
        const overlay = document.createElement('div');
        overlay.id = 'mapa-pdfs-dialogo';
        overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:1000002;background:#020617bb;display:flex;align-items:center;justify-content:center;padding:20px';
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--card-bg,#1e293b);color:var(--text,#e2e8f0);padding:24px;border-radius:12px;width:700px;max-width:100%;max-height:85vh;overflow:auto';
        const titulo = document.createElement('h2'); titulo.textContent = 'PDFs — ' + resultado.nome; box.appendChild(titulo);
        const info = document.createElement('p'); info.textContent = resultado.total + ' assentos · Revisão ' + resultado.revisao.slice(0, 12); box.appendChild(info);
        if (resultado.mapaPersistido && window.MapasTeatroPdfStorage) {
            const status = document.createElement('p'); status.id = 'mapa-pdfs-status-erp'; box.appendChild(status);
            status.style.margin = '12px 0';
            const links = document.createElement('div'); box.appendChild(links);
            const enviar = document.createElement('button'); enviar.type = 'button'; enviar.className = 'btn btn-secondary';
            enviar.id = 'mapa-pdfs-salvar-erp'; enviar.textContent = 'Salvar PDFs para o ERP'; box.appendChild(enviar);
            function atualizarPersistencia() {
                links.replaceChildren();
                const pronto = resultado.persistencia?.estado === 'pronto';
                status.textContent = pronto ? 'PDFs salvos para o ERP nesta revisão.'
                    : 'PDFs disponíveis para download. Envio para o ERP pendente: ' + (resultado.persistencia?.mensagem || 'clique em Salvar PDFs para o ERP.');
                enviar.hidden = pronto;
                enviar.style.display = pronto ? 'none' : '';
                if (pronto) for (const a of resultado.persistencia.arquivos) {
                    const botao = document.createElement('button'); botao.type = 'button'; botao.className = 'btn btn-sm btn-secondary';
                    botao.textContent = 'Copiar link ERP — ' + (a.tipo === 'mapa' ? 'Mapa completo' : a.nome_setor);
                    botao.onclick = async () => {
                        try { await navigator.clipboard.writeText(a.pdf_recurso); status.textContent = 'Link copiado. O ERP deve enviar sua autenticação ao consultar o PDF.'; }
                        catch { status.textContent = 'Não foi possível copiar automaticamente. Use o campo do link.'; }
                    };
                    const campo = document.createElement('input'); campo.readOnly = true; campo.value = a.pdf_recurso;
                    campo.setAttribute('aria-label', 'Link ERP do ' + (a.nome_setor || 'mapa completo'));
                    campo.style.cssText = 'width:100%;box-sizing:border-box;background:var(--input-bg,#0f172a);color:inherit;border:1px solid #64748b55;border-radius:6px;padding:8px;margin:6px 0 12px;font-size:12px';
                    links.appendChild(botao); links.appendChild(campo);
                }
            }
            enviar.onclick = async () => {
                enviar.disabled = true; status.textContent = 'Salvando os PDFs para o ERP...';
                try { resultado.persistencia = await window.MapasTeatroPdfStorage.persistir(resultado.mapaPersistido, resultado); }
                catch (e) { resultado.persistencia = { estado: 'pendente', mensagem: e.message }; }
                finally { enviar.disabled = false; atualizarPersistencia(); }
            };
            atualizarPersistencia();
        }
        const urls = [];
        function linha(nome, arquivo, bytes, detalhe) {
            const row = document.createElement('div'); row.style.cssText = 'padding:14px 0;border-top:1px solid #64748b55;display:flex;gap:14px;flex-wrap:wrap;align-items:center';
            const label = document.createElement('span'); label.style.flex = '1'; label.textContent = nome + (detalhe ? ' · ' + detalhe : ''); row.appendChild(label);
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); urls.push(url);
            for (const [texto, baixar] of [['Visualizar', false], ['Baixar PDF', true]]) {
                const a = document.createElement('a'); a.className = 'btn btn-sm btn-secondary'; a.textContent = texto; a.href = url;
                if (baixar) a.download = arquivo; else { a.target = '_blank'; a.rel = 'noopener'; }
                row.appendChild(a);
            }
            box.appendChild(row);
        }
        linha('Mapa completo', resultado.arquivo, resultado.bytes);
        resultado.arquivos.forEach(a => linha(a.nome, a.arquivo, a.bytes, a.quantidade + ' assentos / ' + a.paginas + ' páginas'));
        const fechar = document.createElement('button'); fechar.className = 'btn btn-primary'; fechar.type = 'button'; fechar.textContent = 'Fechar'; fechar.style.marginTop = '20px';
        let fechado = false;
        const encerrar = () => {
            if (fechado) return; fechado = true;
            fecharAtual = null;
            overlay.remove(); document.removeEventListener('keydown', tecla, true);
            setTimeout(() => urls.forEach(url => URL.revokeObjectURL(url)), 30000);
            if (anterior?.isConnected) anterior.focus();
        };
        const tecla = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); encerrar(); } };
        fechar.onclick = encerrar; overlay.onclick = e => { if (e.target === overlay) encerrar(); };
        box.appendChild(fechar); overlay.appendChild(box); document.body.appendChild(overlay);
        fecharAtual = encerrar;
        document.addEventListener('keydown', tecla, true); fechar.focus();
    }
    window.MapasTeatroPdf = { preparar, gerar, abrir };
})();
