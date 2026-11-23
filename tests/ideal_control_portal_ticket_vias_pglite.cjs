const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

const sql = name => fs.readFileSync(path.join(__dirname, '..', 'sql', name), 'utf8');

async function testarPortal() {
    const db = await PGlite.create();
    try {
        await db.exec(`
            CREATE ROLE anon;
            CREATE ROLE authenticated;
            CREATE ROLE service_role;
            CREATE TABLE propostas(id_int int, id_cliente int, status_interno text);
            CREATE TABLE pedidos_links_cliente(id int, numero_pedido text, token text, ativo boolean);
            CREATE TABLE pedidos_modelos(id int, id_int int, nome_modelo text, quantidade int,
                status_impressao text, amostra_num_id uuid);
            CREATE TABLE producao_numeracoes(id uuid, tipo text, elements jsonb);
            CREATE TABLE producao_acesso_qr_contratos(pedido int, modelo int);
            CREATE TABLE producao_acesso_pedidos(id uuid, pedido_id_int int, evento_id uuid,
                status text, qr_revogado_em timestamptz, publicado_em timestamptz, total_credenciais int);
            CREATE TABLE producao_acesso_eventos(id uuid primary key, id_cliente int, status text);
            CREATE TABLE producao_acesso_setores(id uuid, pedido_id_int int, evento_id uuid,
                modelo_id int, status text);
            CREATE TABLE producao_acesso_credenciais(pedido_id_int int, modelo_id int,
                numero int, evento_id uuid, setor_id uuid);
            CREATE TABLE producao_acesso_convites_evento(id uuid primary key, evento_id uuid,
                criado_por uuid not null);
        `);
        await db.exec(sql('ideal_control_portal_piloto.sql'));
        await db.exec(`
            DO $$
            DECLARE e uuid := gen_random_uuid(); s uuid := gen_random_uuid(); n uuid := gen_random_uuid();
            BEGIN
                UPDATE ideal_control_portal_config SET habilitado=true;
                INSERT INTO ideal_control_portal_pedidos VALUES(123,true);
                INSERT INTO propostas VALUES(123,456,'IMPRESSO');
                INSERT INTO pedidos_links_cliente VALUES(1,'123','token-sintetico',true);
                INSERT INTO producao_numeracoes VALUES(n,'TICKET','[
                    {"type":"QR","ticket_pos":2},{"type":"QR","ticket_pos":1},
                    {"type":"BARCODE","ticket_pos":2},{"type":"QR","source":"database","ticket_pos":3},
                    {"type":"QR","fixed":true,"ticket_pos":4}
                ]');
                INSERT INTO pedidos_modelos VALUES(789,123,'Modelo',2,'IMPRESSO',n);
                INSERT INTO producao_acesso_eventos VALUES(e,456,'ativo');
                INSERT INTO producao_acesso_pedidos VALUES(gen_random_uuid(),123,e,'ativo',NULL,now(),2);
                INSERT INTO producao_acesso_setores VALUES(s,123,e,789,'ativo');
                INSERT INTO producao_acesso_credenciais VALUES(123,789,1,e,s),(123,789,2,e,s);
            END $$;
        `);
        async function estado() {
            const { rows } = await db.query("SELECT ideal_control_portal('123','token-sintetico',false)->>'estado' AS estado");
            return rows[0].estado;
        }
        async function adicionarCredencial(numero) {
            await db.query(`
                INSERT INTO producao_acesso_credenciais
                    SELECT pedido_id_int, modelo_id, $1, evento_id, setor_id
                    FROM producao_acesso_credenciais WHERE numero=1
            `, [numero]);
        }
        assert.equal(await estado(), 'evento_existente');
        await db.exec(sql('ideal_control_portal_ticket_vias.sql'));
        assert.equal(await estado(), 'evento_existente');
        await adicionarCredencial(3);
        assert.equal(await estado(), 'conferir_evento');
        await adicionarCredencial(4);
        await db.exec('UPDATE producao_acesso_pedidos SET total_credenciais=4 WHERE pedido_id_int=123');
        assert.equal(await estado(), 'evento_existente');
        await db.exec('UPDATE producao_acesso_credenciais SET numero=5 WHERE numero=4');
        assert.equal(await estado(), 'conferir_evento');
        const { rows } = await db.query(`
            SELECT has_function_privilege('anon','ideal_control_portal(text,text,boolean)','EXECUTE') AS anon,
                has_function_privilege('authenticated','ideal_control_portal(text,text,boolean)','EXECUTE') AS usuario,
                has_function_privilege('service_role','ideal_control_portal(text,text,boolean)','EXECUTE') AS servidor
        `);
        assert.deepEqual(rows[0], { anon: false, usuario: false, servidor: true });
        console.log('OK: Ideal Control valida legado, Ticket completo, publicação parcial, ordinal ausente e permissões.');
    } finally {
        await db.close();
    }
}

testarPortal().catch(erro => {
    console.error(erro);
    process.exitCode = 1;
});
