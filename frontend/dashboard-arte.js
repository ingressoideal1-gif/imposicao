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
        concluidos: 'Concluídos no período'
    };

    let periodoDias = 7;

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

    function segundosEmArteAgora(registro, agoraMs) {
        if (!registro || registro.card !== 'fila' || !registro.desde) return null;
        const desde = new Date(registro.desde).getTime();
        if (!Number.isFinite(desde)) return null;
        return Math.max(0, Math.floor((agoraMs - desde) / 1000) + numero(registro.credito_segundos));
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
        const tempos = entrada.tempos || {};
        const modelos = entrada.modelos || {};
        const artesPorPedido = {};

        (entrada.artes || []).forEach(arte => {
            const chave = String(arte.id_int);
            if (!artesPorPedido[chave] || arte.designer_nome) artesPorPedido[chave] = arte;
        });

        const pedidos = (entrada.ordens || []).filter(os => {
            if (!os || os.ignorado) return false;
            const designer = nomeDesigner(os, artesPorPedido, entrada.obterDesigner);
            return !filtroDesigner || designer === filtroDesigner;
        }).map(os => {
            const chave = String(os.numero);
            const reg = tempos[chave] || tempos[parseInt(chave, 10)] || null;
            const fila = os._fila_arte || 'fila';
            const cancelado = String(os.status_calculado || os.status || '').trim().toUpperCase() === 'CANCELADA';
            // `saiu_da_fila_em` prova que houve uma transição observada saindo
            // de Em Arte. Registros históricos descobertos já concluídos têm
            // `desde`, mas não esse carimbo, e não podem virar produção de hoje.
            const conclusao = fila === 'concluidos' && !cancelado && reg && reg.card === 'concluidos'
                && reg.desde && reg.saiu_da_fila_em ? new Date(reg.saiu_da_fila_em) : null;
            const duracao = conclusao ? numero(reg.credito_segundos) : null;
            const listaModelos = modelos[chave] || modelos[parseInt(chave, 10)] || [];
            return {
                os,
                chave,
                fila,
                cancelado,
                conclusao: conclusao && Number.isFinite(conclusao.getTime()) ? conclusao : null,
                duracao,
                designer: nomeDesigner(os, artesPorPedido, entrada.obterDesigner),
                modelos: listaModelos,
                tempoAtual: segundosEmArteAgora(reg, agoraMs)
            };
        });

        const dentro = data => data && data >= inicio && data <= agora;
        const noAnterior = data => data && data >= inicioAnterior && data < fimAnterior;
        const concluidos = pedidos.filter(p => dentro(p.conclusao));
        const concluidosAnteriores = pedidos.filter(p => noAnterior(p.conclusao));
        const duracoes = concluidos.map(p => p.duracao).filter(v => v !== null);
        const ativos = pedidos.filter(p => p.fila === 'fila');
        const temposAtivos = ativos.map(p => p.tempoAtual).filter(v => v !== null);
        const dentroSla = duracoes.filter(v => v <= SLA_SEGUNDOS).length;
        const recebidos = pedidos.filter(p => {
            const data = new Date(p.os.created_at || p.os.data_liberacao || '');
            return Number.isFinite(data.getTime()) && dentro(data);
        }).length;

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
        concluidos.forEach(p => {
            const ponto = pontoPorChave[chaveDoDia(p.conclusao)];
            if (ponto) ponto.valor++;
        });

        const fluxo = Object.keys(ROTULOS_FLUXO).map(fila => ({
            fila,
            rotulo: ROTULOS_FLUXO[fila],
            valor: fila === 'concluidos'
                ? concluidos.length
                : pedidos.filter(p => p.fila === fila && !p.cancelado).length,
            cor: CORES_FLUXO[fila]
        }));

        const porDesigner = {};
        pedidos.forEach(p => {
            // Pedido concluído fora do período não é carga atual nem produção
            // do recorte; não deve criar uma linha zerada no ranking.
            if (p.fila === 'concluidos' && !dentro(p.conclusao)) return;
            if (!porDesigner[p.designer]) {
                porDesigner[p.designer] = { designer: p.designer, concluidos: 0, duracoes: [], ativos: 0, alteracoes: 0, aprovacao: 0, modelos: 0 };
            }
            const item = porDesigner[p.designer];
            if (p.fila === 'fila') item.ativos++;
            if (p.fila === 'aprovacao') item.aprovacao++;
            if (String(p.os.status_calculado || '').toUpperCase() === 'EM ALTERAÇÃO') item.alteracoes++;
            if (dentro(p.conclusao)) {
                item.concluidos++;
                item.modelos += p.modelos.length;
                if (p.duracao !== null) item.duracoes.push(p.duracao);
            }
        });
        const designers = Object.values(porDesigner).map(item => ({
            designer: item.designer,
            concluidos: item.concluidos,
            ativos: item.ativos,
            alteracoes: item.alteracoes,
            aprovacao: item.aprovacao,
            modelos: item.modelos,
            media: media(item.duracoes),
            mediana: mediana(item.duracoes),
            sla: item.duracoes.length ? item.duracoes.filter(v => v <= SLA_SEGUNDOS).length / item.duracoes.length * 100 : null,
            cobertura: item.duracoes.length
        })).sort((a, b) => b.concluidos - a.concluidos || (a.media ?? Infinity) - (b.media ?? Infinity) || a.designer.localeCompare(b.designer));

        const porModelo = {};
        concluidos.forEach(p => {
            const nomesNoPedido = new Set((p.modelos || []).map(m => String(m.nome_modelo || m.modelo || '').trim() || 'Sem modelo informado'));
            if (!nomesNoPedido.size) nomesNoPedido.add('Sem modelo informado');
            nomesNoPedido.forEach(nome => {
                if (!porModelo[nome]) porModelo[nome] = { modelo: nome, pedidos: 0, unidades: 0, duracoes: [] };
                const item = porModelo[nome];
                item.pedidos++;
                item.unidades += (p.modelos || []).filter(m => (String(m.nome_modelo || m.modelo || '').trim() || 'Sem modelo informado') === nome).length || 1;
                if (p.duracao !== null) item.duracoes.push(p.duracao);
            });
        });
        const modelosResumo = Object.values(porModelo).map(item => ({
            modelo: item.modelo,
            pedidos: item.pedidos,
            unidades: item.unidades,
            media: media(item.duracoes),
            cobertura: item.duracoes.length
        })).sort((a, b) => b.pedidos - a.pedidos || a.modelo.localeCompare(b.modelo)).slice(0, 12);

        return {
            dias,
            inicio,
            agora,
            pedidos,
            concluidos,
            concluidosAnteriores,
            recebidos,
            ativos,
            alteracoes: pedidos.filter(p => String(p.os.status_calculado || '').toUpperCase() === 'EM ALTERAÇÃO').length,
            emAprovacao: pedidos.filter(p => p.fila === 'aprovacao').length,
            media: media(duracoes),
            mediana: mediana(duracoes),
            mediaBacklog: media(temposAtivos),
            sla: duracoes.length ? dentroSla / duracoes.length * 100 : null,
            cobertura: duracoes.length,
            pontos,
            fluxo,
            designers,
            modelos: modelosResumo
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
        if (!anterior) return atual ? `+${atual} vs. período anterior` : 'sem finalizações no período anterior';
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
            <thead><tr><th>Designer</th><th>Finalizados</th><th>Modelos</th><th>Tempo médio</th><th>Mediana</th><th>Até 2h</th><th>Em arte</th><th>Alteração</th><th>Aprovação</th></tr></thead>
            <tbody>${itens.map((item, indice) => `<tr>
                <td><span class="dashboard-arte-posicao">${indice + 1}</span><strong>${escapar(item.designer)}</strong></td>
                <td>${item.concluidos}</td><td>${item.modelos}</td><td>${tempo(item.media)}</td><td>${tempo(item.mediana)}</td>
                <td>${percentual(item.sla)}</td><td>${item.ativos}</td><td>${item.alteracoes}</td><td>${item.aprovacao}</td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    function tabelaModelos(itens) {
        if (!itens.length) return '<div class="dashboard-arte-vazio">Ainda não há modelos finalizados com data confiável neste período.</div>';
        return `<div class="dashboard-arte-tabela-wrap"><table class="dashboard-arte-tabela">
            <thead><tr><th>Modelo</th><th>Pedidos</th><th>Itens</th><th>Tempo médio do pedido</th></tr></thead>
            <tbody>${itens.map(item => `<tr><td><strong>${escapar(item.modelo)}</strong></td><td>${item.pedidos}</td><td>${item.unidades}</td><td>${tempo(item.media)}</td></tr>`).join('')}</tbody>
        </table></div>`;
    }

    function renderDashboardArte() {
        const raiz = document.getElementById('dashboard-arte-conteudo');
        if (!raiz || typeof state === 'undefined') return;
        const filtroDesigner = document.getElementById('os-filter-designer')?.value || '';
        const ordens = (state.ordens || []).map(os => Object.assign({}, os, {
            ignorado: typeof pedidoIgnoradoNosPaineis === 'function' && pedidoIgnoradoNosPaineis(os)
        }));
        const metricas = calcularMetricasDashboardArte({
            ordens,
            artes: state.todasArtes || [],
            modelos: state.modelosGlobais || {},
            tempos: state.temposNoCard || {},
            dias: periodoDias,
            filtroDesigner,
            agora: new Date(),
            obterDesigner: os => typeof getOSDesigner === 'function' ? getOSDesigner(os.id, os.numero) : ''
        });

        document.querySelectorAll('.dashboard-arte-periodo').forEach(botao => {
            const ativo = parseInt(botao.dataset.dias, 10) === periodoDias;
            botao.classList.toggle('ativo', ativo);
            botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
        });
        const periodoTexto = document.getElementById('dashboard-arte-periodo-texto');
        if (periodoTexto) {
            const intervalo = periodoDias === 1 ? 'hoje' : `nos últimos ${periodoDias} dias`;
            periodoTexto.textContent = `${filtroDesigner || 'Toda a equipe'} · resultados ${intervalo}.`;
        }

        const maiorPonto = Math.max(1, ...metricas.pontos.map(p => p.valor));
        const maiorFluxo = Math.max(1, ...metricas.fluxo.map(p => p.valor));
        const colunas = Math.min(metricas.pontos.length, 30);
        raiz.innerHTML = `
            <div class="dashboard-arte-kpis">
                ${kpi('Pedidos finalizados', metricas.concluidos.length, variacao(metricas.concluidos.length, metricas.concluidosAnteriores.length), true)}
                ${kpi('Tempo médio por pedido', tempo(metricas.media), `${metricas.cobertura} pedido(s) com duração registrada`)}
                ${kpi('Mediana de produção', tempo(metricas.mediana), 'reduz o efeito de casos muito longos')}
                ${kpi('Finalizados em até 2h', percentual(metricas.sla), 'SLA operacional sugerido')}
                ${kpi('Pedidos em Arte agora', metricas.ativos.length, `tempo médio em fila: ${tempo(metricas.mediaBacklog)}`)}
                ${kpi('Em alteração agora', metricas.alteracoes, `${metricas.emAprovacao} aguardando aprovação`)}
            </div>

            <div class="dashboard-arte-grade">
                <article class="dashboard-arte-painel">
                    <h3>Finalizações por dia</h3>
                    <p class="dashboard-arte-painel-sub">${metricas.recebidos} pedido(s) recebido(s) no mesmo período</p>
                    <div class="dashboard-arte-barras" style="--dashboard-colunas:${colunas}">
                        ${metricas.pontos.map(p => `<div class="dashboard-arte-barra-col" title="${escapar(p.rotulo)}: ${p.valor} finalizado(s)">
                            <span class="dashboard-arte-barra-valor">${p.valor}</span>
                            <span class="dashboard-arte-barra-trilho"><span class="dashboard-arte-barra" style="height:${Math.max(2, p.valor / maiorPonto * 100)}%"></span></span>
                            <span class="dashboard-arte-barra-label">${escapar(p.rotulo)}</span>
                        </div>`).join('')}
                    </div>
                </article>
                <article class="dashboard-arte-painel">
                    <h3>Visão do fluxo</h3>
                    <p class="dashboard-arte-painel-sub">Carga atual nas filas e conclusões do período selecionado</p>
                    <div class="dashboard-arte-fluxo">${metricas.fluxo.map(item => `<div class="dashboard-arte-fluxo-linha">
                        <span>${escapar(item.rotulo)}</span><span class="dashboard-arte-fluxo-trilho"><span class="dashboard-arte-fluxo-barra" style="display:block;width:${item.valor / maiorFluxo * 100}%;background:${item.cor}"></span></span><strong>${item.valor}</strong>
                    </div>`).join('')}</div>
                </article>
            </div>

            <article class="dashboard-arte-painel" style="margin-top:14px">
                <h3>Desempenho por designer</h3>
                <p class="dashboard-arte-painel-sub">Produção do período e carga atual. A posição prioriza volume finalizado; tempo só desempata.</p>
                ${tabelaDesigners(metricas.designers)}
            </article>

            <article class="dashboard-arte-painel" style="margin-top:14px">
                <h3>Produção por modelo</h3>
                <p class="dashboard-arte-painel-sub">Até 12 modelos com mais pedidos finalizados no período. O tempo pertence ao pedido que contém o modelo.</p>
                ${tabelaModelos(metricas.modelos)}
            </article>

            <div class="dashboard-arte-cobertura"><span>ℹ️</span><span><strong>Cobertura dos tempos: ${metricas.cobertura} de ${metricas.concluidos.length} finalizado(s).</strong>
                O dashboard só contabiliza como finalização a transição observada saindo de “Em Arte”; pedidos históricos descobertos já concluídos não viram produção do dia. “Em alteração” é a carga atual; uma taxa histórica de retrabalho exigirá registrar cada transição.</span></div>`;
    }

    function setPeriodoDashboardArte(dias) {
        periodoDias = [1, 7, 30].includes(parseInt(dias, 10)) ? parseInt(dias, 10) : 7;
        renderDashboardArte();
    }

    global.DashboardArte = { calcularMetricasDashboardArte, segundosEmArteAgora, media, mediana };
    global.renderDashboardArte = renderDashboardArte;
    global.setPeriodoDashboardArte = setPeriodoDashboardArte;
})(typeof window !== 'undefined' ? window : globalThis);
