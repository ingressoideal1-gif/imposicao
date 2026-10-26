// PostgreSQL em memoria; sem rede, credenciais ou dados reais.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

(async () => {
    const db = new PGlite();
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
            CREATE TABLE public.pedidos_modelos (
            id integer PRIMARY KEY, id_int bigint DEFAULT 999, status_impressao text, acabamento_status text,
            created_at timestamptz, updated_at timestamptz, nota text);
            INSERT INTO pedidos_modelos(id,status_impressao) VALUES (1,'Aguardando');`);
        await db.exec(fs.readFileSync('sql/data_do_status_impresso.sql', 'utf8'));
        await db.exec(fs.readFileSync('sql/data_hora_status_paineis.sql', 'utf8'));
        const row = async (id = 1) => (await db.query('SELECT * FROM pedidos_modelos WHERE id=$1', [id])).rows[0];
        const refuse = async sql => assert.rejects(db.exec(sql), e => e.code === '23514');
        await db.exec("UPDATE pedidos_modelos SET status_impressao='Impresso' WHERE id=1");
        assert((await row()).status_impressao_em);
        await db.exec("UPDATE pedidos_modelos SET status_impressao='Aguardando' WHERE id=1");
        assert.equal((await row()).status_impressao_em, null); // reproduz a vulnerabilidade antiga
        await db.exec("INSERT INTO pedidos_modelos(id,status_impressao) VALUES(2,'Impresso'); UPDATE pedidos_modelos SET status_impressao_em=NULL WHERE id=2");
        const legacy = await row(2);
        await db.exec(fs.readFileSync('sql/impressao_permanente.sql', 'utf8'));
        assert.deepEqual(await row(2), legacy); // nao inventa horario para legado

        await db.exec("UPDATE pedidos_modelos SET status_impressao='Impresso',status_impressao_em='2000-01-01' WHERE id=1");
        const printed = await row();
        assert(printed.status_impressao_em);
        assert.equal(+printed.status_impressao_em, +printed.status_impressao_registrado_em);
        assert.notEqual(printed.status_impressao_em.getUTCFullYear(), 2000);
        for (const status of [null, '', 'Aguardando', 'PENDENTE', 'Corrigir Arte', 'Parcial']) {
            await assert.rejects(db.query('UPDATE pedidos_modelos SET status_impressao=$1 WHERE id=1', [status]), e => e.code === '23514');
            assert.deepEqual(await row(), printed);
        }
        for (const status of ['Impresso', 'IMPRESSO', ' impresso ']) {
            await db.query('UPDATE pedidos_modelos SET status_impressao=$1,status_impressao_em=NULL,status_impressao_registrado_em=NULL WHERE id=1', [status]);
            assert.deepEqual(await row(), printed);
        }
        await db.exec("UPDATE pedidos_modelos SET status_impressao_em='2099-01-01' WHERE id=1");
        assert.deepEqual(await row(), printed);
        await db.exec("UPDATE pedidos_modelos SET acabamento_status='Pronto',nota='acabamento independente' WHERE id=1");
        const finished = await row();
        assert.equal(finished.acabamento_status, 'Pronto');
        assert.equal(+finished.status_impressao_em, +printed.status_impressao_em);
        assert.equal(+finished.status_impressao_registrado_em, +printed.status_impressao_registrado_em);
        await refuse('DELETE FROM pedidos_modelos WHERE id=1');
        await refuse("INSERT INTO pedidos_modelos(id,status_impressao) VALUES(1,'Aguardando') ON CONFLICT(id) DO UPDATE SET status_impressao=EXCLUDED.status_impressao");
        assert.deepEqual(await row(), finished);
        await db.exec("UPDATE pedidos_modelos SET status_impressao='Impresso',nota='legado' WHERE id=2");
        assert.equal((await row(2)).status_impressao_em, null);
        await db.exec("INSERT INTO pedidos_modelos(id,status_impressao,status_impressao_em) VALUES(3,'Impresso','2000-01-01'),(4,'Aguardando','2000-01-01')");
        assert.notEqual((await row(3)).status_impressao_em.getUTCFullYear(), 2000);
        assert.equal((await row(4)).status_impressao_em, null);
        await db.exec("UPDATE pedidos_modelos SET status_impressao='Corrigir Arte' WHERE id=4");
        await refuse("UPDATE pedidos_modelos SET status_impressao='Aguardando' WHERE id IN (1,4)");
        assert.equal((await row(4)).status_impressao, 'Corrigir Arte'); // lote atomico
        await db.exec('DELETE FROM pedidos_modelos WHERE id=4');
        assert.equal(await row(4), undefined);
        const fn = (await db.query("SELECT prosecdef FROM pg_proc WHERE oid='public.carimba_status_impressao_em()'::regprocedure")).rows[0];
        assert.equal(fn.prosecdef, false);
        const rpc = 'SELECT * FROM public.retornar_impressao_aguardando($1,$2,$3)';
        for (const args of [[1,998,printed.status_impressao_registrado_em], [1,999,'2000-01-01']]) {
            await assert.rejects(db.query(rpc,args), e => e.code === '23514');
        }
        const returned = (await db.query(rpc,[1,999,printed.status_impressao_registrado_em])).rows[0];
        assert.equal(returned.status_impressao, 'Aguardando');
        assert.equal(+returned.status_impressao_em, +printed.status_impressao_em);
        assert.notEqual(+returned.status_impressao_registrado_em, +printed.status_impressao_registrado_em);
        assert.equal(returned.acabamento_status, 'Pronto');
        await assert.rejects(db.query(rpc,[1,999,printed.status_impressao_registrado_em]), e => e.code === '23514');
        await db.exec("UPDATE pedidos_modelos SET status_impressao_em=NULL WHERE id=1");
        assert.equal(+(await row()).status_impressao_em, +printed.status_impressao_em);
        await db.exec("UPDATE pedidos_modelos SET status_impressao='Impresso' WHERE id=1");
        assert.equal(+(await row()).status_impressao_em, +printed.status_impressao_em);
        await refuse("UPDATE pedidos_modelos SET status_impressao='Aguardando' WHERE id=1");
        // A RPC nao ignora permissoes/RLS e nao deixa autorizacao residual.
        await db.exec('ALTER TABLE pedidos_modelos ENABLE ROW LEVEL SECURITY; GRANT SELECT,UPDATE ON pedidos_modelos TO authenticated; SET ROLE authenticated');
        await assert.rejects(db.query(rpc,[1,999,(await row())?.status_impressao_registrado_em || null]), e => e.code === '23514');
        await db.exec('RESET ROLE');
        assert.equal((await row()).status_impressao, 'Impresso');
        console.log('OK: regressao bloqueada; retorno manual, hora preservada, concorrencia por versao, RLS, repeticao, acabamento, exclusao, upsert e lote atomico.');
    } finally {
        await db.close();
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
