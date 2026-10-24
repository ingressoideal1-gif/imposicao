/* Importação local de Excel; a gravação usa o contrato existente do pedido. */
(function (root) {
    'use strict';
    const origemScript = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : '';
    let carregando;
    function biblioteca() {
        if (root.XLSX) return Promise.resolve(root.XLSX);
        if (!carregando) carregando = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = new URL('vendor/sheetjs-0.20.3/xlsx.full.min.js', origemScript || document.baseURI).href;
            script.onload = () => resolve(root.XLSX);
            script.onerror = () => { carregando = null; script.remove(); reject(new Error('Não foi possível carregar o leitor de Excel. Tente novamente.')); };
            document.head.appendChild(script);
        });
        return carregando;
    }

    function converter(xlsx, sheet) {
        if (!sheet || !sheet['!ref']) throw new Error('Esta aba está vazia.');
        const range = xlsx.utils.decode_range(sheet['!fullref'] || sheet['!ref']);
        if (range.e.r > 50000 || range.e.c > 255) throw new Error('Use uma aba com até 50.000 linhas e 256 colunas.');
        const matriz = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });
        if (matriz.length < 2) throw new Error('A aba precisa de cabeçalho e pelo menos uma linha de dados.');
        const largura = Math.max(...matriz.map(linha => linha.length));
        const headers = Array.from({ length: largura }, (_, i) => String(matriz[0][i] || '').trim());
        const usados = new Set();
        headers.forEach(h => {
            if (!h) throw new Error('Preencha o nome de todas as colunas na primeira linha.');
            if (usados.has(h)) throw new Error('Há colunas com nomes repetidos: ' + h);
            if (h.startsWith('__') || ['constructor', 'prototype'].includes(h)) throw new Error('Nome de coluna reservado: ' + h);
            usados.add(h);
        });
        const rows = matriz.slice(1).filter(linha => linha.some(v => String(v).trim() !== '')).map(linha =>
            Object.fromEntries(headers.map((h, i) => [h, String(linha[i] == null ? '' : linha[i])])));
        if (!rows.length) throw new Error('A aba não tem linhas de dados.');
        return { headers, rows };
    }

    function abrir(salvar) {
        if (document.getElementById('banco-excel-dialog')) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            try {
                if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('Escolha um arquivo .xlsx ou .xls.');
                if (file.size > 20 * 1024 * 1024) throw new Error('O arquivo deve ter até 20 MB.');
                const xlsx = await biblioteca();
                const book = xlsx.read(await file.arrayBuffer(), { type: 'array', cellText: true, sheetRows: 50002 });
                const dialog = document.createElement('dialog');
                dialog.id = 'banco-excel-dialog';
                dialog.style.cssText = 'width:min(760px,90vw);max-height:85vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--border);border-radius:10px;padding:24px;';
                dialog.innerHTML = '<h3>Importar Excel</h3><p>A primeira linha contém os nomes das colunas. Escolha a aba para criar um novo banco deste pedido.</p><label>Aba <select class="form-control"></select></label><label>Nome do banco <input class="form-control" maxlength="120"></label><p role="status"></p><div style="overflow:auto;max-height:260px"></div><p>Prévia das primeiras 5 linhas. Valores e datas usam a formatação salva no Excel; fórmulas não são recalculadas.</p><button class="btn btn-primary">Importar</button> <button class="btn btn-secondary">Cancelar</button>';
                const select = dialog.querySelector('select');
                const nome = dialog.querySelector('input');
                const status = dialog.querySelector('[role=status]');
                const preview = dialog.querySelector('div');
                const [importar, cancelar] = dialog.querySelectorAll('button');
                let dados;
                let ocupado = false;
                for (const aba of book.SheetNames) select.add(new Option(aba, aba));
                const atualizar = () => {
                    dados = null;
                    importar.disabled = true;
                    preview.replaceChildren();
                    nome.value = (file.name.replace(/\.(xlsx|xls)$/i, '') + (book.SheetNames.length > 1 ? ' - ' + select.value : '')).slice(0, 120);
                    try {
                        dados = converter(xlsx, book.Sheets[select.value]);
                        status.textContent = dados.rows.length + ' linha(s), ' + dados.headers.length + ' coluna(s).';
                        const table = document.createElement('table');
                        for (const [i, linha] of [dados.headers, ...dados.rows.slice(0, 5).map(r => dados.headers.map(h => r[h]))].entries()) {
                            const tr = table.insertRow();
                            for (const valor of linha) {
                                const td = document.createElement(i === 0 ? 'th' : 'td');
                                td.textContent = valor;
                                td.style.cssText = 'padding:5px 10px;border:1px solid #999;white-space:pre-wrap;';
                                tr.appendChild(td);
                            }
                        }
                        preview.appendChild(table);
                        importar.disabled = false;
                    } catch (e) { status.textContent = e.message; }
                };
                select.onchange = atualizar;
                cancelar.onclick = () => dialog.close();
                dialog.oncancel = e => { if (ocupado) e.preventDefault(); };
                dialog.onclose = () => dialog.remove();
                importar.onclick = async () => {
                    if (ocupado || !dados) return;
                    if (!nome.value.trim()) { status.textContent = 'Informe o nome do banco.'; return; }
                    ocupado = true;
                    importar.disabled = cancelar.disabled = select.disabled = nome.disabled = true;
                    status.textContent = 'Importando…';
                    try {
                        await salvar({ ...dados, nome: nome.value.trim(), filename: file.name });
                        dialog.close();
                    } catch (e) {
                        status.textContent = 'Não foi possível importar: ' + (e.message || e);
                        ocupado = false;
                        importar.disabled = cancelar.disabled = select.disabled = nome.disabled = false;
                    }
                };
                document.body.appendChild(dialog);
                atualizar();
                dialog.showModal();
            } catch (e) { root.toast('Erro ao ler Excel: ' + (e.message || e), 'error'); }
        };
        input.click();
    }
    root.BancoExcel = { abrir, converter };
})(typeof window !== 'undefined' ? window : globalThis);
