// PostgreSQL em memoria; dados sinteticos, sem rede nem credenciais.
// PGLITE_MODULE permite reutilizar instalacao existente, sem instalar pacotes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const raiz = path.resolve(__dirname, '..');
const alvo = 'public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)';
(async () => {
    const db = await PGlite.create();
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
            CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
            CREATE SCHEMA storage;
            CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
            CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);
            CREATE TABLE public.producao_mapas_teatro(id uuid PRIMARY KEY,name text,config jsonb);
            CREATE TABLE public.imposition_user_permissions(user_id uuid PRIMARY KEY,role text);
            SET request.jwt.claim.role = 'service_role';`);
        await db.exec(fs.readFileSync(path.join(raiz, 'sql/mapas_teatro_pdf_exportacoes.sql'), 'utf8'));
        // Fixture da correcao de alias aplicada em 04/10: a migracao nova deve conserva-la.
        const original = (await db.query('SELECT pg_get_functiondef($1::regprocedure) AS corpo', [alvo])).rows[0].corpo;
        await db.exec(original.replace("GROUP BY s->>'id' HAVING nullif(btrim(s->>'id'), '') IS NULL", "GROUP BY t.s->>'id' HAVING nullif(btrim(t.s->>'id'), '') IS NULL"));
        const permissoes = () => db.query('SELECT proacl::text AS acl, prosecdef, proowner FROM pg_proc WHERE oid=$1::regprocedure', [alvo]);
        const antes = (await permissoes()).rows;
        const mapaId = '00000000-0000-0000-0000-000000000001', autor = '00000000-0000-0000-0000-000000000002';
        const config = { cadeiras: {}, setores: [{ id: 's1', nome: 'Plateia', cadeiras: {
            '0,0': { prefixo: 'A', num: '01', tipo: 'Normal' }, '1,0': { num: 2, isErased: true }
        } }] }, snapshot = { id: mapaId, name: 'Teatro sintetico', config }, rev = 'a'.repeat(64);
        await db.query('INSERT INTO producao_mapas_teatro VALUES($1,$2,$3::jsonb)', [mapaId,snapshot.name,JSON.stringify(config)]);
        await db.query('INSERT INTO imposition_user_permissions VALUES($1,$2)', [autor,'admin']);
        const arquivos = versao => [null,'s1'].map((id,i) => {
            const hash = String(i+1).repeat(64);
            return { tipo: id === null ? 'mapa' : 'setor', setor_id: id, quantidade_assentos: 1, sha256_arquivo: hash,
                tamanho_bytes: 100+i, paginas: 1, storage_path: Buffer.from(mapaId).toString('hex')+'/'+rev+'/'+versao+'/'+
                    (id === null ? 'mapa/' : 'setores/'+Buffer.from(id).toString('hex')+'/')+hash+'.pdf' };
        });
        const publicar = async (versao, usuario = autor) => {
            const lista = arquivos(versao);
            for (const a of lista) await db.query('INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3::jsonb)', ['mapas-teatro-pdfs',a.storage_path,JSON.stringify({size:a.tamanho_bytes})]);
            return (await db.query('SELECT to_jsonb(public.mapas_teatro_publicar_pdf_exportacao($1,$2,$3,$4::jsonb,$5::jsonb,$6::uuid)) AS row', [mapaId,rev,versao,JSON.stringify(snapshot),JSON.stringify(lista),usuario])).rows[0].row;
        };
        const historico = await publicar('a3-v1-20261003');
        await assert.rejects(() => publicar('a3-v2-20261006'), /Exportação inválida/);
        const migracao = fs.readFileSync(path.join(raiz,'sql/20261006_mapas_teatro_pdf_gerador_v2.sql'),'utf8');
        await db.exec(migracao);
        assert.deepEqual((await permissoes()).rows, antes);
        const novo = await publicar('a3-v2-20261006');
        assert.equal(novo.gerador_versao,'a3-v2-20261006'); assert.deepEqual(novo.snapshot,snapshot);
        assert.equal((await publicar('a3-v1-20261003')).id,historico.id);
        assert.equal((await publicar('a3-v2-20261006')).id,novo.id);
        assert.deepEqual((await db.query('SELECT to_jsonb(e) AS row FROM producao_mapas_teatro_pdf_exportacoes e WHERE id=$1',[historico.id])).rows[0].row,historico);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM producao_mapas_teatro_pdf_exportacoes')).rows[0].n,2);
        await assert.rejects(() => publicar('versao-invalida'), /Exportação inválida/);
        await assert.rejects(() => publicar('a3-v2-20261006','00000000-0000-0000-0000-000000000003'), /Autor sem permissão/);
        await assert.rejects(() => db.exec(migracao), /migracao ja aplicada/); await db.exec('ROLLBACK');
        assert.deepEqual((await permissoes()).rows, antes);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM producao_mapas_teatro_pdf_exportacoes')).rows[0].n,2);
        assert.deepEqual((await db.query('SELECT config FROM producao_mapas_teatro')).rows[0].config,config);
        console.log('OK: migracao PostgreSQL, convivencia v1/v2, historico intacto, alias, grants, SECURITY INVOKER, repeticao e recusas.');
    } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
