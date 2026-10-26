// Banco efemero em memoria, base e codigos reais nunca sao lidos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const db = new PGlite();
let checks = 0;
async function scalar(sql) { return Object.values((await db.query(sql)).rows[0])[0]; }
async function rejected(sql, pattern) {
  await assert.rejects(db.exec(sql), pattern);
  await db.exec('ROLLBACK');
  checks++;
}
(async () => {
  try {
    for (const file of ['tests/qr12_schema_fixture.sql', 'sql/ideal_control_qr12.sql',
      'sql/ideal_control_qr12_suspensao.sql', 'sql/ideal_control_qr12_suspensao_piloto.sql',
      'sql/ideal_control_qr12_base_independente.sql']) await db.exec(read(file));
    // Replica sintetica do salto da numeracao para a coluna vizinha.
    await db.exec(`INSERT INTO pedidos_modelos VALUES
      (1569,91,100,201,'2026-10-01','qr'),(1570,91,1300,30001,'2026-10-01','qr'),
      (11,51,10,1,'2026-10-01','qr');`);
    await rejected('SELECT producao_acesso_qr_contratos_obter(91)', /sobrepostos/);
    const legacy = await scalar('SELECT producao_acesso_qr_contratos_obter(51)');
    await db.exec("UPDATE producao_acesso_qr_controle SET ativo=true");
    // pg_get_functiondef formata a assinatura de forma diferente entre versoes.
    // Confere o corpo original antes de adaptar apenas o hash da fixture.
    const originalBody = read('sql/ideal_control_qr12.sql').split('CREATE FUNCTION public.producao_acesso_qr_contratos_obter')[1].split('AS $$')[1].split('END $$;')[0] + 'END ';
    assert.equal((await scalar("SELECT prosrc FROM pg_proc WHERE oid='public.producao_acesso_qr_contratos_obter(integer)'::regprocedure")).trim(), originalBody.trim());
    const localHash = await scalar("SELECT md5(pg_get_functiondef('public.producao_acesso_qr_contratos_obter(integer)'::regprocedure))");
    const triggerHash = await scalar("SELECT md5(pg_get_functiondef('public.producao_acesso_qr_impedir_retorno_legado()'::regprocedure))");
    const migration = read('sql/qr12_padrao_novas_emissoes_20261026.sql')
      .replace('b761376c347fcbdf16ccad83cd8761e7', localHash)
      .replace('2e9a53d0483fb924ed1a1d97f63033ed', triggerHash);
    await db.exec(migration);
    assert.deepEqual(await scalar('SELECT producao_acesso_qr_contratos_obter(51)'), legacy); checks++;
    await rejected('SELECT producao_acesso_qr_contratos_obter(91)', /ausencia de impressao/);
    await db.exec("INSERT INTO pedidos_modelos VALUES(16,55,10,1,NULL,'qr')");
    await rejected('SELECT producao_acesso_qr_contratos_obter(55)', /ausencia de impressao/);
    await db.exec("INSERT INTO producao_acesso_qr_autorizacoes VALUES(91,'SINTETICO: nenhuma impressao anterior');");
    const qr12 = await scalar('SELECT producao_acesso_qr_contratos_obter(91)');
    assert.equal(qr12.length, 2);
    assert.ok(qr12.every(c => c.versao === 2));
    assert.deepEqual(await scalar('SELECT producao_acesso_qr_contratos_obter(91)'), qr12); checks++;
    assert.equal(await scalar(`SELECT count(*)::integer FROM producao_acesso_qr_reservas a
      JOIN producao_acesso_qr_reservas b ON a.modelo<b.modelo AND a.faixa && b.faixa
      WHERE a.versao=2 AND b.versao=2`), 0); checks++;
    // Novo pedido automaticamente QR12, sem autorizacao individual.
    await db.exec("INSERT INTO pedidos_modelos VALUES(12,52,10,1,now(),'qr')");
    assert.equal((await scalar('SELECT producao_acesso_qr_contratos_obter(52)'))[0].versao, 2); checks++;
    // Emissao preexistente ou modelo novo num pedido legado nunca muda silenciosamente.
    await db.exec("INSERT INTO pedidos_modelos VALUES(13,53,10,1,now(),'qr'); INSERT INTO producao_acesso_preparacoes VALUES(53)");
    await rejected('SELECT producao_acesso_qr_contratos_obter(53)', /existente/);
    await db.exec("INSERT INTO pedidos_modelos VALUES(14,51,10,1,now(),'qr')");
    await rejected('SELECT producao_acesso_qr_contratos_obter(51)', /legado existente/);
    await db.exec("DELETE FROM pedidos_modelos WHERE id=14"); // Apenas fixture em memoria.
    await db.exec("UPDATE producao_acesso_qr_controle SET ativo=false; INSERT INTO pedidos_modelos VALUES(15,54,10,1,now(),'qr')");
    await rejected('SELECT producao_acesso_qr_contratos_obter(54)', /suspensas/);
    assert.deepEqual(await scalar('SELECT producao_acesso_qr_contratos_obter(51)'), legacy);
    assert.deepEqual(await scalar('SELECT producao_acesso_qr_contratos_obter(91)'), qr12); checks++;
    await db.exec("UPDATE producao_acesso_qr_controle SET ativo=true");
    // A tabela tambem recusa novo contrato legado por qualquer outra rota.
    await rejected(`INSERT INTO producao_acesso_qr_contratos
      (pedido,modelo,versao,inicio,passo,posicao,quantidade,capacidade,fonte_hash,pool_revisao)
      VALUES(54,15,1,1,1,1,10,10,'sintetico','ideal-master-1')`, /legado novo recusado/);
    await db.exec('UPDATE pedidos_modelos SET quantidade=101 WHERE id=1569');
    await rejected('SELECT producao_acesso_qr_contratos_obter(91)', /mudou/);
    assert.equal(await scalar("SELECT has_function_privilege('authenticated','producao_acesso_qr_contratos_obter(integer)','EXECUTE')"), false); checks++;
    await rejected(migration, /Definicao QR mudou/);
    // Exercita o script operacional completo contra 17 modelos sinteticos.
    const entries = [[1563,1800,10001],[1564,50,1101],[1565,50,2101],[1566,1800,20001],
      [1567,50,1201],[1568,50,2201],[1569,100,201],[1570,1300,30001],[1571,50,1301],
      [1572,50,2301],[1573,100,301],[1574,1300,40001],[1575,50,1401],[1576,50,2401],
      [1577,800,50001],[1578,50,1501],[1579,50,2501]];
    await db.exec('INSERT INTO pedidos_modelos VALUES '+ entries.map(([m,q,n]) =>
      `(${m+10000},24191,${q},${n},'2026-10-01','qr')`).join(','));
    const operational = read('sql/qr12_pedido_24191_20261026.sql');
    await rejected(operational, /Fonte do pedido/);
    const fingerprint = await scalar('SELECT md5(producao_acesso_qr_fonte(24191)::text)');
    const adapted = operational.replaceAll('d16cb2db57f2e4a01b9ecab265b55e43', fingerprint);
    await db.exec(adapted);
    assert.equal(await scalar('SELECT count(*)::integer FROM producao_acesso_qr_contratos WHERE pedido=24191 AND versao=2'),17);
    assert.equal(await scalar('SELECT sum(capacidade)::integer FROM producao_acesso_qr_contratos WHERE pedido=24191'),7700); checks++;
    await rejected(adapted, /ja tem reserva/);
    // Recuperacao restaura o controle, mas nao remove nenhum contrato emitido.
    const contractsBefore = await scalar('SELECT jsonb_agg(to_jsonb(c) ORDER BY modelo) FROM producao_acesso_qr_contratos c');
    await db.exec(read('sql/qr12_padrao_rollback_20261026.sql'));
    assert.deepEqual(await scalar('SELECT jsonb_agg(to_jsonb(c) ORDER BY modelo) FROM producao_acesso_qr_contratos c'), contractsBefore);
    assert.equal(await scalar('SELECT corte::text FROM producao_acesso_qr_controle'), 'infinity'); checks++;
    console.log(`${checks} verificacoes passaram: regressao, QR12 automatico, legado, bloqueios e transacao do pedido.`);
  } finally { await db.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
