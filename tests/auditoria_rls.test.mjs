import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { analisarSnapshot } from '../ferramentas/auditar_rls.mjs';

test('proposta de pagamentos fecha apenas DELETE anon e exige revisao explicita', () => {
    const sql = readFileSync(new URL('../sql/auditoria_rls/04_pagamentos_sem_delete_anon.sql', import.meta.url), 'utf8');
    const codigo = sql.replace(/--[^\n]*/g, '');
    assert.match(codigo, /current_setting\('imposition\.pagamentos_delete_anon_revisado', true\) IS DISTINCT FROM 'sim'/);
    assert.deepEqual(codigo.match(/REVOKE[^;]+;/g), ['REVOKE DELETE ON TABLE public.pagamentos_v2 FROM anon;']);
    assert.doesNotMatch(codigo, /\b(?:GRANT|DROP|TRUNCATE|INSERT\s+INTO|DELETE\s+FROM|ALTER\s+TABLE)\b/i);
    assert.match(codigo, /antes IS DISTINCT FROM depois/);
    assert.match(codigo, /colunas_antes IS DISTINCT FROM colunas_depois/);
    assert.match(codigo, /IF pg_catalog\.has_table_privilege\('anon', alvo, 'DELETE'\) THEN/);
    assert.match(codigo, /END;\s*\$revisao\$;/);
});

const alvo = { projeto: 'projeto-sintetico', ambiente: 'teste' };
const arquivoCLI = fileURLToPath(new URL('../ferramentas/auditar_rls.mjs', import.meta.url));

function snapshot() {
    const papeis = ['anon', 'authenticated', 'service_role'];
    return {
        formato: 'imposition-rls-v1',
        contexto: { ...alvo, read_only: true, server_version_num: 150000, coletado_em: '2026-09-16T12:00:00Z' },
        papeis: papeis.map(nome => ({ nome, superuser: false, bypassrls: nome === 'service_role', herda: true })),
        schemas: [],
        relacoes: [{ schema: 'public', nome: 'pedidos_sinteticos', tipo: 'r', dono: 'postgres', rls: true, force_rls: false, security_invoker: false }],
        politicas: [],
        acessos: papeis.map(papel => ({ schema: 'public', tabela: 'pedidos_sinteticos', papel,
            schema_usage: true, selecionar: false, selecionar_coluna: false,
            inserir: false, inserir_coluna: false, atualizar: false, atualizar_coluna: false,
            excluir: false, truncar: false, referenciar: false, criar_trigger: false,
            ignora_rls: papel === 'service_role' })),
        acl_tabelas: [], acl_colunas: [], funcoes: [], privilegios_padrao: [],
        gatilhos: [], dependencias_views: [], herancas: [], publicacoes: [], publicacao_tabelas: [],
        colunas: [], constraints: [], indices: [],
    };
}
function policy(s, extra = {}) {
    s.politicas.push({ schema: 'public', tabela: 'pedidos_sinteticos', nome: 'ampla',
        comando: '*', papeis: ['PUBLIC'], papeis_efetivos: ['anon', 'authenticated', 'service_role'],
        permissiva: true, usando: 'true', verificando: 'true', ...extra });
}
const codigos = s => analisarSnapshot(s, alvo).achados.map(a => a.codigo);

test('inventario vazio nao vira atestado de seguranca', () => {
    const s = snapshot(); s.relacoes = [];
    assert.throws(() => analisarSnapshot(s, alvo), /sem relacoes/);
});
test('projeto, ambiente e placeholders impedem analisar o alvo errado', () => {
    assert.throws(() => analisarSnapshot(snapshot(), { ...alvo, projeto: 'outro' }), /diferente/);
    assert.throws(() => analisarSnapshot(snapshot(), { ...alvo, ambiente: 'producao' }), /diferente/);
    const s = snapshot(); s.contexto.projeto = 'PREENCHER_PROJECT_REF';
    assert.throws(() => analisarSnapshot(s, { ...alvo, projeto: s.contexto.projeto }), /Preencha/);
});
test('recusa snapshots incompletos em vez de confundir ausente com false', () => {
    for (const alterar of [s => delete s.acl_colunas, s => delete s.acessos[0].selecionar_coluna,
        s => s.acessos.pop(), s => s.acessos.push({ ...s.acessos[0] }),
        s => { s.contexto.read_only = false; }, s => { s.contexto.coletado_em = 'invalido'; },
        s => { s.contexto.server_version_num = 130000; }, s => s.papeis.pop()]) {
        const s = snapshot(); alterar(s); assert.throws(() => analisarSnapshot(s, alvo));
    }
});
test('grant de coluna conta mesmo sem grant da tabela inteira', () => {
    const s = snapshot(); s.relacoes[0].rls = false; s.acessos[0].atualizar_coluna = true;
    assert.ok(codigos(s).includes('RLS_DESLIGADA_COM_GRANT'));
});
test('RLS desligada sem grant ou sem USAGE nao afirma alcance', () => {
    const s = snapshot(); s.relacoes[0].rls = false;
    assert.deepEqual(codigos(s), []);
    s.acessos[0].selecionar = true; s.acessos[0].schema_usage = false;
    assert.deepEqual(codigos(s), []);
});
test('policy PUBLIC com grant herdado entra na analise efetiva', () => {
    const s = snapshot(); s.acessos[0].atualizar = true; policy(s);
    assert.deepEqual(codigos(s), ['POLICY_AMPLA']);
});
test('policy de SELECT nao concede UPDATE', () => {
    const s = snapshot(); s.acessos[0].atualizar = true; policy(s, { comando: 'r' });
    assert.deepEqual(codigos(s), ['OPERACAO_SEM_POLICY_PERMISSIVA']);
});
test('policy restritiva nao e ignorada nem tratada como permissiva', () => {
    const s = snapshot(); s.acessos[0].selecionar = true; policy(s);
    policy(s, { nome: 'restringir', permissiva: false, usando: 'false' });
    assert.deepEqual(codigos(s), ['POLICY_AMPLA_COM_RESTRITIVA']);
    s.politicas.shift();
    assert.deepEqual(codigos(s), ['OPERACAO_SEM_POLICY_PERMISSIVA']);
});
test('INSERT usa WITH CHECK e UPDATE verifica estado resultante', () => {
    const s = snapshot(); s.acessos[0].inserir = true;
    policy(s, { usando: null, verificando: '(auth.uid() = owner_id)' });
    assert.deepEqual(codigos(s), []);
    s.acessos[0].atualizar = true;
    assert.deepEqual(codigos(s), []);
    s.politicas[0].verificando = null;
    assert.deepEqual(codigos(s), ['POLICY_AMPLA', 'POLICY_AMPLA']);
});
test('composicao complexa nao produz declaracao automatica de seguranca', () => {
    const s = snapshot(); s.acessos[0].selecionar = true;
    policy(s, { usando: '(auth.uid() IS NOT NULL OR true)', verificando: null });
    const r = analisarSnapshot(s, alvo);
    assert.equal(r.pronto_para_revogar, false);
    assert.ok(r.pendencias.some(p => p.includes('nao ha avaliacao simbolica')));
});
test('bypass em papel de cliente e visto, service_role nao gera falso incidente', () => {
    const s = snapshot(); s.acessos[0].selecionar = true; s.acessos[0].ignora_rls = true;
    s.acessos[2].selecionar = true;
    assert.deepEqual(codigos(s), ['BYPASS_RLS']);
});
test('views invoker diferem de views definer e materializadas', () => {
    const s = snapshot(); s.acessos[0].selecionar = true; s.relacoes[0].tipo = 'v';
    assert.deepEqual(codigos(s), ['RELACAO_SEM_RLS_DO_CHAMADOR']);
    s.relacoes[0].security_invoker = true;
    assert.deepEqual(codigos(s), []);
    s.relacoes[0].tipo = 'm';
    assert.deepEqual(codigos(s), ['RELACAO_SEM_RLS_DO_CHAMADOR']);
});
test('funcoes definer executaveis exigem revisao mesmo com search_path fixo', () => {
    const s = snapshot();
    s.funcoes.push({ schema: 'public', nome: 'operar', argumentos: 'pedido integer', security_definer: true,
        search_path: 'public', acessos: s.papeis.map(p => ({ papel: p.nome, executar: p.nome === 'anon', schema_usage: true })) });
    assert.deepEqual(codigos(s), ['DEFINER_EXECUTAVEL']);
    s.funcoes[0].acessos[0].schema_usage = false;
    assert.deepEqual(codigos(s), []);
    s.funcoes[0].acessos.pop();
    assert.throws(() => analisarSnapshot(s, alvo), /incompletos/);
});
test('aceita envelope da API, nao reproduz expressoes privadas e nunca libera revogacao', () => {
    const s = snapshot(); policy(s, { usando: "email = 'dado-privado-sintetico'" });
    const r = analisarSnapshot([{ auditoria_rls: JSON.stringify(s) }], alvo);
    assert.equal(r.pronto_para_revogar, false);
    assert.ok(!JSON.stringify(r).includes('dado-privado-sintetico'));
    assert.throws(() => analisarSnapshot([], alvo), /exatamente uma/);
});
test('CLI cria somente arquivo novo e nao divulga trecho de JSON invalido', () => {
    const dir = mkdtempSync(join(tmpdir(), 'imposition-rls-test-'));
    try {
        const entrada = join(dir, 'snapshot.json'), saida = join(dir, 'relatorio.json');
        writeFileSync(entrada, '\uFEFF' + JSON.stringify(snapshot()));
        const executar = () => spawnSync(process.execPath, [arquivoCLI, '--entrada', entrada,
            '--projeto', alvo.projeto, '--ambiente', alvo.ambiente, '--saida', saida], { encoding: 'utf8' });
        assert.equal(executar().status, 0);
        const anterior = readFileSync(saida, 'utf8');
        assert.equal(executar().status, 1);
        assert.equal(readFileSync(saida, 'utf8'), anterior);
        writeFileSync(entrada, '{"segredo-sintetico": INVALIDO');
        const erro = executar();
        assert.equal(erro.status, 1);
        assert.ok(!erro.stderr.includes('segredo-sintetico'));
        assert.ok(existsSync(saida));
    } finally {
        // Diretorio temporario criado neste teste; nenhum caminho de entrada e removido.
        assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
        assert.ok(basename(dir).startsWith('imposition-rls-test-'));
        rmSync(dir, { recursive: true, force: true });
    }
});
test('coletor usa transacao somente leitura e nao consulta tabelas de negocio', () => {
    const sql = readFileSync(new URL('../sql/auditoria_rls/01_metadados.sql', import.meta.url), 'utf8');
    const codigo = sql.replace(/--[^\n]*/g, '');
    assert.match(codigo, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
    assert.match(codigo, /SET LOCAL statement_timeout = '30s'/);
    assert.match(codigo, /SET LOCAL lock_timeout = '3s'/);
    assert.match(codigo, /ROLLBACK;\s*$/);
    assert.doesNotMatch(codigo, /\b(?:INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|CREATE\s+(?:TABLE|FUNCTION|POLICY)|ALTER\s+TABLE|DROP\s+|GRANT\s+|REVOKE\s+|COPY\s+)\b/i);
    assert.doesNotMatch(codigo, /\b(?:FROM|JOIN)\s+(?:public|auth|storage)\./i);
    assert.doesNotMatch(codigo, /pg_get_functiondef|pg_get_viewdef|SELECT\s+\*\s+FROM/i);
    assert.match(codigo, /has_any_column_privilege/);
    assert.match(codigo, /acldefault\('f', p.proowner\)/);
});
