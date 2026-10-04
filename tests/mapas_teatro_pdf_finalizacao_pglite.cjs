// PostgreSQL em memória, dados sintéticos. Não usa rede nem credenciais.
// Reutiliza instalação existente por PGLITE_MODULE; não instala dependências.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const raiz = path.resolve(__dirname, '..');
async function main() {
  const db = await PGlite.create();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$
        SELECT current_setting('request.jwt.claim.role', true) $$;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);
      CREATE TABLE public.producao_mapas_teatro(id uuid PRIMARY KEY,name text,config jsonb,created_at timestamptz DEFAULT now());
      CREATE TABLE public.imposition_user_permissions(user_id uuid PRIMARY KEY,role text);
      SET request.jwt.claim.role = 'service_role';`);
    await db.exec(fs.readFileSync(path.join(raiz, 'sql/mapas_teatro_pdf_exportacoes.sql'), 'utf8'));
    const mapaId = '00000000-0000-0000-0000-000000000001';
    const autor = '00000000-0000-0000-0000-000000000002';
    const config = { cadeiras: {}, setores: [
      { id: 's1', nome: 'Plateia', cadeiras: { '0,0': { prefixo: 'A', num: '01' },
        '1,0': { num: 2, isErased: true }, '2,0': { num: 3, tipo: 'Apagado' } } },
      { id: 's2', nome: 'Mesas', cadeiras: { '0,2': { prefixo: 'Mesa', num: 'Z' } } }
    ] };
    const snapshot = { id: mapaId, name: 'Teatro sintético', config };
    const revisao = 'a'.repeat(64), gerador = 'a3-v1-20261003';
    const prefixo = Buffer.from(mapaId).toString('hex') + '/' + revisao + '/' + gerador + '/';
    const arquivos = [null, 's1', 's2'].map((id, i) => {
      const hash = String(i + 1).repeat(64);
      return { tipo: id === null ? 'mapa' : 'setor', setor_id: id, quantidade_assentos: id === null ? 2 : 1,
        sha256_arquivo: hash, tamanho_bytes: 100 + i, paginas: id === null ? 2 : 1,
        storage_path: prefixo + (id === null ? 'mapa/' : 'setores/' + Buffer.from(id).toString('hex') + '/') + hash + '.pdf' };
    });
    await db.query('INSERT INTO producao_mapas_teatro(id,name,config) VALUES ($1,$2,$3::jsonb)', [mapaId,snapshot.name,JSON.stringify(config)]);
    await db.query('INSERT INTO imposition_user_permissions VALUES ($1,$2)', [autor,'admin']);
    for (const a of arquivos) await db.query('INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ($1,$2,$3::jsonb)',
      ['mapas-teatro-pdfs',a.storage_path,JSON.stringify({ size: a.tamanho_bytes })]);
    const publicar = (snap = snapshot, lista = arquivos, usuario = autor) => db.query(
      'SELECT to_jsonb(public.mapas_teatro_publicar_pdf_exportacao($1,$2,$3,$4::jsonb,$5::jsonb,$6::uuid)) AS exportacao',
      [mapaId,revisao,gerador,JSON.stringify(snap),JSON.stringify(lista),usuario]);
    await assert.rejects(publicar(), e => e.code === '42702' && /s.*ambiguous/i.test(e.message));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM producao_mapas_teatro_pdf_exportacoes')).rows[0].n, 0);
    const acl = (await db.query("SELECT proacl::text AS acl, prosecdef FROM pg_proc WHERE oid='public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)'::regprocedure")).rows[0];
    const correcao = fs.readFileSync(path.join(raiz, 'sql/mapas_teatro_pdf_finalizacao_alias_20261004.sql'), 'utf8');
    await db.exec(correcao);
    assert.deepEqual((await db.query("SELECT proacl::text AS acl, prosecdef FROM pg_proc WHERE oid='public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)'::regprocedure")).rows[0], acl);
    await assert.rejects(publicar({ ...snapshot, name: 'Mudou' }), /mapa mudou/i);
    await assert.rejects(publicar(snapshot, arquivos.slice(0, 2)), /incompleta/i);
    await assert.rejects(publicar(snapshot, arquivos.map((a, i) => i === 1 ? { ...a, quantidade_assentos: 2 } : a)), /setor inválido/i);
    await assert.rejects(publicar(snapshot, arquivos, '00000000-0000-0000-0000-000000000003'), /Autor sem permissão/i);
    await db.query('UPDATE storage.objects SET metadata=$1::jsonb WHERE name=$2', [JSON.stringify({ size: 999 }),arquivos[1].storage_path]);
    await assert.rejects(publicar(), /Upload não confirmado/i);
    await db.query('UPDATE storage.objects SET metadata=$1::jsonb WHERE name=$2', [JSON.stringify({ size: arquivos[1].tamanho_bytes }),arquivos[1].storage_path]);
    const publicado = (await publicar()).rows[0].exportacao;
    assert.equal(publicado.mapa_id, mapaId);
    assert.equal(publicado.revisao_exportacao, revisao);
    assert.deepEqual(publicado.snapshot, snapshot);
    assert.equal(publicado.arquivos.length, 3);
    assert.equal((await publicar()).rows[0].exportacao.id, publicado.id);
    await db.exec(correcao);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM producao_mapas_teatro_pdf_exportacoes')).rows[0].n, 1);
    await db.query('UPDATE producao_mapas_teatro SET config=$1::jsonb WHERE id=$2',
      [JSON.stringify({ ...config, setores: config.setores.map(s => ({ ...s, id: 'repetido' })) }),mapaId]);
    await assert.rejects(publicar({ ...snapshot, config: { ...config, setores: config.setores.map(s => ({ ...s, id: 'repetido' })) } }), /IDs de setores inválidos/i);
    const negado = (await db.query("SELECT has_function_privilege('authenticated','public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)','EXECUTE') AS pode")).rows[0].pode;
    assert.equal(negado, false);
    console.log('OK: erro 42702 reproduzido; publicação, repetição, snapshots, quantidades, uploads, setores e permissões conferidos em PostgreSQL local.');
  } finally { await db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
