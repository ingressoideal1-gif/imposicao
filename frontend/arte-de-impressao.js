/**
 * Qual arquivo pode servir de ARTE numa imposicao — e qual nunca pode.
 * ---------------------------------------------------------------------------
 *
 * Um modelo pode legitimamente nao ter arte: o ingresso e so numeracao sobre o
 * papel. Nesse caso a imposicao sai com a numeracao e mais nada, e sempre foi
 * assim. O defeito que este arquivo conserta e o sistema INVENTAR uma arte
 * quando ela falta.
 *
 * ── O que estava acontecendo ────────────────────────────────────────────────
 *
 * O estado do painel monta `arte_url` assim (script.js):
 *
 *     arte_url: p.arte_url || p.amostra_arte_base64 || ''
 *
 * Para a TELA isso e razoavel: sem arte, mostre a amostra. Para a IMPOSICAO e
 * um desastre silencioso, porque `amostra_arte_base64` e a **amostra de
 * aprovacao** — o JPEG combinado que o cliente aprova, com tudo achatado
 * dentro:
 *
 *   • a camada da Cor, que o motor nunca desenha e que JAMAIS pode sair
 *     impressa (regra do usuario, 14/08/2026);
 *   • os proprios elementos de numeracao, que o motor desenha DE NOVO por cima,
 *     deixando tudo em duplicata;
 *   • o QR Ideal com a **logo no meio** — que e marca de tela e, no papel,
 *     apaga modulos de verdade. O leitor recusa o ingresso na portaria, com o
 *     lote ja entregue e sem conserto;
 *   • resolucao de amostra. Medido no pedido 18560: 877 x 309 px para um
 *     ingresso de 148,5 x 52,25 mm, ou seja **150 dpi** — metade do minimo de
 *     impressao.
 *
 * Medicao no banco em 14/08/2026: dos 109 modelos, 42 tem arte de verdade
 * (nada muda), 52 nao tem arte nem amostra (ja saiam so com numeracao), e
 * **15** tinham amostra sem arte — esses 15 vinham imprimindo a amostra.
 *
 * ── Por que o corte e aqui, e nao no `arte_url` ─────────────────────────────
 *
 * `arte_url` e lido em cerca de 28 lugares do painel, quase todos de tela:
 * copiar link, mostrar amostra, salvar, botao de remover. Mudar o significado
 * dela consertaria a impressao e quebraria a interface. Entao ela continua como
 * esta, e quem filtra e este arquivo — chamado apenas onde se escolhe o
 * original que vai ao motor.
 *
 * ── A Cor tambem nao entra ──────────────────────────────────────────────────
 *
 * Havia um segundo caminho: `corObj.pdf_url` virava arte quando o modelo nao
 * tinha nenhuma. Regra do usuario: a Cor jamais sai na impressao nem na
 * imposicao de PDF. Medicao no mesmo dia: **nenhuma das 24 cores** do catalogo
 * tem `pdf_url`, entao esse caminho nunca produzia nada — remove-lo cumpre a
 * regra sem mudar um unico trabalho.
 *
 * Este arquivo nao tem dependencia nenhuma de proposito. As duas paginas
 * carregam o `script.js`, entao nao e uma questao de alcance — e de ordem e
 * de risco: um modulo pequeno e sem dependencia carrega cedo, nao pode
 * quebrar por causa de outra coisa, e da para ler inteiro de uma vez quando
 * alguem precisar auditar por que uma arte foi ou nao para o papel.
 */
(function (raiz) {
    'use strict';

    // A pasta do Storage onde a amostra aprovada e gravada. E o unico sinal
    // confiavel: o nome do arquivo varia (frente/verso, pedido, modelo,
    // timestamp), mas o balde nao.
    var PASTA_AMOSTRA = 'amostras_renderizadas';

    /**
     * O arquivo apontado por esta URL e uma amostra de aprovacao?
     *
     * Aceita qualquer coisa (null, undefined, data: URI) sem levantar: quem
     * chama esta no caminho do operador, e uma excecao aqui derrubaria a
     * montagem do trabalho inteiro.
     */
    function ehAmostraRenderizada(url) {
        if (!url || typeof url !== 'string') return false;
        return url.indexOf(PASTA_AMOSTRA) !== -1;
    }

    /**
     * A arte que pode ir ao motor, ou `null` quando nao existe arte de verdade.
     *
     * `null` NAO e erro: e a instrucao de impor so a numeracao, que e o
     * comportamento correto para um modelo sem arte.
     */
    function arteDeImpressao(url) {
        if (!url || typeof url !== 'string') return null;
        if (ehAmostraRenderizada(url)) return null;
        return url;
    }

    // A previa baixa em segundo plano e pode terminar depois do clique em
    // Gerar/Imprimir. O arquivo deste trabalho vem do modelo, nao desse cache.
    async function prepararVersoDoTrabalho(estado, modo, arquivoManual) {
        if (modo !== 'duplex' && modo !== 'duplex_unico') return null;
        function selecao() {
            const ativo = estado.activeOSItem;
            if (!ativo) return null;
            const item = (estado.osItens?.[ativo.osId] || [])
                .find(i => String(i.id) === String(ativo.itemId));
            if (!item) throw new Error('Reabra o modelo antes de gerar a impressão.');
            return { os: String(ativo.osId), id: String(item.id),
                frente: item.arte_url || item.url_arquivo_arte || null,
                verso: item.verso_arte_url || item.url_arquivo_arte_verso || item.verso_url_arquivo || null };
        }
        const inicial = selecao();
        if (!inicial) return arquivoManual || null;
        const url = arteDeImpressao(inicial.verso);
        // Sem original, nunca reaproveitar o verso de outro modelo ou de Cor.
        if (!url) return null;
        const controle = new AbortController();
        const limite = setTimeout(() => controle.abort(), 30000);
        try {
            const resposta = await fetch(url, { signal: controle.signal });
            if (!resposta.ok) throw new Error('Download recusado');
            const blob = await resposta.blob();
            if (!blob.size || /text\/html|application\/json/i.test(blob.type)) {
                throw new Error('Arquivo vazio ou resposta inválida');
            }
            // Os originais aceitos pelo motor sao PDF ou imagem. Uma resposta
            // de erro HTTP 200 nao pode virar um upload com extensao .pdf.
            const bytes = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
            const pdf = new TextDecoder('latin1').decode(bytes).includes('%PDF-');
            const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
            const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
            const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
                && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
            if (!pdf && !png && !jpg && !webp) throw new Error('Formato inválido');
            if (JSON.stringify(selecao()) !== JSON.stringify(inicial)) {
                throw new Error('O modelo ou a arte mudou durante o carregamento. Gere novamente.');
            }
            const extensao = pdf ? 'pdf' : png ? 'png' : jpg ? 'jpg' : 'webp';
            return new File([blob], `verso_${inicial.id}.${extensao}`,
                { type: pdf ? 'application/pdf' : `image/${extensao === 'jpg' ? 'jpeg' : extensao}` });
        } catch (erro) {
            if (erro.message.startsWith('O modelo ou a arte mudou')) throw erro;
            throw new Error('Não foi possível carregar a arte do verso. Confira a conexão e gere novamente.');
        } finally {
            clearTimeout(limite);
        }
    }


    // Uma única barreira para Pedido, Imposição e Montagem. O payload já está
    // serializado: nenhuma dependência de render será lida de seletores depois.
    function canonico(valor) {
        if (Array.isArray(valor)) return valor.map(canonico);
        if (valor && typeof valor === 'object') return Object.fromEntries(
            Object.keys(valor).sort().map(k => [k, canonico(valor[k])]));
        return valor;
    }
    const iguais = (a, b) => JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
    function elementosParaConferencia(elementos) {
        // A previa acrescenta canvas, imagens e controles de carregamento ao
        // objeto compartilhado. Eles nao pertencem ao cadastro nem ao motor.
        // Lista explicita: propriedades persistidas como _centerAnchor contam.
        const temporarios = new Set(['_pdfCanvas', '_pdfLoading', '_svgImage',
            '_svgLoading', '_pdfPreview', '_preloadFalhou', '_assinantes']);
        return (elementos || []).map(el => el && Object.fromEntries(
            Object.entries(el).filter(([chave]) => !temporarios.has(chave))));
    }
    function conferirNumeracaoEnviada(esperada, enviada) {
        if (!esperada || !enviada) {
            if (esperada !== enviada) throw new Error('Numeração obrigatória ausente no trabalho.');
            return;
        }
        const elementos = elementosParaConferencia(esperada.elements).filter(e => !(['PDF', 'SVG'].includes(e.type)
            && String(e.render_mode || 'print').trim().toLowerCase() === 'layout'));
        const enviados = elementosParaConferencia(enviada.elements);
        if (elementos.length !== enviados.length
            || elementos.some((e, i) => Object.keys(e).some(k => !iguais(e[k], enviados[i][k])))
            || ['tipo', 'ticket_qtd', 'print_mode'].some(k => !iguais(esperada[k] ?? null, enviada[k] ?? null))) {
            throw new Error('Elementos de numeração divergentes ou incompletos no trabalho. Reabra o modelo.');
        }
    }
    async function hashArquivo(blob) {
        const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
    }
    async function confirmarIntegridadeDoTrabalho(fd, base, estado, cliente, signal) {
        if (!globalThis.crypto?.subtle || !globalThis.crypto?.randomUUID) {
            throw new Error('Abra o painel pelo endereço local do NewProd ou por HTTPS para conferir a integridade dos arquivos.');
        }
        const controle = new AbortController();
        const abortar = () => controle.abort();
        signal?.addEventListener('abort', abortar, { once: true });
        if (signal?.aborted) abortar();
        const limite = setTimeout(abortar, 120000);
        const identidade = () => JSON.stringify([estado.activeOSItem, estado.selectedOSItems]);
        const inicial = identidade();
        const verificarAtual = () => {
            if (controle.signal.aborted) throw new Error('Preparação interrompida ou tempo limite excedido.');
            if (identidade() !== inicial) throw new Error('A seleção mudou durante a preparação. Gere novamente.');
        };
        try {
            const versao = await fetch(base + '/api/version', { signal: controle.signal });
            const info = versao.ok ? await versao.json() : null;
            if (!info?.capabilities?.includes('integridade_impressao_v1')) {
                throw new Error('Atualize o NewProd desta estação: validação integral da impressão indisponível.');
            }
            const dados = JSON.parse(fd.get('payload'));
            const artes = dados.multi_artes || [];
            const alvos = artes.length ? artes : [dados];
            const ids = [...new Set(alvos.map(a => a.modelo).filter(v => v != null && /^\d+$/.test(String(v))).map(String))];
            async function consultar(tabela, idsConsulta) {
                if (!idsConsulta.length) return [];
                if (!cliente) throw new Error('Não foi possível confirmar os dados obrigatórios.');
                const { data, error } = await cliente.from(tabela).select('*').in('id', idsConsulta).abortSignal(controle.signal);
                if (error || !Array.isArray(data) || data.length !== idsConsulta.length
                    || idsConsulta.some(id => !data.some(r => String(r.id) === id))) {
                    throw new Error('Consulta incompleta de ' + tabela + '. Reabra o pedido.');
                }
                return data.sort((a, b) => String(a.id).localeCompare(String(b.id)));
            }
            const cadastros = [];
            for (const [tabela, id, valores] of [['producao_formatos', dados.formato_id, estado.formatos],
                ['producao_saidas', dados.saida_id, estado.saidas]]) {
                if (!id) continue;
                const linhas = await consultar(tabela, [String(id)]);
                const local = (valores || []).find(v => String(v.id) === String(id));
                const campos = ['width_mm', 'height_mm', 'cols', 'rows', 'gap_h_mm', 'gap_v_mm', 'updated_at'];
                if (!local || campos.some(k => !iguais(local[k] ?? null, linhas[0][k] ?? null))) {
                    throw new Error('Formato ou saída mudou. Atualize o painel antes de gerar.');
                }
                cadastros.push([tabela, String(id), linhas]);
            }
            const modelos = await consultar('pedidos_modelos', ids);
            const numIds = [...new Set(alvos.flatMap(a => [a.num1_id || a.numeracao_id || a.numeracao?.id,
                a.num2_id || a.numeracao_2_id || a.numeracao_2?.id]).filter(Boolean).map(String))];
            const nums = await consultar('producao_numeracoes', numIds);
            for (const n of nums) {
                const atual = (estado.numeracoes || []).find(x => String(x.id) === String(n.id));
                const novo = raiz.normalizarNumeracaoLida ? raiz.normalizarNumeracaoLida(structuredClone(n)) : n;
                const campos = ['print_mode', 'tipo', 'ticket_qtd', 'updated_at', 'csv_url'];
                if (!atual || campos.some(k => !iguais(atual[k] ?? null, novo[k] ?? null))
                    || !iguais(atual.elements == null ? null : elementosParaConferencia(atual.elements),
                        novo.elements == null ? null : elementosParaConferencia(novo.elements))
                    || (atual.csv_data !== undefined && !iguais(atual.csv_data || [], novo.csv_data || []))) {
                    throw new Error('A numeração mudou ou não foi carregada integralmente. Reabra o pedido.');
                }
            }
            // Conferir vínculos e conteúdo do banco contra o conjunto usado no payload.
            const pedidos = [...new Set(modelos.map(m => m.id_int).filter(Boolean))];
            const bancosLidos = [];
            for (const id of pedidos) {
                if (typeof raiz.chamarBancosPedido !== 'function') throw new Error('Validação de bancos indisponível. Atualize o painel.');
                const resposta = await raiz.chamarBancosPedido('consultar', { id_int: id }, controle.signal);
                const vinculos = (resposta.vinculos || []).filter(v => ids.includes(String(v.modelo_id)));
                const anteriores = ids.map(id => estado.vinculosDeBanco?.[id]).filter(Boolean);
                for (const m of modelos.filter(m => m.id_int === id)) {
                    const v = vinculos.find(v => String(v.modelo_id) === String(m.id)) || null;
                    const ant = anteriores.find(v => String(v.modelo_id) === String(m.id)) || null;
                    if (!iguais(v, ant)) throw new Error('O vínculo do banco mudou. Reabra o pedido.');
                }
                for (const banco of resposta.bancos || []) {
                    const antigo = (estado.bancosDoPedido || []).find(b => String(b.id) === String(banco.id));
                    if (!iguais(banco, antigo)) throw new Error('O banco do pedido mudou ou está incompleto. Reabra o pedido.');
                }
                bancosLidos.push([id, resposta]);
            }
            const arquivos = {};
            if (modelos.length) fd.delete('csv_file'); // O banco é a fatia confirmada do modelo, nunca um upload residual.
            else if (fd.has('csv_file')) {
                const csv = fd.get('csv_file');
                if (!csv.size) throw new Error('Banco enviado vazio.');
                arquivos.csv_file = { sha256: await hashArquivo(csv), size: csv.size };
            }
            async function registrar(chave, arquivo) {
                if (!arquivo || !arquivo.size) throw new Error('Arquivo obrigatório vazio: ' + chave);
                const bytes = new Uint8Array(await arquivo.slice(0, 1024).arrayBuffer());
                const pdf = new TextDecoder('latin1').decode(bytes).includes('%PDF-');
                const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
                const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
                if (!pdf && !png && !jpg) throw new Error('Arte inválida (esperado PDF, PNG ou JPEG): ' + chave);
                fd.set(chave, arquivo, chave + (pdf ? '.pdf' : png ? '.png' : '.jpg'));
                arquivos[chave] = { sha256: await hashArquivo(arquivo), size: arquivo.size };
            }
            const downloads = new Map();
            async function baixar(url, chave) {
                if (!downloads.has(url)) downloads.set(url, (async () => {
                    const res = await fetch(url, { signal: controle.signal, cache: 'no-store' });
                    if (!res.ok) throw new Error('Falha ao carregar a arte obrigatória: ' + chave);
                    return res.blob();
                })());
                const arquivo = await downloads.get(url);
                const anterior = fd.get(chave);
                if (anterior && await hashArquivo(anterior) !== await hashArquivo(arquivo)) {
                    throw new Error('A arte carregada na prévia difere do original confirmado. Reabra o modelo.');
                }
                await registrar(chave, arquivo);
            }
            for (let i = 0; i < alvos.length; i++) {
                const alvo = alvos[i];
                const modelo = modelos.find(m => String(m.id) === String(alvo.modelo));
                const frente = artes.length ? 'ma_file_' + i : 'file';
                const verso = artes.length ? 'ma_verso_' + i : 'file_verso';
                let urlFrente = artes.length ? arteDeImpressao(alvo.pdf_url) : null;
                let urlVerso = artes.length ? arteDeImpressao(alvo.pdf_verso_url) : null;
                if (modelo) {
                    const local = Object.values(estado.osItens || {}).flat().find(m => String(m.id) === String(modelo.id));
                    if (!local) throw new Error('Modelo não carregado. Reabra o pedido.');
                    const arteFrente = m => arteDeImpressao(m.arte_url || m.url_arquivo_arte || m.url_arquivo);
                    const arteVerso = m => arteDeImpressao(m.verso_arte_url || m.url_arquivo_arte_verso || m.verso_url_arquivo);
                    if ((!local._produto_prateleira && arteFrente(local) !== arteFrente(modelo)) || arteVerso(local) !== arteVerso(modelo)
                        || Number(local.qtd ?? local.quantidade) !== Number(modelo.quantidade ?? modelo.qtd)
                        || String(local.bloco || '') !== String(modelo.bloco || '')
                        || !!local.modo_pdf !== !!modelo.modo_pdf
                        || String(local.numeracao_inicio ?? local.num_inicial ?? '') !== String(modelo.numeracao_inicio ?? modelo.num_inicial ?? '')
                        || String(local.numeracao_fim ?? local.num_final ?? '') !== String(modelo.numeracao_fim ?? modelo.num_final ?? '')) {
                        throw new Error('Arte ou configuração do modelo mudou. Reabra o pedido antes de gerar.');
                    }
                    const resolvido = raiz.reconciliarCorNumDoModelo?.(modelo, estado.cores, estado.numeracoes);
                    const numId = resolvido?.numId || modelo.amostra_num_id || null;
                    if (!numId && (modelo.gabarito_operacional || modelo.numeracao || modelo.tipo_numeracao)) {
                        throw new Error('Referência de numeração não resolvida. Confirme o cadastro antes de gerar.');
                    }
                    if (String(numId || '') !== String(alvo.num1_id || alvo.numeracao_id || alvo.numeracao?.id || '')) {
                        throw new Error('A numeração do modelo não corresponde ao trabalho. Reabra o pedido.');
                    }
                    if (numId && raiz.numeracaoConfirmadaDoModelo) {
                        const fonte = (estado.numeracoes || []).find(n => String(n.id) === String(numId));
                        const esperado = raiz.numeracaoConfirmadaDoModelo(fonte, local);
                        conferirNumeracaoEnviada(esperado, alvo.numeracao);
                        if (!iguais(esperado?.csv_data || [], alvo.numeracao?.csv_data || [])) {
                            throw new Error('O banco enviado não corresponde à fatia confirmada do modelo. Reabra o pedido.');
                        }
                    }
                    urlFrente = local._produto_prateleira ? null : arteDeImpressao(modelo.arte_url || modelo.url_arquivo_arte || modelo.url_arquivo);
                    urlVerso = arteDeImpressao(modelo.verso_arte_url || modelo.url_arquivo_arte_verso || modelo.verso_url_arquivo);
                    // O modelo é a fonte: nunca imprimir amostra/cor/arquivo residual.
                    if (!urlFrente) fd.delete(frente);
                    if (!urlVerso) fd.delete(verso);
                }
                for (const campo of ['numeracao', 'numeracao_2']) {
                    if (modelo && campo === 'numeracao' && raiz.numeracaoConfirmadaDoModelo) continue;
                    const enviada = alvo[campo];
                    if (!enviada?.id) continue;
                    const esperada = (estado.numeracoes || []).find(n => String(n.id) === String(enviada.id));
                    conferirNumeracaoEnviada(esperada, enviada);
                }
                if (urlFrente && urlFrente !== 'local_file') await baixar(urlFrente, frente);
                else if (fd.has(frente)) await registrar(frente, fd.get(frente));
                if (urlVerso) await baixar(urlVerso, verso);
                else if (fd.has(verso)) await registrar(verso, fd.get(verso));
                if (artes.length) {
                    alvo.has_raw_file = fd.has(frente);
                    alvo.pdf_url = null;
                    alvo.pdf_verso_url = null;
                }
            }
            // Uma alteração durante os downloads invalida o trabalho preparado.
            if (!iguais(modelos, await consultar('pedidos_modelos', ids))
                || !iguais(nums, await consultar('producao_numeracoes', numIds))) {
                throw new Error('Os dados mudaram durante a preparação. Reabra e gere novamente.');
            }
            for (const [id, resposta] of bancosLidos) {
                if (!iguais(resposta, await raiz.chamarBancosPedido('consultar', { id_int: id }, controle.signal))) {
                    throw new Error('O banco mudou durante a preparação. Reabra o pedido.');
                }
            }
            for (const [tabela, id, linhas] of cadastros) {
                if (!iguais(linhas, await consultar(tabela, [id]))) throw new Error('Formato ou saída mudou durante a preparação.');
            }
            verificarAtual();
            dados.integridade = { version: 1, job_id: crypto.randomUUID(), arquivos,
                modelos: ids, numeracoes: numIds, faces: alvos.map((a, i) => ({
                    front: fd.has(artes.length ? 'ma_file_' + i : 'file'),
                    back: fd.has(artes.length ? 'ma_verso_' + i : 'file_verso') })) };
            fd.set('payload', JSON.stringify(dados));
            return dados.integridade;
        } finally {
            clearTimeout(limite);
            signal?.removeEventListener('abort', abortar);
        }
    }
    let interrupcao = null;
    raiz.registrarImpressaoInterrompida = enviados => {
        interrupcao = { enviados, quando: Date.now() };
        try { localStorage.setItem('impressao-interrompida', JSON.stringify(interrupcao)); } catch (_) {}
    };
    raiz.confirmarRetomadaImpressao = () => {
        try { interrupcao = JSON.parse(localStorage.getItem('impressao-interrompida')) || interrupcao; } catch (_) {}
        if (!interrupcao) return true;
        if (!confirm('O envio anterior foi interrompido. Há ' + interrupcao.enviados
            + ' arquivo(s) com envio aceito e pode haver um envio sem resposta. Confira a fila e o papel; ajuste Refazer para não repetir o que saiu. Confirma retomar com a seleção atual?')) return false;
        interrupcao = null;
        try { localStorage.removeItem('impressao-interrompida'); } catch (_) {}
        return true;
    };
    raiz.registrarEAguardarEnvioRemoto = async (cliente, trabalho) => {
        const controle = new AbortController();
        const limite = setTimeout(() => controle.abort(), 600000);
        try {
            const { data, error } = await cliente.from('print_queue').insert(trabalho)
                .select('id').single().abortSignal(controle.signal);
            if (error || !data?.id) throw new Error('Não foi possível confirmar o registro do envio. Confira a fila antes de retomar.');
            while (!controle.signal.aborted) {
                if (raiz._printCancelRequested) throw new Error('Envio interrompido. O arquivo já registrado pode estar na fila.');
                const resposta = await cliente.from('print_queue').select('status').eq('id', data.id)
                    .single().abortSignal(controle.signal);
                if (resposta.error || !resposta.data) throw new Error('Resposta do agente desconhecida. Confira a fila antes de retomar.');
                if (resposta.data.status === 'completed') return;
                if (!['pending', 'printing'].includes(resposta.data.status)) throw new Error('O agente não confirmou o envio do arquivo.');
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            throw new Error('Tempo limite sem confirmar o envio. Confira a fila antes de retomar.');
        } finally { clearTimeout(limite); }
    };
    function criarConferenciaStream(jobId) {
        let recebidos = 0;
        let concluido = false;
        return {
            async arquivo(info, bytes) {
                if (jobId && info.job_id !== jobId) throw new Error('Arquivo recebido pertence a outro trabalho.');
                if (concluido || info.index !== recebidos + 1) throw new Error('Lote ausente, duplicado ou fora de ordem.');
                if (!info.sha256 || await hashArquivo(new Blob([bytes])) !== info.sha256) {
                    throw new Error('Integridade do lote não confirmada.');
                }
                recebidos++;
            },
            concluir(info) {
                if (concluido || !recebidos || info.files !== recebidos) throw new Error('Contagem de lotes incompleta.');
                concluido = true;
            },
            verificar() {
                if (!concluido) throw new Error('Conexão encerrada sem confirmar o trabalho completo. Confira os lotes anteriores antes de retomar.');
            }
        };
    }
    raiz.criarConferenciaStream = criarConferenciaStream;
    raiz.confirmarIntegridadeDoTrabalho = confirmarIntegridadeDoTrabalho;
    raiz.hashArquivoImpressao = hashArquivo;

    raiz.documentoDaArteParaPrevia = async arquivo => {
        let bytes = new Uint8Array(await arquivo.arrayBuffer());
        if (!arquivo.type.includes('pdf') && !arquivo.name.toLowerCase().endsWith('.pdf')) {
            const doc = await PDFLib.PDFDocument.create();
            const imagem = arquivo.type.includes('png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
            doc.addPage([imagem.width, imagem.height]).drawImage(imagem, { x: 0, y: 0, width: imagem.width, height: imagem.height });
            bytes = await doc.save();
        }
        return pdfjsLib.getDocument({ data: bytes }).promise;
    };
    raiz.prepararVersoDoTrabalho = prepararVersoDoTrabalho;
    raiz.ehAmostraRenderizada = ehAmostraRenderizada;
    raiz.arteDeImpressao = arteDeImpressao;
    raiz.PASTA_AMOSTRA_RENDERIZADA = PASTA_AMOSTRA;
})(typeof window !== 'undefined' ? window : globalThis);
