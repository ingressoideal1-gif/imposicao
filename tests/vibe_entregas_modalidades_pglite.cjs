// PostgreSQL em memoria, somente fixtures sinteticas. Nao conecta a producao.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb DEFAULT '{}'::jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth,storage TO authenticated;
      CREATE TABLE imposition_user_permissions(user_id uuid PRIMARY KEY,role text,perm_admin_view boolean,perm_admin_edit boolean DEFAULT true);
      CREATE TABLE propostas(id uuid PRIMARY KEY,id_int bigint,cliente text,empresa text,frete_escolhido text,status_interno text,id_endereco_ent text,obs_entrega text,categoria_frete text);
      CREATE TABLE expedicoes(id bigint PRIMARY KEY,id_int integer,id_endereco_entrega uuid,qtd_volumes integer,data_entrega timestamptz);
      CREATE TABLE enderecos(id uuid PRIMARY KEY,endereco text,numero text,complemento text,bairro text,cidade text,uf text,cep text);
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb,PRIMARY KEY(bucket_id,name));
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT INSERT,SELECT ON storage.objects TO authenticated;
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:2] $$;
    `);
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_proposta.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_rotas_proposta.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_gestao_adm.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_atribuicao_linha.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_pin.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_acesso_todas_empresas.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_login_empresas.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_mapa.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_mapa_atribuicao.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_mapa_todas.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_mapa_fila_operacional.sql'),'utf8'));
    for (const file of ['retirar_entregador','previsoes_automaticas','autoatribuicao']) await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_'+file+'.sql'),'utf8'));
    await db.exec('CREATE TABLE propostas_os(id_int integer,data_termino timestamp)');
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_modalidades.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_rotas_mistas.sql'),'utf8'));
    {for(const nome of ['avulsas','avulsas_rotas'])await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_'+nome+'.sql'),'utf8'));}
    await db.exec(fs.readFileSync(path.join(__dirname,'../sql/vibe_entregas_categoria_aereo.sql'),'utf8'));

    await db.exec(`INSERT INTO auth.users VALUES('${uuid(91)}'),('${uuid(92)}');
      INSERT INTO vibe_entregas_cadastros(operacao,email,nome,empresas,autor) VALUES('${uuid(90)}','teste@example.invalid','Motorista',ARRAY['A'],'${uuid(91)}');
      INSERT INTO vibe_entregas_entregadores(usuario,nome,email,ativo,operacao) VALUES('${uuid(91)}','Motorista','teste@example.invalid',true,'${uuid(90)}');
      INSERT INTO vibe_entregas_acessos(usuario,empresa,nome) VALUES('${uuid(91)}','A','Motorista');
      INSERT INTO imposition_user_permissions VALUES('${uuid(91)}','admin',true,true);
      INSERT INTO propostas(id,id_int,cliente,empresa,frete_escolhido,status_interno) VALUES
        ('${uuid(1)}',1001,'Veppo A','A','VEPPO','EXPEDICAO'),('${uuid(2)}',1002,'Veppo B','A','VEPPO-RS','EXPEDICAO'),
        ('${uuid(3)}',1003,'Aereo','A','AÉREO EXPRESSO','EXPEDICAO'),('${uuid(4)}',1004,'Hoje','A','MOTOBOY','EM PRODUCAO'),
        ('${uuid(5)}',1005,'Amanha','A','MOTOBOY','EM PRODUCAO'),('${uuid(6)}',1006,'Cancelado','A','MOTOBOY','CANCELADO'),
        ('${uuid(7)}',1007,'Outra empresa','B','VEPPO','EXPEDICAO');
      INSERT INTO propostas_os VALUES(1004,(now() AT TIME ZONE 'America/Sao_Paulo')::date),(1005,(now() AT TIME ZONE 'America/Sao_Paulo')::date+1),(1006,(now() AT TIME ZONE 'America/Sao_Paulo')::date);
      INSERT INTO expedicoes(id,id_int) VALUES(1,1001),(2,1002);
      SELECT set_config('request.jwt.claim.sub','${uuid(91)}',false); SET ROLE authenticated;`);
    const query=async(sql,args=[]) => (await db.query(sql,args)).rows[0].dados;
    await require('./vibe_entregas_categoria_aereo_cases.cjs')({db,query,uuid});
    if(process.env.TEST_AVULSAS)await require('./vibe_entregas_avulsas_cases.cjs')({db,query,uuid});
    assert.deepEqual((await query("SELECT ve_listar_modalidades('',0,'disponivel','motoboy') dados")).map(p=>p.id),['1004']);
    assert.deepEqual((await query("SELECT ve_admin_mapa_modalidades(NULL,'motoboy') dados")).map(p=>p.pedido),[1004]);
    const veppo=await query("SELECT ve_listar_modalidades('',0,'disponivel','veppo') dados");
    assert.deepEqual(veppo.map(p=>p.id),['1001','1002']);assert.match(veppo[0].endereco,/90035-040/);
    assert.match((await query("SELECT ve_listar_modalidades('',0,'disponivel','aereo') dados"))[0].endereco,/92020-400/);
    await assert.rejects(()=>db.query('SELECT ve_assumir($1)',[uuid(4)]),/indisponivel/);
    await db.query('SELECT ve_admin_atribuir_rota($1,$2,NULL)',[uuid(1),uuid(91)]);
    await db.exec(`RESET ROLE; INSERT INTO enderecos(id,endereco,numero,cidade,uf) VALUES('${uuid(40)}','Rua Sintetica','10','Cidade','RS'); UPDATE propostas SET status_interno='EXPEDICAO',id_endereco_ent='${uuid(40)}' WHERE id='${uuid(4)}'; SET ROLE authenticated;`);
    assert.deepEqual((await query("SELECT ve_admin_pedidos_rota_modalidades($1,'',0,'todas') dados",[uuid(91)])).map(p=>p.pedido),[1001,1002,1003,1004]);
    for(const n of [3,4,2])await db.query('SELECT ve_assumir($1)',[uuid(n)]);
    await db.exec(`RESET ROLE; INSERT INTO propostas(id,id_int,cliente,empresa,frete_escolhido,status_interno) VALUES('${uuid(8)}',1008,'Outro lote','A','VEPPO','EXPEDICAO'); SET ROLE authenticated;`);
    const rota=(await query('SELECT ve_rotas_status() dados'))[0];
    assert.deepEqual((await query("SELECT ve_listar_modalidades('',0,'disponivel','veppo') dados")).map(p=>p.id),['1008']);
    assert.equal((await query("SELECT ve_listar_modalidades('',0,'minha','todas') dados")).length,4);
    assert.equal((await query("SELECT ve_admin_mapa_modalidades(NULL,'todas') dados")).length,6);
    assert.deepEqual(rota.paradas.map(p=>p.pedido),[1001,1003,1004,1002]);
    await assert.rejects(()=>db.query('SELECT ve_admin_salvar_rota($1,$2,$3,$4,false)',[uuid(70),uuid(91),[uuid(1),uuid(99)],rota.id]),/Pedido inexistente/);
    const previsoes=Object.fromEntries(rota.paradas.map((p,i)=>[p.chave,new Date(Date.now()+3600000+i*60000).toISOString()]));
    await db.query('SELECT ve_admin_iniciar_deslocamento($1,$2)',[rota.id,previsoes]);
    const op=uuid(81),foto=`${uuid(91)}/${uuid(1)}/${op}.jpg`;
    const repasse=(ids=[uuid(1),uuid(2)],operacao=op)=>query('SELECT ve_registrar_repasse($1,$2,$3,$4,$5,$6,true) dados',[rota.id,ids,operacao,'Recebedor',foto,'Volumes conferidos']);
    await db.exec(`RESET ROLE; UPDATE imposition_user_permissions SET role='operador',perm_admin_view=false,perm_admin_edit=false WHERE user_id='${uuid(91)}'; SET ROLE authenticated;`);
    await assert.rejects(()=>repasse([uuid(1),uuid(7)]),/Selecao alterada/);
    await assert.rejects(()=>repasse([uuid(1),uuid(8)]),/Selecao alterada/);
    await assert.rejects(()=>repasse([uuid(1),uuid(3)]),/Selecao alterada/);
    await assert.rejects(()=>repasse(),/Comprovante nao recebido/);
    await db.query(`INSERT INTO storage.objects VALUES('vibe-entregas-comprovantes',$1,'{"size":100,"mimetype":"image/jpeg"}')`,[foto]);
    await db.exec(`RESET ROLE; CREATE FUNCTION recusar_repasse() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.proposta='${uuid(2)}' THEN RAISE EXCEPTION 'falha simulada'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER recusar_repasse BEFORE UPDATE ON vibe_entregas_registros FOR EACH ROW EXECUTE FUNCTION recusar_repasse(); SET ROLE authenticated;`);
    await assert.rejects(()=>repasse(),/falha simulada/);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT count(*)::int n FROM vibe_entregas_repasses')).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int n FROM vibe_entregas_registros WHERE concluida_em IS NOT NULL')).rows[0].n,0);
    await db.exec('DROP TRIGGER recusar_repasse ON vibe_entregas_registros; SET ROLE authenticated');
    await db.exec('BEGIN');
    await repasse([uuid(1)]);
    assert.deepEqual((await query("SELECT ve_listar_modalidades('',0,'minha','veppo') dados")).map(p=>p.id),['1002']);
    await db.exec('ROLLBACK');
    const r=await repasse();assert.equal(r.tipo,'repasse');assert.equal((await repasse()).hora,r.hora);
    assert.equal((await query("SELECT ve_listar_modalidades('',0,'minha','veppo') dados")).length,0);
    assert.equal((await query("SELECT ve_listar_modalidades('',0,'concluida','veppo') dados"))[0].registro.resultado,'repasse');
    await db.exec('RESET ROLE');
    assert.deepEqual((await db.query('SELECT status_interno FROM propostas WHERE id=ANY($1) ORDER BY id',[[uuid(1),uuid(2)]])).rows.map(p=>p.status_interno),['EM TRANSITO','EM TRANSITO']);
    assert.equal((await db.query('SELECT count(*)::int n FROM expedicoes WHERE data_entrega IS NOT NULL')).rows[0].n,0);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${uuid(92)}',false); SET ROLE authenticated`);
    await assert.rejects(()=>repasse(),/inativo/);
    await db.exec('RESET ROLE; SET ROLE anon');await assert.rejects(()=>repasse(),/permission denied/);
    console.log('Modalidades: filtro do dia, destinos fixos, rota mista individual, lote pendente, repasse parcial, atomicidade, idempotencia, isolamento e repasse sem concluir ERP aprovados.');
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
