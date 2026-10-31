(function (global) {
    'use strict';

    const CORES_FLUXO = {
        fila: '#3b82f6',
        pendente: '#ef4444',
        aprovacao: '#8b5cf6',
        aprovados: '#14b8a6',
        concluidos: '#f59e0b'
    };
    const ROTULOS_FLUXO = {
        fila: 'Em Arte',
        pendente: 'Pendente',
        aprovacao: 'Em Aprovação',
        aprovados: 'Aprovados',
        concluidos: 'Prontos/aprovados no período'
    };

    let periodoDias = 7;
    const STATUS_DE_ARTE_PRONTA = new Set([
        'ENVIAR ARTE', 'ARTE PRONTA',
        'EM APROVAÇÃO', 'EM APROVACAO', 'AGUARDANDO_APROVACAO',
        'AGUARD. APROVAÇÃO', 'AGUARD. APROVACAO',
        'DADOS PENDENTES', 'APROVADO', 'APROVADA',
        'ARTE APROVADA', 'ARTE_APROVADA'
    ]);

    function numero(valor) {
        const n = Number(valor);
        return Number.isFinite(n) ? n : 0;
    }

    function inicioDoDia(data) {
        const d = new Date(data);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function chaveDoDia(data) {
        const d = new Date(data);
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function nomeDesigner(os, artesPorPedido, obterDesigner) {
        const atribuido = obterDesigner ? obterDesigner(os) : '';
        if (atribuido) return atribuido;
        const arte = artesPorPedido[String(os.numero)] || {};
        return arte.designer_nome || 'Não atribuído';
    }

    function nomeAtendente(os, obterAtendente) {
        const atribuido = obterAtendente ? obterAtendente(os) : '';
        return atribuido || os.vendedor || 'Não atribuído';
    }

    function pedidoTemArtePronta(pedido) {
        if (!pedido || pedido.cancelado) return false;
        if (pedido.fila === 'concluidos' || pedido.fila === 'aprovados') return true;
        const status = String(pedido.os.status_calculado || pedido.os.status || '').trim().toUpperCase();
        return STATUS_DE_ARTE_PRONTA.has(status);
    }

    function calcularMetricasDashboardArte(entrada) {
        const agora = new Date(entrada.agora || Date.now());
        const dias = Math.max(1, parseInt(entrada.dias, 10) || 7);
        const inicio = inicioDoDia(agora);
        inicio.setDate(inicio.getDate() - (dias - 1));
        const inicioAnterior = new Date(inicio);
        inicioAnterior.setDate(inicioAnterior.getDate() - dias);
        const fimAnterior = new Date(inicio);
        const filtroDesigner = String(entrada.filtroDesigner || '');
        const filtroAtendente = String(entrada.filtroAtendente || '');
        const buscaArtePronta = String(entrada.buscaArtePronta || '').trim().toLocaleLowerCase('pt-BR');
        const tempos = entrada.tempos || {};
        const links = entrada.links || {};
        const produtosPorPedido = {};
        (entrada.produtos || []).forEach(produto => {
            const chave = String(produto.id_int);
            if (!produtosPorPedido[chave]) produtosPorPedido[chave] = [];
            produtosPorPedido[chave].push(produto);
        });
        const artesPorPedido = {};

        (entrada.artes || []).forEach(arte => {
            const chave = String(arte.id_int);
            if (!artesPorPedido[chave] || arte.designer_nome) artesPorPedido[chave] = arte;
        });

        const pedidosVistos = new Set();
        const pedidos = (entrada.ordens || []).filter(os => {
            if (!os || os.ignorado) return false;
            const identidade = String(os.numero ?? os.id);
            if (pedidosVistos.has(identidade)) return false;
            pedidosVistos.add(identidade);
            const designer = nomeDesigner(os, artesPorPedido, entrada.obterDesigner);
            const atendente = nomeAtendente(os, entrada.obterAtendente);
            return (!filtroDesigner || designer === filtroDesigner)
                && (!filtroAtendente || atendente === filtroAtendente);
        }).map(os => {
            const chave = String(os.numero);
            const reg = tempos[chave] || tempos[parseInt(chave, 10)] || null;
            const fila = os._fila_arte || 'fila';
            const cancelado = String(os.status_calculado || os.status || '').trim().toUpperCase() === 'CANCELADA';
            const link = links[os.id] || null;
            const listaProdutos = produtosPorPedido[chave] || [];
            const pedido = {
                os,
                chave,
                fila,
                cancelado,
                designer: nomeDesigner(os, artesPorPedido, entrada.obterDesigner),
                atendente: nomeAtendente(os, entrada.obterAtendente),
                produtos: listaProdutos,
                // Conta identidades, não passagens por Pronto/Reprovado.
                modelos: new Set((entrada.modelos?.[chave] || [])
                    .filter(modelo => modelo?.id != null).map(modelo => String(modelo.id))).size
            };
            // `arte_pronta_em` é o carimbo persistido quando a versão da arte
            // fica pronta. O relógio de Em Arte é a alternativa para pedidos
            // sem esse link, nunca a única fonte do volume produzido.
            const carimboPronto = link && link.arte_pronta_em
                ? link.arte_pronta_em
                : (reg && reg.saiu_da_fila_em);
            const prontoEm = pedidoTemArtePronta(pedido) && carimboPronto
                ? new Date(carimboPronto) : null;
            pedido.prontoEm = prontoEm && Number.isFinite(prontoEm.getTime()) ? prontoEm : null;
            return pedido;
        });

        const dentro = data => data && data >= inicio && data <= agora;
        const noAnterior = data => data && data >= inicioAnterior && data < fimAnterior;
        const prontosNoPeriodo = pedidos.filter(p => dentro(p.prontoEm));
        const prontosNoPeriodoAnterior = pedidos.filter(p => noAnterior(p.prontoEm));
        const ativos = pedidos.filter(p => p.fila === 'fila');
        const recebidos = pedidos.filter(p => {
            const data = new Date(p.os.created_at || p.os.data_liberacao || '');
            return Number.isFinite(data.getTime()) && dentro(data);
        }).length;
        const artesProntas = pedidos.filter(pedidoTemArtePronta).filter(p => {
            if (!buscaArtePronta) return true;
            const produtosDoPedido = (p.produtos || []).map(produto => produto.nome_produto || '').join(' ');
            return [p.chave, p.os.cliente, p.os.cliente_nome, p.designer, p.atendente,
                p.os.status_calculado, p.os.status, produtosDoPedido]
                .some(valor => String(valor || '').toLocaleLowerCase('pt-BR').includes(buscaArtePronta));
        }).sort((a, b) => numero(b.os.numero) - numero(a.os.numero));

        const pontos = [];
        for (let i = 0; i < dias; i++) {
            const data = new Date(inicio);
            data.setDate(inicio.getDate() + i);
            pontos.push({
                chave: chaveDoDia(data),
                rotulo: data.toLocaleDateString('pt-BR', dias > 7 ? { day: '2-digit', month: '2-digit' } : { weekday: 'short' }),
                valor: 0
            });
        }
        const pontoPorChave = Object.fromEntries(pontos.map(p => [p.chave, p]));
        prontosNoPeriodo.forEach(p => {
            const ponto = pontoPorChave[chaveDoDia(p.prontoEm)];
            if (ponto) ponto.valor++;
        });

        const fluxo = Object.keys(ROTULOS_FLUXO).map(fila => ({
            fila,
            rotulo: ROTULOS_FLUXO[fila],
            valor: fila === 'concluidos'
                ? prontosNoPeriodo.length
                : pedidos.filter(p => p.fila === fila && !p.cancelado).length,
            cor: CORES_FLUXO[fila]
        }));

        const historico = entrada.reprovacoes || {};
        const eventosVistos = new Set();
        const reprovacoes = historico.disponivel ? (historico.eventos || []).filter(e => {
            const chave = JSON.stringify([String(e.pedido), e.acao]);
            if (eventosVistos.has(chave)) return false;
            eventosVistos.add(chave);
            return dentro(new Date(e.ocorrido_em))
                && new Date(e.ocorrido_em) >= new Date(historico.inicio)
                && (!filtroDesigner || e.designer === filtroDesigner)
                && (!filtroAtendente || e.atendente === filtroAtendente);
        }) : [];

        const porDesigner = {};
        pedidos.forEach(p => {
            if (p.cancelado) return;
            // Aprovados e concluídos fora do período não são carga atual nem
            // produção do recorte. “Em Aprovação” continua aparecendo como
            // carga atual, mesmo quando a saída de Em Arte foi anterior.
            const cargaAtual = ['fila', 'pendente', 'aprovacao'].includes(p.fila);
            if (pedidoTemArtePronta(p) && !cargaAtual && !dentro(p.prontoEm)) return;
            if (!porDesigner[p.designer]) {
                porDesigner[p.designer] = { designer: p.designer, prontos: 0, ativos: 0, alteracoes: 0, aprovacao: 0, produtos: 0, modelos: 0 };
            }
            const item = porDesigner[p.designer];
            if (p.fila === 'fila') item.ativos++;
            if (p.fila === 'aprovacao') item.aprovacao++;
            if (dentro(p.prontoEm)) {
                item.prontos++;
                item.produtos += p.produtos.length;
                item.modelos += p.modelos;
            }
        });
        reprovacoes.forEach(e => {
            const item = porDesigner[e.designer] ||= { designer: e.designer, prontos: 0, ativos: 0, alteracoes: 0, aprovacao: 0, produtos: 0, modelos: 0 };
            item.alteracoes++;
        });
        if (!historico.disponivel) Object.values(porDesigner).forEach(item => { item.alteracoes = '--'; });
        const designers = Object.values(porDesigner).map(item => ({
            designer: item.designer,
            prontos: item.prontos,
            ativos: item.ativos,
            alteracoes: item.alteracoes,
            aprovacao: item.aprovacao,
            produtos: item.produtos,
            modelos: item.modelos,
        })).sort((a, b) => b.prontos - a.prontos || a.designer.localeCompare(b.designer));

        const porAtendente = {};
        pedidos.forEach(p => {
            if (p.cancelado) return;
            const cargaAtual = ['fila', 'pendente', 'aprovacao'].includes(p.fila);
            if (pedidoTemArtePronta(p) && !cargaAtual && !dentro(p.prontoEm)) return;
            if (!porAtendente[p.atendente]) {
                porAtendente[p.atendente] = { atendente: p.atendente, prontos: 0, ativos: 0, pendentes: 0, alteracoes: 0, aprovacao: 0, produtos: 0 };
            }
            const item = porAtendente[p.atendente];
            if (p.fila === 'fila') item.ativos++;
            if (p.fila === 'pendente') item.pendentes++;
            if (p.fila === 'aprovacao') item.aprovacao++;
            if (dentro(p.prontoEm)) {
                item.prontos++;
                item.produtos += p.produtos.length;
            }
        });
        reprovacoes.forEach(e => {
            const item = porAtendente[e.atendente] ||= { atendente: e.atendente, prontos: 0, ativos: 0, pendentes: 0, alteracoes: 0, aprovacao: 0, produtos: 0 };
            item.alteracoes++;
        });
        if (!historico.disponivel) Object.values(porAtendente).forEach(item => { item.alteracoes = '--'; });
        const atendentes = Object.values(porAtendente).map(item => ({
            atendente: item.atendente,
            prontos: item.prontos,
            ativos: item.ativos,
            pendentes: item.pendentes,
            alteracoes: item.alteracoes,
            aprovacao: item.aprovacao,
            produtos: item.produtos,
        })).sort((a, b) => b.prontos - a.prontos || a.atendente.localeCompare(b.atendente));

        const porProduto = {};
        prontosNoPeriodo.forEach(p => {
            const nomesNoPedido = new Set((p.produtos || []).map(produto => String(produto.nome_produto || '').trim() || 'Sem produto informado'));
            if (!nomesNoPedido.size) nomesNoPedido.add('Sem produto informado');
            nomesNoPedido.forEach(nome => {
                if (!porProduto[nome]) porProduto[nome] = { produto: nome, pedidos: 0, itens: 0, quantidade: 0 };
                const item = porProduto[nome];
                const produtosDoNome = (p.produtos || []).filter(produto => (String(produto.nome_produto || '').trim() || 'Sem produto informado') === nome);
                item.pedidos++;
                item.itens += produtosDoNome.length || 1;
                item.quantidade += produtosDoNome.reduce((soma, produto) => soma + numero(produto.qtd), 0);
            });
        });
        const produtosResumo = Object.values(porProduto).map(item => ({
            produto: item.produto,
            pedidos: item.pedidos,
            itens: item.itens,
            quantidade: item.quantidade,
        })).sort((a, b) => b.pedidos - a.pedidos || b.quantidade - a.quantidade || a.produto.localeCompare(b.produto)).slice(0, 12);

        return {
            dias,
            inicio,
            agora,
            pedidos,
            prontosNoPeriodo,
            prontosNoPeriodoAnterior,
            recebidos,
            ativos,
            alteracoes: pedidos.filter(p => String(p.os.status_calculado || '').toUpperCase() === 'EM ALTERAÇÃO').length,
            emAprovacao: pedidos.filter(p => p.fila === 'aprovacao').length,
            artesProntas,
            pontos,
            fluxo,
            designers,
            atendentes,
            produtos: produtosResumo
        };
    }

    function escapar(valor) {
        return String(valor ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
    }

    function variacao(atual, anterior) {
        if (!anterior) return atual ? `+${atual} vs. período anterior` : 'sem artes prontas no período anterior';
        const pct = Math.round((atual - anterior) / anterior * 100);
        return `${pct >= 0 ? '+' : ''}${pct}% vs. período anterior`;
    }

    function kpi(rotulo, valor, nota, destaque) {
        return `<article class="dashboard-arte-kpi${destaque ? ' dashboard-arte-kpi-destaque' : ''}">
            <span class="dashboard-arte-kpi-label">${escapar(rotulo)}</span>
            <strong class="dashboard-arte-kpi-valor">${escapar(valor)}</strong>
            <span class="dashboard-arte-kpi-nota">${escapar(nota)}</span>
        </article>`;
    }

    function tabelaDesigners(itens) {
        if (!itens.length) return '<div class="dashboard-arte-vazio">Nenhum designer atribuído no recorte atual.</div>';
        return `<div class="dashboard-arte-tabela-wrap"><table class="dashboard-arte-tabela">
            <thead><tr><th>Designer</th><th>Prontos/aprovados</th><th>Produtos</th><th title="Modelos cadastrados nos pedidos prontos/aprovados do período">Modelos</th><th>Em arte</th><th title="Reprovações por ação e pedido no período, desde o início do registro">Alteração</th><th>Aprovação</th></tr></thead>
            <tbody>${itens.map((item, indice) => `<tr>
                <td><span class="dashboard-arte-posicao">${indice + 1}</span><strong>${escapar(item.designer)}</strong></td>
                <td>${item.prontos}</td><td>${item.produtos}</td><td>${item.modelos}</td>
                <td>${item.ativos}</td><td>${item.alteracoes}</td><td>${item.aprovacao}</td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    function tabelaProdutos(itens) {
        if (!itens.length) return '<div class="dashboard-arte-vazio">Ainda não há produtos com arte pronta/aprovada e data confiável neste período.</div>';
        return `<div class="dashboard-arte-tabela-wrap"><table class="dashboard-arte-tabela">
            <thead><tr><th>Produto</th><th>Pedidos</th><th>Itens</th><th>Quantidade</th></tr></thead>
            <tbody>${itens.map(item => `<tr><td><strong>${escapar(item.produto)}</strong></td><td>${item.pedidos}</td><td>${item.itens}</td><td>${item.quantidade.toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody>
        </table></div>`;
    }

    function tabelaAtendentes(itens) {
        if (!itens.length) return '<div class="dashboard-arte-vazio">Nenhum atendente atribuído no recorte atual.</div>';
        return `<div class="dashboard-arte-tabela-wrap"><table class="dashboard-arte-tabela">
            <thead><tr><th>Atendente</th><th>Prontos/aprovados</th><th>Produtos</th><th>Em arte</th><th>Pendências</th><th title="Reprovações por ação e pedido no período, desde o início do registro">Alteração</th><th>Aprovação</th></tr></thead>
            <tbody>${itens.map((item, indice) => `<tr>
                <td><span class="dashboard-arte-posicao">${indice + 1}</span><strong>${escapar(item.atendente)}</strong></td>
                <td>${item.prontos}</td><td>${item.produtos}</td>
                <td>${item.ativos}</td><td>${item.pendentes}</td><td>${item.alteracoes}</td><td>${item.aprovacao}</td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    function renderDashboardArte() {
        // Filtros e cliques também chegam aqui durante a atualização automática.
        // Manter a última tela completa até todas as fontes terminarem.
        if (typeof _cargaOrdensEmAndamento !== 'undefined' && _cargaOrdensEmAndamento) return;
        const raiz = document.getElementById('dashboard-arte-conteudo');
        if (!raiz || typeof state === 'undefined') return;
        const filtroDesigner = document.getElementById('os-filter-designer')?.value || '';
        const filtroAtendente = document.getElementById('os-filter-atendente')?.value || '';
        const buscaArtePronta = document.getElementById('os-search-arte')?.value || '';
        const ordens = (state.ordens || []).map(os => Object.assign({}, os, {
            ignorado: typeof pedidoIgnoradoNosPaineis === 'function' && pedidoIgnoradoNosPaineis(os)
        }));
        const metricas = calcularMetricasDashboardArte({
            ordens,
            artes: state.todasArtes || [],
            produtos: state.produtosPropostaGlobais || [],
            modelos: state.modelosGlobais || {},
            reprovacoes: state.reprovacoesArte,
            tempos: state.temposNoCard || {},
            links: state.linksClienteData || {},
            dias: periodoDias,
            filtroDesigner,
            filtroAtendente,
            buscaArtePronta,
            agora: new Date(),
            obterDesigner: os => typeof getOSDesigner === 'function' ? getOSDesigner(os.id, os.numero) : '',
            obterAtendente: os => typeof getOSVendedor === 'function' ? getOSVendedor(os.id) : (os.vendedor || '')
        });

        document.querySelectorAll('.dashboard-arte-periodo').forEach(botao => {
            const ativo = parseInt(botao.dataset.dias, 10) === periodoDias;
            botao.classList.toggle('ativo', ativo);
            botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
        });
        const periodoTexto = document.getElementById('dashboard-arte-periodo-texto');
        if (periodoTexto) {
            const intervalo = periodoDias === 1 ? 'hoje' : `nos últimos ${periodoDias} dias`;
            const recorte = [filtroDesigner, filtroAtendente].filter(Boolean).join(' · ') || 'Toda a equipe';
            periodoTexto.textContent = `${recorte} · resultados ${intervalo}.`;
        }

        const maiorPonto = Math.max(1, ...metricas.pontos.map(p => p.valor));
        const maiorFluxo = Math.max(1, ...metricas.fluxo.map(p => p.valor));
        const colunas = Math.min(metricas.pontos.length, 30);
        raiz.innerHTML = `
            <div class="dashboard-arte-kpis">
                ${kpi('Artes prontas/aprovadas', metricas.prontosNoPeriodo.length, variacao(metricas.prontosNoPeriodo.length, metricas.prontosNoPeriodoAnterior.length), true)}
                ${kpi('Pedidos em Arte agora', metricas.ativos.length, 'Carga atual')}
                ${kpi('Em alteração agora', metricas.alteracoes, `${metricas.emAprovacao} aguardando aprovação`)}
            </div>

            <div class="dashboard-arte-grade">
                <article class="dashboard-arte-painel">
                    <h3>Artes prontas por dia</h3>
                    <p class="dashboard-arte-painel-sub">${metricas.recebidos} pedido(s) recebido(s) no mesmo período</p>
                    <div class="dashboard-arte-barras" style="--dashboard-colunas:${colunas}">
                        ${metricas.pontos.map(p => `<div class="dashboard-arte-barra-col" title="${escapar(p.rotulo)}: ${p.valor} arte(s) pronta(s)/aprovada(s)">
                            <span class="dashboard-arte-barra-valor">${p.valor}</span>
                            <span class="dashboard-arte-barra-trilho"><span class="dashboard-arte-barra" style="height:${Math.max(2, p.valor / maiorPonto * 100)}%"></span></span>
                            <span class="dashboard-arte-barra-label">${escapar(p.rotulo)}</span>
                        </div>`).join('')}
                    </div>
                </article>
                <article class="dashboard-arte-painel">
                    <h3>Visão do fluxo</h3>
                    <p class="dashboard-arte-painel-sub">Carga atual nas filas e artes prontas/aprovadas do período selecionado</p>
                    <div class="dashboard-arte-fluxo">${metricas.fluxo.map(item => `<div class="dashboard-arte-fluxo-linha">
                        <span>${escapar(item.rotulo)}</span><span class="dashboard-arte-fluxo-trilho"><span class="dashboard-arte-fluxo-barra" style="display:block;width:${item.valor / maiorFluxo * 100}%;background:${item.cor}"></span></span><strong>${item.valor}</strong>
                    </div>`).join('')}</div>
                </article>
            </div>

            <article class="dashboard-arte-painel" style="margin-top:14px">
                <h3>Desempenho por designer</h3>
                <p class="dashboard-arte-painel-sub">Artes prontas/aprovadas no período e carga atual. A posição prioriza o volume de pedidos prontos/aprovados.</p>
                ${tabelaDesigners(metricas.designers)}
            </article>

            <article class="dashboard-arte-painel" style="margin-top:14px">
                <h3>Desempenho por atendente</h3>
                <p class="dashboard-arte-painel-sub">Produção vinculada ao atendente e situação atual dos pedidos sob sua responsabilidade.</p>
                <p class="dashboard-arte-painel-sub">${state.reprovacoesArte?.disponivel
                    ? `Alteração: cada reprovação do pedido no período, pelo responsável na ocasião. Vários modelos na mesma ação contam uma vez. Registro iniciado em ${escapar(new Date(state.reprovacoesArte.inicio).toLocaleString('pt-BR'))}; datas anteriores não têm contagem.`
                    : 'Contagem de reprovações indisponível. A coluna Alteração mostra -- até a leitura do registro iniciado na implantação.'}</p>
                ${tabelaAtendentes(metricas.atendentes)}
            </article>

            <article class="dashboard-arte-painel" style="margin-top:14px">
                <h3>Produção por produto</h3>
                <p class="dashboard-arte-painel-sub">Até 12 produtos com mais artes prontas/aprovadas no período. Quantidade mantém o valor comercial original do item.</p>
                ${tabelaProdutos(metricas.produtos)}
            </article>

`;
    }

    function setPeriodoDashboardArte(dias) {
        periodoDias = [1, 7, 30].includes(parseInt(dias, 10)) ? parseInt(dias, 10) : 7;
        renderDashboardArte();
    }

    global.DashboardArte = { calcularMetricasDashboardArte, pedidoTemArtePronta };
    global.renderDashboardArte = renderDashboardArte;
    global.setPeriodoDashboardArte = setPeriodoDashboardArte;
})(typeof window !== 'undefined' ? window : globalThis);

// DASHBOARD_PRODUCAO_INICIO
(function (global) {
    'use strict';
    const hoje = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const escapar = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const numero = valor => Number.isFinite(Number(valor)) ? Math.max(0, Number(valor)) : 0;

    function calcular({ ordens, modelos, itens, produtos, catalogo, inicio, fim, normalizar }) {
        const grupos = new Map();
        const pedidosPorProduto = new Map();
        const origens = new Map(produtos.map(p => [String(p.id), p]));
        const produtosPorPedido = new Map();
        produtos.forEach(p => {
            const chave = String(p.id_int);
            if (!produtosPorPedido.has(chave)) produtosPorPedido.set(chave, []);
            produtosPorPedido.get(chave).push(p);
        });
        const cadastro = new Map(catalogo.map(p => [String(p.id_produto), p]));
        let semPrazo = 0;
        let semItens = 0;
        for (const os of ordens) {
            const dia = String(os.prazo_entrega || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) { semPrazo++; continue; }
            if (dia < inicio || dia > fim) continue;
            const lista = modelos[parseInt(os.numero, 10)]?.length ? modelos[parseInt(os.numero, 10)]
                : itens[os.id]?.length ? itens[os.id] : (produtosPorPedido.get(String(os.numero)) || []);
            if (!lista.length) semItens++;
            const vistos = new Set();
            for (const item of lista) {
                if (item.id != null && vistos.has(String(item.id))) continue;
                if (item.id != null) vistos.add(String(item.id));
                const origem = origens.get(String(item.id_produto_proposta_origem ?? item._vibe_produto_id));
                const id = item._vibe_id_produto ?? item.id_produto ?? item.produto_id ?? origem?.id_produto;
                const produto = cadastro.get(String(id));
                const setor = String((produto ? produto.setor_pcp : (item.setor || origem?.setor_pcp)) || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() || 'Sem setor';
                const nome = produto?.nome_produto || origem?.nome_produto || item.nome_produto_real || item.nome_produto || item._nome_original || item.produto || 'Produto não identificado';
                const chave = JSON.stringify([setor, id != null ? `id:${id}` : `nome:${nome}`]);
                if (!grupos.has(chave)) grupos.set(chave, { nome, setor, pedidos: 0, total: 0, impresso: 0 });
                const grupo = grupos.get(chave);
                if (!pedidosPorProduto.has(chave)) pedidosPorProduto.set(chave, new Set());
                const pedidosDoProduto = pedidosPorProduto.get(chave);
                pedidosDoProduto.add(String(os.numero ?? os.id));
                grupo.pedidos = pedidosDoProduto.size;
                const qtd = numero(item.quantidade ?? item.qtd);
                grupo.total += qtd;
                if (normalizar(item.impressao || item.status_impressao || item.status_producao) === 'Impresso') grupo.impresso += qtd;
            }
        }
        return { linhas: [...grupos.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR')), semPrazo, semItens };
    }

    function renderDashboardProducao() {
        const raiz = document.getElementById('dashboard-producao');
        if (!raiz || typeof state === 'undefined') return;
        if (!raiz.dataset.iniciado) {
            raiz.innerHTML = `<h2>Produção por produto</h2>
                <div class="dp-conteudo"><div class="dp-periodo">
                <label>De <input id="dp-inicio" type="date" value="${hoje()}"></label>
                <label>Até <input id="dp-fim" type="date" value="${hoje()}"></label>
                <button type="button" class="prod-btn-outline" id="dp-hoje">Hoje</button></div>
                <p>Prazo previsto de produção/entrega. Impresso corresponde à quantidade dos modelos marcados como impressos, independentemente da data da impressão.</p>
                <div id="dp-resultado" aria-live="polite"></div></div>`;
            raiz.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
                raiz.dataset.personalizado = '1';
                renderDashboardProducao();
            }));
            document.getElementById('dp-hoje').addEventListener('click', () => {
                delete raiz.dataset.personalizado;
                renderDashboardProducao();
            });
            raiz.dataset.iniciado = '1';
        }
        const de = document.getElementById('dp-inicio');
        const ate = document.getElementById('dp-fim');
        if (!raiz.dataset.personalizado) de.value = ate.value = hoje();
        const resultado = document.getElementById('dp-resultado');
        if (!de.value || !ate.value || de.value > ate.value) {
            resultado.textContent = 'Selecione um período válido: a data inicial deve ser anterior ou igual à final.';
            return;
        }
        const dados = calcular({ ordens: state.ordensDashboardProducao || state.ordens || [], modelos: state.modelosGlobais || {}, itens: state.osItens || {},
            produtos: state.produtosPropostaGlobais || [], catalogo: state.produtosGlobais || [], inicio: de.value, fim: ate.value,
            normalizar: normalizarStatusImpressao });
        const total = dados.linhas.reduce((s, p) => s + p.total, 0);
        const impresso = dados.linhas.reduce((s, p) => s + p.impresso, 0);
        const n = valor => valor.toLocaleString('pt-BR');
        const setores = new Map();
        for (const produto of dados.linhas) {
            if (!setores.has(produto.setor)) setores.set(produto.setor, []);
            setores.get(produto.setor).push(produto);
        }
        const tabelas = [...setores].sort(([a], [b]) => (a === 'Sem setor') - (b === 'Sem setor') || a.localeCompare(b, 'pt-BR')).map(([setor, linhas]) => {
            const subtotal = linhas.reduce((s, p) => s + p.total, 0);
            const impressoSetor = linhas.reduce((s, p) => s + p.impresso, 0);
            return `<section class="dp-setor"><header class="dp-setor-cabecalho"><div><span class="dp-sobrelinha">SETOR</span><h3>${escapar(setor)}</h3><span class="dp-contagem">${linhas.length} ${linhas.length === 1 ? 'produto' : 'produtos'}</span></div>
                <dl class="dp-setor-totais"><div><dt>Total</dt><dd>${n(subtotal)}</dd></div><div class="dp-impresso"><dt>Impresso</dt><dd>${n(impressoSetor)}</dd></div><div class="dp-pendente"><dt>Pendente</dt><dd>${n(subtotal - impressoSetor)}</dd></div></dl></header>
                <div class="dp-tabela"><table><caption>Produtos — ${escapar(setor)}</caption><thead><tr><th>Produto</th><th>Pedidos</th><th>Total</th><th>Impresso</th><th>Pendente</th><th>Progresso</th></tr></thead><tbody>${linhas.map(p => `<tr><th scope="row">${escapar(p.nome)}</th><td>${n(p.pedidos)}</td><td>${n(p.total)}</td><td class="dp-impresso">${n(p.impresso)}</td><td class="dp-pendente">${n(p.total - p.impresso)}</td><td><div class="dp-progresso"><progress aria-label="Impressão de ${escapar(p.nome)}" max="${p.total || 1}" value="${p.impresso}"></progress> ${p.total ? Math.round(p.impresso / p.total * 100) : 0}%</div></td></tr>`).join('')}</tbody></table></div></section>`;
        }).join('');
        resultado.innerHTML = `<div class="dp-resumo"><div>Total previsto<strong>${n(total)}</strong></div><div class="dp-impresso">Impresso<strong>${n(impresso)}</strong></div><div class="dp-pendente">Pendente<strong>${n(total - impresso)}</strong></div></div>
            ${tabelas || '<p>Nenhum produto com prazo neste período.</p>'}
            <p>Base: todos os pedidos carregados, independentemente do status, inclusive expedidos e entregues. Os filtros da fila de produção não alteram este resumo.${dados.semPrazo ? ` ${n(dados.semPrazo)} pedido(s) sem prazo ficam fora do período.` : ''}${dados.semItens ? ` ${n(dados.semItens)} pedido(s) do período estão sem itens disponíveis.` : ''}</p>`;
    }
    global.renderDashboardProducao = renderDashboardProducao;
    if (typeof module !== 'undefined' && module.exports) module.exports = { calcular };
})(typeof window !== 'undefined' ? window : globalThis);
