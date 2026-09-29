// PostgreSQL descartável em memória; nenhuma conexão remota ou dado real.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
assert.ok(process.argv[2] && isAbsolute(process.argv[2]), 'Informe o módulo PGlite já instalado');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
        CREATE TABLE public.pedidos_links_cliente(numero_pedido text, token text, ativo boolean, id_int text);
        INSERT INTO public.pedidos_links_cliente VALUES ('11','abc123',true,NULL),('22','xyz123',false,NULL),('33','abc123',true,'44');
        INSERT INTO public.pedidos_links_cliente SELECT n::text,'abc123',true,n::text FROM generate_series(100,135) n;`);
    await db.exec(readFileSync(new URL('../sql/link_cliente_pagamento_vibe.sql', import.meta.url), 'utf8'));
    const verificacaoSql = readFileSync(new URL('../sql/link_cliente_pagamento_vibe_verificar.sql', import.meta.url), 'utf8');
    const verificacoes = (await db.query(verificacaoSql)).rows;
    assert.equal(verificacoes.length, 13);
    assert.ok(verificacoes.every(v => v.resultado === 'OK'), JSON.stringify(verificacoes));
    console.log('OK 13 verificações de instalação e permissões');
    const reserva = async (numero = '11', token = 'abc123') =>
        (await db.query('SELECT public.reservar_link_pagamento_vibe($1,$2) AS r', [numero, token])).rows[0].r;
    const concluir = async (numero, lease, url, codigo) =>
        (await db.query('SELECT public.concluir_link_pagamento_vibe($1,$2,$3,$4) AS r', [numero, lease, url, codigo])).rows[0].r;
    assert.equal(await reserva('22', 'xyz123'), null);
    assert.equal(await reserva('11', 'xyz123'), null);
    assert.equal(await reserva('99'), null);
    assert.equal(await reserva('33'), null);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.pedidos_links_pagamento_vibe')).rows[0].n, 0);
    console.log('OK token de outro pedido, inexistente e revogado não reservam');
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await assert.rejects(() => reserva(), e => e.code === '42501');
        await assert.rejects(() => db.query('SELECT * FROM public.pedidos_links_pagamento_vibe'), e => e.code === '42501');
        await assert.rejects(() => db.exec("INSERT INTO public.pedidos_links_pagamento_vibe(numero_pedido) VALUES ('99')"), e => e.code === '42501');
        await assert.rejects(() => concluir('11', '00000000-0000-0000-0000-000000000001', null, '500'), e => e.code === '42501');
        await db.exec('RESET ROLE');
    }
    console.log('OK tabela e ambas as RPCs fechadas para navegador');
    await db.exec('SET ROLE service_role');
    const primeira = await reserva();
    assert.ok(primeira.reserva);
    const concorrentes = await Promise.all(Array.from({ length: 10 }, () => reserva()));
    assert.ok(concorrentes.every(x => JSON.stringify(x) === '{}'));
    assert.equal(await concluir('11', '00000000-0000-0000-0000-000000000001', null, '500'), null);
    assert.equal(await concluir('11', primeira.reserva, 'https://evil.example/', '200'), null);
    assert.deepEqual(await concluir('11', primeira.reserva, null, '500'), { url: null, codigo: '500' });
    assert.deepEqual(await reserva(), {});
    console.log('OK concorrência, reserva divergente, URL inválida e espera após erro');
    await db.exec("RESET ROLE; UPDATE public.pedidos_links_pagamento_vibe SET tentar_apos = now() - interval '1 second' WHERE numero_pedido='11'; SET ROLE service_role;");
    const segunda = await reserva();
    assert.notEqual(segunda.reserva, primeira.reserva);
    const url = 'https://vibe.ai-ideal.com.br/p/11-sintetico';
    assert.deepEqual(await concluir('11', segunda.reserva, url, '200'), { url, codigo: '200' });
    assert.deepEqual(await reserva(), { url });
    assert.equal(await concluir('11', primeira.reserva, null, '500'), null);
    await db.exec("RESET ROLE; UPDATE public.pedidos_links_cliente SET ativo=false WHERE numero_pedido='11'; SET ROLE service_role;");
    assert.equal(await reserva(), null);
    console.log('OK nova tentativa depois do intervalo, cache permanente e revogação após sucesso');
    for (let i = 100; i < 129; i++) assert.ok((await reserva(String(i))).reserva);
    assert.deepEqual(await reserva('129'), {});
    await db.exec("RESET ROLE; UPDATE public.pedidos_links_pagamento_vibe SET tentativa_em=now()-interval '2 minutes'; SET ROLE service_role;");
    assert.ok((await reserva('129')).reserva);
    console.log('OK limite global 30/minuto e liberação depois da janela');
    await db.exec("RESET ROLE; INSERT INTO public.pedidos_links_cliente VALUES ('22','xyz123',true,NULL); UPDATE public.pedidos_links_cliente SET ativo=true WHERE numero_pedido='22'; SET ROLE service_role;");
    assert.equal(await reserva('22', 'xyz123'), null);
    console.log('OK par número/token ambíguo recusado');
    await db.exec('RESET ROLE');
    const antes = (await db.query('SELECT count(*)::int AS n FROM public.pedidos_links_pagamento_vibe')).rows[0].n;
    await db.exec(readFileSync(new URL('../sql/link_cliente_pagamento_vibe_rollback.sql', import.meta.url), 'utf8'));
    await db.exec('SET ROLE service_role');
    await assert.rejects(() => reserva(), e => e.code === '42501');
    await assert.rejects(() => concluir('11', primeira.reserva, null, '500'), e => e.code === '42501');
    await assert.rejects(() => db.query('SELECT * FROM public.pedidos_links_pagamento_vibe'), e => e.code === '42501');
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.pedidos_links_pagamento_vibe')).rows[0].n, antes);
    const aposRollback = (await db.query(verificacaoSql)).rows;
    assert.deepEqual(aposRollback.filter(v => v.resultado === 'CONFERIR').map(v => v.verificacao),
        ['Servidor pode reler cache', 'Servidor pode executar as RPCs']);
    console.log('OK rollback revoga acesso sem apagar cache');
} finally { await db.close(); }
