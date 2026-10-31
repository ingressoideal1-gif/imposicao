'use strict';
// Somente a Lista de Arte interna. O portal e o motor continuam independentes.
(() => {
  let adapter = null, busy = false;
  const mounted = new Map();
  const pendingClears = [];
  const label = entry => entry?.art_origin === 'tracedraw' && Number.isInteger(entry.art_revision)
    ? `Arte gerada pelo ${entry.manifesto?.editor==='coreldraw'?'CorelDRAW':'TraceDraw'} · revisão ${entry.art_revision} · ${(entry.backup_pending??Boolean(entry.manifesto?.backup_job_id))?'backup no Drive pendente':'backup confirmado'}` : '';
  function configure(value) {
    if (adapter || !['request', 'compose', 'reload', 'canEdit'].every(k => typeof value?.[k] === 'function')) {
      throw Error('Adaptador de produção inválido.');
    }
    adapter = value;
  }
  function refresh() {
    for (const [host, b] of mounted) {
      if (!host.isConnected) {mounted.delete(host);continue;}
      b.gab.disabled = b.open.disabled = b.update.disabled = busy || !adapter.canEdit();
      b.badge.textContent = label(b.entry);
      b.badge.hidden = !b.badge.textContent;
    }
  }
  async function action(binding, name, editor, face) {
    if (busy || !adapter.canEdit()) return;
    const started=Date.now();
    busy = true; refresh();
    binding.feedback.textContent = name === 'open' ? `Abrindo no ${editor==='coreldraw'?'CorelDRAW':'TraceDraw'}…` : 'Preparando…';
    try {
      const identity = {order:Number(binding.order), model:Number(binding.model),editor:'coreldraw'};
      if(name==='clear')identity.face=face;
      if(editor)identity.editor=editor;
      if(name==='open'&&binding.gab.checked)identity.gabarito=true;
      let result;
      if (name === 'update') {
        const draft = await adapter.request('prepare', identity);
        const preparedAt=Date.now();
        if(!Array.isArray(draft.drafts))throw Error('A ponte está executando a versão antiga, que atualiza apenas um modelo. Reinicie a ponte antes de publicar o documento.');
        if (draft.unchanged === true) {
          if(draft.state)binding.entry=draft.state;
          binding.feedback.textContent='Todas as páginas do documento já estão atualizadas.';
          return;
        }
        if(Array.isArray(draft.drafts)) {
          const prepared=[],completed=[];
          const stageTimes={};
          const collectTimes=performance=>{
            for(const [name,row] of Object.entries(performance?.stages||{}))
              if(Number.isFinite(row.seconds))stageTimes[name]=(stageTimes[name]||0)+row.seconds;
          };
          collectTimes(draft.performance);
          const ids=new Set();
          for(const part of draft.drafts) {
            if(!part.operation||ids.has(String(part.model)))throw Error('Mapa de publicação inválido.');
            ids.add(String(part.model));
            const member=[...mounted.values()].find(b=>b.order===binding.order&&b.model===String(part.model)&&b.osId===binding.osId&&b.controls.isConnected);
            if(!member)throw Error('Abra todos os modelos do documento antes de atualizar.');
            binding.feedback.textContent=`Gerando amostra ${prepared.length+1}/${draft.drafts.length}…`;
            prepared.push({part,member,samples:await adapter.compose(member,part)});
          }
          const composedAt=Date.now();
          try {
            if(draft.atomic_document===true) {
              binding.feedback.textContent=`Publicando documento com ${prepared.length} modelo(s)…`;
              const receipt=await adapter.request('publish_document',{...identity,parts:prepared.map(({part,samples})=>({model:Number(part.model),operation:part.operation,samples}))});
              const received=receipt.receipts;
              if(receipt.confirmed!==true||Number(receipt.pedido)!==identity.order||!Array.isArray(received)||received.length!==prepared.length)
                throw Error('Documento sem todos os recibos de publicação.');
              for(const {part} of prepared)if(!received.some(r=>Number(r.modelo)===Number(part.model)&&r.operacao===part.operation&&Number(r.pedido)===identity.order))
                throw Error('Recibo do documento divergente.');
              collectTimes(receipt.performance);
              completed.push(...prepared.map(({part})=>Number(part.model)));
            } else {
            for(const {part,member,samples} of prepared) {
              binding.feedback.textContent=`Atualizando modelo ${completed.length+1}/${prepared.length}…`;
              const receipt=await adapter.request('publish',{...identity,model:Number(part.model),operation:part.operation,samples});
              collectTimes(receipt.performance);
              if(receipt.confirmed!==true||Number(receipt.modelo)!==Number(part.model)||Number(receipt.pedido)!==identity.order)
                throw Error('Persistência não confirmada.');
              completed.push(Number(part.model));member.entry=receipt.state||member.entry;
              member.feedback.textContent=receipt.message||'PDF e amostra atualizados.';
            }
            }
          } catch(error) {
            if(completed.length)await adapter.reload(binding);
            throw Error(`${completed.length}/${prepared.length} modelos confirmados. ${error.message} Confira o documento antes de repetir.`);
          }
          const publishedAt=Date.now();
          await adapter.reload(binding);
          for(const member of mounted.values())if(member.order===binding.order&&ids.has(member.model)) {
            member.feedback.textContent=`Documento atualizado: ${completed.length} modelo(s) em ${Math.round((Date.now()-started)/1000)} s. Preparação: ${((preparedAt-started)/1000).toFixed(1)} s; amostras: ${((composedAt-preparedAt)/1000).toFixed(1)} s; publicação: ${((publishedAt-composedAt)/1000).toFixed(1)} s.`;
            member.feedback.title=Object.entries(stageTimes).map(([name,seconds])=>`${name}: ${seconds.toFixed(2)} s`).join('; ');
          }
          return;
        }
      } else {
        result = await adapter.request(name==='clear'?'clear':'open', identity);
      }
      if (name !== 'open' && name !== 'clear') {
        if (result.confirmed !== true || Number(result.modelo) !== identity.model || Number(result.pedido) !== identity.order) {
          throw Error('Persistência não confirmada. Recarregue antes de repetir.');
        }
        // Apenas o recibo confirmado permite atualizar a interface oficial.
        await adapter.reload(binding);
      }
      binding.entry = result.state || binding.entry;
      binding.feedback.textContent = result.message || 'Concluído.';
    } catch (error) {
      binding.feedback.textContent = error.message || 'Operação não concluída; confira a revisão vigente.';
      for(const member of mounted.values())if(member.order===binding.order&&member.model===binding.model)
        member.feedback.textContent=binding.feedback.textContent;
    } finally {
      busy = false;refresh();
      const next=pendingClears.shift();
      if(next)await action(next.binding,'clear','coreldraw',next.face);
    }
  }
  function mount(container, order, items, osId) {
    if (!adapter || container.id !== 'amostras-itens-container' || !adapter.canEdit()) return;
    for (let i=0;i<items.length;i++) {
      const item=items[i], anchor=container.querySelector(`#amostra-item-arte-${i}`);
      if (!anchor || !item.id || item._produto_prateleira) continue;
      const host=anchor.parentElement, old=mounted.get(host);
      if (old?.model===String(item.id) && old.order===String(order)) continue;
      if (old) {old.controls.remove();mounted.delete(host);}
      const controls=document.createElement('span');
      controls.dataset.tracedrawControls='producao';
      controls.style.cssText='display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:6px;align-items:center;margin-left:auto;flex:1 1 200px;min-width:200px;padding-top:26px;align-self:flex-start';
      const open=document.createElement('button'),update=document.createElement('button');
      for (const button of [open,update]) {button.type='button';button.className='btn btn-sm btn-secondary';}
      open.style.cssText='grid-column:3;height:36px;white-space:nowrap';
      update.style.cssText='grid-column:4;height:36px;white-space:nowrap';
      open.textContent='CorelDRAW';update.textContent='Atualizar';
      update.title='Atualiza o documento do editor escolhido pelo Imposition. Salve suas edições antes de atualizar.';
      const gab=document.createElement('input'),gabLabel=document.createElement('label');
      gab.type='checkbox';gab.checked=false;gabLabel.style.cssText='grid-column:2;white-space:nowrap';
      gabLabel.title='Adicionar gabarito editável às páginas deste modelo. Desmarcar não remove elementos já inseridos.';
      gabLabel.append(gab,document.createTextNode(' Gab.'));
      const badge=document.createElement('span'), feedback=document.createElement('span');
      badge.className='badge badge-teal';feedback.setAttribute('role','status');
      badge.style.cssText='grid-column:1 / -1;justify-self:end';
      feedback.style.cssText='grid-column:1 / -1;text-align:right;overflow-wrap:anywhere;min-width:0';
      const binding={order:String(order),model:String(item.id),osId,index:i,gab,open,update,badge,feedback,controls,entry:null};
      open.onclick=()=>action(binding,'open','coreldraw');update.onclick=()=>action(binding,'update');
      const toolbar=host.closest?.('[data-tracedraw-toolbar]')||host;
      controls.append(gabLabel,open,update,badge,feedback);toolbar.append(controls);mounted.set(host,binding);
      if (typeof adapter.status==='function') {
        const poll=()=>adapter.status(binding).then(entry=>{binding.entry=entry;refresh();
          if(entry.backup_pending&&host.isConnected)setTimeout(poll,5000);
        }).catch(()=>{if(host.isConnected)setTimeout(poll,10000);});
        poll();
      }
    }
    refresh();
  }
  async function artRemoved(osId,model,face) {
    const binding=[...mounted.values()].find(b=>b.osId===osId&&b.model===String(model)&&b.controls.isConnected);
    if(!binding)return;
    binding.entry=null;
    const nativeFace=face==='verso'?'back':'front';
    if(busy){pendingClears.push({binding,face:nativeFace});binding.feedback.textContent='PDF excluído. A limpeza do CDR será iniciada ao terminar a operação atual.';return;}
    await action(binding,'clear','coreldraw',nativeFace);
  }
  window.ImpositionTraceDraw=Object.freeze({configure,mount,refresh,label,artRemoved});
})();

// Biblioteca privada de fontes, no modulo ja sincronizado pelas estacoes.
(() => {
  let dialog, rows, status, search, files, license, note, upload, busy=false, catalog=[];
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const canEdit=()=>window._currentPerms?.perm_fontes_edit===true;
  async function api(action,body={}) {
    const {data,error}=await supabaseClient.auth.getSession();
    if(error||!data?.session?.access_token)throw Error('Entre novamente no Imposition.');
    const response=await fetch(API_PAINEL+'/api/fontes-corel/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw Error(result.message||result.error||'Biblioteca indisponível.');return result;
  }
  async function load() {
    const result=[];
    for(let offset=0;;offset+=200){const data=await api('listar',{offset});if(!Array.isArray(data.fontes))throw Error('Catálogo inválido.');result.push(...data.fontes);if(data.fontes.length<200)break;}
    catalog=result;
  }
  function render() {
    upload.disabled=busy||!canEdit();files.disabled=busy||!canEdit();rows.replaceChildren();
    const term=search.value.trim().toLocaleLowerCase('pt-BR');
    for(const f of catalog.filter(f=>[f.nome,f.familia,f.estilo,f.versao].join(' ').toLocaleLowerCase('pt-BR').includes(term))) {
      const tr=el('tr'),info=el('td'),actions=el('td'),download=el('button','Baixar');download.type='button';download.className='btn btn-secondary btn-sm';download.disabled=busy;
      info.append(el('strong',f.nome),el('div',`${f.estilo} · ${f.versao||'Versão não informada'}`),el('small',`SHA-256: ${f.sha256}`));
      download.onclick=()=>run(async()=>{
        const meta=await api('baixar',{sha256:f.sha256}),r=await fetch(meta.url);if(!r.ok)throw Error('Download indisponível.');
        const data=await r.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==f.sha256||data.byteLength!==f.tamanho)throw Error('Arquivo recebido incompleto. Tente novamente.');
        const url=URL.createObjectURL(new Blob([data])),a=el('a');a.href=url;a.download=f.sha256+'.'+f.extensao;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status.textContent='Download verificado.';
      });actions.append(download);tr.append(info,actions);rows.append(tr);
    }
  }
  async function run(work){if(busy)return;busy=true;render();status.textContent='Aguarde…';try{await work();}catch(e){status.textContent=e.message;}finally{busy=false;render();}}
  async function save() {
    const selected=Array.from(files.files||[]);
    await run(async()=>{
      if(!license.checked)throw Error('Confirme que a licença permite distribuir as fontes entre as estações.');
      if(!selected.length)throw Error('Selecione arquivos TTF/OTF.');
      const errors=[];let saved=0,duplicates=0;
      for(const file of selected) {
        try {
          if(!/\.(ttf|otf)$/i.test(file.name)||!file.size||file.size>10*1024*1024)throw Error('Use TTF/OTF até 10 MiB.');
          const data=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<data.length;i+=8192)raw+=String.fromCharCode(...data.subarray(i,i+8192));
          const result=await api('salvar',{arquivo:btoa(raw),licenca_confirmada:true,licenca_nota:note.value});
          if(result.inalterado)duplicates++;else saved++;
        } catch(e){errors.push(file.name+': '+e.message);}
      }
      files.value='';license.checked=false;await load();status.textContent=`${saved} cadastrada(s); ${duplicates} já existente(s). ${errors.join(' ')}`;
    });
  }
  async function abrir() {
    if(!dialog){
      dialog=el('dialog');dialog.setAttribute('aria-label','Fontes internas CorelDRAW');dialog.style.cssText='width:min(960px,94vw);max-height:85vh;overflow:auto;background:var(--bg-card,#1e293b);color:inherit;border:1px solid #64748b;border-radius:12px;padding:24px';
      const close=el('button','Fechar');close.type='button';close.className='btn btn-secondary';close.onclick=()=>dialog.close();
      files=el('input');files.type='file';files.multiple=true;files.accept='.ttf,.otf';files.setAttribute('aria-label','Arquivos de fonte TTF ou OTF');
      license=el('input');license.type='checkbox';const label=el('label');label.append(license,document.createTextNode(' Confirmo que a licença permite compartilhar estas fontes entre as estações da empresa.'));
      note=el('input');note.type='text';note.maxLength=1000;note.placeholder='Origem ou licença (opcional)';note.setAttribute('aria-label','Origem ou licença');
      upload=el('button','Carregar fontes');upload.type='button';upload.className='btn btn-primary';upload.onclick=save;
      search=el('input');search.type='search';search.placeholder='Pesquisar nome, estilo ou versão';search.setAttribute('aria-label','Pesquisar fontes');search.oninput=render;
      for(const input of [files,note,search])input.style.cssText='display:block;width:100%;margin:12px 0';
      status=el('p');status.setAttribute('role','status');const table=el('table');table.style.width='100%';rows=el('tbody');table.append(rows);
      dialog.append(el('h2','Fontes internas — CorelDRAW'),el('p','Arquivos privados, até 10 MiB por fonte. Versões de mesmo nome são mantidas separadas. O catálogo web continua independente.'),close,files,label,note,upload,search,status,table);document.body.append(dialog);
    }
    dialog.showModal();await run(async()=>{await load();status.textContent='Biblioteca carregada.';});
  }
  window.FontesCorel=Object.freeze({abrir});
})();

// Biblioteca de gabaritos distribuida no modulo ja sincronizado pelas estacoes.
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
  function atualizarAcesso(){const card=document.getElementById?.('card-gabaritos-arte');if(card){card.hidden=!allowed();card.style.display=allowed()?'':'none';}}
  window.Gabaritos=Object.freeze({abrir,atualizarAcesso});atualizarAcesso();
})();
