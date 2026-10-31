const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
const fonte = script.split('// BEGIN ARTE_DISTRIBUICAO')[1].split('// END ARTE_DISTRIBUICAO')[0];
let casos = 0;
function igual(a,b) { assert.equal(a,b); casos++; }
function montar(role = 'admin') {
    const chamadas = [], avisos = [];
    const contexto = { Intl, Date, Map, console, papelAtual: () => role,
        prompt: () => 'Teste de atribuição', toast: (...a) => avisos.push(a), renderOrdens() {},
        supabaseClient: { rpc: async (nome, args) => {
            chamadas.push({ nome, args });
            return contexto.resposta;
        } }
    };
    contexto.window = contexto;
    contexto.resposta = { data: { ativo:true, designers:[{ uid:'d1', nome:'Designer Um', modo:'ativo', carga:1 }],
        pedidos:[{ id_int:1, original_uid:'d1', responsavel_uid:'d1', nome:'Designer Um', em_arte:true,
            desde:'2026-10-30T17:00:00-03:00', credito_segundos:1800, fixado:false }] } };
    vm.createContext(contexto); vm.runInContext(fonte,contexto);
    return { contexto, api:contexto.ArteDistribuicao, chamadas, avisos };
}
(async () => {
    const { api, contexto, chamadas, avisos } = montar();
    const tempo = api.segundosUteis;
    igual(tempo('2026-10-30T07:00:00-03:00','2026-10-30T19:00:00-03:00'),36000);
    igual(tempo('2026-10-30T17:00:00-03:00','2026-11-02T09:00:00-03:00'),7200);
    igual(tempo('2026-10-31T08:00:00-03:00','2026-11-01T18:00:00-03:00'),0);
    igual(tempo('2026-11-02T18:00:00-03:00','2026-11-03T08:00:00-03:00'),0);
    igual(tempo('2026-11-02T08:00:00-03:00','2026-11-02T08:00:59-03:00'),59);
    igual(tempo(null,Date.now()),0);
    igual(tempo('inválido',Date.now()),0);
    igual(tempo('2026-11-03','2026-11-02'),0);
    await api.carregar();
    igual(api.ativo(),true);
    igual(api.nome(1),'Designer Um');
    igual(api.nome(999),'');
    igual(api.tempo(1,Date.parse('2026-11-02T09:00:00-03:00')),9000);
    igual(api.controlesPedido(1).includes('Fixar designer'),true);
    contexto.resposta.data.pedidos[0].responsavel_uid = null;
    contexto.resposta.data.pedidos[0].nome = null;
    await api.carregar();
    igual(api.tempo(1),null);
    igual(api.nome(1),'');
    contexto.resposta.data.pedidos[0].original_uid = null;
    igual(api.tempo(1),null);
    const quantidade = chamadas.length;
    contexto.resposta = { error:{ message:'Falha simulada' } };
    await api.atribuir(1,'d1','Designer Um');
    igual(chamadas.length,quantidade+1); // somente releitura; nenhuma escrita após falha
    igual(avisos.at(-1)[1],'warning');
    igual(api.ativo(),true); // falha de rede NÃO devolve autoridade ao override local
    const ausente = montar();
    ausente.contexto.resposta = { error:{ code:'PGRST202' } };
    await ausente.api.carregar();
    igual(ausente.api.ativo(),false);
    igual(await ausente.api.atribuir(1,'d1','Designer Um'),false);
    const inativo = montar();
    inativo.contexto.resposta = { data:{ativo:false,designers:[],pedidos:[]} };
    await inativo.api.carregar();
    igual(inativo.api.legado(),true);
    inativo.contexto.resposta = { error:{code:'503',message:'Falha de rede'} };
    igual(await inativo.api.atribuir(1,'d1','Designer Um'),true);
    igual(inativo.api.legado(),false);
    igual(inativo.avisos.at(-1)[1],'warning');
    igual(inativo.chamadas.some(c=>c.nome==='arte_distribuicao_fixar'),false);
    // Recuperação confirma novamente o estado antes de permitir o fluxo anterior.
    inativo.contexto.resposta = { data:{ativo:false,designers:[],pedidos:[]} };
    igual(await inativo.api.atribuir(1,'d1','Designer Um'),false);
    const designer = montar('designer');
    await designer.api.carregar();
    igual(designer.api.controlesPedido(1).includes('Fixar designer'),false);
    await designer.api.atribuir(1,'d1','Designer Um');
    igual(designer.chamadas.some(c => c.nome==='arte_distribuicao_fixar'),false);
    const atendimento = montar('atendimento');
    await atendimento.api.atribuir(1,'d1','Designer Um');
    const escrita = atendimento.chamadas.find(c => c.nome==='arte_distribuicao_fixar');
    igual(escrita.args.p_fixado,true);
    igual(escrita.args.p_num,1);
    igual(escrita.args.p_uid,'d1');
    // Integração real: estado persistido vence override antigo do navegador.
    function extrair(nome) {
        const ini=script.indexOf('\nfunction '+nome+'(');
        return script.slice(ini,script.indexOf('\n}',ini)+2);
    }
    // O atalho não pode dispensar a consulta por ter inativo em cache.
    const atalho = montar();
    atalho.contexto.resposta = { data:{ativo:false,designers:[],pedidos:[]} };
    await atalho.api.carregar();
    atalho.contexto.resposta = { error:{code:'503',message:'Falha de rede'} };
    atalho.contexto.state = {ordens:[{id:'vibe_1',numero:1}]};
    atalho.contexto.podeDefinirDesigner = ()=>true;
    let overridesGravados=0;
    atalho.contexto.localStorage={getItem:()=> '{}',setItem:()=>{overridesGravados++;}};
    vm.runInContext(extrair('setOSDesigner')+'\nthis.definir=setOSDesigner;',atalho.contexto);
    atalho.contexto.definir('vibe_1','Designer Um',1);
    await new Promise(resolve=>setImmediate(resolve));
    igual(atalho.chamadas.length,2);
    igual(overridesGravados,0);
    igual(atalho.avisos.at(-1)[1],'warning');
    const ctx = atendimento.contexto;
    ctx.state={ ordens:[{id:'vibe_1',numero:1}], temposNoCard:{}, todasArtes:[] };
    ctx.localStorage={getItem:()=>'{"vibe_1":"Designer antigo"}'};
    vm.runInContext(extrair('getOSDesigner')+'\nthis.obter=getOSDesigner;',ctx);
    igual(ctx.obter('vibe_1',1),'Designer Um');
    vm.runInContext(extrair('inicioDoTempoNoCard')+'\nthis.inicio=inicioDoTempoNoCard;',ctx);
    igual(ctx.inicio({numero:999}),null);
    assert(Number.isFinite(ctx.inicio({numero:1}))); casos++;
    ctx.state.temposNoCard[1]={card:'concluidos',desde:'2026-10-01T10:00:00-03:00'};
    ctx.pedidoCancelado=()=>false;ctx.escapeHtml=String;ctx.formatDateTime=String;
    ctx.NOME_DO_CARD={fila:'Em Arte'};ctx.corDoTempoNoCard=()=> 'green';ctx.formatarTempoNoCard=String;
    vm.runInContext(extrair('celulaDeTempoHtml')+'\nthis.celula=celulaDeTempoHtml;',ctx);
    igual(ctx.celula({numero:1}).includes('class="celula-tempo"'),true);
    igual(ctx.celula({numero:999}).includes('>--</td>'),true);
    console.log(`OK: ${casos} verificações de distribuição, relógio e integração.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
