import assert from "node:assert/strict";
import { operarContatosArte } from "./contatos_arte.ts";
const quem={id:"00000000-0000-4000-8000-000000000001",permissoes:{perm_lista_arte_view:true,perm_lista_arte_edit:true}};
const contato_id="guru#"+"a".repeat(24),revisao="b".repeat(32);
const row={pedido:11,contato_id,nome:"Exemplo",whatsapp:"5511888880000",valido:true,opcoes:[{contato_id}],revisao};
Deno.test("contatos: consulta em lote privado e seleciona sem editar cadastro",async()=>{
 const calls:any[]=[];
 const db=async(m:string,p:string,c?:unknown)=>{calls.push({m,p,c});return [row];};
 assert.deepEqual(await operarContatosArte("consultar",{pedidos:[11,11]},quem,db),[row]);
 assert.deepEqual(calls[0].c,{p_pedidos:[11]});
 assert.equal(calls[0].p,"rpc/imposition_arte_guru_ler");
 assert.deepEqual(await operarContatosArte("selecionar",{pedido:11,contato_id,revisao},quem,db),row);
 assert.equal(calls[1].p,"rpc/imposition_arte_guru_selecionar");
 assert.deepEqual(calls[1].c,{p_pedido:11,p_contato_id:contato_id,p_revisao:revisao,p_autor:quem.id});
});
Deno.test("contatos: permissão, payload livre, edição antiga e listas inválidas recusados",async()=>{
 const db=async()=>{throw Error("Não deve consultar");};
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:[11]},{...quem,id:""},db),/Entre/);
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:[11]},{...quem,permissoes:{}},db),/permissão/);
 await assert.rejects(()=>operarContatosArte("selecionar",{}, {...quem,permissoes:{perm_lista_arte_view:true}},db),/permissão/);
 await assert.rejects(()=>operarContatosArte("salvar",{},quem,db),/inexistente/);
 await assert.rejects(()=>operarContatosArte("selecionar",{pedido:11,contato_id,revisao,nome:"livre"},quem,db),/Campo/);
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:Array(201).fill(11)},quem,db),/200/);
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:["11&x"]},quem,db),/inválido/);
});
Deno.test("contatos: conflito e confirmação vazia não viram sucesso",async()=>{
 const c={pedido:11,contato_id,revisao};
 await assert.rejects(()=>operarContatosArte("selecionar",c,quem,async()=>{throw Error("privado");}),/cadastro mudou/);
 await assert.rejects(()=>operarContatosArte("selecionar",c,quem,async()=>[]),/não confirmou/);
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:[11]},quem,async()=>[{...row,pedido:99}]),/inválida/);
});
