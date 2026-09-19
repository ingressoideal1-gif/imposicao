// Exclusivamente PostgreSQL em memória. Nenhuma conexão remota.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const raiz = path.resolve(__dirname, '..');
const novo = { recebedor: 'Pessoa Teste', cpf_recebedor: '52998224725', cep: '01001000',
    endereco: 'Rua de teste', numero: '10', complemento: '', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP' };
async function main() {
    const db = await PGlite.create();
    try {
        const fixture = fs.readFileSync(path.join(__dirname, 'portal_persistencia_sql.sql'), 'utf8');
        await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;' + fixture.slice(fixture.indexOf('CREATE TABLE public.pedidos_links_cliente'), fixture.indexOf('-- Substitui somente')));
        await db.exec(`
            CREATE TABLE propostas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_int bigint UNIQUE NOT NULL,
                id_cliente integer, id_faturado integer, id_endereco_ent text, valor_total numeric DEFAULT 100);
            CREATE TABLE enderecos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_cliente integer NOT NULL,
                tipo_endereco text, obs text, data_criacao timestamp DEFAULT now(), recebedor text, cpf_recebedor text, cep text, endereco text, numero text,
                complemento text, bairro text, cidade text, uf text);
            CREATE FUNCTION public.link_cliente_pedido(text,text) RETURNS jsonb LANGUAGE sql AS $$
                SELECT jsonb_build_object('pedido',jsonb_build_object('frete_escolhido','PAC'),
                    'cliente',jsonb_build_object('documento','00000000000000'),
                    'endereco', CASE WHEN e.id IS NULL THEN 'null'::jsonb
                      ELSE (to_jsonb(e) - ARRAY['id','id_cliente','tipo_endereco','obs','data_criacao']) || '{"do_cadastro":false}'::jsonb END)
                FROM propostas p LEFT JOIN enderecos e ON e.id::text=p.id_endereco_ent WHERE p.id_int=$1::bigint
            $$;
            INSERT INTO propostas(id_int,id_cliente) VALUES (123,1),(456,1);
            INSERT INTO pedidos_links_cliente VALUES ('00000000-0000-0000-0000-000000000001','123','teste',true,'vibe_123','123','Dados Pendentes');
            INSERT INTO pedidos_modelos VALUES (1,123,'APROVADA_CLIENTE');
            INSERT INTO pedidos_artes VALUES ('00000000-0000-0000-0000-000000000001',123,'Dados Pendentes','',
                '{"confirmacoes_portal":{"entrega":null,"faturamento":true,"selo":"","finalizado":false}}',now());
        `);
        for (const arquivo of ['link_cliente_salvar_entrega.sql', 'link_cliente_finalizar.sql'])
            await db.exec(fs.readFileSync(path.join(raiz, 'sql', arquivo), 'utf8'));
        const salvar = (valor = novo, anterior = null, token = 'teste') => db.query(
            'SELECT link_cliente_salvar_entrega($1,$2,$3::jsonb,$4::jsonb) AS recibo', ['123',token,JSON.stringify(valor),JSON.stringify(anterior)]);
        await assert.rejects(salvar(novo, null, 'invalido'));
        await assert.rejects(salvar({ ...novo, cpf_recebedor: '11111111111' }));
        await assert.rejects(salvar({ ...novo, cpf_recebedor: '11222333000182' }));
        await assert.rejects(salvar({ ...novo, cpf_recebedor: '11111111111111' }));
        await assert.rejects(salvar({ ...novo, numero: '' }));
        await assert.rejects(salvar({ ...novo, cep: '123' }));
        await db.exec('BEGIN');
        const comCnpj = { ...novo, cpf_recebedor: '11222333000181', numero: '11' };
        const cnpj = await salvar(comCnpj);
        assert.equal(cnpj.rows[0].recibo.endereco.cpf_recebedor, '11222333000181');
        await db.exec('ROLLBACK');
        await db.exec('SET ROLE anon');
        const { rows } = await salvar();
        await db.exec('RESET ROLE');
        assert.deepEqual(rows[0].recibo.endereco, { ...novo, do_cadastro: false });
        const atual = rows[0].recibo.endereco;
        await salvar(); // Resposta perdida: retry com snapshot antigo não duplica.
        assert.equal((await db.query('SELECT count(*)::int AS n FROM enderecos')).rows[0].n, 1);
        assert.equal((await db.query('SELECT id_endereco_ent FROM propostas WHERE id_int=456')).rows[0].id_endereco_ent, null);
        // Executa o bloco real de escolha do cadastro e da nota na nova revisão.
        const leitura = fs.readFileSync(path.join(raiz,'sql/link_cliente_pedido_enderecos_portal.sql'),'utf8');
        const selecao = leitura.slice(leitura.indexOf('    IF v_end.id IS NULL AND v_prop.id_cliente'),
            leitura.indexOf('    -- O endereço da própria gráfica'));
        const verificarAlternativa = esperado => db.exec(`DO $$ DECLARE
            v_prop propostas%ROWTYPE; v_end enderecos%ROWTYPE; v_end_fat enderecos%ROWTYPE;
            v_end_do_cadastro boolean := false;
            BEGIN SELECT * INTO v_prop FROM propostas WHERE id_int=456;
            ${selecao}
            IF v_end.id IS DISTINCT FROM ${esperado} OR v_end_fat.id IS DISTINCT FROM ${esperado}
            THEN RAISE EXCEPTION 'endereço exclusivo alterou cadastro/nota'; END IF; END $$;`);
        await verificarAlternativa('NULL::uuid');
        await db.exec(`INSERT INTO enderecos(id,id_cliente,endereco) VALUES
            ('00000000-0000-0000-0000-000000000099',1,'Cadastro original')`);
        await verificarAlternativa("'00000000-0000-0000-0000-000000000099'::uuid");
        await db.exec("DELETE FROM enderecos WHERE id='00000000-0000-0000-0000-000000000099'");
        await assert.rejects(salvar({ ...novo, numero: '20' }, null), /endereço mudou/);
        // Falha tardia deve desfazer inclusive o INSERT do endereço.
        await db.exec(`CREATE FUNCTION alterar_total() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN NEW.valor_total:=999; RETURN NEW; END $$;
            CREATE TRIGGER teste_total BEFORE UPDATE ON propostas FOR EACH ROW EXECUTE FUNCTION alterar_total();`);
        await assert.rejects(salvar({ ...novo, numero: '20' }, atual), /outros dados/);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM enderecos')).rows[0].n, 1);
        assert.equal((await db.query('SELECT valor_total FROM propostas WHERE id_int=123')).rows[0].valor_total, '100');
        await db.exec('DROP TRIGGER teste_total ON propostas');
        // Simula a confirmação que só ocorre depois de salvar o endereço.
        await db.exec(`UPDATE pedidos_artes SET entrega_dados='APROVADO',
            observacoes='{"confirmacoes_portal":{"entrega":true,"faturamento":true,"selo":"APROVADO","finalizado":false}}' WHERE id_int=123`);
        const repeticaoConfirmada = await salvar();
        assert.equal(repeticaoConfirmada.rows[0].recibo.ok, true, 'repetição idêntica recebe recibo mesmo após confirmar');
        assert.equal((await db.query('SELECT count(*)::int AS n FROM enderecos')).rows[0].n, 1);
        await assert.rejects(salvar({ ...novo, numero: '20' }, atual), /use Alterar/);
        const fim = await db.query(`SELECT link_cliente_finalizar('123','teste',
            '{"entrega":true,"faturamento":true,"textoEntrega":"","textoFaturamento":""}') AS r`);
        assert.equal(fim.rows[0].r.finalizado, true);
        assert.equal((await db.query('SELECT status_arte FROM pedidos_links_cliente')).rows[0].status_arte, 'APROVADO');
        console.log('OK: SQL em memória — autenticação, CPF/CNPJ, campos, isolamento, repetição, conflito, rollback e finalização integrada.');
    } finally { await db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
