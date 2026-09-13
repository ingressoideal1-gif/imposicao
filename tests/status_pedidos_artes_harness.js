const fs = require('fs');
const vm = require('vm');

const fonte = fs.readFileSync('frontend/script.js', 'utf8');

function trechoConst(nome) {
    const inicio = fonte.indexOf('const ' + nome + ' =');
    const fim = fonte.indexOf(';', inicio) + 1;
    if (inicio < 0 || fim <= 0) throw new Error('const não encontrada: ' + nome);
    return fonte.slice(inicio, fim);
}

function trechoFuncao(nome) {
    const inicio = fonte.indexOf('function ' + nome + '(');
    if (inicio < 0) throw new Error('função não encontrada: ' + nome);
    const abre = fonte.indexOf('{', inicio);
    let nivel = 0;
    for (let i = abre; i < fonte.length; i++) {
        if (fonte[i] === '{') nivel++;
        if (fonte[i] === '}' && --nivel === 0) return fonte.slice(inicio, i + 1);
    }
    throw new Error('função incompleta: ' + nome);
}

const contexto = {};
vm.createContext(contexto);
vm.runInContext(
    trechoConst('ARTE_REPROVADOS') + '\n' +
    trechoConst('ARTE_APROVADOS') + '\n' +
    trechoFuncao('calcularStatusConsolidadoPedidoArte') + '\n' +
    'this.calcular = calcularStatusConsolidadoPedidoArte;',
    contexto
);

function igual(recebido, esperado, caso) {
    if (recebido !== esperado) throw new Error(caso + ': esperado ' + esperado + ', recebido ' + recebido);
}

const aprovado = { status_arte: 'APROVADA_CLIENTE' };
const pendente = { status_arte: 'AGUARDANDO_CLIENTE' };
const alteracao = { status_arte: 'REPROVADA_CLIENTE' };

igual(contexto.calcular([pendente], '', 'AGUARDANDO_APROVACAO'), 'Em Aprovação', 'nome antigo');
igual(contexto.calcular([aprovado, pendente], '', ''), 'Apr Parcial', 'aprovação parcial');
igual(contexto.calcular([aprovado], '', ''), 'Dados Pendentes', 'arte aprovada sem dados');
igual(contexto.calcular([aprovado], 'APROVADO', ''), 'APROVADO', 'aprovação completa');
igual(contexto.calcular([aprovado], 'CORRIGIR', 'APROVADO'), 'Corrigir Dados', 'correção vence aprovação');
igual(contexto.calcular([aprovado, pendente], 'CORRIGIR', ''), 'Corrigir Dados', 'correção vence parcial');
igual(contexto.calcular([alteracao, aprovado], 'APROVADO', ''), 'Em Alteração', 'alteração de arte');
igual(contexto.calcular([pendente], '', 'Enviar Arte'), 'Enviar Arte', 'pronto para envio');
igual(contexto.calcular([pendente], '', 'ENVIAR ARTE'), 'Enviar Arte', 'grafia antiga em maiúsculas');

console.log('status pedidos_artes: 9 casos OK');
