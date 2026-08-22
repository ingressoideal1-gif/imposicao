// A grade de permissoes de quem entra pela ESTACAO (codigo local, sem sessao
// do Supabase), e o que acontece com ela quando um modulo novo nasce.
//
// Pedido do usuario em 22/08/2026: "o Menu Painel do Acabamento deve aparecer e
// ser editavel a todos os usuarios, ajustar permissoes, mesmo marcando nao esta
// visualizando". A investigacao mostrou o porque: tres acessos locais
// (Bernardo, Eduardo, Gustavo) tinham a grade gravada ANTES de o modulo
// Acabamento existir, e `permsDoOperadorLocal` aplicava o JSON como estava --
// chave ausente valia "nao". Marcar a caixa na grade dos USUARIOS do site nao
// muda nada na estacao, porque la quem manda e a grade do ACESSO LOCAL.
//
// O que este harness prova:
//
//   1. Chave que a grade local nunca teve segue o padrao do perfil (ROLE_DEFAULTS),
//      e nao um "nao" silencioso. Modulo novo, grade velha: o operador ganha o
//      que o perfil dele ganha.
//   2. Chave que a grade TEM continua mandando -- inclusive quando diz "nao".
//      A grade e editavel caixa a caixa pelo administrador, e quem manda e ela.
//   3. Todo perfil do ROLE_DEFAULTS ve E edita o Acabamento (decisao do usuario).
//   4. Grade vazia continua liberando tudo menos a administracao (comportamento
//      antigo, preservado).
//
// Roda em node, sem navegador: `node tests/grade_do_acesso_local_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// Os trechos sao LIDOS do `script.js`, nao copiados: uma copia continuaria
// passando depois de o original mudar.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

/** `const NOME = {` ... ate o `\n};` (ou `\n];`) que fecha a declaracao. */
function extrairConst(src, nome, fecho) {
    const ini = src.indexOf('const ' + nome + ' = ');
    if (ini < 0) throw new Error('nao achei a const ' + nome + ' no script.js');
    const fim = src.indexOf('\n' + fecho, ini);
    if (fim < 0) throw new Error('nao achei o fim da const ' + nome);
    return src.slice(ini, fim + 1 + fecho.length);
}

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const CODIGO = [
    extrairConst(SCRIPT, 'ROLE_DEFAULTS', '};'),
    extrairConst(SCRIPT, 'PERM_NAV_MAP', '};'),
    extrairConst(SCRIPT, 'PERM_VIEW_MAP', '};'),
    extrairConst(SCRIPT, 'PERM_MODULES', '];'),
    extrairConst(SCRIPT, 'PERM_ACTIONS', '];'),
    extrairFuncao(SCRIPT, 'chavesDaGrade'),
    extrairFuncao(SCRIPT, 'permsDoOperadorLocal'),
].join('\n');

const api = new Function('window', CODIGO
    + '\nreturn { ROLE_DEFAULTS, PERM_MODULES, PERM_ACTIONS, chavesDaGrade, permsDoOperadorLocal };')({});

const { ROLE_DEFAULTS, permsDoOperadorLocal } = api;

// ─── 3. Todo perfil ve e edita o Acabamento ─────────────────────────────────

const perfis = Object.keys(ROLE_DEFAULTS);
ok(perfis.length === 8, 'ROLE_DEFAULTS tem os 8 perfis', perfis);
for (const perfil of perfis) {
    ok(ROLE_DEFAULTS[perfil].perm_acabamento_view === true,
       'perfil ' + perfil + ' VE o Acabamento por padrao');
    ok(ROLE_DEFAULTS[perfil].perm_acabamento_edit === true,
       'perfil ' + perfil + ' EDITA o Acabamento por padrao');
}

// ─── 3b. O perfil 'acabamento': uma tela so ────────────────────────────────
//
// Pedido do usuario em 22/08/2026: perfil novo para o Acesso Local, "apenas para
// visualizacao e edicao no Painel do Acabamento". Se uma permissao a mais entrar
// aqui, o operador do setor ganha uma tela que ninguem lhe deu.

ok(!!ROLE_DEFAULTS.acabamento, "existe o perfil 'acabamento'");
{
    const p = ROLE_DEFAULTS.acabamento || {};
    const ligadas = Object.keys(p).filter(k => p[k] === true).sort();
    ok(ligadas.length === 2 && ligadas[0] === 'perm_acabamento_edit' && ligadas[1] === 'perm_acabamento_view',
       'o perfil acabamento liga SO o painel do acabamento', ligadas);
    // Toda chave da grade precisa estar escrita, e nao apenas as duas ligadas:
    // chave ausente vira o padrao do perfil, e o padrao do perfil e ele mesmo.
    for (const key of api.chavesDaGrade()) {
        ok(key in p, 'o perfil acabamento declara ' + key);
    }
}

// ─── 1. Grade antiga: chave ausente segue o padrao do perfil ────────────────

// A grade de Gustavo Rosa (impressor) como estava no banco em 22/08/2026:
// 28 chaves, nenhuma do Acabamento.
const GRADE_IMPRESSOR_ANTIGA = {
    perm_imprimir: true, perm_gerar_pdf: true,
    perm_admin_edit: false, perm_admin_view: false,
    perm_cores_edit: false, perm_cores_view: true,
    perm_mapas_edit: false, perm_mapas_view: false,
    perm_fontes_edit: false, perm_fontes_view: false,
    perm_saidas_edit: false, perm_saidas_view: true,
    perm_pedidos_edit: false, perm_pedidos_view: true,
    perm_amostras_edit: false, perm_amostras_view: true,
    perm_formatos_edit: false, perm_formatos_view: true,
    perm_producao_edit: true, perm_producao_view: true,
    perm_imposicao_edit: true, perm_imposicao_view: true,
    perm_numeracao_edit: false, perm_numeracao_view: true,
    perm_lista_arte_edit: false, perm_lista_arte_view: false,
    perm_impressoras_edit: true, perm_impressoras_view: true,
};

{
    const p = permsDoOperadorLocal(GRADE_IMPRESSOR_ANTIGA, 'impressor');
    ok(p.perm_acabamento_view === true, 'impressor com grade antiga VE o Acabamento', p);
    ok(p.perm_acabamento_edit === true, 'impressor com grade antiga EDITA o Acabamento', p);
    // O que a grade tinha continua valendo, letra por letra.
    ok(p.perm_lista_arte_view === false, 'a chave explicita "nao" da grade continua "nao"');
    ok(p.perm_admin_view === false && p.perm_admin_edit === false, 'administracao segue fechada');
    ok(p.perm_imposicao_edit === true, 'a chave explicita "sim" da grade continua "sim"');
    // Caixa baixa e espacos no papel nao mudam o resultado.
    const p2 = permsDoOperadorLocal(GRADE_IMPRESSOR_ANTIGA, ' Impressor ');
    ok(p2.perm_acabamento_view === true, 'o papel e lido sem caixa nem espacos');
    // A grade original nao e mexida.
    ok(!('perm_acabamento_view' in GRADE_IMPRESSOR_ANTIGA), 'a grade recebida nao e alterada');
}

// ─── 2. Chave explicita manda, mesmo dizendo "nao" ──────────────────────────

{
    const grade = { ...GRADE_IMPRESSOR_ANTIGA, perm_acabamento_view: true, perm_acabamento_edit: false };
    const p = permsDoOperadorLocal(grade, 'impressor');
    ok(p.perm_acabamento_view === true, 'VER explicito continua');
    ok(p.perm_acabamento_edit === false, 'EDITAR explicitamente desmarcado NAO e ligado pelo padrao');
}

// Papel desconhecido ou vazio: chave ausente vale "nao", como antes -- nada de
// inventar permissao para quem nao tem perfil.
{
    const p = permsDoOperadorLocal(GRADE_IMPRESSOR_ANTIGA, '');
    ok(p.perm_acabamento_view === false, 'sem papel, chave ausente e "nao"');
    const q = permsDoOperadorLocal(GRADE_IMPRESSOR_ANTIGA, 'operador');
    ok(q.perm_acabamento_view === false, 'papel fora do ROLE_DEFAULTS, chave ausente e "nao"');
}

// ─── 4. Grade vazia: tudo menos a administracao (como sempre foi) ───────────

for (const vazia of [undefined, null, {}]) {
    const p = permsDoOperadorLocal(vazia, 'admin');
    ok(p.perm_acabamento_view === true && p.perm_producao_view === true,
       'grade vazia libera os modulos', vazia);
    ok(p.perm_admin_view === false && p.perm_admin_edit === false,
       'grade vazia NAO libera a administracao', vazia);
    ok(p.perm_imprimir === true && p.perm_gerar_pdf === true,
       'grade vazia libera imprimir e gerar PDF', vazia);
}

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' caso(s) falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' casos da grade do acesso local.');
