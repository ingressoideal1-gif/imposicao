/* Ensaio opt-in de desempenho. Comparacao de rede somente por clique explicito.
 * Tempos sobrepostos nao devem ser somados. Ativacao: ?diagnostico_artes=1.
 */
(function () {
    'use strict';
    if (new URLSearchParams(location.search).get('diagnostico_artes') !== '1') return;
    if (window.DiagnosticoArtes) return;
    const MAX_EVENTOS = 2000, MAX_ABERTURAS = 100, MAX_MS = 20 * 60 * 1000;
    let coleta = null, painel, prazo;
    const restauracoes = [], observadores = [];
    const agora = () => performance.now();
    const arredondar = n => Math.round(n * 10) / 10;
    const seguro = fn => { try { return fn(); } catch (_) { return undefined; } };
    const estado = () => typeof state === 'undefined' ? {} : state;
    const ordem = id => typeof findOSInState === 'function' ? findOSInState(id) : null;
    const pedido = id => {
        const numero = ordem(id)?.numero || id;
        return /^(?:vibe_)?\d{1,16}$/.test(String(numero)) ? String(numero).replace(/^vibe_/, '') : null;
    };
    const ativa = c => c && c === coleta && c.ativo;
    function emitir(c, tipo, dados) {
        if (!ativa(c)) return;
        if (c.eventos.length >= MAX_EVENTOS) { c.descartados++; return; }
        c.eventos.push({ tipo, em_ms: arredondar(agora() - c.inicio), ...dados });
    }
    function usuarioAtual() { return window._currentUser?.id || window._acessoLocal || null; }
    function atual() {
        if (coleta?.ativo && usuarioAtual() !== coleta.usuario) parar('conta_alterada');
        return coleta?.ativo ? coleta : null;
    }
    function erroResumido(erro) {
        const texto = String(erro?.message || '');
        if (/timeout|demorou|prazo/i.test(texto)) return 'tempo_excedido';
        if (/403|401/.test(texto)) return 'acesso';
        return erro?.name === 'AbortError' ? 'cancelado' : 'falha';
    }
    function contarModelos(c, id, momento) {
        if (!ativa(c) || id == null) return;
        const chave = ordem(id)?.id || id;
        const itens = estado().osItens?.[chave] || [];
        const container = document.getElementById('amostras-itens-container');
        const mesmoPedido = container?.dataset.amostrasOsId === String(chave);
        const avisos = mesmoPedido ? [...container.querySelectorAll('[data-amostra-carga]')] : [];
        emitir(c, 'contagem_modelos', { pedido: pedido(id), momento, no_estado: itens.length,
            completos_no_estado: itens.filter(i => i._dbLoaded === true).length,
            com_arte_no_estado: itens.filter(i => i.arte_url || i.amostra_arte_base64 || i.url_arquivo_arte).length,
            tela_do_pedido: mesmoPedido,
            cartoes_no_dom: mesmoPedido ? container.querySelectorAll('[id^="amostra-item-header-"]').length : null,
            previas_carregando: avisos.filter(el => el.dataset.estado === 'carregando').length,
            previas_com_erro: avisos.filter(el => el.dataset.estado === 'erro').length,
            previas_prontas: avisos.filter(el => el.dataset.estado === 'pronto').length });
    }
    // Proxy conserva this, retorno, identidade da Promise e propriedades da fila/cache.
    function observar(nome, iniciar, terminar, dono = window) {
        const original = dono[nome];
        if (typeof original !== 'function') { coleta.ausentes.push(nome); return; }
        const proxy = new Proxy(original, { apply(alvo, thisArg, args) {
            const c = seguro(atual);
            const contexto = c ? seguro(() => iniciar(c, args, thisArg)) : null;
            let resultado;
            try { resultado = Reflect.apply(alvo, thisArg, args); }
            catch (erro) {
                if (c) seguro(() => terminar(c, contexto, undefined, erro));
                throw erro;
            }
            if (c) {
                const fim = (valor, erro) => seguro(() => terminar(c, contexto, valor, erro));
                if (resultado instanceof Promise) resultado.then(v => fim(v), e => fim(undefined, e));
                else fim(resultado);
            }
            return resultado;
        } });
        dono[nome] = proxy;
        restauracoes.push(() => { if (dono[nome] === proxy) dono[nome] = original; });
    }
    // URLs ficam apenas neste mapa limitado em memoria. O JSON recebe referencias locais.
    function chaveArquivo(entrada) {
        if (typeof entrada !== 'string' || !/^(https?:\/\/|\/)/i.test(entrada)) return null;
        const url = new URL(entrada, location.href);
        url.hash = '';
        return url.href;
    }
    function arquivo(c, entrada) {
        const chave = chaveArquivo(entrada);
        if (!chave) return null;
        if (!c.arquivos.has(chave) && c.arquivos.size < 500) c.arquivos.set(chave, `arquivo-${c.arquivos.size + 1}`);
        return c.arquivos.get(chave) || null;
    }
    function rota(c, entrada) {
        const url = new URL(typeof entrada === 'string' ? entrada : entrada?.url || String(entrada), location.href);
        const remoto = /\.supabase\.co$/i.test(url.hostname);
        const caminho = url.pathname;
        if (/\/(?:api\/)?proxy$/.test(caminho)) return {
            rota: remoto ? 'proxy_nuvem' : url.origin === location.origin ? 'proxy_mesma_origem' : 'proxy_outro',
            arquivo_ref: arquivo(c, url.searchParams.get('url')) };
        const ref = c.arquivos.get(chaveArquivo(url.href));
        if (ref || remoto && caminho.startsWith('/storage/')) return {
            rota: remoto ? 'arquivo_supabase_direto' : 'arquivo_outro_direto', arquivo_ref: ref || arquivo(c, url.href) };
        if (remoto && caminho.startsWith('/rest/v1/')) {
            const tabela = caminho.split('/')[3];
            const permitidas = ['pedidos_modelos', 'pedidos_artes', 'produtos_proposta', 'propostas_os',
                'propostas_os_setores', 'producao_numeracoes', 'producao_cores', 'producao_formatos',
                'catalogo_fontes', 'producao_os', 'producao_os_itens', 'propostas'];
            return { rota: 'banco_rest', tabela: permitidas.includes(tabela) ? tabela : 'outra' };
        }
        if ((remoto || url.origin === location.origin) && caminho.includes('/api/propostas/')) {
            const acao = caminho.split('/').at(-1);
            return { rota: 'propostas', acao: ['consultar', 'pagamentos', 'cadastro', 'status'].includes(acao) ? acao : 'outra' };
        }
        return null;
    }
    function instalarRede() {
        observar('urlDoProxy', (c, args) => arquivo(c, args[0]), (c, ref, _, erro) => {
            if (ref && !erro) emitir(c, 'fallback_arquivo', { arquivo_ref: ref,
                ...(c.comparando ? { experimento: 'comparacao_download' } : {}) });
        });
        observar('requisitarPropostas', (c, args) => {
            if (!['consultar', 'pagamentos'].includes(args[0]) || (args[2] && args[2] !== 'propostas')) return null;
            const corpo = args[1] || {};
            const numero = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
            const m = { inicio: agora(), etapa: 'consulta_propostas', pedido: null, rede: {
                acao: args[0], consulta: ['numeros', 'status', 'nome', 'cliente'].includes(corpo.tipo) ? corpo.tipo : 'outra',
                offset: numero(corpo.offset), limite: numero(corpo.limite),
                quantidade_numeros: Array.isArray(corpo.numeros) ? corpo.numeros.length : null } };
            c.pendentes.add(m);
            return m;
        }, (c, m, valor, erro) => {
            if (!m) return;
            c.pendentes.delete(m);
            emitir(c, 'consulta_propostas', { ...m.rede, duracao_ms: arredondar(agora() - m.inicio),
                linhas: Array.isArray(valor) ? valor.length : null, resultado: erro ? erroResumido(erro) : 'concluido' });
        });
        observar('fetch', (c, args) => {
            const destino = rota(c, args[0]);
            if (!destino) return null;
            const m = { inicio: agora(), etapa: 'http_headers', pedido: null,
                rede: { requisicao: ++c.requisicoes, ...destino,
                    ...(c.comparando ? { experimento: 'comparacao_download' } : {}) } };
            c.pendentes.add(m);
            return m;
        }, (c, m, resposta, erro) => {
            if (!m) return;
            c.pendentes.delete(m);
            if (!ativa(c)) return;
            if (resposta && typeof resposta === 'object') c.respostas.set(resposta, m.rede);
            emitir(c, 'http_headers', { ...m.rede, duracao_ms: arredondar(agora() - m.inicio),
                status_http: resposta?.status ?? null, resultado: erro ? (erro.name === 'TypeError' ? 'rede_ou_cors' : erroResumido(erro))
                    : resposta?.ok ? 'concluido' : 'http_erro' });
        });
        // Observar somente o consumo que o produto ja faria; nunca clonar nem ler o corpo por conta propria.
        for (const metodo of ['arrayBuffer', 'json', 'text']) {
            if (typeof Response === 'undefined') break;
            observar(metodo, (c, _, resposta) => {
                const rede = c.respostas.get(resposta);
                if (!rede) return null;
                const m = { inicio: agora(), etapa: 'http_corpo', pedido: null, rede: { ...rede, leitura: metodo } };
                c.pendentes.add(m);
                return m;
            }, (c, m, valor, erro) => {
                if (!m) return;
                c.pendentes.delete(m);
                emitir(c, 'http_corpo', { ...m.rede, duracao_ms: arredondar(agora() - m.inicio),
                    bytes_lidos: valor instanceof ArrayBuffer ? valor.byteLength : null,
                    resultado: erro ? erroResumido(erro) : 'concluido' });
            }, Response.prototype);
        }
    }
    function etapa(nome, rotulo, obterPedido) {
        observar(nome, (c, args) => {
            const id = obterPedido ? obterPedido(args) : null;
            if (rotulo === 'modelos') contarModelos(c, id, 'antes_da_carga');
            const rede = rotulo === 'obter_pdf' ? { arquivo_ref: arquivo(c, args[0]) } : {};
            const medicao = { inicio: agora(), etapa: rotulo, pedido: pedido(id), id, rede };
            c.pendentes.add(medicao);
            return medicao;
        }, (c, m, valor, erro) => {
            if (!m) return;
            c.pendentes.delete(m);
            if (m.etapa === 'modelos') contarModelos(c, m.id, 'apos_carga');
            emitir(c, 'etapa', { etapa: m.etapa, pedido: m.pedido, ...m.rede,
                duracao_ms: arredondar(agora() - m.inicio),
                resultado: erro ? erroResumido(erro) : valor === false ? 'nao_concluido' : 'concluido' });
        });
    }
    function abertura(c, id) {
        const numero = pedido(id);
        const ultima = c.aberturas[c.aberturas.length - 1];
        return numero != null && ultima?.pedido === numero && ultima.fim_ms == null ? ultima : null;
    }
    function encerrarAbertura(c, motivo) {
        const a = c?.aberturas[c.aberturas.length - 1];
        if (!a || a.fim_ms != null) return;
        a.fim_ms = arredondar(agora() - c.inicio);
        a.encerramento = motivo;
        a.resultado = a.primeira_previa_ms != null ? 'previa_apresentada'
            : a.falhas > 0 ? 'falha_sem_previa' : 'sem_previa_ate_encerrar';
    }
    function instalar(c) {
        instalarRede();
        if (typeof window.loadOrdens === 'function') observar('loadOrdens', (sessao, args) => {
            const views = ['view-lista-arte', 'view-lista-impressao', 'view-amostras'];
            const view = views.find(v => document.getElementById(v)?.classList.contains('active')) || 'outra';
            const busca = document.getElementById('os-search-arte')?.value.trim() || '';
            const filtro = estado().filtroFilaTipo;
            const recorte = args[0]?.completa ? 'completo' : seguro(() => recorteDaCargaDeOrdens()) || 'desconhecido';
            emitir(sessao, 'solicitacao_lista', { view,
                filtro: ['fila', 'todos', 'concluidos', 'dashboard', 'aprovacao', 'aprovados', 'pendente'].includes(filtro) ? filtro : 'outro',
                pesquisa: !busca ? 'vazia' : /^\d{1,9}$/.test(busca) ? 'numero' : 'texto',
                recorte: recorte.startsWith('pedido:') ? 'pedido' : recorte,
                completa_explicita: !!args[0]?.completa,
                carga_em_andamento: typeof _cargaOrdensEmAndamento !== 'undefined' && !!_cargaOrdensEmAndamento });
        }, () => {});
        if (typeof window.renderOrdens === 'function') observar('renderOrdens', () => agora(), (sessao, inicio, _, erro) => {
            emitir(sessao, 'desenho_lista', { duracao_ms: arredondar(agora() - inicio),
                pedidos: estado().ordens?.length || 0, resultado: erro ? erroResumido(erro) : 'concluido' });
        });
        observar('navigateToAmostrasFromOS', (sessao, args) => {
            encerrarAbertura(sessao, 'outra_abertura');
            if (sessao.aberturas.length >= MAX_ABERTURAS) { parar('limite_aberturas'); return null; }
            const a = { pedido: pedido(args[0]), inicio_ms: arredondar(agora() - sessao.inicio),
                modelos_ms: null, primeira_previa_ms: null, modelos: null, falhas: 0,
                aba_oculta: document.hidden, fim_ms: null, resultado: 'em_andamento' };
            sessao.aberturas.push(a);
            return a;
        }, (sessao, a, _, erro) => {
            if (a && ativa(sessao)) a.funcao_abertura_ms = arredondar(agora() - sessao.inicio - a.inicio_ms);
            if (erro && a && ativa(sessao)) { a.falhas++; emitir(sessao, 'erro_abertura', { pedido: a.pedido, resultado: erroResumido(erro) }); }
        });
        observar('renderAmostrasOSItens', (_, args) => ({ id: args[0] }), (sessao, ctx, _, erro) => {
            if (!ctx || !ativa(sessao)) return;
            contarModelos(sessao, ctx.id, erro ? 'erro_ao_montar_cartoes' : 'apos_montar_cartoes');
            const a = abertura(sessao, ctx.id);
            if (erro) {
                if (a) a.falhas++;
                emitir(sessao, 'erro_cartoes', { pedido: pedido(ctx.id), resultado: erroResumido(erro) });
                return;
            }
            const container = document.getElementById('amostras-itens-container');
            if (a && a.modelos_ms == null && pedido(container?.dataset.amostrasOsId) === a.pedido) {
                a.modelos_ms = arredondar(agora() - sessao.inicio - a.inicio_ms);
                a.modelos = (estado().osItens?.[ordem(ctx.id)?.id || ctx.id] || []).length;
            }
        });
        observar('mostrarCargaDaPrevia', (_, args) => ({ container: args[0], idx: args[1], id: args[2], situacao: args[3] }),
            (sessao, ctx, _, erro) => {
                if (!ctx || erro || !ativa(sessao)) return;
                const a = abertura(sessao, ctx.id);
                if (ctx.situacao === 'erro') {
                    if (a) a.falhas++;
                    emitir(sessao, 'erro_previa', { pedido: pedido(ctx.id), modelo_indice: Number(ctx.idx) });
                }
                if (ctx.situacao !== 'pronto') return;
                // Medir a apresentacao numa frame seguinte, apenas de canvas visivel.
                requestAnimationFrame(() => seguro(() => {
                    if (!ativa(sessao) || document.hidden || !ctx.container.isConnected
                        || pedido(ctx.container.dataset.amostrasOsId) !== pedido(ctx.id)) return;
                    if (ctx.container.querySelector(`[data-amostra-carga="${ctx.idx}"]`)?.dataset.estado !== 'pronto') return;
                    const visivel = [...ctx.container.querySelectorAll(`#amostra-item-canvas-${ctx.idx}, #amostra-pdf-canvas-${ctx.idx}`)].some(canvas => {
                        const rect = canvas.getBoundingClientRect();
                        return canvas.width > 1 && canvas.height > 1 && rect.width > 0 && rect.height > 0
                            && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
                    });
                    if (!visivel) return;
                    emitir(sessao, 'previa_visivel', { pedido: pedido(ctx.id), modelo_indice: Number(ctx.idx) });
                    if (a && a.fim_ms == null && a.primeira_previa_ms == null) {
                        a.primeira_previa_ms = arredondar(agora() - sessao.inicio - a.inicio_ms);
                        a.resultado = 'previa_apresentada';
                    }
                }));
            });
        observar('showView', (sessao, args) => {
            contarModelos(sessao, estado().amostrasOSAtivo, 'antes_de_navegar');
            return args[0];
        }, (sessao, view, _, erro) => {
            if (!erro && view !== 'view-amostras' && document.querySelector('.view-section.active')?.id === view) {
                encerrarAbertura(sessao, 'saiu_da_tela');
            }
        });
        observar('loadOrdensFromVibecode', sessao => {
            const id = estado().amostrasOSAtivo || estado()._aberturaArtes?.osId;
            contarModelos(sessao, id, 'antes_de_atualizar_lista');
            return id;
        }, (sessao, id) => {
            contarModelos(sessao, id, 'apos_atualizar_lista');
            const atualId = estado().amostrasOSAtivo || estado()._aberturaArtes?.osId;
            if (atualId !== id) contarModelos(sessao, atualId, 'apos_atualizar_lista');
        });
        observar('lerDadosLista', (_, args) => ({ inicio: agora(), etapa:
            ['modelos do pedido', 'produtos do pedido', 'artes do pedido', 'produtos', 'propostas',
                'status dos pedidos', 'dados do ERP', 'horários dos prazos', 'modelos', 'pagamentos'].includes(args[1]) ? args[1] : null }),
        (sessao, ctx, valor, erro) => {
            if (!ctx?.etapa) return;
            emitir(sessao, 'resposta_consulta', { etapa: ctx.etapa, duracao_ms: arredondar(agora() - ctx.inicio),
                linhas: Array.isArray(valor?.data) ? valor.data.length : null,
                resultado: erro || valor?.error ? erroResumido(erro || valor.error) : 'concluido' });
        });
        for (const [nome, rotulo, indice] of [
            ['loadOrdens', 'lista'], ['carregarOrdensDados', 'lista_dados'], ['loadAll', 'catalogos'], ['loadOSItens', 'modelos', 0],
            ['carregarArtesGlobais', 'lista_artes'], ['carregarLinksExistentes', 'lista_links'],
            ['carregarTemposNoCard', 'lista_relogios'], ['loadUsuarios', 'lista_usuarios'],
            ['carregarModelosGlobais', 'lista_modelos'], ['carregarHorasDosPrazos', 'lista_horarios'],
            ['carregarPagamentosGlobais', 'lista_pagamentos'], ['loadUltimosPedidos', 'historico_cliente'],
            ['recarregarNumeracoesDoPedido', 'numeracoes', 0], ['carregarBancosDoPedido', 'bancos', 0],
            ['fetchPdfBytes', 'obter_pdf'], ['garantirPdfDaCor', 'obter_cor'],
            ['garantirFontesCarregadas', 'fontes'], ['preloadAmostraItemPdfElements', 'elementos_pdf', 2],
            ['renderItemAmostraCombinada', 'composicao_com_recuperacao', 1],
            ['desenharItemAmostraCombinada', 'tentativa_composicao', 1]
        ]) etapa(nome, rotulo, indice == null ? null : args => args[indice]);
        observar('executarRasterDaPrevia', (sessao, args) => {
            const m = { inicio: agora(), etapa: 'fila_raster', pedido: pedido(args[1]) };
            sessao.pendentes.add(m);
            const executar = args[2];
            args[2] = function (...valores) {
                m.rasterInicio = agora();
                emitir(sessao, 'etapa', { etapa: 'fila_raster', pedido: m.pedido,
                    duracao_ms: arredondar(m.rasterInicio - m.inicio), resultado: 'iniciado' });
                m.etapa = 'raster_pdf';
                m.inicio = m.rasterInicio;
                return Reflect.apply(executar, this, valores);
            };
            return m;
        }, (sessao, m, _, erro) => {
            if (!m) return;
            sessao.pendentes.delete(m);
            emitir(sessao, 'etapa', { etapa: m.rasterInicio == null ? 'fila_raster' : 'raster_pdf', pedido: m.pedido,
                duracao_ms: arredondar(agora() - (m.rasterInicio ?? m.inicio)),
                resultado: erro ? erroResumido(erro) : m.rasterInicio == null ? 'descartado' : 'concluido' });
        });
        observar('rasterDaAmostra', (_, args) => {
            const chave = args[0];
            const existente = window.rasterDaAmostra.cache?.some(e => e.chave.length === chave.length
                && e.chave.every((valor, i) => valor === chave[i]));
            return { reutilizado: !!existente };
        }, (sessao, ctx, _, erro) => {
            if (ctx) emitir(sessao, 'cache_raster', { ...ctx, resultado: erro ? erroResumido(erro) : 'concluido' });
        });
        if (typeof PerformanceObserver !== 'undefined') {
            for (const tipo of ['resource', 'longtask']) {
                if (!PerformanceObserver.supportedEntryTypes?.includes(tipo)) continue;
                const obs = new PerformanceObserver(lista => seguro(() => {
                    for (const e of lista.getEntries()) {
                        if (e.startTime < c.inicio) continue;
                        if (tipo === 'longtask') emitir(c, 'tarefa_longa', { duracao_ms: arredondar(e.duration) });
                        else {
                            // Nao guardar URL, query string, nomes de arquivos ou conteudo.
                            const url = new URL(e.name, location.href);
                            const categoria = /\/rest\/|\/functions\//.test(url.pathname) ? 'consultas'
                                : /\.(woff2?|ttf|otf)$/i.test(url.pathname) ? 'fontes'
                                : /\/storage\//.test(url.pathname) ? 'arquivos' : 'outros';
                            const exposto = e.requestStart > 0 && e.responseStart > 0;
                            const intervalo = (fim, inicio) => exposto && fim >= inicio ? arredondar(fim - inicio) : null;
                            emitir(c, 'recurso', { categoria, ...(rota(c, e.name) || {}), duracao_ms: arredondar(e.duration),
                                timing_detalhado: exposto, dns_ms: intervalo(e.domainLookupEnd, e.domainLookupStart),
                                conexao_ms: intervalo(e.connectEnd, e.connectStart),
                                espera_primeiro_byte_ms: intervalo(e.responseStart, e.requestStart),
                                transferencia_ms: intervalo(e.responseEnd, e.responseStart),
                                bytes_transferidos: e.transferSize || 0,
                                cache: e.transferSize > 0 ? 'rede' : e.decodedBodySize > 0 ? 'cache' : 'indeterminado' });
                        }
                    }
                }));
                seguro(() => {
                    obs.observe({ type: tipo });
                    observadores.push(obs);
                    c.observados.push(tipo);
                });
            }
        }
    }
    function iniciar(opcoes = {}) {
        if (coleta?.ativo) return false;
        const participante = String(opcoes.participante || ''), estacao = String(opcoes.estacao || '');
        if (![participante, estacao].every(v => /^[a-z0-9_-]{1,32}$/i.test(v))) return false;
        const fases = ['primeira_abertura', 'reabertura_1', 'reabertura_2', 'reabertura_3'];
        const fase = fases.includes(opcoes.fase) ? opcoes.fase : fases[0];
        const agente = navigator.userAgent.match(/(?:Edg|Chrome|Firefox|Version)\/\d+/g) || [];
        const versao = [...document.scripts].map(s => s.src.match(/\/script\.js\?v=(\d+)/)?.[1]).find(Boolean) || null;
        const role = window._currentPerms?.role;
        coleta = { ativo: true, inicio: agora(), inicio_utc: new Date().toISOString(),
            usuario: usuarioAtual(), identificacao: { participante, estacao, fase },
            ambiente: { versao_script: versao, navegador: agente.join(' '),
                perfil: ['admin', 'designer', 'atendimento', 'impressor'].includes(role) ? role : 'outro',
                viewport: { largura: innerWidth, altura: innerHeight, dpr: devicePixelRatio },
                conexao_online: navigator.onLine },
            eventos: [], aberturas: [], pendentes: new Set(), arquivos: new Map(), respostas: new WeakMap(),
            requisicoes: 0, descartados: 0, ausentes: [], observados: [] };
        seguro(() => instalar(coleta));
        prazo = setTimeout(() => parar('limite_tempo'), MAX_MS);
        atualizarPainel();
        return true;
    }
    function parar(motivo = 'operador') {
        if (!coleta?.ativo) return;
        const c = coleta;
        c.comparacaoControle?.abort();
        c.alvoComparacao = null;
        seguro(() => contarModelos(c, estado().amostrasOSAtivo, 'encerramento'));
        encerrarAbertura(c, motivo);
        for (const m of c.pendentes) emitir(c, 'etapa', { etapa: m.etapa, pedido: m.pedido, ...m.rede,
            duracao_ms: arredondar(agora() - m.inicio), resultado: 'pendente_ao_encerrar' });
        c.pendentes.clear();
        c.arquivos.clear();
        c.respostas = new WeakMap();
        c.duracao_ms = arredondar(agora() - c.inicio);
        c.encerramento = motivo;
        c.ativo = false;
        clearTimeout(prazo);
        observadores.splice(0).forEach(obs => seguro(() => obs.disconnect()));
        restauracoes.splice(0).reverse().forEach(fn => seguro(fn));
        atualizarPainel();
    }
    function registrarFalha() {
        const c = atual();
        if (!c) return;
        seguro(() => contarModelos(c, estado().amostrasOSAtivo, 'relato_do_operador'));
        emitir(c, 'relato_do_operador', { etapas_pendentes: c.pendentes.size });
        if (painel) painel.querySelector('[role="status"]').textContent = 'Falha marcada. Pode fechar e reabrir o pedido; depois exporte.';
    }
    async function compararDownload() {
        const c = atual();
        if (!c) {
            if (painel) painel.querySelector('[role="status"]').textContent = 'Inicie o diagnóstico e abra o pedido antes de comparar.';
            return false;
        }
        if (c.comparando) return false;
        // Reutiliza o mesmo arquivo nas rodadas desta coleta, mesmo ao trocar rede.
        if (!c.alvoComparacao) {
            const lentos = c.eventos.filter(e => e.etapa === 'obter_pdf' && e.arquivo_ref)
                .sort((a, b) => b.duracao_ms - a.duracao_ms);
            for (const evento of lentos) {
                const entrada = [...c.arquivos].find(([url, ref]) => ref === evento.arquivo_ref
                    && /^https:\/\/[^/]+\.supabase\.co\/storage\//i.test(url));
                if (entrada) { c.alvoComparacao = entrada; break; }
            }
        }
        if (!c.alvoComparacao || typeof urlDoProxy !== 'function') {
            if (painel) painel.querySelector('[role="status"]').textContent = 'Abra um pedido e aguarde uma arte antes de comparar.';
            return false;
        }
        c.comparando = true;
        const [url, ref] = c.alvoComparacao;
        const rodada = c.rodadaComparacao = (c.rodadaComparacao || 0) + 1;
        const provas = [];
        const rotas = rodada % 2 ? ['direto', 'proxy'] : ['proxy', 'direto'];
        if (painel) painel.querySelector('[role="status"]').textContent = 'Comparando o mesmo arquivo. Aguarde; não recarregue a página.';
        try {
            for (const caminho of rotas) {
                if (!ativa(c) || !atual()) break;
                const controle = c.comparacaoControle = new AbortController();
                const inicio = agora(); let headersMs = null, status = null;
                const relogio = setTimeout(() => controle.abort(), 20000);
                try {
                    const response = await fetch(caminho === 'direto' ? url : urlDoProxy(url),
                        { signal: controle.signal, cache: 'no-store', credentials: 'omit' });
                    headersMs = arredondar(agora() - inicio); status = response.status;
                    if (!response.ok) throw Error(`HTTP ${status}`);
                    const bytes = await response.arrayBuffer();
                    const corpoMs = arredondar(agora() - inicio - headersMs);
                    const hash = await crypto.subtle.digest('SHA-256', bytes);
                    provas.push({ caminho, hash: [...new Uint8Array(hash)].join(','), bytes: bytes.byteLength });
                    emitir(c, 'comparacao_download', { rodada, caminho, arquivo_ref: ref, status_http: status,
                        headers_ms: headersMs, corpo_ms: corpoMs, bytes: bytes.byteLength, resultado: 'concluido' });
                } catch (erro) {
                    emitir(c, 'comparacao_download', { rodada, caminho, arquivo_ref: ref, status_http: status,
                        headers_ms: headersMs, duracao_ms: arredondar(agora() - inicio), resultado: erroResumido(erro) });
                } finally { clearTimeout(relogio); }
            }
            const iguais = provas.length === 2 && provas[0].hash === provas[1].hash;
            emitir(c, 'comparacao_download_fim', { rodada, arquivo_ref: ref, caminhos_concluidos: provas.length,
                conteudo_igual: provas.length === 2 ? iguais : null });
            if (ativa(c) && painel) painel.querySelector('[role="status"]').textContent =
                provas.length === 2 ? (iguais ? 'Comparação concluída; conteúdo idêntico. Exporte o relatório.' : 'Comparação concluída; os conteúdos diferem.')
                    : 'Comparação incompleta. Exporte o relatório para análise.';
            return iguais;
        } finally { c.comparando = false; c.comparacaoControle = null; }
    }
    function relatorio() {
        const c = coleta;
        if (!c) return null;
        return JSON.parse(JSON.stringify({ esquema: 2, modo: 'site_atual_sem_cache_experimental',
            inicio_utc: c.inicio_utc, duracao_ms: c.duracao_ms ?? arredondar(agora() - c.inicio),
            ativo: c.ativo, encerramento: c.encerramento || null, ...c.identificacao, ambiente: c.ambiente,
            aberturas: c.aberturas, eventos: c.eventos, descartados: c.descartados,
            funcoes_ausentes: c.ausentes, observadores: c.observados,
            limites: ['tempos_sobrepostos_nao_somar', 'cache_http_pode_ser_indeterminado',
                'primeira_abertura_nao_garante_cache_frio', 'primeira_previa_e_sinal_canvas_visivel_na_frame',
                'sem_identificacao_automatica_do_usuario', 'eventos_de_rede_sao_da_sessao',
                'headers_incluem_rede_servidor_e_esperas_do_cliente', 'corpo_inclui_leitura_e_decodificacao',
                'timings_entre_origens_podem_nao_ser_expostos', 'referencias_de_arquivo_valem_so_nesta_coleta'] }));
    }
    function exportar() {
        parar();
        const dados = relatorio();
        if (!dados) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `diagnostico-artes-${dados.participante}-${dados.estacao}-${dados.fase}-${Date.now()}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function atualizarPainel() {
        if (!painel) return;
        painel.querySelector('[data-iniciar]').disabled = !!coleta?.ativo;
        painel.querySelector('[data-parar]').disabled = !coleta?.ativo;
        painel.querySelector('[data-exportar]').disabled = !coleta;
        painel.querySelector('[data-falha]').disabled = !coleta?.ativo;
        painel.querySelectorAll('input,select').forEach(el => { el.disabled = !!coleta?.ativo; });
        painel.querySelector('[role="status"]').textContent = coleta?.ativo
            ? 'Medindo. Abra o pedido e role normalmente.'
            : coleta ? 'Coleta encerrada. Exporte antes de iniciar outra.' : 'Pronto para medir. Use códigos, não nomes ou e-mails.';
    }
    function montar() {
        painel = document.createElement('details');
        painel.id = 'diagnostico-artes';
        painel.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:99999;width:min(340px,calc(100vw - 24px));padding:12px;background:#182234;color:white;border:1px solid #64748b;border-radius:8px;font:13px system-ui;box-sizing:border-box';
        painel.innerHTML = `<summary style="cursor:pointer">Teste de carregamento das artes — v2</summary>
            <p>Relatório local, sem envio automático. Exporte antes de fechar ou recarregar.</p>
            <label>Participante <input data-participante placeholder="designer-1" maxlength="32" style="width:100%;box-sizing:border-box"></label>
            <label>Estação <input data-estacao placeholder="pc-arte-1" maxlength="32" style="width:100%;box-sizing:border-box"></label>
            <label>Rodada <select data-fase style="width:100%"><option value="primeira_abertura">Primeira abertura</option>
            <option value="reabertura_1">Reabertura 1</option><option value="reabertura_2">Reabertura 2</option><option value="reabertura_3">Reabertura 3</option></select></label>
            <p role="status" aria-live="polite"></p><button type="button" data-iniciar>Iniciar</button>
            <button type="button" data-parar>Encerrar</button> <button type="button" data-exportar>Exportar</button>
            <p><button type="button" data-falha>Marcar travamento / modelos faltando</button></p>
            <p><button type="button" data-comparar>Comparar download direto / proxy</button></p>
            <small>Teste manual: baixa novamente uma arte já observada pelos dois caminhos. Não altera a arte nem envia o relatório.</small>`;
        painel.querySelector('[data-iniciar]').onclick = () => {
            const ok = iniciar({ participante: painel.querySelector('[data-participante]').value.trim(),
                estacao: painel.querySelector('[data-estacao]').value.trim(), fase: painel.querySelector('[data-fase]').value });
            if (!ok) painel.querySelector('[role="status"]').textContent = 'Preencha os códigos com letras, números, hífen ou sublinhado.';
            else painel.open = false;
        };
        painel.querySelector('[data-parar]').onclick = () => parar();
        painel.querySelector('[data-exportar]').onclick = exportar;
        painel.querySelector('[data-falha]').onclick = registrarFalha;
        painel.querySelector('[data-comparar]').onclick = compararDownload;
        document.body.appendChild(painel);
        atualizarPainel();
    }
    window.DiagnosticoArtes = { iniciar, parar, relatorio, exportar, registrarFalha, compararDownload };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar, { once: true });
    else montar();
})();
