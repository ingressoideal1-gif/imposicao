// PostgreSQL descartavel em memoria. Nenhuma conexao com banco real.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async () => {
    const db = await PGlite.create();
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
            CREATE TABLE propostas(id_int bigint PRIMARY KEY, vendedor text);
            CREATE TABLE pedidos_modelos(id bigint PRIMARY KEY,id_int bigint,status_arte text);
            CREATE TABLE pedidos_artes(id bigint PRIMARY KEY,id_int bigint,status text,designer_nome text,created_at timestamptz DEFAULT now());
            INSERT INTO propostas VALUES(1,'Atendente A'),(2,'Atendente B');
            INSERT INTO pedidos_artes VALUES(1,1,'Em Arte','Designer A',now()),(2,2,'Em Arte','Designer B',now());
            INSERT INTO pedidos_modelos VALUES(1,1,'REPROVADA_CLIENTE'),(2,1,'PRONTO'),(3,2,'PRONTO');
            GRANT SELECT ON propostas TO authenticated;
            ALTER TABLE propostas ENABLE ROW LEVEL SECURITY;
            CREATE POLICY carteira ON propostas FOR SELECT TO authenticated USING(id_int=1);`);
        await db.exec(fs.readFileSync('sql/dashboard_arte_reprovacoes_preflight.sql','utf8'));
        await db.exec(fs.readFileSync('sql/dashboard_arte_reprovacoes.sql','utf8'));
        await db.exec(fs.readFileSync('sql/dashboard_arte_reprovacoes_verificar.sql','utf8'));
        const rows = async () => (await db.query('SELECT * FROM imposition_reprovacoes_arte ORDER BY id')).rows;
        assert.equal((await rows()).length,0,'nenhum historico inventado na implantacao');
        assert((await db.query('SELECT iniciado_em FROM imposition_reprovacoes_inicio')).rows[0].iniciado_em);
        const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
        // Lote em transacoes distintas, como as chamadas REST do painel.
        for (const id of [1,2]) await db.query('UPDATE pedidos_modelos SET status_arte=$1,reprovacao_acao=$2 WHERE id=$3',['REPROVADA_CLIENTE',a,id]);
        assert.equal((await rows()).length,1,'varios modelos, uma acao do pedido');
        await db.query('UPDATE pedidos_artes SET status=$1,reprovacao_acao=$2 WHERE id=1',['Em Alteração',a]);
        assert.equal((await rows()).length,1,'consolidacao com mesmo identificador nao duplica');
        await db.exec("UPDATE pedidos_modelos SET status_arte='PRONTO' WHERE id=1");
        await db.query('UPDATE pedidos_modelos SET status_arte=$1,reprovacao_acao=$2 WHERE id=1',['REPROVADA_CLIENTE',b]);
        assert.equal((await rows()).length,2,'nova reprovacao do mesmo pedido soma');
        await db.exec("UPDATE propostas SET vendedor='Atendente C' WHERE id_int=1");
        assert.equal((await rows())[0].atendente,'Atendente A','carteira preservada na ocorrencia');
        await db.query('UPDATE pedidos_modelos SET status_arte=$1,reprovacao_acao=$2 WHERE id=3',['REPROVADA_CLIENTE',a]);
        assert.equal((await rows()).length,3,'identidade inclui o pedido');
        await db.exec('BEGIN');
        await db.query('UPDATE pedidos_artes SET status=$1,reprovacao_acao=$2 WHERE id=2',['Em Alteração',b]);
        await db.exec('ROLLBACK');
        assert.equal((await rows()).length,3,'rollback do status tambem desfaz evento');
        await assert.rejects(db.query('UPDATE pedidos_modelos SET status_arte=$1,reprovacao_acao=$2 WHERE id=2',['PRONTO',b]));
        assert.equal((await rows()).length,3,'falha nao deixa evento');
        await db.exec('SET ROLE authenticated');
        assert.equal((await rows()).length,2,'RLS acompanha pedidos visiveis');
        await assert.rejects(db.exec('DELETE FROM imposition_reprovacoes_arte'));
        await assert.rejects(db.exec("UPDATE imposition_reprovacoes_inicio SET iniciado_em=now()"));
        await assert.rejects(db.exec(`INSERT INTO imposition_reprovacoes_arte(pedido,acao,atendente,designer) VALUES(1,'${a}','x','x')`));
        await db.exec('RESET ROLE; SET ROLE anon');
        await assert.rejects(rows());
        await db.exec('RESET ROLE');
        await db.exec(fs.readFileSync('sql/dashboard_arte_reprovacoes_rollback.sql','utf8'));
        await db.query('UPDATE pedidos_artes SET status=$1,reprovacao_acao=$2 WHERE id=2',['Em Alteração',b]);
        assert.equal((await rows()).length,3,'rollback operacional preserva historico e desliga captura');
        console.log('OK: baseline, lote entre transacoes, repeticao, carteira historica, rollback e RLS.');
    } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
