// O navegador somente le o inicio persistido; sem integracoes reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/script.js','utf8');
function extract(name) {
 const i=source.search(new RegExp('\\n(?:async )?function '+name+'\\('));
 assert(i>=0,name); return source.slice(i,source.indexOf('\n}',i)+2);
}
assert(!source.includes('function anotarTempoNoCard('));
assert(!source.includes('function gravarTemposNoCard('));
assert(!source.includes(".from('imposition_tempo_no_card')"));
const state={temposNoCard:{
 1:{card:'fila',desde:'2026-09-28T10:00:00Z',credito_segundos:9999},
 2:{card:'aprovacao',desde:'2026-09-29T11:00:00Z'},
 3:{card:'aprovacao',desde:null}
}};
const c={state};vm.createContext(c);vm.runInContext(extract('inicioDoTempoNoCard'),c);
for(let i=0;i<100;i++) {
 assert.equal(c.inicioDoTempoNoCard({numero:1,_fila_arte:'fila'}),Date.parse('2026-09-28T10:00:00Z'));
 assert.equal(c.inicioDoTempoNoCard({numero:2,_fila_arte:'aprovacao'}),Date.parse('2026-09-29T11:00:00Z'));
}
assert.equal(c.inicioDoTempoNoCard({numero:2,_fila_arte:'fila'}),null,'troca aguarda marcador da etapa atual');
assert.equal(c.inicioDoTempoNoCard({numero:3,_fila_arte:'aprovacao'}),null,'baseline nao inventa horario');
assert.equal(c.inicioDoTempoNoCard({numero:4,_fila_arte:'fila'}),null,'memoria vazia nao inicia relogio');
console.log('OK: 100 releituras preservam inicios distintos; sem escrita, credito legado ou horario inventado.');
