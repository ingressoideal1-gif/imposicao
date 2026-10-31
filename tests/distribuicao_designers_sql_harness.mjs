// Uso: node tests/distribuicao_designers_sql_harness.mjs <caminho absoluto de @electric-sql/pglite/dist/index.js>
// Não usa URL, credencial, banco remoto ou dependências do projeto. Banco em memória.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2] || !path.isAbsolute(process.argv[2])) throw new Error('Informe o caminho absoluto do PGlite de teste.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const A='10000000-0000-0000-0000-000000000001', B='10000000-0000-0000-0000-000000000002', C='10000000-0000-0000-0000-000000000003';
const admin='00000000-0000-0000-0000-000000000001', atendente='00000000-0000-0000-0000-000000000002', designer='00000000-0000-0000-0000-000000000003';
let casos=0;
// Nas unidades, executar explicitamente o consumidor após cada escrita.
// A separação por commit e conexões é testada no harness PostgreSQL real.
let instalado=false;
const query = async (sql,args=[]) => {
    const resultado=(await db.query(sql,args)).rows;
    if (instalado && /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) await db.query('SELECT arte_fila.consumir()');
    return resultado;
};
const igual=(a,b)=>{ assert.equal(a,b); casos++; };
const usuario=async uid=>query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid]);
const inserir=async(n,uid=A,status='Em Arte')=>query('INSERT INTO public.pedidos_artes(id_int,designer_uid,designer_nome,status) VALUES($1,$2,$3,$4)',[n,uid,uid===A?'Designer A':uid===B?'Designer B':uid===C?'Designer C':null,status]);
const pedido=async n=>(await query('SELECT * FROM arte_fila.pedidos WHERE id_int=$1',[n]))[0];
const modo=async(uid,m)=>query('SELECT public.arte_distribuicao_disponibilidade($1,$2,$3)',[uid,m,'Teste de disponibilidade']);
const fixar=async(n,uid,f=true)=>query('SELECT public.arte_distribuicao_fixar($1,$2,$3,$4)',[n,uid,f,'Teste de fixação']);
async function rejeita(fn) {
    await db.exec('SAVEPOINT recusa');
    let falhou=false;
    try { await fn(); } catch { falhou=true; }
    await db.exec('ROLLBACK TO SAVEPOINT recusa');
    igual(falhou,true);
}
async function cenario(fn) {
    await db.exec('BEGIN'); await usuario(admin);
    try { await query('SELECT public.arte_distribuicao_ativar(true)'); await fn(); }
    finally { await db.exec('ROLLBACK'); }
}
try {
    await db.exec(fs.readFileSync(path.join(raiz,'tests/distribuicao_designers_fixture.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(raiz,'tests/distribuicao_designers_classificador_fixture.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(raiz,'sql/distribuicao_designers.sql'),'utf8'));
    instalado=true;
    igual((await query('SELECT ativo FROM arte_fila.config'))[0].ativo,false);
    await cenario(async()=>{
        await inserir(1);await inserir(2);await inserir(3);await inserir(4);await inserir(5);
        igual((await pedido(3)).responsavel_uid,A);
        igual((await pedido(4)).responsavel_uid,B);
        igual((await pedido(5)).responsavel_uid,C);
        await inserir(6,null);
        igual((await pedido(6)).responsavel_uid,null);
        igual((await pedido(6)).desde,null);
        igual((await pedido(6)).aguardando,false);
        // Múltiplas linhas do mesmo pedido não aumentam a carga nem duplicam atribuição.
        await inserir(1);
        igual(Number((await query('SELECT count(*) AS n FROM arte_fila.pedidos WHERE responsavel_uid=$1 AND em_arte',[A]))[0].n),3);
        // Aprovação libera carga; retorno segue o atual (inclusive com fila segurada).
        await query("UPDATE pedidos_artes SET status='ARTE PRONTA' WHERE id_int=4");
        igual((await pedido(4)).em_arte,false);
        await modo(B,'segurado');
        await query("UPDATE pedidos_artes SET status='Em Alteração' WHERE id_int=4");
        igual((await pedido(4)).responsavel_uid,B);
        igual((await pedido(4)).em_arte,true);
        await inserir(7,B);
        igual((await pedido(7)).responsavel_uid,C);
        await fixar(6,B);
        igual((await pedido(6)).fixado,true);
        assert((await pedido(6)).desde); casos++;
        await modo(B,'ausente');
        igual((await pedido(6)).fixado,false);
        assert((await pedido(6)).responsavel_uid!==B);casos++;
        assert((await pedido(4)).responsavel_uid!==B);casos++;
        const transferido=(await pedido(4)).responsavel_uid;
        await modo(B,'ativo');
        igual((await pedido(4)).responsavel_uid,transferido);
        await query("UPDATE pedidos_artes SET status='ARTE PRONTA' WHERE id_int=4");
        await query("UPDATE pedidos_artes SET status='Em Alteração' WHERE id_int=4");
        igual((await pedido(4)).responsavel_uid,transferido);
    });
    await cenario(async()=>{
        await inserir(1);await fixar(1,A);
        await modo(B,'segurado');await modo(C,'segurado');await modo(A,'ausente');
        igual((await pedido(1)).responsavel_uid,null);
        igual((await pedido(1)).fixado,false);
        igual((await pedido(1)).aguardando,true);
        igual((await pedido(1)).desde,null);
        igual((await query('SELECT designer_uid FROM pedidos_artes WHERE id_int=1'))[0].designer_uid,null);
        await modo(B,'ativo');
        igual((await pedido(1)).responsavel_uid,B);
    });
    await cenario(async()=>{
        // Processamento de um lote usa a carga atualizada após cada atribuição.
        await query(`INSERT INTO pedidos_artes(id_int,designer_uid,status)
            SELECT n,$1::uuid,'Em Arte' FROM generate_series(1,12) n`,[A]);
        const cargas=await query('SELECT responsavel_uid,count(*) AS n FROM arte_fila.pedidos GROUP BY responsavel_uid ORDER BY responsavel_uid');
        igual(cargas.length,3);
        cargas.forEach(c=>igual(Number(c.n),4));
        // Erro em transação não deixa fila ou auditoria parcialmente gravadas.
        const antes=Number((await query('SELECT count(*) AS n FROM arte_fila.historico'))[0].n);
        await db.exec('SAVEPOINT desfazer'); await modo(A,'ausente'); await db.exec('ROLLBACK TO SAVEPOINT desfazer');
        igual(Number((await query('SELECT count(*) AS n FROM arte_fila.historico'))[0].n),antes);
        igual((await query('SELECT modo FROM arte_fila.designers WHERE uid=$1',[A]))[0].modo,'ativo');
    });
    await cenario(async()=>{
        await inserir(1); await inserir(2); await inserir(3);
        await inserir(4,A,'Em Alteração');
        igual((await pedido(4)).responsavel_uid,A);
        await query("INSERT INTO propostas VALUES(4,'EM PRODUCAO')");
        igual((await pedido(4)).em_arte,false);
        await query("INSERT INTO pedidos_modelos(id_int,status_impressao) VALUES(4,'Corrigir Arte')");
        igual((await pedido(4)).em_arte,true);
        await query("UPDATE propostas SET status_interno='CANCELADO' WHERE id_int=4");
        igual((await pedido(4)).em_arte,false);
        await query('DELETE FROM pedidos_artes WHERE id_int=3');
        igual((await pedido(3)).em_arte,false);
    });
    await cenario(async()=>{
        await inserir(1);
        await usuario(designer);
        await db.exec('SET LOCAL ROLE authenticated');
        await rejeita(()=>modo(A,'ausente'));
        await rejeita(()=>fixar(1,B));
        await rejeita(()=>query('SELECT * FROM arte_fila.pedidos'));
        igual((await query('SELECT public.arte_distribuicao_estado() AS e'))[0].e.ativo,true);
        await db.exec('RESET ROLE');await usuario(atendente);await db.exec('SET LOCAL ROLE authenticated');
        await fixar(1,B);await rejeita(()=>modo(B,'ausente'));
        await db.exec('RESET ROLE');
        await query('UPDATE imposition_user_permissions SET perm_lista_arte_edit=false WHERE user_id=$1',[atendente]);
        await db.exec('SET LOCAL ROLE authenticated');await rejeita(()=>fixar(1,A));await db.exec('RESET ROLE');
    });
    await cenario(async()=>{
        const r=await query("SELECT arte_fila.segundos_uteis('2026-10-30 17:00-03','2026-11-02 09:00-03') AS s");
        igual(Number(r[0].s),7200);
        igual(Number((await query("SELECT arte_fila.segundos_uteis(NULL,now()) AS s"))[0].s),0);
    });
    await cenario(async()=>{
        await query("INSERT INTO propostas VALUES(123,'LIBERADO')");
        await usuario(atendente); await fixar(123,A);
        igual((await pedido(123)).responsavel_uid,A);
        igual((await pedido(123)).fixado,true);
        igual((await pedido(123)).em_arte,true);
        igual((await query('SELECT designer_uid FROM pedidos_artes WHERE id_int=123'))[0].designer_uid,A);
        igual((await query('SELECT ultima_atribuicao IS NOT NULL AS definida FROM arte_fila.designers WHERE uid=$1',[A]))[0].definida,true);
        igual((await query("SELECT anterior_uid FROM arte_fila.historico WHERE id_int=123 AND evento='fixacao' ORDER BY id DESC LIMIT 1"))[0].anterior_uid,null);
    });
    await cenario(async()=>{
        // Empresas distintas compartilham a mesma carga; designers continuam sem empresa.
        await query(`INSERT INTO usuarios(user_id,nome_usuario,setor,id_empresa) VALUES
            ($1,'Atendente 1','Atendimento',1),($2,'Atendente 2','Atendimento',2),($3,'Atendente 3','Atendimento',3)`,
            [admin,atendente,designer]);
        await query(`INSERT INTO propostas(id_int,status_interno,user_id) VALUES
            (1,'LIBERADO',$1),(2,'LIBERADO',$2),(3,'LIBERADO',$3),(4,'LIBERADO',$2)`,[admin,atendente,designer]);
        for(let n=1;n<=4;n++) await inserir(n,A);
        igual((await pedido(1)).responsavel_uid,A);
        igual((await pedido(2)).responsavel_uid,A);
        igual((await pedido(3)).responsavel_uid,A);
        igual((await pedido(4)).responsavel_uid,B);
        igual(Number((await query("SELECT count(*) AS n FROM usuarios WHERE setor='Designer' AND id_empresa IS NULL"))[0].n),3);
        await modo(A,'ausente');
        igual(Number((await query('SELECT count(*) AS n FROM arte_fila.pedidos WHERE responsavel_uid=$1',[A]))[0].n),0);
        igual(Number((await query('SELECT count(*) AS n FROM arte_fila.pedidos WHERE responsavel_uid IS NOT NULL'))[0].n),4);
        igual(Number((await query('SELECT count(DISTINCT u.id_empresa) AS n FROM propostas p JOIN usuarios u ON u.user_id=p.user_id'))[0].n),3);
    });
    await db.exec('BEGIN');
    try {
        await usuario(admin);
        // Instalação desativada preserva a fonte; ativação não redistribui a base antiga.
        for (let n=1;n<=5;n++) await inserir(n,A);
        igual(Number((await query('SELECT count(*) AS n FROM arte_fila.pedidos'))[0].n),0);
        await query('SELECT public.arte_distribuicao_ativar(true)');
        igual(Number((await query('SELECT count(*) AS n FROM arte_fila.pedidos WHERE responsavel_uid=$1',[A]))[0].n),5);
        await inserir(6,A);
        igual((await pedido(6)).responsavel_uid,B);
        await query('SELECT public.arte_distribuicao_ativar(false)');
        await inserir(7,A);
        igual(await pedido(7),undefined);
        igual((await query('SELECT designer_uid FROM pedidos_artes WHERE id_int=7'))[0].designer_uid,A);
    } finally { await db.exec('ROLLBACK'); }
    await cenario(async()=>{
        igual((await query('SELECT schedule FROM cron.job'))[0].schedule,'5 seconds');
        // A origem só registra: consumidor falho reverte todo o lote e permite repetir.
        await db.query('INSERT INTO pedidos_artes(id_int,designer_uid,status) VALUES(70,$1,\'Em Arte\')',[A]);
        igual(await pedido(70),undefined);
        await db.exec('SAVEPOINT falha_consumidor');
        await db.exec('ALTER TABLE arte_fila.pedidos ADD CONSTRAINT falha_teste CHECK(id_int <> 70)');
        let falhou=false;
        try { await db.query('SELECT arte_fila.consumir()'); } catch { falhou=true; }
        await db.exec('ROLLBACK TO SAVEPOINT falha_consumidor');
        igual(falhou,true);
        igual(Number((await query('SELECT count(*) AS n FROM arte_fila.eventos WHERE id_int=70'))[0].n),1);
        igual(await pedido(70),undefined);
        await db.query('SELECT arte_fila.consumir()');
        igual((await pedido(70)).responsavel_uid,A);
        await db.query('SELECT arte_fila.consumir()');
        igual(Number((await query('SELECT count(*) AS n FROM arte_fila.eventos'))[0].n),0);
        igual(Number((await query("SELECT count(*) AS n FROM arte_fila.historico WHERE id_int=70 AND evento='atribuicao'"))[0].n),1);
        await query('SELECT public.arte_distribuicao_ativar(false)');
        igual(Number((await query('SELECT count(*) AS n FROM cron.job'))[0].n),0);
    });
    await cenario(async()=>{
        await inserir(1); await inserir(2); await inserir(3);
        await inserir(4,A,'PENDENTE INFORMAÇÃO');
        igual((await pedido(4)).ja_distribuido,false);
        await query("UPDATE pedidos_artes SET status='Em Arte' WHERE id_int=4");
        igual((await pedido(4)).responsavel_uid,B);
        igual((await pedido(4)).ja_distribuido,true);
        // Retorno mantém o responsável mesmo segurado; primeira entrada fixada também.
        await query("UPDATE pedidos_artes SET status='ARTE PRONTA' WHERE id_int=4");
        await modo(B,'segurado');
        await query("UPDATE pedidos_artes SET status='Em Alteração' WHERE id_int=4");
        igual((await pedido(4)).responsavel_uid,B);
        await inserir(5,A,'PENDENTE INFORMAÇÃO'); await fixar(5,A);
        await query("UPDATE pedidos_artes SET status='Em Arte' WHERE id_int=5");
        igual((await pedido(5)).responsavel_uid,A);
        igual((await pedido(5)).fixado,true);
    });
    await cenario(async()=>{
        await inserir(1); await fixar(1,A); await inserir(2); await inserir(3);
        await query('SELECT arte_distribuicao_ativar(false)');
        await query("UPDATE pedidos_artes SET designer_uid=$1,designer_nome='Designer B' WHERE id_int=1",[B]);
        await query('UPDATE pedidos_artes SET designer_uid=NULL,designer_nome=NULL WHERE id_int=2');
        await query('DELETE FROM pedidos_artes WHERE id_int=3');
        await query('SELECT arte_distribuicao_ativar(true)');
        igual((await pedido(1)).responsavel_uid,B);
        igual((await pedido(1)).original_uid,B);
        igual((await pedido(1)).fixado,false);
        igual((await pedido(2)).responsavel_uid,null);
        igual((await pedido(2)).desde,null);
        igual((await pedido(3)).em_arte,false);
        await query('INSERT INTO propostas(id_int) VALUES(99)');
        igual((await query('SELECT designer_uid FROM pedidos_artes WHERE id_int=1'))[0].designer_uid,B);
        igual((await query('SELECT designer_uid FROM pedidos_artes WHERE id_int=2'))[0].designer_uid,null);
        igual(Number((await query("SELECT count(*) AS n FROM arte_fila.historico WHERE id_int=1 AND evento='base_reconciliada'"))[0].n),1);
    });
    console.log(`OK: ${casos} verificações SQL em banco descartável (não comprova concorrência entre conexões PostgreSQL).`);
} catch (erro) {
    console.error({ message:erro.message, code:erro.code, detail:erro.detail, where:erro.where,
        actual:erro.actual, expected:erro.expected });
    process.exitCode=1;
} finally { await db.close(); }
