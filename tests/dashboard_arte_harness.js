'use strict';

const assert = require('assert');
require('../frontend/dashboard-arte.js');

const calcular = globalThis.DashboardArte.calcularMetricasDashboardArte;
const agora = new Date('2026-09-20T15:00:00-03:00');

const ordens = [
    { id: 'a', numero: 100, vendedor: 'Carla', _fila_arte: 'concluidos', status_calculado: 'APROVADO', created_at: '2026-09-20T08:00:00-03:00' },
    { id: 'b', numero: 101, vendedor: 'Carla', _fila_arte: 'concluidos', status_calculado: 'APROVADO', created_at: '2026-09-13T08:00:00-03:00' },
    { id: 'c', numero: 102, vendedor: 'Diego', _fila_arte: 'fila', status_calculado: 'Em Alteração', created_at: '2026-09-20T12:00:00-03:00' },
    { id: 'd', numero: 103, vendedor: 'Diego', _fila_arte: 'concluidos', status_calculado: 'CANCELADA', created_at: '2026-09-20T10:00:00-03:00' }
];
const tempos = {
    100: { card: 'concluidos', desde: '2026-09-20T10:00:00-03:00', saiu_da_fila_em: '2026-09-20T10:00:00-03:00', credito_segundos: 5400 },
    // Snapshot histórico: tem `desde`, mas nunca foi observado saindo de Em Arte.
    101: { card: 'concluidos', desde: '2026-09-20T09:00:00-03:00', saiu_da_fila_em: null, credito_segundos: 0 },
    102: { card: 'fila', desde: '2026-09-20T13:00:00-03:00', saiu_da_fila_em: null, credito_segundos: 1800 },
    103: { card: 'concluidos', desde: '2026-09-20T11:00:00-03:00', saiu_da_fila_em: '2026-09-20T11:00:00-03:00', credito_segundos: 1200 }
};
const artes = [
    { id_int: 100, designer_nome: 'Ana' },
    { id_int: 101, designer_nome: 'Ana' },
    { id_int: 102, designer_nome: 'Bia' },
    { id_int: 103, designer_nome: 'Bia' }
];
const produtos = [
    { id_int: 100, nome_produto: 'Ingresso', qtd: 500 },
    { id_int: 100, nome_produto: 'Ingresso', qtd: 250 },
    { id_int: 102, nome_produto: 'Credencial', qtd: 80 }
];

const metricas = calcular({ ordens, tempos, artes, produtos, dias: 1, agora });
assert.strictEqual(metricas.concluidos.length, 1, 'conta somente transição concluída observada e não cancelada');
assert.strictEqual(metricas.concluidos[0].chave, '100');
assert.strictEqual(metricas.media, 5400, 'usa o tempo acumulado em Em Arte');
assert.strictEqual(metricas.mediana, 5400);
assert.strictEqual(Math.round(metricas.sla), 100, 'pedido de 90 minutos cumpre SLA de 2 horas');
assert.strictEqual(metricas.ativos.length, 1);
assert.strictEqual(metricas.mediaBacklog, 9000, 'idade atual inclui crédito anterior e trecho corrente');
assert.strictEqual(metricas.alteracoes, 1);
assert.strictEqual(metricas.pontos[0].valor, 1);
assert.strictEqual(metricas.produtos[0].produto, 'Ingresso');
assert.strictEqual(metricas.produtos[0].itens, 2);
assert.strictEqual(metricas.produtos[0].quantidade, 750, 'soma qtd sem dividir ou converter');

const ana = metricas.designers.find(item => item.designer === 'Ana');
assert.strictEqual(ana.concluidos, 1);
assert.strictEqual(ana.media, 5400);
const carla = metricas.atendentes.find(item => item.atendente === 'Carla');
assert.strictEqual(carla.concluidos, 1);
assert.strictEqual(carla.produtos, 2);

const filtradas = calcular({ ordens, tempos, artes, produtos, dias: 7, agora, filtroDesigner: 'Bia' });
assert.strictEqual(filtradas.pedidos.length, 2, 'filtro do designer também recorta o dashboard');
assert.strictEqual(filtradas.concluidos.length, 0, 'cancelamento não vira produtividade');
assert.strictEqual(filtradas.ativos.length, 1);

const porAtendente = calcular({ ordens, tempos, artes, produtos, dias: 7, agora, filtroAtendente: 'Diego' });
assert.strictEqual(porAtendente.pedidos.length, 2, 'filtro do atendente também recorta o dashboard');
assert.strictEqual(porAtendente.ativos.length, 1);

console.log('dashboard_arte_harness: ok');
