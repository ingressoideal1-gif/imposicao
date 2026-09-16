// PostgreSQL WASM descartavel: nenhuma conexao, credencial ou dado real.
// Dependencia instalada separadamente, somente com autorizacao.
// node tests/pagamentos_rls_postgres.mjs CAMINHO_ABSOLUTO_DO_PGLITE/dist/index.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.ok(process.argv[2] && isAbsolute(process.argv[2]), 'Informe o modulo local PGlite por caminho absoluto.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const migration = readFileSync(new URL('../sql/auditoria_rls/04_pagamentos_sem_delete_anon.sql', import.meta.url), 'utf8');
const setup = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.pagamentos_v2 (id integer PRIMARY KEY, id_int integer, status text);
ALTER TABLE public.pagamentos_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY ampla ON public.pagamentos_v2 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
GRANT SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pagamentos_v2 TO anon, authenticated;
GRANT ALL ON public.pagamentos_v2 TO service_role;
INSERT INTO public.pagamentos_v2 VALUES (1,900001,'PAID'),(2,900001,'CANCELADO'),(3,900002,'A_VENCER');
`;
const revisar = `SET imposition.pagamentos_delete_anon_revisado = 'sim';`;
let total = 0;
let versao;
async function comBanco(nome, executar) {
    const db = new PGlite(); // Sem dataDir: memoria somente; sem socket ou rede.
    try {
        await db.waitReady;
        const servidor = (await db.query('SELECT current_user AS usuario, current_setting(\'server_version\') AS versao')).rows[0];
        assert.equal(servidor.usuario, 'postgres');
        versao = servidor.versao;
        await db.exec(setup);
        await executar(db);
        total++;
        console.log(`OK: ${nome}`);
    } finally { await db.close(); }
}
async function privilegio(db, papel, operacao) {
    return (await db.query(`SELECT has_table_privilege($1, 'public.pagamentos_v2', $2) AS permitido`, [papel, operacao])).rows[0].permitido;
}
async function estado(db) {
    return {
        colunas: (await db.query("SELECT attname, attacl::text FROM pg_attribute WHERE attrelid='public.pagamentos_v2'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum")).rows,
        dados: (await db.query('SELECT * FROM public.pagamentos_v2 ORDER BY id')).rows,
        policies: (await db.query("SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='pagamentos_v2' ORDER BY policyname")).rows,
        outros: (await db.query(`SELECT r.rolname, p.operacao, has_table_privilege(r.oid, 'public.pagamentos_v2', p.operacao) AS permitido
            FROM pg_roles r CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(operacao)
            WHERE r.rolname IN ('authenticated','service_role') ORDER BY 1,2`)).rows,
    };
}
async function deveAbortar(db, padrao) {
    await assert.rejects(() => db.exec(migration), padrao);
    await db.exec('ROLLBACK;');
}
async function comoPapel(db, papel, executar) {
    assert.ok(['anon','authenticated','service_role'].includes(papel));
    await db.exec(`BEGIN; SET LOCAL ROLE ${papel};`);
    try { await executar(); } finally { await db.exec('ROLLBACK;'); }
}

await comBanco('reproduz exclusao anon antes; bloqueia depois e preserva leitura/dados/policies/outros papeis', async db => {
    await comoPapel(db, 'anon', async () => {
        const excluido = await db.query('DELETE FROM public.pagamentos_v2 WHERE id=1 RETURNING id');
        assert.equal(excluido.rows.length, 1);
    });
    const antes = await estado(db);
    await db.exec(revisar);
    await db.exec(migration);
    assert.equal(await privilegio(db, 'anon', 'DELETE'), false);
    assert.deepEqual(await estado(db), antes);
    await comoPapel(db, 'anon', async () => {
        assert.deepEqual((await db.query("SELECT id_int,status FROM public.pagamentos_v2 WHERE status <> 'CANCELADO' ORDER BY id")).rows,
            [{ id_int: 900001, status: 'PAID' }, { id_int: 900002, status: 'A_VENCER' }]);
        await assert.rejects(() => db.query('DELETE FROM public.pagamentos_v2 WHERE id=1'), e => e.code === '42501');
    });
    for (const papel of ['authenticated','service_role']) await comoPapel(db, papel, async () => {
        assert.equal((await db.query('DELETE FROM public.pagamentos_v2 WHERE id=1 RETURNING id')).rows.length, 1);
    });
    assert.deepEqual(await estado(db), antes);
});
await comBanco('sem marcador de revisao nao altera privilegios', async db => {
    await deveAbortar(db, /pendente de revisao/);
    assert.equal(await privilegio(db, 'anon', 'DELETE'), true);
});
await comBanco('DELETE herdado de PUBLIC aborta e desfaz a revogacao direta', async db => {
    await db.exec('GRANT DELETE ON public.pagamentos_v2 TO PUBLIC;');
    await db.exec(revisar);
    await deveAbortar(db, /ainda herdado/);
    await db.exec('REVOKE DELETE ON public.pagamentos_v2 FROM PUBLIC;');
    assert.equal(await privilegio(db, 'anon', 'DELETE'), true);
});
await comBanco('DELETE herdado de outro papel aborta e preserva baseline', async db => {
    await db.exec('CREATE ROLE grupo_sintetico; GRANT DELETE ON public.pagamentos_v2 TO grupo_sintetico; GRANT grupo_sintetico TO anon;');
    await db.exec(revisar);
    await deveAbortar(db, /ainda herdado/);
    await db.exec('REVOKE grupo_sintetico FROM anon;');
    assert.equal(await privilegio(db, 'anon', 'DELETE'), true);
});
await comBanco('preserva INSERT UPDATE de coluna existentes sem impedir revogacao DELETE', async db => {
    await db.exec('GRANT INSERT(status), UPDATE(status) ON public.pagamentos_v2 TO anon, authenticated;');
    const antes = await estado(db);
    await db.exec(revisar);
    await db.exec(migration);
    assert.equal(await privilegio(db, 'anon', 'DELETE'), false);
    assert.deepEqual(await estado(db), antes);
    await comoPapel(db, 'anon', async () => {
        assert.equal((await db.query("UPDATE public.pagamentos_v2 SET status='SINTETICO' WHERE id=1 RETURNING id")).rows.length, 1);
    });
    assert.deepEqual(await estado(db), antes);
});
await comBanco('grant inesperado de UPDATE na tabela impede aplicacao', async db => {
    await db.exec('GRANT UPDATE ON public.pagamentos_v2 TO anon;');
    await db.exec(revisar);
    await deveAbortar(db, /Privilegios anon divergentes/);
    assert.equal(await privilegio(db, 'anon', 'DELETE'), true);
});
await comBanco('RLS desligada impede aplicacao', async db => {
    await db.exec('ALTER TABLE public.pagamentos_v2 DISABLE ROW LEVEL SECURITY;');
    await db.exec(revisar);
    await deveAbortar(db, /Tabela, dono ou RLS/);
    assert.equal(await privilegio(db, 'anon', 'DELETE'), true);
});
await comBanco('papel com BYPASSRLS impede aplicacao', async db => {
    await db.exec('ALTER ROLE anon BYPASSRLS;');
    await db.exec(revisar);
    await deveAbortar(db, /privilegio inesperado/);
    assert.equal(await privilegio(db, 'anon', 'DELETE'), true);
});
await comBanco('reaplicacao exige novo baseline sem reabrir a exclusao', async db => {
    await db.exec(revisar);
    await db.exec(migration);
    await deveAbortar(db, /Privilegios anon divergentes/);
    assert.equal(await privilegio(db, 'anon', 'DELETE'), false);
});
console.log(JSON.stringify({ testes: total, postgres: versao, dados: 'sinteticos', ambiente: 'memoria PGlite', rede: false }));
