(function (raiz) {
    'use strict';
    const rotulos = {
        local_validado: '✓ Local validado',
        sem_copia: '☁ Web — sem cópia local validada',
        desconhecido: 'Local não verificado',
        aguardando_preparacao: 'Aguardando preparação local',
        preparando_local: '↓ Preparando local',
        preparacao_pausada: 'Preparação pausada',
        revalidacao_pendente: 'Verificação local vencida',
        atualizacao_pendente: '↻ Atualização pendente',
        falha_preparacao: '⚠ Falha na preparação',
        falha_validacao: '⚠ Falha na validação',
        preparacao_interrompida: 'Preparação interrompida',
        desativado: 'Preparação local desativada',
        revisao_a_conferir: 'Cópia local — conferir revisão',
        dependencias_pendentes: 'Entrada local conferida — dependências pendentes',
        fotos_fontes_locais: 'Fotos e fontes locais — demais verificações pendentes',
        recursos_antecipados: 'Arquivos antecipados — preparação pendente'
    };
    function descrever(info) {
        const estado = info?.estado || 'desconhecido';
        return {
            texto: rotulos[estado] || rotulos.desconhecido,
            validado: estado === 'local_validado',
            detalhe: [info?.revisao ? 'Revisão ' + info.revisao : '',
                info?.verificado_em ? 'Verificado em ' + info.verificado_em : '',
                info?.origem_conferida_em ? 'Origem consultada na nuvem em ' + info.origem_conferida_em : '',
                info?.conferencia_online_pendente ? 'Nova conferência online pendente' : '',
                'Disponibilidade local; não é autorização de impressão offline.'].filter(Boolean).join(' · ')
        };
    }
    let timer = null, controlador = null, observer = null;
    let estados = new Map(), geracao = 0, config = null, ultimaResposta = 0;
    let capturaAtiva = null, controladorCaptura = null, ultimaCaptura = { estado: 'desativada' };
    let filaCapturas = [], bytesCapturas = 0, falhasCaptura = 0, ultimaFalha = null;
    let painel = null, resumoAgente = null, coletaController = null, ultimaConsulta = 0;
    let coleta = { estado: 'desativada', recebidos: 0 }, operando = false;
    let proximaPagina = 0;
    function mostrarPainel() {
        if (!config || !document.createElement) return;
        if (!painel) {
            painel = document.createElement('aside');
            painel.id = 'piloto-local-acompanhamento';
            painel.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:10000;background:#fff;color:#17233b;border:1px solid #888;border-radius:8px;padding:12px;max-width:380px;font-size:12px';
            const texto = document.createElement('p');
            texto.setAttribute('role', 'status');
            painel.appendChild(texto);
            for (const [rotulo, acao] of [['Pausar preparação', () => controlar(true)],
                ['Retomar preparação', () => controlar(false)], ['Desligar piloto', desligar]]) {
                const botao = document.createElement('button');
                botao.type = 'button'; botao.textContent = rotulo; botao.onclick = acao;
                painel.appendChild(botao);
            }
            document.body.appendChild(painel);
        }
        const pendentes = filaCapturas.length + (capturaAtiva ? 1 : 0);
        const auto = resumoAgente?.coleta_autonoma;
        const estadoAuto = auto?.estado === 'lote_concluido' ? 'lote recebido; há mais pedidos'
            : auto?.estado === 'concluida' ? 'varredura recebida' : auto?.estado;
        const texto = [config.empresa || 'Piloto local', 'Prioridade: ' + (resumoAgente?.setor || 'Laser'),
            ultimaResposta ? 'Agente conectado' : 'Consulta de estado sem confirmação',
            resumoAgente?.fila?.pausado ? 'Preparação pausada' : '',
            'Capturas aguardando recibo: ' + pendentes,
            'Última captura: ' + ultimaCaptura.estado,
            'Coleta: ' + coleta.estado + ' · recibos: ' + coleta.recebidos,
            auto?.habilitada ? 'Coleta pelo agente: ' + estadoAuto + ' · recibos: ' + auto.recebidos : '',
            coleta.motivo || '', ultimaFalha || '',
            resumoAgente?.erro_catalogo ? 'Falha ao atualizar fila local' : '',
            'Impressão segue o fluxo atual.'].filter(Boolean).join(' · ');
        if (painel.firstChild.textContent !== texto) painel.firstChild.textContent = texto;
        for (const botao of painel.querySelectorAll('button')) if (botao.disabled !== operando) botao.disabled = operando;
    }
    async function controlar(pausado) {
        if (!config || operando) return false;
        const atual = config, versao = geracao, controller = new AbortController();
        operando = true; mostrarPainel();
        if (pausado) coletaController?.abort();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            const res = await fetch(atual.base + '/api/pacotes-locais/pausa/' + pausado, {
                method: 'POST', headers: { 'X-NewProd-Piloto': atual.token }, signal: controller.signal });
            if (!res.ok || (await res.json()).pausado !== pausado) throw new Error();
            if (versao !== geracao) return false;
            resumoAgente = { ...resumoAgente, fila: { ...resumoAgente?.fila, pausado } };
            return true;
        } catch (_) {
            if (versao === geracao) ultimaFalha = 'Agente não confirmou o comando; confira a conexão.';
            return false;
        } finally {
            clearTimeout(timeout);
            if (versao === geracao) { operando = false; mostrarPainel(); }
        }
    }
    async function desligar() {
        const versao = geracao;
        if (await controlar(true) && versao === geracao) {
            parar();
            if (document.createElement) {
                const aviso = document.createElement('p');
                aviso.id = 'piloto-local-desligado'; aviso.setAttribute('role', 'status');
                aviso.textContent = 'Piloto pausado no agente e coleta desligada nesta tela. Arquivos locais preservados.';
                document.body.appendChild(aviso);
            }
        }
    }
    function antecipar() {
        if (!config?.antecipar || !raiz.AntecipacaoPedidos || coletaController || operando
            || resumoAgente?.coleta_autonoma?.habilitada
            || resumoAgente?.fila?.pausado || resumoAgente?.fila?.ocupado
            || Date.now() - ultimaConsulta < 300000) return;
        const atual = config, versao = geracao, controller = new AbortController();
        coletaController = controller; ultimaConsulta = Date.now();
        coleta = { estado: 'consultando pedidos', recebidos: 0 }; mostrarPainel();
        const timeout = setTimeout(() => controller.abort(), 120000);
        Promise.resolve().then(async () => {
            const cliente = typeof supabaseClient !== 'undefined' ? supabaseClient : raiz.supabaseClient;
            const propostas = typeof consultarPropostas !== 'undefined' ? consultarPropostas : raiz.consultarPropostas;
            if (!cliente || !propostas) throw new Error('Sessão do painel indisponível.');
            const hora = new Date().getHours();
            const receber = async item => {
                if (versao !== geracao || controller.signal.aborted) throw new Error('Coleta cancelada.');
                const sessao = await cliente.auth.getSession();
                const token = sessao.data?.session?.access_token;
                if (sessao.error || !token) throw new Error('Sessão online indisponível.');
                if (versao !== geracao || controller.signal.aborted) throw new Error('Coleta cancelada.');
                const res = await fetch(atual.base + '/api/pacotes-locais/antecipacao', {
                    method: 'POST', headers: { 'X-NewProd-Piloto': atual.token, 'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token },
                    body: JSON.stringify(item), signal: controller.signal });
                const recibo = res.ok ? await res.json() : null;
                if (!recibo?.recebido || recibo.modelo !== item.modelo) throw new Error('Antecipação sem recibo da estação.');
                if (versao !== geracao) return;
                coleta.recebidos++; mostrarPainel();
            };
            const dados = await raiz.AntecipacaoPedidos.consultar({ cliente, propostas, empresa: atual.empresa,
                setor: resumoAgente?.setor || 'laser', signal: controller.signal,
                limite: hora >= 20 || hora < 7 ? 128 : 16, inicio: proximaPagina, receber,
                avancar: proximo => { if (versao === geracao) proximaPagina = proximo; } });
            if (versao === geracao) {
                proximaPagina = dados.proximo;
                coleta.estado = dados.limitados ? 'lote recebido; demais pedidos no próximo ciclo' : 'consulta concluída';
            }
        }).catch(() => {
            if (versao === geracao) coleta = { ...coleta, estado: 'pendente',
                motivo: 'Coleta não concluída. Confira sessão, conexão e capacidade do catálogo; haverá nova tentativa.' };
        }).finally(() => {
            clearTimeout(timeout);
            if (coletaController === controller) coletaController = null;
            if (versao === geracao) mostrarPainel();
        });
    }
    function aplicar() {
        if (!config) return;
        mostrarPainel();
        // Fila do Pedido: o id do modelo já faz parte da identidade da linha.
        document.querySelectorAll('[id^="ped-queue-row-"]').forEach(linha => {
            const modelo = linha.id.slice('ped-queue-row-'.length);
            const alvo = linha.querySelector('td[title="Código do Modelo"]');
            if (alvo && /^\d+$/.test(modelo)) alvo.dataset.pacoteModelo = modelo;
        });
        const recente = Date.now() - ultimaResposta < 45000;
        document.querySelectorAll('[data-pacote-modelo]').forEach(alvo => {
            const id = alvo.dataset.pacoteModelo;
            const candidatos = estados.get(id) || [];
            // Sem vínculo da tela à revisão exata, múltiplas revisões são ambíguas.
            const revisao = alvo.dataset.pacoteRevisao;
            const exato = candidatos.find(item => item.revisao === revisao);
            const info = recente ? (exato || (candidatos.length ? { estado: 'revisao_a_conferir' } : null)) : null;
            const visual = descrever(info);
            let selo = alvo.querySelector(':scope > .pacote-local-selo');
            if (!selo) {
                selo = document.createElement('small');
                selo.className = 'pacote-local-selo';
                selo.style.cssText = 'display:block;font-size:11px;margin-top:4px';
                selo.setAttribute('role', 'status');
                alvo.appendChild(selo);
            }
            if (selo.textContent !== visual.texto) selo.textContent = visual.texto;
            if (selo.title !== visual.detalhe) selo.title = visual.detalhe;
            selo.style.color = visual.validado ? '#16803c' : '#a66b00';
        });
    }
    async function atualizar(minhaGeracao) {
        const controller = new AbortController();
        controlador = controller;
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            const res = await fetch(config.base + '/api/pacotes-locais/estado', {
                headers: { 'X-NewProd-Piloto': config.token }, cache: 'no-store', signal: controller.signal
            });
            if (!res.ok) throw new Error('Agente indisponível');
            const dados = await res.json();
            if (minhaGeracao !== geracao) return;
            if (config.empresa && dados.empresa && dados.empresa !== config.empresa) throw new Error('Empresa divergente.');
            resumoAgente = dados;
            const novos = new Map();
            for (const item of dados.modelos || []) {
                const id = String(item.modelo);
                if (!novos.has(id)) novos.set(id, []);
                novos.get(id).push(item);
            }
            estados = novos;
            ultimaResposta = Date.now();
            antecipar();
        } catch (_) {
            if (minhaGeracao !== geracao) return;
            estados = new Map(); ultimaResposta = 0;
        } finally {
            clearTimeout(timeout);
            if (minhaGeracao === geracao && config) {
                aplicar();
                timer = setTimeout(() => atualizar(minhaGeracao), 15000);
            }
        }
    }
    function parar() {
        geracao++;
        clearTimeout(timer); controlador?.abort(); observer?.disconnect();
        controladorCaptura?.abort();
        coletaController?.abort(); coletaController = null;
        painel?.remove(); painel = null; resumoAgente = null;
        ultimaConsulta = 0; coleta = { estado: 'desativada', recebidos: 0 }; operando = false;
        proximaPagina = 0;
        capturaAtiva = null; controladorCaptura = null;
        filaCapturas = []; bytesCapturas = 0; falhasCaptura = 0; ultimaFalha = null;
        ultimaCaptura = { estado: 'desativada' };
        config = null; estados = new Map(); ultimaResposta = 0;
        document.querySelectorAll('.pacote-local-selo').forEach(el => el.remove());
    }
    function iniciar(opcoes) {
        parar();
        const url = new URL(opcoes.base);
        if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:'
            || url.username || url.password || url.pathname !== '/' || url.search || url.hash
            || typeof opcoes.token !== 'string' || opcoes.token.length < 32) {
            throw new Error('Configuração local do piloto inválida.');
        }
        config = { base: url.origin, token: opcoes.token, capturar: opcoes.capturar === true,
            empresa: opcoes.empresa, antecipar: opcoes.antecipar === true };
        document.querySelectorAll('#piloto-local-desligado').forEach(el => el.remove());
        observer = new MutationObserver(() => aplicar());
        observer.observe(document.body, { childList: true, subtree: true });
        aplicar(); atualizar(geracao);
    }
    function capturarEntrada(fd, contexto) {
        if (!config?.capturar || !raiz.PacoteEntrada) return;
        const atual = config, versao = geracao;
        let copia, contextoCopia, bytes = 0;
        try {
            copia = new FormData();
            for (const [nome, valor] of fd.entries()) {
                if (valor instanceof Blob) bytes += valor.size;
                else bytes += new Blob([valor]).size;
                copia.append(nome, valor);
            }
            if (bytes > 64 * 1024 * 1024) throw new Error('Entrada excede o limite de captura do piloto.');
            if (filaCapturas.length + (capturaAtiva ? 1 : 0) >= 8 || bytesCapturas + bytes > 128 * 1024 * 1024) {
                throw new Error('Fila de captura cheia; repita a preparação após concluir as capturas pendentes.');
            }
            contextoCopia = structuredClone(contexto);
        } catch (erro) {
            falhasCaptura++;
            ultimaCaptura = { estado: 'falha', motivo: erro.message };
            ultimaFalha = erro.message;
            mostrarPainel();
            return;
        }
        bytesCapturas += bytes;
        filaCapturas.push({ atual, versao, copia, contextoCopia, bytes });
        consumirCaptura();
        mostrarPainel();
    }
    function consumirCaptura() {
        if (capturaAtiva || !config || !filaCapturas.length) return;
        const tarefa = filaCapturas.shift();
        const { atual, versao, copia, contextoCopia } = tarefa;
        capturaAtiva = tarefa;
        ultimaCaptura = { estado: 'capturando' };
        // Promise destacada somente para persistência opcional; produção não aguarda.
        Promise.resolve().then(async () => {
            const pacote = await raiz.PacoteEntrada.criar(copia, contextoCopia, atual.empresa);
            if (versao !== geracao) return;
            const controller = new AbortController();
            controladorCaptura = controller;
            const timeout = setTimeout(() => controller.abort(), 30000);
            try {
                const resposta = await fetch(atual.base + '/api/pacotes-locais/entrada', {
                    method: 'POST', headers: { 'X-NewProd-Piloto': atual.token },
                    body: pacote.envio, signal: controller.signal
                });
                if (!resposta.ok) throw new Error('A estação não confirmou a captura da entrada.');
                const recibo = await resposta.json();
                if (recibo.revisao !== pacote.manifesto.revisao || !recibo.recebido) {
                    throw new Error('Recibo da captura divergente.');
                }
                if (versao === geracao) ultimaCaptura = { estado: 'recebida', revisao: recibo.revisao };
            } finally {
                clearTimeout(timeout);
                if (controladorCaptura === controller) controladorCaptura = null;
            }
        }).catch(erro => {
            if (versao === geracao) {
                falhasCaptura++;
                ultimaCaptura = { estado: 'falha', motivo: erro.message };
                ultimaFalha = erro.message;
            }
        }).finally(() => {
            if (capturaAtiva === tarefa) {
                bytesCapturas -= tarefa.bytes;
                capturaAtiva = null;
                consumirCaptura();
                mostrarPainel();
            }
        });
    }
    raiz.PacotesLocais = { iniciar, parar, desligar, controlar, descrever, aplicar, capturarEntrada,
        estadoCaptura: () => ({ ...ultimaCaptura,
            pendentes: filaCapturas.length + (capturaAtiva ? 1 : 0), falhas: falhasCaptura, ultimaFalha }) };
    // Nenhuma requisição, selo ou armazenamento de token antes da ativação explícita.
})(typeof window !== 'undefined' ? window : globalThis);
