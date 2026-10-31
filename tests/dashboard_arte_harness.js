'use strict';

const assert = require('assert');
require('../frontend/dashboard-arte.js');

const calcular = globalThis.DashboardArte.calcularMetricasDashboardArte;
const agora = new Date('2026-09-20T15:00:00-03:00');

const ordens = [
    { id: 'a', numero: 100, vendedor: 'Carla', _fila_arte: 'concluidos', status_calculado: 'APROVADO', created_at: '2026-09-20T08:00:00-03:00' },
    { id: 'b', numero: 101, vendedor: 'Carla', _fila_arte: 'concluidos', status_calculado: 'APROVADO', created_at: '2026-09-13T08:00:00-03:00' },
    { id: 'c', numero: 102, vendedor: 'Diego', _fila_arte: 'fila', status_calculado: 'Em Alteração', created_at: '2026-09-20T12:00:00-03:00' },
    { id: 'd', numero: 103, vendedor: 'Diego', _fila_arte: 'concluidos', status_calculado: 'CANCELADA', created_at: '2026-09-20T10:00:00-03:00' },
    { id: 'e', numero: 104, vendedor: 'Carla', _fila_arte: 'aprovacao', status_calculado: 'Enviar Arte', created_at: '2026-09-20T14:00:00-03:00' },
    { id: 'f', numero: 105, vendedor: 'Diego', _fila_arte: 'aprovados', status_calculado: 'APROVADO', created_at: '2026-09-20T13:30:00-03:00' }
];
const tempos = {
    100: { card: 'concluidos', desde: '2026-09-20T10:00:00-03:00', saiu_da_fila_em: '2026-09-20T10:00:00-03:00', credito_segundos: 5400 },
    // Snapshot histórico: tem `desde`, mas nunca foi observado saindo de Em Arte.
    101: { card: 'concluidos', desde: '2026-09-20T09:00:00-03:00', saiu_da_fila_em: null, credito_segundos: 0 },
    102: { card: 'fila', desde: '2026-09-20T13:00:00-03:00', saiu_da_fila_em: null, credito_segundos: 1800 },
    103: { card: 'concluidos', desde: '2026-09-20T11:00:00-03:00', saiu_da_fila_em: '2026-09-20T11:00:00-03:00', credito_segundos: 1200 },
    // O relógio não observou esta saída, mas o fluxo real persistiu a hora da arte pronta no link.
    104: { card: 'aprovacao', desde: '2026-09-20T14:00:00-03:00', saiu_da_fila_em: null, credito_segundos: 0 },
    105: { card: 'aprovados', desde: '2026-09-20T13:30:00-03:00', saiu_da_fila_em: '2026-09-20T13:30:00-03:00', credito_segundos: 7200 }
};
const artes = [
    { id_int: 100, designer_nome: 'Ana' },
    { id_int: 101, designer_nome: 'Ana' },
    { id_int: 102, designer_nome: 'Bia' },
    { id_int: 103, designer_nome: 'Bia' },
    { id_int: 104, designer_nome: 'Ana' },
    { id_int: 105, designer_nome: 'Bia' }
];
const produtos = [
    { id_int: 100, nome_produto: 'Ingresso', qtd: 500 },
    { id_int: 100, nome_produto: 'Ingresso', qtd: 250 },
    { id_int: 102, nome_produto: 'Credencial', qtd: 80 },
    { id_int: 104, nome_produto: 'Pulseira', qtd: 1000 },
    { id_int: 105, nome_produto: 'Cartão', qtd: 10 }
];
const links = {
    e: { arte_pronta_em: '2026-09-20T14:00:00-03:00' }
};

const metricas = calcular({ ordens, tempos, links, artes, produtos, dias: 1, agora });
assert.deepStrictEqual(metricas.prontosNoPeriodo.map(item => item.chave), ['100', '104', '105'],
    'conta as transições observadas para pronto, aprovação e aprovado sem esperar a conclusão');
assert.strictEqual(metricas.ativos.length, 1);
assert.strictEqual(metricas.alteracoes, 1);
assert.strictEqual(metricas.pontos[0].valor, 3);
const ingresso = metricas.produtos.find(item => item.produto === 'Ingresso');
assert.strictEqual(ingresso.itens, 2);
assert.strictEqual(ingresso.quantidade, 750, 'soma qtd sem dividir ou converter');
assert.deepStrictEqual(metricas.artesProntas.map(item => item.chave), ['105', '104', '101', '100'],
    'lista pronta inclui envio e histórico concluído sem depender do relógio');
assert.ok(!metricas.artesProntas.some(item => item.chave === '103'), 'cancelamento não entra nas artes prontas');

const ana = metricas.designers.find(item => item.designer === 'Ana');
assert.strictEqual(ana.prontos, 2);
const carla = metricas.atendentes.find(item => item.atendente === 'Carla');
assert.strictEqual(carla.prontos, 2);
assert.strictEqual(carla.produtos, 3);

const filtradas = calcular({ ordens, tempos, links, artes, produtos, dias: 7, agora, filtroDesigner: 'Bia' });
assert.strictEqual(filtradas.pedidos.length, 3, 'filtro do designer também recorta o dashboard');
assert.deepStrictEqual(filtradas.prontosNoPeriodo.map(item => item.chave), ['105'], 'cancelamento não vira produtividade');
assert.strictEqual(filtradas.ativos.length, 1);

const porAtendente = calcular({ ordens, tempos, links, artes, produtos, dias: 7, agora, filtroAtendente: 'Diego' });
assert.strictEqual(porAtendente.pedidos.length, 3, 'filtro do atendente também recorta o dashboard');
assert.strictEqual(porAtendente.ativos.length, 1);

const buscaHistorico = calcular({ ordens, tempos, links, artes, produtos, dias: 1, agora, buscaArtePronta: '101' });
assert.deepStrictEqual(buscaHistorico.artesProntas.map(item => item.chave), ['101'],
    'busca encontra concluído histórico fora das métricas do período');

const modelos = {
    100: [{id:1,quantidade:1000},{id:2,quantidade:500},{id:3,quantidade:200}],
    101: [{id:4}], // sem data válida no período
    102: [{id:5}], // ainda em arte
    103: [{id:6}], // cancelado
    104: [{id:7},{id:8}]
};
const comModelos = calcular({ordens,tempos,links,artes,produtos,modelos,dias:1,agora});
const anaModelos = comModelos.designers.find(item => item.designer === 'Ana');
assert.strictEqual(anaModelos.modelos, 5, 'conta modelos dos dois pedidos do período, sem somar tiragem');
assert.strictEqual(anaModelos.prontos, 2);
assert.strictEqual(anaModelos.produtos, 3, 'coluna Produtos mantém itens comerciais');
assert.strictEqual(comModelos.designers.find(item => item.designer === 'Bia').modelos, 0,
    'sem modelos cadastrados não estima pela quantidade de produtos');
const modelosFiltrados = calcular({ordens,tempos,links,artes,produtos,modelos,dias:1,agora,filtroDesigner:'Bia'});
assert.strictEqual(modelosFiltrados.designers.length, 1);
assert.strictEqual(modelosFiltrados.designers[0].modelos, 0, 'exclui modelos de outros designers, em arte e cancelados');
assert.strictEqual(ana.modelos, 0, 'entrada sem modelos é compatível');
const repetidos = calcular({
    ordens:[...ordens,{...ordens[0],numero:'100'},ordens[4]],tempos,links,artes,produtos,
    modelos:{...modelos,100:[...modelos[100],{id:'1',status_arte:'REPROVADO'},{id:1,status_arte:'PRONTO'}]},
    dias:1,agora
});
assert.strictEqual(repetidos.prontosNoPeriodo.length, comModelos.prontosNoPeriodo.length,
    'mesmo pedido repetido não aumenta o total do período');
assert.strictEqual(repetidos.designers.find(item => item.designer === 'Ana').modelos, 5,
    'mesmo modelo reprovado e pronto novamente conta uma vez, inclusive ID numérico/texto');
assert.strictEqual(repetidos.designers.find(item => item.designer === 'Ana').prontos, 2);
assert.strictEqual(repetidos.atendentes.find(item => item.atendente === 'Carla').prontos, 2);
assert.strictEqual(repetidos.pontos.reduce((total,ponto)=>total+ponto.valor,0),comModelos.prontosNoPeriodo.length,
    'série diária preserva o total de pedidos únicos');
const ciclo = {id:'ciclo',numero:900,status_calculado:'Enviar Arte',_fila_arte:'aprovacao'};
const entradaCiclo = {ordens:[ciclo],modelos:{900:[{id:9001}]},dias:7,agora,
    links:{ciclo:{arte_pronta_em:'2026-09-18T10:00:00-03:00'}}};
assert.strictEqual(calcular(entradaCiclo).prontosNoPeriodo.length,1);
ciclo.status_calculado='REPROVADO'; ciclo._fila_arte='fila';
calcular(entradaCiclo);
ciclo.status_calculado='Enviar Arte'; ciclo._fila_arte='aprovacao';
entradaCiclo.links.ciclo.arte_pronta_em='2026-09-20T10:00:00-03:00';
const prontoNovamente=calcular(entradaCiclo);
assert.strictEqual(prontoNovamente.prontosNoPeriodo.length,1,'segunda conclusão não acumula pedido');
assert.strictEqual(prontoNovamente.designers[0].modelos,1,'segunda conclusão não acumula modelo');
for (const campo of ['media','mediana','sla','cobertura','mediaBacklog']) {
    assert.ok(!(campo in metricas), 'cálculo de tempo removido: ' + campo);
    assert.ok(!(campo in ana), 'tempo do designer removido: ' + campo);
}
console.log('dashboard_arte_harness: ok');

const evento = {pedido:100,acao:'acao-1',ocorrido_em:agora,designer:'Ana',atendente:'Carla'};
const historico = {disponivel:true,inicio:'2020-01-01T00:00:00Z',eventos:[evento,{...evento},
    {...evento,acao:'acao-2'}, {...evento,pedido:999,acao:'acao-3',atendente:'Antiga carteira'},
    {...evento,acao:'fora',ocorrido_em:'2000-01-01T00:00:00Z'}]};
const comReprovacoes = calcular({ordens,tempos,links,artes,produtos,modelos,dias:7,agora,reprovacoes:historico});
assert.equal(comReprovacoes.designers.find(i=>i.designer==='Ana').alteracoes,3);
assert.equal(comReprovacoes.atendentes.find(i=>i.atendente==='Carla').alteracoes,2);
assert.equal(comReprovacoes.atendentes.find(i=>i.atendente==='Antiga carteira').alteracoes,1,
    'evento continua contado mesmo sem pedido na carga atual');
assert.equal(calcular({ordens,dias:7,agora,reprovacoes:historico,filtroAtendente:'Carla'}).designers[0].alteracoes,2);
assert.equal(calcular({ordens,dias:7,agora}).designers[0].alteracoes,'--','indisponivel nao e zero');
assert.equal(calcular({ordens,dias:7,agora,reprovacoes:{...historico,eventos:[]}}).designers[0].alteracoes,0);
console.log('OK: reprovacoes por acao/pedido, filtros, historico e indisponibilidade.');
