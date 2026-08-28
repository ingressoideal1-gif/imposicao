// O SQL do banco do pedido nao pode encostar em nada que ja existe.
//
// A regra veio do usuario em 27/08/2026: as numeracoes em andamento sao
// preservadas obrigatoriamente. Uma migracao que converta, limpe ou apague
// registro existente quebra isso — e o jeito de garantir que ninguem acrescente
// uma linha dessas depois e um teste que le o proprio arquivo.
//
// Roda em node: `node tests/pedidos_bancos_sql_harness.js`.

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let falhas = 0, total = 0;
function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra ? '\n         ' + JSON.stringify(extra) : ''));
}

const sql = fs.readFileSync(path.join(RAIZ, 'sql', 'pedidos_bancos.sql'), 'utf8');
const codigo = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').toUpperCase();

ok(!/\bUPDATE\s+PRODUCAO_NUMERACOES\b/.test(codigo),
    'o SQL nao atualiza nenhuma numeracao existente');
ok(!/\bINSERT\s+INTO\s+PRODUCAO_NUMERACOES\b/.test(codigo),
    'o SQL nao insere em producao_numeracoes');
ok(!/\bDELETE\s+FROM\b/.test(codigo), 'o SQL nao apaga nada');
ok(!/\bDROP\b/.test(codigo), 'o SQL nao derruba nada');
ok(!/\bALTER\s+TABLE\s+PEDIDOS_MODELOS\b/.test(codigo),
    'o SQL nao mexe na tabela do parceiro');
ok(/CREATE TABLE IF NOT EXISTS PEDIDOS_BANCOS/.test(codigo), 'cria pedidos_bancos');
ok(/CREATE TABLE IF NOT EXISTS PEDIDOS_MODELOS_BANCO/.test(codigo), 'cria pedidos_modelos_banco');

console.log((falhas ? 'FALHAS: ' + falhas + ' de ' : 'OK: ') + total + ' casos');
process.exit(falhas ? 1 : 0);
