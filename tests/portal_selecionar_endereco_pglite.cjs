// PostgreSQL em memória, com dados sintéticos e sem conexões de rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

const sql = nome => fs.readFileSync(path.join(__dirname, '..', 'sql', nome), 'utf8');
const migracao = 'revisao_vibe/20261125_portal_selecionar_endereco';
const principal = '00000000-0000-0000-0000-000000000001';
const alternativo = '00000000-0000-0000-0000-000000000002';
const exclusivo = '00000000-0000-0000-0000-000000000003';
const faturamento = '00000000-0000-0000-0000-000000000004';
const campos = ['recebedor', 'cpf_recebedor', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
const novo = {
    recebedor: 'Recebedor do pedido', cpf_recebedor: '52998224725', cep: '01001000',
    endereco: 'Rua de Teste', numero: '30', complemento: '',
    bairro: 'Centro', cidade: 'São Paulo', uf: 'SP'
};

const schema = `
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE pedidos_links_cliente (
        id uuid DEFAULT gen_random_uuid(), numero_pedido text, token text,
        ativo boolean, id_int bigint, os_id text, status_arte text
    );
    CREATE TABLE pedidos_modelos (id int, id_int bigint);
    CREATE TABLE pedidos_artes (
        id int, id_int bigint, created_at timestamp, entrega_dados text, observacoes jsonb
    );
    CREATE TABLE propostas (
        id_int bigint PRIMARY KEY, id_cliente int, id_faturado int, id_endereco_ent text,
        cliente text, valor_total numeric DEFAULT 100, valor_frete numeric DEFAULT 5,
        frete_escolhido text DEFAULT 'PAC', modalidade_frete text, texto_whatsapp text,
        volume numeric, vendedor text, updated_at timestamp
    );
    CREATE TABLE enderecos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_cliente int, tipo_endereco text,
        obs text, data_criacao timestamp DEFAULT now(), recebedor text, cpf_recebedor text,
        cep text, endereco text, numero text, complemento text, bairro text, cidade text, uf text,
        ie_recebedor text
    );
    CREATE TABLE clientes (
        id int, id_cliente int PRIMARY KEY, nome text, fantasia text, documento text,
        ins_estadual text, email_financeiro text, email_contato text, email text,
        whatsapp_1 text, telefone_fixo text
    );
    CREATE TABLE clientes_socios (id int, id_cliente_principal int, id_cliente_socio int, tipo_relacao text);
    CREATE TABLE clientes_faturamento_portal (id_cliente_titular int, id_cliente_faturamento int);
    CREATE TABLE empresas (
        id int, empresa text, nome_fantasia text, logradouro text, numero text, complemento text, bairro text,
        municipio text, uf text, cep text, telefone_nfse text, telefone_nfe text
    );
    CREATE TABLE propostas_os (
        id uuid, id_int bigint, data_termino timestamp, codigo_rastreamento text,
        link_pagamento text, forma_pagamento text, status_pagamento text
    );
    CREATE TABLE cotacao_frete (
        id uuid, id_int bigint, escolhido boolean, created_at timestamp, servico text, prazo text, valor numeric
    );
    CREATE TABLE produtos_proposta (id bigint, id_int bigint, id_produto bigint, nome_produto text, modelo_descri text, qtd numeric, valor_unt numeric, fixo numeric, valor_sub_total numeric);
    CREATE TABLE produtos (id_produto bigint, prazo text);
    CREATE TABLE pagamentos_v2 (id_int bigint, id_pagamento text, tipo_cobranca text, status text, valor numeric, vencimento date, url_cobranca text, created_at timestamp);

    INSERT INTO clientes (id,id_cliente,nome,documento) VALUES
        (1,1,'Titular sintético','11222333000181'),
        (2,2,'Faturado sintético','00000000000191');
    INSERT INTO enderecos (id,id_cliente,tipo_endereco,obs,recebedor,cpf_recebedor,cep,endereco,numero,complemento,bairro,cidade,uf)
    VALUES
        ('${principal}',1,'PRINCIPAL',NULL,'Recebedor principal','529.982.247-25','01001-000','Rua de Teste','10',NULL,'Centro','São Paulo','SP'),
        ('${alternativo}',1,'ENTREGA',NULL,'Recebedor alternativo','11.222.333/0001-81','01001-000','Rua de Teste','10',NULL,'Centro','São Paulo','SP'),
        ('${exclusivo}',1,'ENTREGA','portal-entrega-pedido:505','Recebedor anterior','52998224725','01001000','Rua de Teste','20','','Centro','São Paulo','SP'),
        ('${faturamento}',2,'PRINCIPAL',NULL,'Cadastro fiscal','00000000000191','01001000','Rua de Faturamento','10','','Centro','São Paulo','SP');

    INSERT INTO propostas (id_int,id_cliente,id_faturado,id_endereco_ent) VALUES
        (101,1,2,NULL),(202,1,2,NULL),(303,1,2,'${principal}'),(404,1,2,NULL),
        (505,1,2,'${exclusivo}'),(606,1,2,'${principal}');
    UPDATE propostas SET frete_escolhido = 'RETIRADA' WHERE id_int = 404;
    INSERT INTO pedidos_links_cliente (numero_pedido,token,ativo,id_int)
        SELECT id_int::text, 'teste-' || id_int, true, id_int FROM propostas;
    INSERT INTO pedidos_artes (id,id_int,observacoes)
        SELECT id_int,id_int,'{}' FROM propostas;
    INSERT INTO pedidos_modelos (id,id_int)
        SELECT id_int,id_int FROM propostas;

    CREATE FUNCTION fn_preencher_dados_recebedor_endereco() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        NEW.recebedor := 'Titular sintético';
        NEW.cpf_recebedor := '11222333000181';
        NEW.ie_recebedor := 'IE sintética';
        RETURN NEW;
    END $$;
    CREATE TRIGGER trg_preencher_dados_recebedor_endereco
        BEFORE INSERT ON enderecos FOR EACH ROW EXECUTE FUNCTION fn_preencher_dados_recebedor_endereco();
`;

async function instalarBase(db) {
    await db.exec(schema);
    const leitura = sql('link_cliente_nome_fantasia_20260920.sql');
    await db.exec(leitura.slice(leitura.indexOf('CREATE OR REPLACE FUNCTION'), leitura.lastIndexOf('COMMIT;')));
    await db.exec(`
        REVOKE ALL ON FUNCTION link_cliente_pedido(text,text) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION link_cliente_pedido(text,text) TO anon, authenticated;
    `);
    const revisao = sql('revisao_vibe/20260923_entrega_preservar_recebedor.up.sql');
    const linhaOriginal = revisao.split('$alvo$')[1];
    const linhaNova = revisao.split('$novo$')[1];
    const gravacao = sql('link_cliente_salvar_entrega.sql');
    assert.ok(gravacao.includes(linhaOriginal));
    await db.exec(gravacao.replace(linhaOriginal, linhaNova));
}

async function main() {
    const db = await PGlite.create();
    try {
        await instalarBase(db);
        const valor = async (consulta, params) => (await db.query(consulta, params)).rows[0].valor;
        const contar = () => valor('SELECT count(*)::int AS valor FROM enderecos');
        const enderecosExistentes = () => valor('SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) AS valor FROM enderecos e');
        const vinculo = pedido => valor('SELECT id_endereco_ent AS valor FROM propostas WHERE id_int = $1', [pedido]);
        const comoCliente = async (consulta, params, papel = 'anon') => {
            await db.exec(papel === 'anon' ? 'SET ROLE anon' : 'SET ROLE authenticated');
            try { return await valor(consulta, params); }
            finally { await db.exec('RESET ROLE'); }
        };
        const ler = (pedido, token = 'teste-' + pedido) =>
            comoCliente('SELECT link_cliente_pedido($1,$2) AS valor', [String(pedido), token]);
        const snapshot = endereco => Object.fromEntries(campos.map(campo => [campo, endereco[campo]]));
        const definir = (pedido, acao, id, endereco, anterior, token = 'teste-' + pedido) => comoCliente(
            'SELECT link_cliente_definir_endereco_entrega($1,$2,$3,$4,$5::jsonb,$6::jsonb) AS valor',
            [String(pedido), token, acao, id, JSON.stringify(endereco), JSON.stringify(anterior)]
        );
        const gravacaoLegada = (papel, pedido, endereco, anterior) => comoCliente(
            'SELECT link_cliente_salvar_entrega($1,$2,$3::jsonb,$4::jsonb) AS valor',
            [String(pedido), 'teste-' + pedido, JSON.stringify(endereco), JSON.stringify(anterior)], papel
        );

        const antes = await ler(101);
        const definicaoLeitura = await valor("SELECT pg_get_functiondef('link_cliente_pedido(text,text)'::regprocedure) AS valor");
        const cadastroOriginal = await enderecosExistentes();
        assert.equal(await contar(), 4);
        await db.exec(sql(migracao + '.up.sql'));
        const enderecoLegado = (await ler(505)).endereco;
        for (const papel of ['anon', 'authenticated']) {
            const recibo = await gravacaoLegada(papel, 505, snapshot(enderecoLegado), enderecoLegado);
            assert.equal(recibo.ok, true);
        }
        assert.deepEqual(await enderecosExistentes(), cadastroOriginal);
        await db.exec(sql(migracao + '.down.sql'));
        assert.equal(await valor("SELECT pg_get_functiondef('link_cliente_pedido(text,text)'::regprocedure) AS valor"), definicaoLeitura);
        assert.equal((await gravacaoLegada('anon', 505, snapshot(enderecoLegado), enderecoLegado)).ok, true);
        await db.exec(sql(migracao + '.up.sql'));

        const portal = await ler(101);
        const opcao = portal.enderecos_entrega.find(endereco => endereco.id === alternativo);
        assert.equal(portal.endereco_entrega_id, principal);
        assert.equal(portal.endereco.do_cadastro, true);
        assert.deepEqual(portal.enderecos_entrega.map(endereco => endereco.id), [principal, alternativo]);
        assert.deepEqual(portal.endereco_faturamento, antes.endereco_faturamento);
        assert.equal(await ler(101, 'token-vencido'), null);
        await assert.rejects(definir(101, 'selecionar', alternativo, snapshot(opcao), portal.endereco, 'token-vencido'), { code: 'P0002' });
        const enderecoFiscal = cadastroOriginal.find(endereco => endereco.id === faturamento);
        const enderecoExclusivo = cadastroOriginal.find(endereco => endereco.id === exclusivo);
        await assert.rejects(definir(101, 'selecionar', faturamento, snapshot(enderecoFiscal), portal.endereco), /indisponível/);
        await assert.rejects(definir(101, 'selecionar', exclusivo, snapshot(enderecoExclusivo), portal.endereco), /indisponível/);
        await assert.rejects(definir(101, 'selecionar', alternativo, { ...snapshot(opcao), numero: '99' }, portal.endereco), /mudou/);
        await assert.rejects(definir(101, 'confirmar', alternativo, snapshot(opcao), portal.endereco), /mudou/);
        assert.equal(await vinculo(101), null);
        assert.equal(await contar(), 4);

        const selecao = await definir(101, 'selecionar', alternativo, snapshot(opcao), portal.endereco);
        assert.equal(selecao.ok, true);
        assert.equal(selecao.numero, '101');
        assert.equal(selecao.endereco_id, alternativo);
        assert.deepEqual(snapshot(selecao.endereco), snapshot(opcao));
        assert.equal(await vinculo(101), alternativo);
        assert.equal((await ler(101)).endereco_entrega_id, alternativo);
        assert.equal(await contar(), 4);
        const repeticaoSelecao = await definir(101, 'selecionar', alternativo, snapshot(opcao), portal.endereco);
        assert.equal(repeticaoSelecao.endereco_id, alternativo);
        await assert.rejects(definir(101, 'selecionar', principal, snapshot(portal.endereco), portal.endereco), /mudou/);
        assert.equal(await vinculo(101), alternativo);

        const pedidoComFallback = await ler(202);
        const confirmacao = await definir(202, 'confirmar', principal, snapshot(pedidoComFallback.endereco), pedidoComFallback.endereco);
        assert.equal(confirmacao.endereco_id, principal);
        assert.equal(await vinculo(202), principal);
        const pedidoJaVinculado = await ler(202);
        const compartilhado = await definir(202, 'selecionar', alternativo, snapshot(opcao), pedidoJaVinculado.endereco);
        assert.equal(compartilhado.endereco_id, alternativo);
        assert.equal(await vinculo(202), await vinculo(101));
        const pedidoExclusivo = await ler(505);
        assert.equal((await definir(505, 'confirmar', exclusivo, snapshot(pedidoExclusivo.endereco), pedidoExclusivo.endereco)).endereco_id, exclusivo);
        const retirada = await ler(404);
        await assert.rejects(definir(404, 'confirmar', principal, snapshot(retirada.endereco), retirada.endereco), /retirada/);
        assert.deepEqual(await enderecosExistentes(), cadastroOriginal);

        const pedidoCriacao = await ler(303);
        await db.exec(sql(migracao + '.ativar.sql'));
        assert.deepEqual(await enderecosExistentes(), cadastroOriginal);
        await assert.rejects(gravacaoLegada('anon', 303, novo, pedidoCriacao.endereco), { code: '42501' });
        await assert.rejects(gravacaoLegada('authenticated', 303, novo, pedidoCriacao.endereco), { code: '42501' });
        await assert.rejects(definir(303, 'criar', principal, novo, pedidoCriacao.endereco), /ação ou referência/);
        await assert.rejects(definir(303, 'criar', null, { ...novo, cep: '123' }, pedidoCriacao.endereco), /CEP ou UF/);
        const criacao = await definir(303, 'criar', null, novo, pedidoCriacao.endereco);
        assert.equal(criacao.ok, true);
        assert.deepEqual(snapshot(criacao.endereco), novo);
        assert.equal(await vinculo(303), criacao.endereco_id);
        assert.equal(await valor('SELECT ie_recebedor AS valor FROM enderecos WHERE id = $1', [criacao.endereco_id]), null);
        assert.equal(await contar(), 5);
        const repeticao = await definir(303, 'criar', null, novo, pedidoCriacao.endereco);
        assert.equal(repeticao.endereco_id, criacao.endereco_id);
        assert.equal(await contar(), 5);

        const pedidoConflito = await ler(606);
        await db.exec(`
            CREATE FUNCTION alterar_total() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN NEW.valor_total := 999; RETURN NEW; END $$;
            CREATE TRIGGER teste_total BEFORE UPDATE ON propostas
                FOR EACH ROW EXECUTE FUNCTION alterar_total();
        `);
        await assert.rejects(definir(606, 'selecionar', alternativo, snapshot(opcao), pedidoConflito.endereco), /outros dados/);
        await assert.rejects(definir(606, 'criar', null, novo, pedidoConflito.endereco), /outros dados/);
        assert.equal(await vinculo(606), principal);
        assert.equal(await valor('SELECT valor_total::int AS valor FROM propostas WHERE id_int = 606'), 100);
        assert.equal(await contar(), 5);

        await db.exec(sql(migracao + '.down.sql'));
        assert.equal(await valor("SELECT pg_get_functiondef('link_cliente_pedido(text,text)'::regprocedure) AS valor"), definicaoLeitura);
        assert.equal(await valor("SELECT has_function_privilege('anon','link_cliente_salvar_entrega(text,text,jsonb,jsonb)','EXECUTE') AS valor"), true);
        assert.equal(await valor("SELECT has_function_privilege('authenticated','link_cliente_salvar_entrega(text,text,jsonb,jsonb)','EXECUTE') AS valor"), true);
        assert.equal(await vinculo(101), alternativo);
        assert.equal(await vinculo(303), criacao.endereco_id);
        assert.equal(await contar(), 5);
        console.log('OK: seleção e confirmação sem cópia, criação explícita, isolamento, dados desatualizados, ativação e reversão em PostgreSQL.');
    } finally {
        await db.close();
    }
}

main().catch(erro => { console.error(erro); process.exitCode = 1; });
