import assert from "node:assert/strict";
import { operarContatosArte } from "./contatos_arte.ts";
const quem={id:"00000000-0000-4000-8000-000000000001",permissoes:{perm_lista_arte_view:true,perm_lista_arte_edit:true}};
const contato_id="guru#"+"a".repeat(24),revisao="b".repeat(32);
const row={pedido:11,contato_id,nome:"Exemplo",whatsapp:"5511888880000",valido:true,opcoes:[{contato_id}],revisao};
Deno.test("contatos: consulta o comprador em lote privado e recusa seleção local",async()=>{
 const calls:any[]=[];
 const db=async(m:string,p:string,c?:unknown)=>{calls.push({m,p,c});return [row];};
 assert.deepEqual(await operarContatosArte("consultar",{pedidos:[11,11]},quem,db),[row]);
 assert.deepEqual(calls[0].c,{p_pedidos:[11]});
 assert.equal(calls[0].p,"rpc/imposition_arte_guru_ler");
 await assert.rejects(()=>operarContatosArte("selecionar",{pedido:11,contato_id,revisao},quem,db),/Altere o comprador no Vibe/);
 assert.equal(calls.length,1);
});
Deno.test("contatos: permissão, campos extras e listas inválidas recusados",async()=>{
 const db=async()=>{throw Error("Não deve consultar");};
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:[11]},{...quem,id:""},db),/Entre/);
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:[11]},{...quem,permissoes:{}},db),/permissão/);
 await assert.rejects(()=>operarContatosArte("salvar",{},quem,db),/inexistente/);
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:[11],nome:"livre"},quem,db),/Campo/);
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:Array(201).fill(11)},quem,db),/200/);
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:["11&x"]},quem,db),/inválido/);
});
Deno.test("contatos: falha ou resposta de outro pedido não viram sucesso",async()=>{
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:[11]},quem,async()=>{throw Error("privado");}),/Não foi possível consultar/);
 await assert.rejects(()=>operarContatosArte("consultar",{pedidos:[11]},quem,async()=>[{...row,pedido:99}]),/inválida/);
});
