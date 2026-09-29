(function (global) {
    'use strict';

    const SLA_SEGUNDOS = 2 * 60 * 60;
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
    let paginaArtesProntas = 1;
    let assinaturaArtesProntas = '';
    const ARTES_PRONTAS_POR_PAGINA = 50;
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

    function media(valores) {
        const validos = (valores || []).filter(v => Number.isFinite(v) && v >= 0);
        return validos.length ? validos.reduce((soma, v) => soma + v, 0) / validos.length : null;
    }

    function mediana(valores) {
        const validos = (valores || []).filter(v => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
        if (!validos.length) return null;
        const meio = Math.floor(validos.length / 2);
        return validos.length % 2 ? validos[meio] : (validos[meio - 1] + validos[meio]) / 2;
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

    function segundosEmArteAgora(registro, agoraMs) {
        if (!registro || registro.card !== 'fila' || !registro.desde) return null;
        const desde = new Date(registro.desde).getTime();
        if (!Number.isFinite(desde)) return null;
        return Math.max(0, Math.floor((agoraMs - desde) / 1000) + numero(registro.credito_segundos));
    }

    function pedidoTemArtePronta(pedido) {
        if (!pedido || pedido.cancelado) return false;
        if (pedido.fila === 'concluidos' || pedido.fila === 'aprovados') return true;
        const status = String(pedido.os.status_calculado || pedido.os.status || '').trim().toUpperCase();
        return STATUS_DE_ARTE_PRONTA.has(status);
    }

    function calcularMetricasDashboardArte(entrada) {
        const agora = new Date(entrada.agora || Date.now());
        const agoraMs = agora.getTime();
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

        const pedidos = (entrada.ordens || []).filter(os => {
            if (!os || os.ignorado) return false;
            const designer = nomeDesigner(os, artesPorPedido, entrada.obterDesigner);
            const atendente = nomeAtendente(os, entrada.obterAtendente);
            return (!filtroDesigner || designer === filtroDesigner)
                && (!filtroAtendente || atendente === filtroAtendente);
        }).map(os => {
            const chave = String(os.numero);
            const reg = tempos[chave] || tempos[parseInt(chave, 10)] || null;
            const fila = os._fila_arte || 'fila';
            const cancelado = String(os.status_calculado || os.status || '').trim().toUpperCase() === 'CANCELADA';
            const listaProdutos = produtosPorPedido[chave] || [];
            const pedido = {
                os,
                chave,
                fila,
                cancelado,
                designer: nomeDesigner(os, artesPorPedido, entrada.obterDesigner),
                atendente: nomeAtendente(os, entrada.obterAtendente),
                produtos: listaProdutos,
                tempoAtual: segundosEmArteAgora(reg, agoraMs)
            };
            // `saiu_da_fila_em` prova quando o painel observou a saída de
            // “Em Arte”. A produtividade nasce nesse instante, quando a arte
            // fica pronta para aprovação, e não quando o pedido chega à produção.
            const prontoEm = pedidoTemArtePronta(pedido) && reg && reg.saiu_da_fila_em
                ? new Date(reg.saiu_da_fila_em) : null;
            pedido.prontoEm = prontoEm && Number.isFinite(prontoEm.getTime()) ? prontoEm : null;
            pedido.duracao = pedido.prontoEm ? numero(reg.credito_segundos) : null;
            return pedido;
        });

        const dentro = data => data && data >= inicio && data <= agora;
        const noAnterior = data => data && data >= inicioAnterior && data < fimAnterior;
        const prontosNoPeriodo = pedidos.filter(p => dentro(p.prontoEm));
        const prontosNoPeriodoAnterior = pedidos.filter(p => noAnterior(p.prontoEm));
        const duracoes = prontosNoPeriodo.map(p => p.duracao).filter(v => v !== null);
        const ativos = pedidos.filter(p => p.fila === 'fila');
        const temposAtivos = ativos.map(p => p.tempoAtual).filter(v => v !== null);
        const dentroSla = duracoes.filter(v => v <= SLA_SEGUNDOS).length;
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

        const porDesigner = {};
        pedidos.forEach(p => {
            if (p.cancelado) return;
            // Aprovados e concluídos fora do período não são carga atual nem
            // produção do recorte. “Em Aprovação” continua aparecendo como
            // carga atual, mesmo quando a saída de Em Arte foi anterior.
            const cargaAtual = ['fila', 'pendente', 'aprovacao'].includes(p.fila);
            if (pedidoTemArtePronta(p) && !cargaAtual && !dentro(p.prontoEm)) return;
            if (!porDesigner[p.designer]) {
                porDesigner[p.designer] = { designer: p.designer, prontos: 0, duracoes: [], ativos: 0, alteracoes: 0, aprovacao: 0, produtos: 0 };
            }
            const item = porDesigner[p.designer];
            if (p.fila === 'fila') item.ativos++;
            if (p.fila === 'aprovacao') item.aprovacao++;
            if (String(p.os.status_calculado || '').toUpperCase() === 'EM ALTERAÇÃO') item.alteracoes++;
            if (dentro(p.prontoEm)) {
                item.prontos++;
                item.produtos += p.produtos.length;
                if (p.duracao !== null) item.duracoes.push(p.duracao);
            }
        });
        const designers = Object.values(porDesigner).map(item => ({
            designer: item.designer,
            prontos: item.prontos,
            ativos: item.ativos,
            alteracoes: item.alteracoes,
            aprovacao: item.aprovacao,
            produtos: item.produtos,
            media: media(item.duracoes),
            mediana: mediana(item.duracoes),
            sla: item.duracoes.length ? item.duracoes.filter(v => v <= SLA_SEGUNDOS).length / item.duracoes.length * 100 : null,
            cobertura: item.duracoes.length
        })).sort((a, b) => b.prontos - a.prontos || (a.media ?? Infinity) - (b.media ?? Infinity) || a.designer.localeCompare(b.designer));

        const porAtendente = {};
        pedidos.forEach(p => {
            if (p.cancelado) return;
            const cargaAtual = ['fila', 'pendente', 'aprovacao'].includes(p.fila);
            if (pedidoTemArtePronta(p) && !cargaAtual && !dentro(p.prontoEm)) return;
            if (!porAtendente[p.atendente]) {
                porAtendente[p.atendente] = { atendente: p.atendente, prontos: 0, duracoes: [], ativos: 0, pendentes: 0, aprovacao: 0, produtos: 0 };
            }
            const item = porAtendente[p.atendente];
            if (p.fila === 'fila') item.ativos++;
            if (p.fila === 'pendente') item.pendentes++;
            if (p.fila === 'aprovacao') item.aprovacao++;
            if (dentro(p.prontoEm)) {
                item.prontos++;
                item.produtos += p.produtos.length;
                if (p.duracao !== null) item.duracoes.push(p.duracao);
            }
        });
        const atendentes = Object.values(porAtendente).map(item => ({
            atendente: item.atendente,
            prontos: item.prontos,
            ativos: item.ativos,
            pendentes: item.pendentes,
            aprovacao: item.aprovacao,
            produtos: item.produtos,
            media: media(item.duracoes),
            mediana: mediana(item.duracoes),
            sla: item.duracoes.length ? item.duracoes.filter(v => v <= SLA_SEGUNDOS).length / item.duracoes.length * 100 : null
        })).sort((a, b) => b.prontos - a.prontos || (a.media ?? Infinity) - (b.media ?? Infinity) || a.atendente.localeCompare(b.atendente));

        const porProduto = {};
        prontosNoPeriodo.forEach(p => {
            const nomesNoPedido = new Set((p.produtos || []).map(produto => String(produto.nome_produto || '').trim() || 'Sem produto informado'));
            if (!nomesNoPedido.size) nomesNoPedido.add('Sem produto informado');
            nomesNoPedido.forEach(nome => {
                if (!porProduto[nome]) porProduto[nome] = { produto: nome, pedidos: 0, itens: 0, quantidade: 0, duracoes: [] };
                const item = porProduto[nome];
                const produtosDoNome = (p.produtos || []).filter(produto => (String(produto.nome_produto || '').trim() || 'Sem produto informado') === nome);
                item.pedidos++;
                item.itens += produtosDoNome.length || 1;
                item.quantidade += produtosDoNome.reduce((soma, produto) => soma + numero(produto.qtd), 0);
                if (p.duracao !== null) item.duracoes.push(p.duracao);
            });
        });
        const produtosResumo = Object.values(porProduto).map(item => ({
            produto: item.produto,
            pedidos: item.pedidos,
            itens: item.itens,
            quantidade: item.quantidade,
            media: media(item.duracoes),
            cobertura: item.duracoes.length
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
            media: media(duracoes),
            mediana: mediana(duracoes),
            mediaBacklog: media(temposAtivos),
            sla: duracoes.length ? dentroSla / duracoes.length * 100 : null,
            cobertura: duracoes.length,
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

    function tempo(segundos) {
        if (segundos === null || segundos === undefined || !Number.isFinite(segundos)) return '--';
        const totalMin = Math.round(segundos / 60);
        const horas = Math.floor(totalMin / 60);
        const minutos = totalMin % 60;
        return horas ? `${horas}h ${String(minutos).padStart(2, '0')}min` : `${minutos}min`;
    }

    function percentual(valor) {
        return valor === null || valor === undefined ? '--' : `${Math.round(valor)}%`;
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
            <thead><tr><th>Designer</th><th>Prontos/aprovados</th><th>Produtos</th><th>Tempo médio</th><th>Mediana</th><th>Até 2h</th><th>Em arte</th><th>Alteração</th><th>Aprovação</th></tr></thead>
            <tbody>${itens.map((item, indice) => `<tr>
                <td><span class="dashboard-arte-posicao">${indice + 1}</span><strong>${escapar(item.designer)}</strong></td>
                <td>${item.prontos}</td><td>${item.produtos}</td><td>${tempo(item.media)}</td><td>${tempo(item.mediana)}</td>
                <td>${percentual(item.sla)}</td><td>${item.ativos}</td><td>${item.alteracoes}</td><td>${item.aprovacao}</td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    function tabelaProdutos(itens) {
        if (!itens.length) return '<div class="dashboard-arte-vazio">Ainda não há produtos com arte pronta/aprovada e data confiável neste período.</div>';
        return `<div class="dashboard-arte-tabela-wrap"><table class="dashboard-arte-tabela">
            <thead><tr><th>Produto</th><th>Pedidos</th><th>Itens</th><th>Quantidade</th><th>Tempo médio do pedido</th></tr></thead>
            <tbody>${itens.map(item => `<tr><td><strong>${escapar(item.produto)}</strong></td><td>${item.pedidos}</td><td>${item.itens}</td><td>${item.quantidade.toLocaleString('pt-BR')}</td><td>${tempo(item.media)}</td></tr>`).join('')}</tbody>
        </table></div>`;
    }

    function tabelaAtendentes(itens) {
        if (!itens.length) return '<div class="dashboard-arte-vazio">Nenhum atendente atribuído no recorte atual.</div>';
        return `<div class="dashboard-arte-tabela-wrap"><table class="dashboard-arte-tabela">
            <thead><tr><th>Atendente</th><th>Prontos/aprovados</th><th>Produtos</th><th>Tempo médio</th><th>Mediana</th><th>Até 2h</th><th>Em arte</th><th>Pendências</th><th>Aprovação</th></tr></thead>
            <tbody>${itens.map((item, indice) => `<tr>
                <td><span class="dashboard-arte-posicao">${indice + 1}</span><strong>${escapar(item.atendente)}</strong></td>
                <td>${item.prontos}</td><td>${item.produtos}</td><td>${tempo(item.media)}</td><td>${tempo(item.mediana)}</td>
                <td>${percentual(item.sla)}</td><td>${item.ativos}</td><td>${item.pendentes}</td><td>${item.aprovacao}</td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    function statusDaArtePronta(pedido) {
        if (pedido.fila === 'concluidos') return 'Concluído';
        if (pedido.fila === 'aprovados') return 'Aprovado';
        return pedido.os.status_calculado || pedido.os.status || 'Arte pronta';
    }

    function tabelaArtesProntas(itens, total, pagina, totalPaginas) {
        if (!itens.length) return '<div class="dashboard-arte-vazio">Nenhum pedido com arte pronta encontrado neste recorte.</div>';
        const linhas = itens.map(pedido => {
            const produtos = [...new Set((pedido.produtos || []).map(produto => String(produto.nome_produto || '').trim()).filter(Boolean))];
            return `<tr>
                <td><strong>#${escapar(pedido.os.numero)}</strong></td>
                <td>${escapar(pedido.os.cliente || pedido.os.cliente_nome || '--')}</td>
                <td>${escapar(produtos.join(', ') || '--')}</td>
                <td>${escapar(pedido.designer)}</td>
                <td>${escapar(pedido.atendente)}</td>
                <td><span class="badge">${escapar(statusDaArtePronta(pedido))}</span></td>
            </tr>`;
        }).join('');
        const anterior = pagina > 1
            ? `<button type="button" class="btn btn-sm btn-ghost" onclick="irParaPaginaArtesProntas(${pagina - 1})">← Anteriores</button>` : '';
        const proxima = pagina < totalPaginas
            ? `<button type="button" class="btn btn-sm btn-ghost" onclick="irParaPaginaArtesProntas(${pagina + 1})">Próximos →</button>` : '';
        return `<div class="dashboard-arte-tabela-wrap"><table class="dashboard-arte-tabela">
            <thead><tr><th>Pedido</th><th>Cliente</th><th>Produto</th><th>Designer</th><th>Atendente</th><th>Status</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>
        <div class="dashboard-arte-paginacao">${anterior}<span>Página <strong>${pagina}</strong> de <strong>${totalPaginas}</strong> · ${total} pedido(s)</span>${proxima}</div>`;
    }

    function renderDashboardArte() {
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
            tempos: state.temposNoCard || {},
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
        const novaAssinatura = JSON.stringify([filtroDesigner, filtroAtendente, buscaArtePronta]);
        if (assinaturaArtesProntas !== novaAssinatura) {
            assinaturaArtesProntas = novaAssinatura;
            paginaArtesProntas = 1;
        }
        const totalPaginasArtesProntas = Math.max(1, Math.ceil(metricas.artesProntas.length / ARTES_PRONTAS_POR_PAGINA));
        paginaArtesProntas = Math.min(Math.max(1, paginaArtesProntas), totalPaginasArtesProntas);
        const inicioArtesProntas = (paginaArtesProntas - 1) * ARTES_PRONTAS_POR_PAGINA;
        const artesProntasNaPagina = metricas.artesProntas.slice(inicioArtesProntas, inicioArtesProntas + ARTES_PRONTAS_POR_PAGINA);
        raiz.innerHTML = `
            <div class="dashboard-arte-kpis">
                ${kpi('Artes prontas/aprovadas', metricas.prontosNoPeriodo.length, variacao(metricas.prontosNoPeriodo.length, metricas.prontosNoPeriodoAnterior.length), true)}
                ${kpi('Tempo médio por pedido', tempo(metricas.media), `${metricas.cobertura} pedido(s) com duração registrada`)}
                ${kpi('Mediana de produção', tempo(metricas.mediana), 'reduz o efeito de casos muito longos')}
                ${kpi('Prontos em até 2h', percentual(metricas.sla), 'SLA operacional sugerido')}
                ${kpi('Pedidos em Arte agora', metricas.ativos.length, `tempo médio em fila: ${tempo(metricas.mediaBacklog)}`)}
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
                <p class="dashboard-arte-painel-sub">Artes prontas/aprovadas no período e carga atual. A posição prioriza volume produzido; tempo só desempata.</p>
                ${tabelaDesigners(metricas.designers)}
            </article>

            <article class="dashboard-arte-painel" style="margin-top:14px">
                <h3>Desempenho por atendente</h3>
                <p class="dashboard-arte-painel-sub">Produção vinculada ao atendente e situação atual dos pedidos sob sua responsabilidade.</p>
                ${tabelaAtendentes(metricas.atendentes)}
            </article>

            <article class="dashboard-arte-painel" style="margin-top:14px">
                <h3>Produção por produto</h3>
                <p class="dashboard-arte-painel-sub">Até 12 produtos com mais artes prontas/aprovadas no período. Quantidade mantém o valor comercial original do item.</p>
                ${tabelaProdutos(metricas.produtos)}
            </article>

            <article class="dashboard-arte-painel" id="dashboard-arte-pedidos-prontos" style="margin-top:14px">
                <h3>Pedidos com arte pronta</h3>
                <p class="dashboard-arte-painel-sub">${metricas.artesProntas.length} pedido(s), independentemente do período selecionado e incluindo os que já foram concluídos.</p>
                ${tabelaArtesProntas(artesProntasNaPagina, metricas.artesProntas.length, paginaArtesProntas, totalPaginasArtesProntas)}
            </article>

            <div class="dashboard-arte-cobertura"><span>ℹ️</span><span><strong>Cobertura dos tempos: ${metricas.cobertura} de ${metricas.prontosNoPeriodo.length} arte(s) pronta(s)/aprovada(s).</strong>
                O dashboard contabiliza a transição observada saindo de “Em Arte”, quando o pedido é marcado como pronto para aprovação. Pedidos históricos já prontos sem esse carimbo continuam na lista completa, mas não viram produção do dia. “Em alteração” é a carga atual; uma taxa histórica de retrabalho exigirá registrar cada transição.</span></div>`;
    }

    function setPeriodoDashboardArte(dias) {
        periodoDias = [1, 7, 30].includes(parseInt(dias, 10)) ? parseInt(dias, 10) : 7;
        renderDashboardArte();
    }

    function irParaPaginaArtesProntas(pagina) {
        paginaArtesProntas = Math.max(1, parseInt(pagina, 10) || 1);
        renderDashboardArte();
        document.getElementById('dashboard-arte-pedidos-prontos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    global.DashboardArte = { calcularMetricasDashboardArte, segundosEmArteAgora, pedidoTemArtePronta, media, mediana };
    global.renderDashboardArte = renderDashboardArte;
    global.setPeriodoDashboardArte = setPeriodoDashboardArte;
    global.irParaPaginaArtesProntas = irParaPaginaArtesProntas;
})(typeof window !== 'undefined' ? window : globalThis);
