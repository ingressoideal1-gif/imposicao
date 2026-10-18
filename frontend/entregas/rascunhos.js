/* Rascunhos locais por usuário; nunca são enviados automaticamente. */
window.RascunhosEntregas = (() => {
  let banco;
  function abrir(){return banco ||= new Promise((resolve,reject)=>{
    const r=indexedDB.open('vibe-entregas-rascunhos',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('rascunhos');
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });}
  async function executar(modo,acao){const db=await abrir();return new Promise((resolve,reject)=>{
    const tx=db.transaction('rascunhos',modo),store=tx.objectStore('rascunhos');let valor;
    const r=acao(store);if(r)r.onsuccess=()=>{valor=r.result;};
    tx.oncomplete=()=>resolve(valor);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}
  const chave=(usuario,pedido)=>usuario+'/'+pedido;
  return {
    ler:(u,p)=>executar('readonly',s=>s.get(chave(u,p))),
    salvar:(u,p,dados)=>executar('readwrite',s=>s.put(dados,chave(u,p))),
    remover:(u,p)=>executar('readwrite',s=>s.delete(chave(u,p))),
    limpar:u=>executar('readwrite',s=>{const r=s.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(String(c.key).startsWith(u+'/'))c.delete();c.continue();}};})
  };
})();
