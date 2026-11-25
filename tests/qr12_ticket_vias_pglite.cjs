const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createRequire } = require('node:module');

const modulo = process.env.PGLITE_MODULE || '@electric-sql/pglite';
const { PGlite } = require(modulo);
const { pgcrypto } = createRequire(require.resolve(modulo))('./contrib/pgcrypto.cjs');

const ler = arquivo => readFileSync(join(__dirname, '..', arquivo), 'utf8').replace(/\r\n/g, '\n');

async function testar() {
    const db = await PGlite.create({ extensions: { pgcrypto } });
    const escalar = async (consulta, argumentos) => Object.values((await db.query(consulta, argumentos)).rows[0])[0];
    const obter = pedido => escalar('SELECT public.producao_acesso_qr_contratos_obter($1)', [pedido]);
    const portal = (pedido, criar = false) => escalar(
        'SELECT public.ideal_control_portal($1,$2,$3)', [String(pedido), `ficticio-${pedido}`, criar],
    );
    const sql = nome => db.exec(ler(`sql/${nome}.sql`));
    const contrato = pedido => escalar('SELECT to_jsonb(c) FROM producao_acesso_qr_contratos c WHERE c.pedido=$1', [pedido]);

    try {
        for (const arquivo of [
            'tests/control_portal_fixture.sql',
            'sql/ideal_control_portal_piloto.sql',
            'tests/control_portal_qr_fixture.sql',
            'tests/control_portal_qr_baseline.sql',
            'sql/ideal_control_portal_emissao_automatica.sql',
            'sql/ideal_control_portal_todos_pedidos.sql',
            'sql/ideal_control_portal_ticket_vias.sql',
            'tests/fixtures/qr12_pre_camarote.sql',
            'sql/qr12_camarote_20261117.sql',
        ]) await db.exec(ler(arquivo));

        const preparacao = ler('sql/ideal_control_preparacao_nuvem.sql');
        await db.exec(preparacao.slice(preparacao.indexOf('CREATE TABLE public.producao_acesso_preparacoes'),
            preparacao.lastIndexOf('COMMIT;')));

        await db.exec(`
            INSERT INTO producao_numeracoes (id,tipo,ticket_qtd,elements) VALUES
                ('00000000-0000-4000-8000-000000000001','TICKET',2,
                    '[{"type":"QR_IDEAL","ticket_pos":2},{"type":"QR","ticket_pos":1}]'),
                ('00000000-0000-4000-8000-000000000002','TICKET',2,
                    '[{"type":"QR_IDEAL","ticket_pos":2},{"type":"QR_IDEAL"},{"type":"QR_IDEAL","ticket_pos":2}]'),
                ('00000000-0000-4000-8000-000000000003','TICKET',2,
                    '[{"type":"QR_IDEAL","ticket_pos":1},{"type":"QR_IDEAL","ticket_pos":3}]'),
                ('00000000-0000-4000-8000-000000000004','TICKET',2,
                    '[{"type":"QR_IDEAL","ticket_pos":null}]');
            INSERT INTO pedidos_modelos (id,id_int,nome_modelo,quantidade,amostra_num_id,status_impressao,numeracao_inicio) VALUES
                (100,10,'Emissão de uma via',5,'00000000-0000-4000-8000-000000000001','PENDENTE',11),
                (200,20,'Duas vias',1000,'00000000-0000-4000-8000-000000000002','PENDENTE',11),
                (300,30,'Via inválida',1000,'00000000-0000-4000-8000-000000000003','PENDENTE',1),
                (400,40,'Emissão pelo portal',1000,'00000000-0000-4000-8000-000000000002','IMPRESSO',1),
                (500,50,'Após reversão',1000,'00000000-0000-4000-8000-000000000002','PENDENTE',1),
                (600,60,'Via nula antiga',1,'00000000-0000-4000-8000-000000000004','PENDENTE',1),
                (700,70,'Via nula nova',1,'00000000-0000-4000-8000-000000000004','PENDENTE',1);
            INSERT INTO propostas VALUES (40,40,'EM PRODUCAO');
            INSERT INTO pedidos_links_cliente (numero_pedido,token,ativo) VALUES ('40','ficticio-40',true);
        `);

        const [antigo] = await obter(10);
        const [nuloLegado] = await obter(60);
        assert.equal(antigo.posicao, 2);
        await assert.rejects(obter(20), /QR v2 exige/);
        await assert.rejects(sql('qr12_ticket_vias_20261125'), /Preparar o esquema/);
        await db.exec('ROLLBACK');
        await sql('qr12_ticket_vias_schema_20261125');
        assert.deepEqual(await contrato(10), { ...antigo, posicoes: null });
        await assert.rejects(obter(20), /QR v2 exige/);

        const permissoes = `SELECT jsonb_object_agg(proname,proacl) FROM pg_proc WHERE oid IN (
            'public.producao_acesso_qr_contratos_obter(integer)'::regprocedure,
            'public.ideal_control_portal_reservar_qr(integer)'::regprocedure,
            'public.ideal_control_portal(text,text,boolean)'::regprocedure)`;
        const antes = await escalar(permissoes);
        await sql('qr12_ticket_vias_20261125');
        assert.deepEqual(await escalar(permissoes), antes);
        assert.deepEqual(await obter(10), [{ ...antigo, posicoes: null }]);
        assert.deepEqual(await obter(60), [{ ...nuloLegado, posicoes: null }]);
        await assert.rejects(obter(70), /posições de TICKET/);

        const [novo] = await obter(20);
        assert.equal(novo.quantidade, 1000);
        assert.equal(novo.capacidade, 2000);
        assert.equal(novo.posicao, 1);
        assert.deepEqual(novo.posicoes, [1, 2]);
        assert.deepEqual(await obter(20), [novo]);
        await assert.rejects(obter(30), /posições de TICKET/);
        assert.equal(await escalar('SELECT count(*)::int FROM producao_acesso_qr_reservas WHERE pedido=30'), 0);

        await db.exec('UPDATE pedidos_modelos SET numeracao_inicio=12 WHERE id=200');
        await assert.rejects(obter(20), /mudou após reservar/);
        assert.deepEqual(await contrato(20), novo);
        await db.exec('UPDATE pedidos_modelos SET numeracao_inicio=11 WHERE id=200');

        assert.equal((await portal(40)).estado, 'pronto');
        assert.equal(await escalar('SELECT count(*)::int FROM producao_acesso_qr_contratos WHERE pedido=40'), 0);
        const abertura = await portal(40, true);
        assert.equal(abertura.estado, 'preparando');
        const peloPortal = await contrato(40);
        assert.deepEqual(peloPortal.posicoes, [1, 2]);
        assert.equal(peloPortal.capacidade, 2000);
        assert.equal(await escalar('SELECT quantidade FROM producao_acesso_setores WHERE modelo_id=400'), 1000);
        assert.equal(await escalar(`SELECT count(*)::int FROM producao_acesso_qr_reservas a
            JOIN producao_acesso_qr_reservas b ON a.modelo < b.modelo AND a.faixa && b.faixa
            WHERE a.versao=2 AND b.versao=2`), 0);

        const setor = await escalar('SELECT id FROM producao_acesso_setores WHERE modelo_id=400');
        const estado = await escalar('SELECT producao_acesso_preparar_lote($1,40)', [abertura.evento_id]);
        const plano = JSON.stringify([{ modelo: 400, setor, quantidade: 2000 }]);
        assert.equal((await escalar('SELECT producao_acesso_preparar_lote($1,40,$2,$3)',
            [abertura.evento_id, estado.fonte_hash, plano])).total, 2000);
        const enviarLote = offset => escalar(`
            SELECT producao_acesso_preparar_lote($1,40,$2,NULL,$3,
                (SELECT jsonb_agg(jsonb_build_object('modelo',400,'numero',g,'hash',repeat(md5(g::text),2)) ORDER BY g)
                   FROM generate_series($3::int+1,$3::int+100) g))`,
            [abertura.evento_id, estado.fonte_hash, offset]);
        assert.equal((await enviarLote(0)).prontos, 100);
        assert.equal((await enviarLote(0)).prontos, 100);
        for (let offset = 100; offset < 1000; offset += 100) await enviarLote(offset);
        // Um recibo incompleto de um consumidor antigo não pode liberar o evento.
        await db.exec('UPDATE producao_acesso_pedidos SET publicado_em=now(),total_credenciais=1000 WHERE pedido_id_int=40');
        assert.equal((await portal(40)).estado, 'conferir_evento');
        await db.exec('UPDATE producao_acesso_pedidos SET publicado_em=NULL,total_credenciais=NULL WHERE pedido_id_int=40');
        for (let offset = 1000; offset < 1900; offset += 100) await enviarLote(offset);
        assert.equal((await enviarLote(1900)).concluida, true);
        assert.equal(await escalar('SELECT total_credenciais FROM producao_acesso_pedidos WHERE pedido_id_int=40'), 2000);
        assert.equal((await portal(40)).estado, 'evento_existente');

        await sql('qr12_ticket_vias_20261125_rollback');
        assert.deepEqual(await obter(20), [novo]);
        assert.equal((await portal(40)).estado, 'evento_existente');
        await assert.rejects(obter(50), /QR v2 exige/);
        assert.equal(await escalar('SELECT count(*)::int FROM producao_acesso_qr_reservas WHERE pedido=50'), 0);
        await db.exec(`
            UPDATE pedidos_modelos SET status_impressao='IMPRESSO' WHERE id=500;
            INSERT INTO propostas VALUES (50,50,'EM PRODUCAO');
            INSERT INTO pedidos_links_cliente (numero_pedido,token,ativo) VALUES ('50','ficticio-50',true);
        `);
        await assert.rejects(portal(50, true), /QR v2 exige/);
        assert.equal(await escalar('SELECT count(*)::int FROM producao_acesso_eventos WHERE id_cliente=50'), 0);
        await sql('qr12_ticket_vias_20261125');
        assert.equal((await portal(50, true)).estado, 'preparando');
        assert.deepEqual((await contrato(50)).posicoes, [1, 2]);
        assert.deepEqual(await obter(20), [novo]);
        assert.equal((await portal(40)).estado, 'evento_existente');
        console.log('OK: reserva, limites, contrato imutável, portal e reversão QR12 para TICKET com duas vias.');
    } finally {
        await db.close();
    }
}

testar().catch(erro => {
    console.error(erro);
    process.exitCode = 1;
});
