/* Layout da capa: coordenadas em mm, X na borda esquerda da caixa e Y na linha de base. */
(function () {
    'use strict';
    const MM2PT = 2.83465;
    const campo = nome => document.getElementById('fmt-cover-' + nome);
    const numero = (nome, padrao) => {
        const valor = campo(nome)?.value;
        return valor !== '' && Number.isFinite(Number(valor)) ? Number(valor) : padrao;
    };
    window.lerEstiloDaCapa = () => ({
        cover_max_width_mm: Math.max(0, numero('max-width', 0)),
        cover_overflow: campo('overflow')?.value || 'shrink',
        cover_text_align: campo('text-align')?.value || 'left'
    });
    window.carregarEstiloDaCapa = (formato = {}) => {
        for (const [nome, valor] of Object.entries({
            'max-width': formato.cover_max_width_mm || '',
            overflow: formato.cover_overflow || 'shrink',
            'text-align': formato.cover_text_align || 'left'
        })) if (campo(nome)) campo(nome).value = valor;
    };

    window.desenharTextoDaCapa = function (ctx, fmt, titulo, detalhe, x, y, escalaPt) {
        const texto = titulo + detalhe;
        const corpo = (Number(fmt.cover_font_size) || 12) * escalaPt;
        const largura = Math.max(0, Number(fmt.cover_max_width_mm) || 0) * MM2PT * escalaPt;
        ctx.save();
        // A régua em negrito reserva espaço também para o título após uma quebra.
        const medir = (t, fs) => {
            ctx.font = `bold ${fs}px Helvetica, Arial, sans-serif`;
            return ctx.measureText(t).width;
        };
        const ajuste = window.ajustarTextoNaLargura(medir, texto, corpo, largura, fmt.cover_overflow || 'shrink');
        ctx.fillStyle = fmt.cover_font_color || '#000000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        let cursor = 0;
        let minX = Infinity, maxX = -Infinity;
        ajuste.linhas.forEach((linha, i) => {
            const inicio = texto.indexOf(linha, cursor);
            cursor = Math.max(cursor, inicio) + linha.length;
            const corte = Math.max(0, Math.min(linha.length, titulo.length - Math.max(0, inicio)));
            const forte = linha.slice(0, corte), normal = linha.slice(corte);
            const wForte = medir(forte, ajuste.corpo);
            ctx.font = `${ajuste.corpo}px Helvetica, Arial, sans-serif`;
            const w = (wForte + ctx.measureText(normal).width) * ajuste.escalaX;
            const deslocamento = largura > 0 && fmt.cover_text_align === 'right' ? largura - w
                : largura > 0 && fmt.cover_text_align === 'center' ? (largura - w) / 2 : 0;
            const lx = x + deslocamento;
            minX = Math.min(minX, lx); maxX = Math.max(maxX, lx + w);
            ctx.save();
            ctx.translate(lx, y + i * ajuste.corpo * 1.2);
            ctx.scale(ajuste.escalaX, 1);
            ctx.font = `bold ${ajuste.corpo}px Helvetica, Arial, sans-serif`;
            ctx.fillText(forte, 0, 0);
            ctx.font = `${ajuste.corpo}px Helvetica, Arial, sans-serif`;
            ctx.fillText(normal, wForte, 0);
            ctx.restore();
        });
        ctx.restore();
        return { x: largura ? x : minX, y: y - ajuste.corpo,
            w: largura || maxX - minX, h: ajuste.linhas.length * ajuste.corpo * 1.2 };
    };

    window.abrirLayoutDaCapa = function () {
        if (document.getElementById('capa-layout-dialog')) return;
        const w = Number(document.getElementById('fmt-w').value);
        const h = Number(document.getElementById('fmt-h').value);
        if (!(w > 0 && h > 0)) { toast('Informe a largura e a altura do formato.', 'warning'); return; }
        const fields = document.getElementById('fmt-cover-fields');
        const origem = fields.parentNode, proximo = fields.nextSibling;
        const valores = [...fields.querySelectorAll('input, select')].map(el => [el, el.value]);
        const dialog = document.createElement('dialog');
        dialog.id = 'capa-layout-dialog';
        dialog.setAttribute('aria-labelledby', 'capa-layout-title');
        dialog.innerHTML = `<h2 id="capa-layout-title">Layout da capa</h2>
            <p>Arraste a arte ou o texto. As posições são relativas a uma capa de ${w} × ${h} mm.</p>
            <div class="capa-layout-grid"><section class="capa-layout-controls">
                <label for="capa-layout-elemento">Elemento selecionado</label>
                <select id="capa-layout-elemento" class="form-control"><option value="texto">Texto do conjunto</option><option value="arte">Arte</option></select>
                <label for="capa-layout-exemplo">Exemplo de visualização</label>
                <select id="capa-layout-exemplo" class="form-control"><option value="bloco">Bloco</option><option value="teatro">Teatro</option><option value="camarote">Camarote</option></select>
                <div id="capa-layout-fields"></div>
                <small>X do texto é a borda esquerda do espaço; Y é a linha de base. Sem largura máxima, o texto começa em X. Offset Y positivo move a arte para cima.</small>
            </section><section class="capa-layout-preview"><canvas aria-label="Prévia da capa; use os campos de posição para ajustar pelo teclado"></canvas>
                <p>Arte ilustrativa. Na geração, será usada a arte do pedido. A contracapa usa a mesma posição da arte, sem o texto.</p>
                <p id="capa-layout-aviso" role="status"></p></section></div>
            <footer><button type="button" class="btn btn-secondary" id="capa-layout-cancelar">Cancelar</button>
            <button type="button" class="btn btn-primary" id="capa-layout-aplicar">Aplicar ao formulário</button></footer>`;
        document.body.appendChild(dialog);
        dialog.querySelector('#capa-layout-fields').appendChild(fields);
        const canvas = dialog.querySelector('canvas'), ctx = canvas.getContext('2d');
        const scale = Math.min(720 / w, 540 / h, 12);
        const margem = 24;
        canvas.width = Math.ceil(w * scale + margem * 2);
        canvas.height = Math.ceil(h * scale + margem * 2);
        let caixaTexto, caixaArte, drag;
        const seletor = dialog.querySelector('#capa-layout-elemento');
        const exemplos = { bloco: ['Bloco 01', ' - de 0001 a 0050'],
            teatro: ['Fila A', ' - Plateia - de 1 a 50 (50 lugares)'],
            camarote: ['Camarote 01', ' - de 1 a 10'] };
        function desenhar() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff'; ctx.fillRect(margem, margem, w * scale, h * scale);
            ctx.save(); ctx.translate(margem, margem);
            ctx.beginPath(); ctx.rect(0, 0, w * scale, h * scale); ctx.clip();
            const valorReducao = numero('scale', 80) / 100;
            const reducao = valorReducao <= 0.05 ? 0.8 : valorReducao;
            caixaArte = { x: (w * (1 - reducao) / 2 + numero('offx', 0)) * scale,
                y: (h * (1 - reducao) / 2 - numero('offy', 0)) * scale,
                w: w * reducao * scale, h: h * reducao * scale };
            ctx.fillStyle = '#e2e8f0'; ctx.fillRect(caixaArte.x, caixaArte.y, caixaArte.w, caixaArte.h);
            ctx.fillStyle = '#475569'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
            ctx.fillText('ARTE DO PEDIDO', caixaArte.x + caixaArte.w / 2, caixaArte.y + caixaArte.h / 2);
            const fmt = { ...lerEstiloDaCapa(), cover_font_size: numero('font-size', 12), cover_font_color: campo('font-color').value };
            caixaTexto = desenharTextoDaCapa(ctx, fmt, ...exemplos[dialog.querySelector('#capa-layout-exemplo').value],
                numero('font-x', 10) * scale, numero('font-y', 10) * scale, scale / MM2PT);
            const box = seletor.value === 'arte' ? caixaArte : caixaTexto;
            ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
            ctx.strokeRect(box.x, box.y, box.w, box.h);
            ctx.restore();
            dialog.querySelector('#capa-layout-aviso').textContent =
                [caixaTexto, caixaArte].some(b => b.x < 0 || b.y < 0 || b.x + b.w > w * scale + 0.1 || b.y + b.h > h * scale + 0.1)
                    ? 'Há elementos fora da capa; confira as posições para evitar cortes.' : '';
        }
        function ponto(event) {
            const rect = canvas.getBoundingClientRect();
            return { x: (event.clientX - rect.left) * canvas.width / rect.width - margem,
                y: (event.clientY - rect.top) * canvas.height / rect.height - margem };
        }
        canvas.onpointerdown = event => {
            const p = ponto(event);
            const dentro = b => p.x >= b.x - 5 && p.x <= b.x + b.w + 5 && p.y >= b.y - 5 && p.y <= b.y + b.h + 5;
            if (dentro(caixaTexto)) seletor.value = 'texto';
            else if (dentro(caixaArte)) seletor.value = 'arte'; else return;
            const arte = seletor.value === 'arte';
            drag = { ...p, arte, x0: numero(arte ? 'offx' : 'font-x', 0), y0: numero(arte ? 'offy' : 'font-y', 0) };
            canvas.setPointerCapture(event.pointerId); desenhar();
        };
        canvas.onpointermove = event => {
            if (!drag) return;
            const p = ponto(event);
            campo(drag.arte ? 'offx' : 'font-x').value = (drag.x0 + (p.x - drag.x) / scale).toFixed(1);
            campo(drag.arte ? 'offy' : 'font-y').value = (drag.y0 + (p.y - drag.y) / scale * (drag.arte ? -1 : 1)).toFixed(1);
            desenhar();
        };
        canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
        dialog.addEventListener('input', desenhar);
        dialog.addEventListener('change', desenhar);
        function fechar(aplicar) {
            if (!aplicar) valores.forEach(([el, valor]) => { el.value = valor; });
            origem.insertBefore(fields, proximo);
            dialog.close(); dialog.remove();
        }
        dialog.querySelector('#capa-layout-cancelar').onclick = () => fechar(false);
        dialog.querySelector('#capa-layout-aplicar').onclick = () => {
            if ([...fields.querySelectorAll('input')].every(el => el.reportValidity())) fechar(true);
        };
        dialog.addEventListener('cancel', event => { event.preventDefault(); fechar(false); });
        dialog.showModal(); desenhar();
    };
})();
