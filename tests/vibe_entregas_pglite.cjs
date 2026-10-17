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
      CREATE TABLE propostas(id uuid PRIMARY KEY,id_int bigint,cliente text,empresa text,frete_escolhido text,status_interno text,id_endereco_ent text,obs_entrega text);
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
    await db.exec(`INSERT INTO auth.users VALUES('${uuid(91)}'),('${uuid(92)}');
      INSERT INTO vibe_entregas_acessos VALUES('${uuid(91)}','A','Motorista teste',true),('${uuid(92)}','B','Outro motorista',true);
      INSERT INTO propostas(id,id_int,cliente,empresa,frete_escolhido,status_interno) VALUES
      ('${uuid(1)}',1001,'Exemplo sem expedicao','A',' Motoboy ','EXPEDICAO'),
      ('${uuid(2)}',1002,'Exemplo com expedicao','A','MOTOBOY','EXPEDICAO'),
      ('${uuid(3)}',1003,'Duplicidade','A','MOTOBOY','EXPEDICAO'),
      ('${uuid(4)}',1004,'Entregue','A','MOTOBOY','EXPEDICAO'),
      ('${uuid(5)}',1005,'Transportadora','A','PAC','EXPEDICAO'),
      ('${uuid(6)}',1006,'Outra empresa','B','MOTOBOY','EXPEDICAO');
      INSERT INTO expedicoes(id,id_int,data_entrega) VALUES(2,1002,NULL),(3,1003,NULL),(30,1003,NULL),(4,1004,now());`);
    const login = async n => db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uuid(n)}',false); SET ROLE authenticated;`);
    const listar = async filtro => (await db.query('SELECT ve_listar($1,0,$2) AS dados',['',filtro])).rows[0].dados;
    const assumir = n => db.query('SELECT ve_assumir($1)',[uuid(n)]);
    const foto = (n,op) => `${uuid(91)}/${uuid(n)}/${uuid(op)}.jpg`;
    const registrar = (n,op) => db.query("SELECT ve_registrar($1,$2,'entregue','Recebedor teste',$3,'',true) AS recibo",[uuid(n),uuid(op),foto(n,op)]);
    await db.exec('SET ROLE anon');await assert.rejects(()=>db.query('SELECT ve_listar()'),/permission denied/);
    await login(91);assert.deepEqual((await listar('disponivel')).map(x=>x.id),['1001','1002']);
    await assumir(1);await assumir(1); // idempotencia da retirada
    await assert.rejects(()=>registrar(1,81),/Comprovante nao recebido/);
    await db.exec('RESET ROLE');assert.equal((await db.query('SELECT status_interno FROM propostas WHERE id=$1',[uuid(1)])).rows[0].status_interno,'EXPEDICAO');
    await login(91);
    await db.query("INSERT INTO storage.objects VALUES('vibe-entregas-comprovantes',$1,'{\"size\":10,\"mimetype\":\"image/jpeg\"}')",[foto(1,81)]);
    const first=(await registrar(1,81)).rows[0].recibo;assert.equal(first.confirmada,true);
    assert.deepEqual((await registrar(1,81)).rows[0].recibo,first);
    assert.equal((await listar('concluida'))[0].id,'1001');
    await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int AS n FROM expedicoes WHERE id_int=1001')).rows[0].n,0);
    assert.equal((await db.query('SELECT status_interno FROM propostas WHERE id=$1',[uuid(1)])).rows[0].status_interno,'ENTREGUE');
    await login(92);assert.deepEqual((await listar('disponivel')).map(x=>x.id),['1006']);
    await assert.rejects(()=>assumir(2),/Acesso nao autorizado/);
    await assert.rejects(()=>db.query("INSERT INTO storage.objects VALUES('vibe-entregas-comprovantes',$1,'{}')",[foto(2,82)]),/row-level security/);
    await login(91);await assumir(2);
    await db.query("INSERT INTO storage.objects VALUES('vibe-entregas-comprovantes',$1,'{\"size\":10,\"mimetype\":\"image/jpeg\"}')",[foto(2,82)]);
    await db.exec(`RESET ROLE; CREATE FUNCTION teste_recusa() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada'; END $$;
      CREATE TRIGGER teste_recusa BEFORE UPDATE ON propostas FOR EACH ROW EXECUTE FUNCTION teste_recusa();`);
    await login(91);await assert.rejects(()=>registrar(2,82),/falha simulada/);
    await db.exec('RESET ROLE');assert.equal((await db.query('SELECT data_entrega FROM expedicoes WHERE id=2')).rows[0].data_entrega,null);
    assert.equal((await db.query('SELECT concluida_em FROM vibe_entregas_registros WHERE proposta=$1',[uuid(2)])).rows[0].concluida_em,null);
    await db.exec('DROP TRIGGER teste_recusa ON propostas');await login(91);assert.equal((await registrar(2,82)).rows[0].recibo.confirmada,true);
    await assert.rejects(()=>assumir(3),/more than one row/);
    await db.exec(`RESET ROLE; INSERT INTO propostas(id,id_int,cliente,empresa,frete_escolhido,status_interno)
      VALUES('${uuid(7)}',1007,'Expedicao posterior','A','MOTOBOY','EXPEDICAO');`);
    await login(91);await assumir(7);
    await db.exec(`RESET ROLE; INSERT INTO expedicoes(id,id_int) VALUES(7,1007);`);
    await login(91);await db.query("INSERT INTO storage.objects VALUES('vibe-entregas-comprovantes',$1,'{\"size\":10,\"mimetype\":\"image/jpeg\"}')",[foto(7,87)]);
    assert.equal((await registrar(7,87)).rows[0].recibo.confirmada,true);
    await db.exec('RESET ROLE');assert.equal((await db.query('SELECT expedicao FROM vibe_entregas_registros WHERE proposta=$1',[uuid(7)])).rows[0].expedicao,7);
    assert.notEqual((await db.query('SELECT data_entrega FROM expedicoes WHERE id=7')).rows[0].data_entrega,null);
    await login(91);await assert.rejects(()=>db.query('SELECT ve_acompanhar()'),/gestor nao autorizado/);
    await db.exec(`RESET ROLE; INSERT INTO auth.users VALUES('${uuid(93)}'),('${uuid(94)}');
      INSERT INTO vibe_entregas_acessos(usuario,empresa,nome,gestor) VALUES('${uuid(93)}','A','Gestor A',true),('${uuid(94)}','B','Gestor B',true);
      INSERT INTO imposition_user_permissions VALUES('${uuid(93)}','admin',true),('${uuid(94)}','visualizador',true);
      INSERT INTO propostas(id,id_int,cliente,empresa,frete_escolhido,status_interno) VALUES('${uuid(8)}',1008,'Pendente','A','MOTOBOY','EXPEDICAO');`);
    await login(93);
    const acompanhar = async filtro => (await db.query("SELECT ve_acompanhar('', $1, current_date-1,current_date+1,0) AS dados",[filtro])).rows[0].dados;
    assert.deepEqual((await acompanhar('disponivel')).map(r=>r.pedido),[1006,1008]);
    assert.deepEqual((await acompanhar('concluida')).map(r=>r.pedido),[1001,1002,1007]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM storage.objects WHERE name=$1",[foto(1,81)])).rows[0].n,1);
    await assert.rejects(()=>db.query("SELECT ve_acompanhar('','concluida',current_date,current_date-1,0)"),/Filtros invalidos/);
    await login(94);await assert.rejects(()=>acompanhar('disponivel'),/gestor nao autorizado/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM storage.objects WHERE name=$1",[foto(1,81)])).rows[0].n,0);
    await db.exec(`RESET ROLE; UPDATE imposition_user_permissions SET role='visualizador' WHERE user_id='${uuid(93)}';`);
    await login(93);await assert.rejects(()=>acompanhar('concluida'),/gestor nao autorizado/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM storage.objects WHERE name=$1",[foto(1,81)])).rows[0].n,0);
    await db.exec(`RESET ROLE; INSERT INTO enderecos(id,endereco,numero,cidade,uf) VALUES('${uuid(88)}','Rua de teste','81','Porto Alegre','RS');
      INSERT INTO propostas(id,id_int,cliente,empresa,frete_escolhido,status_interno,id_endereco_ent) VALUES
      ('${uuid(10)}',1010,'Rota A','A','MOTOBOY','EXPEDICAO','${uuid(88)}'),('${uuid(11)}',1011,'Rota B','A','MOTOBOY','EXPEDICAO','${uuid(88)}');`);
    await login(91);await assumir(10);await assumir(11);
    const reservar=(id,ids=[uuid(10),uuid(11)])=>db.query('SELECT ve_rota_reservar($1,$2)',[uuid(id),ids]);
    await assert.rejects(()=>reservar(50,[uuid(6)]),/indisponivel/);
    await reservar(51);await assert.rejects(()=>reservar(51),/ja solicitado/);
    await assert.rejects(()=>db.query('SELECT ve_rota_resultado($1,$2,$3,true)',[uuid(51),uuid(91),[uuid(11),uuid(10)]]),/permission denied/);
    await db.exec('RESET ROLE; SET ROLE service_role');
    await db.query('SELECT ve_rota_resultado($1,$2,$3,true)',[uuid(51),uuid(91),[uuid(11),uuid(10)]]);
    await login(91);await db.query('SELECT ve_rota_confirmar($1)',[uuid(51)]);
    const route=(await db.query('SELECT ve_rotas_status() AS dados')).rows[0].dados[0];
    assert.deepEqual(route.paradas.map(p=>p.pedido),[1011,1010]);assert.equal(route.minha,true);assert.equal(route.retorno,true);
    assert.match(route.paradas[0].endereco,/Rua de teste/);
    await login(94);assert.deepEqual((await db.query('SELECT ve_rotas_status() AS dados')).rows[0].dados,[]);
    await login(91);for(let i=0;i<19;i++)await reservar(200+i);
    await assert.rejects(()=>reservar(300),/Limite diario/);
    // Cadastro retoma Auth sem duplicar e nunca altera conta preexistente.
    await login(91);await assert.rejects(()=>db.query('SELECT ve_admin_contexto()'),/ADM necessario/);
    await db.exec(`RESET ROLE; UPDATE imposition_user_permissions SET role='admin' WHERE user_id='${uuid(93)}';`);
    await login(93);
    const preparar=()=>db.query("SELECT ve_admin_preparar_cadastro($1,'driver@example.invalid','Motorista novo',ARRAY['A'])",[uuid(400)]);
    await preparar();
    await assert.rejects(()=>db.query("SELECT ve_admin_concluir_cadastro($1)",[uuid(400)]),/no rows/);
    await db.exec(`RESET ROLE; INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES('${uuid(95)}','driver@example.invalid','{"vibe_operacao":"${uuid(400)}"}');`);
    await login(93);await preparar();await db.query('SELECT ve_admin_concluir_cadastro($1)',[uuid(400)]);await db.query('SELECT ve_admin_concluir_cadastro($1)',[uuid(400)]);
    const contexto=(await db.query('SELECT ve_admin_contexto() AS dados')).rows[0].dados;
    assert.equal(contexto.entregadores.length,1);assert.equal(contexto.entregadores[0].email,'driver@example.invalid');
    await assert.rejects(()=>db.query("SELECT ve_admin_preparar_cadastro($1,'driver@example.invalid','Outro',ARRAY['A'])",[uuid(401)]),/outra conta/);
    await assert.rejects(()=>db.query('SELECT ve_admin_conta_senha($1)',[uuid(91)]),/no rows/);
    await db.query('SELECT ve_admin_conta_senha($1)',[uuid(95)]);
    const salvar=(id,ordem,anterior=null)=>db.query('SELECT ve_admin_salvar_rota($1,$2,$3,$4,true) AS dados',[uuid(id),uuid(95),ordem.map(uuid),anterior?uuid(anterior):null]);
    await assert.rejects(()=>salvar(410,[6]),/sem acesso/);
    await salvar(410,[8]);await salvar(410,[8]);
    await assert.rejects(()=>salvar(411,[8]),/outra sessao/);
    await assert.rejects(()=>db.query("SELECT ve_admin_editar_entregador($1,'Motorista',ARRAY['A'],false)",[uuid(95)]),/pendentes/);
    await salvar(411,[8],410);
    await assert.rejects(()=>salvar(412,[8,8],411),/distintos/);
    await assert.rejects(()=>salvar(412,[8,10],411),/outro entregador/);
    await login(95);const atribuida=(await db.query('SELECT ve_rotas_status() AS dados')).rows[0].dados;assert.equal(atribuida.length,1);assert.equal(atribuida[0].id,uuid(411));
    await login(93);await assert.rejects(()=>db.query('SELECT * FROM vibe_entregas_auditoria'),/permission denied/);
    await db.exec(`RESET ROLE; UPDATE imposition_user_permissions SET perm_admin_edit=false WHERE user_id='${uuid(93)}';`);
    await login(93);assert.equal((await db.query('SELECT ve_admin_contexto() AS dados')).rows[0].dados.editar,false);await assert.rejects(()=>salvar(413,[8],411),/Edicao ADM/);
    console.log('PASS: SQL real em memoria; pedido sem expedicao, retirada, foto privada, confirmacao, repeticao, filtro, isolamento e rollback atomico.');
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
