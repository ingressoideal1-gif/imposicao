const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const dir = process.argv[2] || 'frontend';
const script = fs.readFileSync(dir + '/script.js','utf8').replace(/\r\n/g,'\n');
const begin = script.indexOf('function faixaNumeracaoDoModelo(');
const helper = script.slice(begin,script.indexOf('\n}',begin)+2);
for (const file of ['script.js','pedido.js']) {
 const source=fs.readFileSync(dir+'/'+file,'utf8').replace(/\r\n/g,'\n');
 const start=source.indexOf('        // A fatia do modelo, nao o banco inteiro:');
 const branch=source.slice(start,source.indexOf('\n    } else {',start));
 for (const [ni,nf,qtd,tipo,vias] of [[1001,11000,10000,'SEQUENCIAL',1],[0,9,10,'SEQUENCIAL',1],[101,120,10,'TICKET',2]]) {
  const item={numeracao_inicio:ni,numeracao_fim:nf};
  const rows=Array.from({length:qtd},(_,i)=>({__id:i+1,qr:'synthetic-'+i}));
  const inputs={};
  const c={state:{},num:{csv_data:rows,tipo,ticket_qtd:vias},itemAtivoDoPedido:()=>item,fatiaCsvDoItem:()=>rows,
   document:{getElementById:id=>inputs[id] ||= {value:0,setAttribute(){}}}};
  vm.runInNewContext(helper+'\n'+branch,c);
  const prefix=file==='pedido.js'?'ped':'imp';
  assert.equal(inputs[prefix+'-start'].value,ni);assert.equal(inputs[prefix+'-end'].value,nf);
  assert.equal(c.state.csvData,rows);assert.equal(c.state.csvData[0].__id,1);
 }
}
console.log('6 casos: NI/NF preservados, zero, TICKET e índices CSV independentes nas duas telas.');
