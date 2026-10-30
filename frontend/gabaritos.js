'use strict';
(() => {
  let dialog, rows, status, search, busy=false, products=[], revisions=new Map();
  const allowed=()=>['admin','gerente','designer','atendimento'].includes(String(window._currentPerms?.role||'').toLowerCase())&&window._currentPerms?.perm_lista_arte_view!==false;
  const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  async function api(action,body={}) {
    const {data,error}=await supabaseClient.auth.getSession();
    if(error||!data?.session?.access_token)throw Error('Entre novamente no Imposition.');
    const r=await fetch(API_PAINEL+'/api/gabaritos/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body)});
    const result=await r.json();
    if(!r.ok)throw Error(result.message||result.error||'Não foi possível acessar os gabaritos.');
    return result;
  }
  async function run(work) {
    if(busy)return;
    busy=true;render();status.textContent='Aguarde…';
    try{await work();}catch(e){status.textContent=e.message;}finally{busy=false;render();}
  }
  async function load() {
    const data=await api('listar');products=data.produtos;revisions=new Map(data.gabaritos.map(r=>[Number(r.produto),r.revisao]));render();
  }
  async function upload(product,file) {
    if(!file)return;
    await run(async()=>{
      if(!/\.pdf$/i.test(file.name)||!file.size||file.size>30*1024*1024)throw Error('Selecione um PDF de até 30 MiB.');
      const bytes=new Uint8Array(await file.arrayBuffer());
      const pdf=await PDFLib.PDFDocument.load(bytes);
      if(![1,2].includes(pdf.getPageCount()))throw Error('Use PDF com uma página ou duas páginas (Frente e Verso).');
      const anterior=revisions.get(product)||null;
      if(anterior&&!window.confirm('Substituir o gabarito deste produto? Documentos já editados no CorelDRAW serão preservados.')){status.textContent='Substituição cancelada.';return;}
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      await api('salvar',{produto:product,anterior,nome:file.name,pdf:btoa(binary)});
      await load();status.textContent='Gabarito salvo.';
    });
  }
  function render() {
    if(!rows)return;rows.replaceChildren();
    const term=search.value.trim().toLocaleLowerCase('pt-BR');
    for(const p of products.filter(p=>(p.nomeReal+' '+p.id_produto).toLocaleLowerCase('pt-BR').includes(term))) {
      const tr=node('tr'), name=node('td',p.nomeReal+' · '+p.id_produto), actions=node('td');
      const input=node('input');input.type='file';input.accept='application/pdf,.pdf';input.hidden=true;
      input.onchange=()=>upload(Number(p.id_produto),input.files[0]);
      const send=node('button',revisions.has(Number(p.id_produto))?'Substituir PDF':'Carregar PDF');send.type='button';send.className='btn btn-secondary btn-sm';send.disabled=busy;send.onclick=()=>input.click();
      const download=node('button','Baixar PDF');download.type='button';download.className='btn btn-secondary btn-sm';download.disabled=busy||!revisions.has(Number(p.id_produto));
      download.onclick=()=>run(async()=>{
        const file=await api('baixar',{produto:Number(p.id_produto)});
        const response=await fetch(file.url);if(!response.ok)throw Error('Download indisponível. Tente novamente.');
        const url=URL.createObjectURL(await response.blob()),a=node('a');a.href=url;a.download=file.nome;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status.textContent='Download iniciado.';
      });
      actions.append(send,download,input);tr.append(name,actions);rows.append(tr);
    }
  }
  async function abrir() {
    if(!allowed())return;
    if(!dialog) {
      dialog=node('dialog');dialog.style.cssText='width:min(900px,94vw);max-height:85vh;overflow:auto;background:var(--bg-card,#1e293b);color:inherit;border:1px solid #64748b;border-radius:12px;padding:24px';
      dialog.setAttribute('aria-label','Gabaritos por produto');
      const close=node('button','Fechar');close.type='button';close.className='btn btn-secondary';close.onclick=()=>dialog.close();
      search=node('input');search.type='search';search.placeholder='Pesquisar produto ou código';search.setAttribute('aria-label','Pesquisar produto');search.oninput=render;search.style.cssText='width:100%;margin:12px 0;padding:10px';
      status=node('p');status.setAttribute('role','status');
      const table=node('table');table.style.width='100%';rows=node('tbody');table.append(rows);
      dialog.append(node('h2','Gabaritos'),node('p','Um PDF por produto, até 30 MiB. Uma página: mesma base nas duas faces. Duas páginas: Frente e Verso. O gabarito será editável e fará parte da arte exportada.'),close,search,status,table);document.body.append(dialog);
    }
    dialog.showModal();await run(async()=>{await load();status.textContent='Selecione um produto para carregar ou baixar o PDF.';});
  }
  function atualizarAcesso(){const card=document.getElementById('card-gabaritos-arte');if(card){card.hidden=!allowed();card.style.display=allowed()?'':'none';}}
  window.Gabaritos=Object.freeze({abrir,atualizarAcesso});atualizarAcesso();
})();
