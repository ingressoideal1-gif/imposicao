/* Editor local de observações. Quill 2.0.3; persistência HTML existente. */
window.BriefingEditor = (() => {
    let configurado = false;

    function configurar() {
        if (configurado) return;
        const Size = Quill.import('attributors/style/size');
        Size.whitelist = null;
        Quill.register(Size, true);
        Quill.register(Quill.import('attributors/style/align'), true);
        const Parchment = Quill.import('parchment');
        // Mantém o início de listas numeradas do ERP, inclusive ao exportar HTML.
        Quill.register(new Parchment.StyleAttributor('listStart', 'counter-set', {
            scope: Parchment.Scope.BLOCK
        }), true);
        configurado = true;
    }

    function campoDe(controle) {
        return controle.closest('.briefing-obs-edicao')?.querySelector('.briefing-obs-editor');
    }

    function aviso(campo, texto) {
        campo.closest('.briefing-obs-edicao').querySelector('.briefing-obs-aviso').textContent = texto;
    }

    function importar(campo, valor) {
        const q = campo._quillBriefing;
        const texto = String(valor ?? '');
        if (!/<\/?[a-z][^>]*>/i.test(texto)) q.setText(texto, 'silent');
        else {
            const seguro = criarConteudoObservacaoBriefing(texto).conteudo.innerHTML;
            q.setContents(q.clipboard.convert({ html: seguro }), 'silent');
        }
        q.history.clear();
        campo._briefingFaixa = null;
        campo._briefingOriginal = texto;
    }

    function exportar(campo) {
        const q = campo._quillBriefing;
        if (q.getLength() === 1 && q.getText() === '\n') return '';
        const fragmento = document.createElement('template');
        fragmento.innerHTML = q.getSemanticHTML();
        const itens = fragmento.content.querySelectorAll('li');
        const linhas = q.getLines().filter(linha => linha.domNode.tagName === 'LI');
        linhas.forEach((linha, i) => {
            const inicio = linha.formats().listStart;
            const numero = /^list-0 (-?\d+)$/.exec(inicio || '');
            if (numero && itens[i]?.parentElement.tagName === 'OL') {
                itens[i].parentElement.setAttribute('start', String(Number(numero[1])));
            }
        });
        return criarConteudoObservacaoBriefing(fragmento.innerHTML).conteudo.innerHTML;
    }

    function salvar(campo) {
        if (!campo.isConnected) return;
        const html = exportar(campo);
        campo._briefingOriginal = html;
        atualizarLeituraObservacaoBriefing(campo.dataset.prodId, html);
        saveBriefingField(campo.dataset.osNum, null, html, true, campo.dataset.prodId);
    }

    function atualizarControles(campo, faixa) {
        const area = campo.closest('.briefing-obs-edicao');
        if (!area || !campo.isConnected) return;
        const formatos = faixa ? campo._quillBriefing.getFormat(faixa) : {};
        area.querySelector('[data-acao="bold"]').setAttribute('aria-pressed', String(formatos.bold === true));
        area.querySelector('[aria-label="Tamanho da fonte"]').value = formatos.size || '';
        area.querySelector('[aria-label="Cor do texto"]').value = formatos.color || '';
    }

    function abrir(area) {
        const campo = area.querySelector('.briefing-obs-editor');
        if (!campo || campo._quillBriefing || !area.open) return;
        if (typeof Quill === 'undefined') {
            aviso(campo, 'Não foi possível carregar o editor. Atualize a página para tentar novamente.');
            return;
        }
        configurar();
        const Delta = Quill.import('delta');
        const q = new Quill(campo, {
            theme: null,
            placeholder: 'Observações específicas para este produto...',
            modules: {
                toolbar: false,
                history: { delay: 400, userOnly: true },
                table: true,
                clipboard: { matchers: [
                    [Node.TEXT_NODE, (no) => {
                        // Espaços de indentação entre tags não são texto do briefing.
                        const entreBlocos = !no.data.trim() && /\n/.test(no.data) &&
                            no.parentElement?.querySelector(':scope > p, :scope > div, :scope > li, :scope > tr');
                        return new Delta().insert(entreBlocos ? '' : no.data);
                    }],
                    ['OL', (no, delta) => {
                        const inicio = Number(no.getAttribute('start') || 1);
                        if (inicio === 1 || !Number.isInteger(inicio)) return delta;
                        let posicao = 0;
                        for (const op of delta.ops) {
                            const quebra = typeof op.insert === 'string' ? op.insert.indexOf('\n') : -1;
                            if (quebra >= 0 && op.attributes?.list === 'ordered') {
                                return delta.compose(new Delta().retain(posicao + quebra).retain(1, { listStart: `list-0 ${inicio}` }));
                            }
                            posicao += typeof op.insert === 'string' ? op.insert.length : 1;
                        }
                        return delta;
                    }]
                ] }
            }
        });
        campo._quillBriefing = q;
        q.root.setAttribute('role', 'textbox');
        q.root.setAttribute('aria-label', 'Observações do produto');
        q.root.setAttribute('aria-multiline', 'true');
        importar(campo, campo._briefingOriginal || '');
        q.on('selection-change', faixa => {
            if (!campo.isConnected) return;
            // null significa foco na barra; o último trecho permanece válido.
            if (faixa) campo._briefingFaixa = { index: faixa.index, length: faixa.length };
            atualizarControles(campo, faixa || campo._briefingFaixa);
        });
        q.on('text-change', (_delta, _anterior, origem) => {
            if (!campo.isConnected) return;
            if (origem === 'user') {
                campo._briefingEditado = true;
                salvar(campo);
            }
        });
        // Limpa a colagem antes de o Quill interpretá-la. Arquivos não entram no briefing.
        q.root.addEventListener('paste', evento => {
            evento.preventDefault();
            evento.stopImmediatePropagation();
            const html = evento.clipboardData?.getData('text/html');
            const texto = evento.clipboardData?.getData('text/plain') || '';
            if (!html && !texto) return;
            const conteudo = html
                ? q.clipboard.convert({ html: criarConteudoObservacaoBriefing(html).conteudo.innerHTML })
                : new Delta().insert(texto);
            const faixa = q.getSelection(true);
            q.updateContents(new Delta().retain(faixa.index).delete(faixa.length).concat(conteudo), 'user');
            q.setSelection(faixa.index + conteudo.length(), 0, 'silent');
            campo._briefingFaixa = { index: faixa.index + conteudo.length(), length: 0 };
        }, true);
        q.root.addEventListener('drop', evento => { evento.preventDefault(); evento.stopImmediatePropagation(); }, true);
        aviso(campo, 'Selecione um trecho para aplicar o destaque.');
    }

    function carregar(campo, valor) {
        // A instância e a seleção sobrevivem às atualizações enquanto a edição está aberta.
        if (campo._quillBriefing && campo.closest('details').open &&
            (campo._briefingRecebido || campo._briefingEditado)) return;
        const texto = String(valor ?? '');
        if (campo._quillBriefing && texto !== campo._briefingOriginal) importar(campo, texto);
        campo._briefingOriginal = texto;
        campo._briefingRecebido = true;
        atualizarLeituraObservacaoBriefing(campo.dataset.prodId, texto);
    }

    function formatar(controle, formato, valor) {
        const campo = campoDe(controle);
        const q = campo?._quillBriefing;
        if (!q || !['bold', 'size', 'color'].includes(formato)) return;
        const faixa = q.getSelection() || campo._briefingFaixa;
        if (!faixa?.length) {
            aviso(campo, 'Selecione o trecho desejado ou clique em Selecionar tudo.');
            atualizarControles(campo, faixa);
            return;
        }
        if (formato === 'bold') valor = q.getFormat(faixa).bold !== true;
        if (formato === 'size' && !['16px', '18px', '24px'].includes(valor)) return;
        if (formato === 'color' && !/^#[0-9a-f]{6}$/i.test(valor)) return;
        q.history.cutoff();
        q.formatText(faixa.index, faixa.length, formato, valor, 'user');
        q.history.cutoff();
        q.setSelection(faixa.index, faixa.length, 'silent');
        campo._briefingFaixa = { ...faixa };
        atualizarControles(campo, faixa);
        aviso(campo, 'Destaque aplicado ao trecho selecionado.');
    }

    function selecionarTudo(controle) {
        const campo = campoDe(controle);
        const q = campo?._quillBriefing;
        if (!q) return;
        const faixa = { index: 0, length: Math.max(0, q.getLength() - 1) };
        q.setSelection(faixa.index, faixa.length, 'user');
        campo._briefingFaixa = faixa;
    }

    function historico(controle, acao) {
        const campo = campoDe(controle);
        if (!campo?._quillBriefing || !['undo', 'redo'].includes(acao)) return;
        const q = campo._quillBriefing;
        q.history[acao]();
        campo._briefingFaixa = q.getSelection();
        atualizarControles(campo, campo._briefingFaixa);
    }

    return { abrir, carregar, formatar, selecionarTudo, historico };
})();
