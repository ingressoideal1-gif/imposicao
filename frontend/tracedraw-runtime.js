'use strict';
(() => {
  const origin='http://localhost:9012';
  let sequence=0;
  async function localFetch(path,options={},timeout=180000) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try {
      return await fetch(origin+path,{...options,credentials:'omit',cache:'no-store',signal:controller.signal});
    } catch(error) {
      if(error.name==='AbortError')throw Error('A ponte não confirmou a resposta no prazo. Confira o estado antes de repetir.');
      throw Error('Não foi possível conectar à Ponte Imposition. Confira se está aberta e se o navegador permite acesso à rede local.');
    } finally {clearTimeout(timer);}
  }
  function chooseFile(result) {
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');
      dialog.style.cssText='max-width:480px;padding:24px;border:1px solid #64748b;border-radius:12px;background:#1e293b;color:#f8fafc';
      const title=document.createElement('h3');title.textContent='Arquivo foi alterado';
      const text=document.createElement('p');text.textContent=result.message||'Abrir do disco ou do Drive? A arte salva será preservada.';
      const actions=document.createElement('div');actions.style.cssText='display:flex;gap:10px;flex-wrap:wrap';
      dialog.append(title,text,actions);
      let finished=false;
      const finish=value=>{if(finished)return;finished=true;dialog.close();dialog.remove();resolve(value);};
      for(const [label,value,enabled] of [['Abrir do disco','disk',result.disk_available],['Abrir do Drive','drive',result.drive_available],...(result.pdf_available?[['Criar do PDF atual','pdf',true]]:[]),['Cancelar',null,true]]) {
        const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=!enabled;
        button.className='btn btn-primary';button.style.cssText='padding:9px 14px;border-radius:6px;cursor:pointer';
        button.addEventListener('click',()=>finish(value));actions.append(button);
      }
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
      document.body.append(dialog);dialog.showModal();
    });
  }
  async function request(action,data) {
    const healthResponse=await localFetch('/health',{},5000);
    if(!healthResponse.ok)throw Error('Ponte local indisponível.');
    const health=await healthResponse.json();
    if(health.application!=='Ponte Imposition'||health.protocol!==1||health.direct_transport!==true)
      throw Error('Atualize a Ponte Imposition para a versão 1.3.0 ou superior.');
    if(!health.ready)throw Error(health.message||'A ponte precisa de atenção.');
    if(data.editor==='coreldraw'&&!health.editors?.includes('coreldraw'))
      throw Error('CorelDRAW indisponível na ponte. Confira a instalação do programa e atualize a Ponte Imposition.');
    const {data:auth,error}=await supabaseClient.auth.getSession();
    if(error||!auth?.session?.access_token)throw Error('Entre novamente no Imposition.');
    const response=await localFetch('/api/editor/producao/'+action,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({data,token:auth.session.access_token})});
    const result=await response.json();
    if(!response.ok)throw Error(result.message||'Operação não confirmada.');
    if(action==='open'&&result.requires_selection===true) {
      const origin=await chooseFile(result);
      if(!origin)throw Error('Abertura cancelada; arquivos preservados.');
      return request(action,{...data,origin,selection_token:result.selection_token});
    }
    return result;
  }
  async function compose(binding,draft) {
    const original=state.osItens[binding.osId]?.[binding.index];
    if(!original||String(original.id)!==binding.model)throw Error('Modelo mudou de posiÃ§Ã£o. Reabra o pedido.');
    const container=document.getElementById('amostras-itens-container');
    for(const prefix of ['amostra-item-arte-','amostra-item-arte-verso-']) {
      if(container.querySelector('#'+prefix+binding.index)?.files?.length)throw Error('Existe upload manual selecionado. Conclua ou remova essa seleÃ§Ã£o antes do CorelDRAW.');
    }
    const item={...original,arte_url:draft.files.front,verso_arte_url:draft.files.back||null,_dbLoaded:true,_needsSnapshot:false};
    delete item._snapshotTimer;delete item._cacheArteAmostra;
    const cor=state.cores.find(row=>String(row.id)===String(item.amostra_cor_id));
    let num=state.numeracoes.find(row=>String(row.id)===String(item.amostra_num_id));
    num=resolverNumeracaoParaModelo(num,item);
    const fmt=formatoDoModelo(item,cor,num);
    if(!fmt?.width_mm||!fmt?.height_mm)throw Error('Formato da composiÃ§Ã£o nÃ£o confirmado.');
    await garantirFontesCarregadas(fontesDosElementos(num?.elements));
    const idx=-(++sequence),osKey='tracedraw_'+crypto.randomUUID(),key=osKey+'_'+idx;
    const host=document.createElement('div');host.style.cssText='position:absolute;left:-100000px;pointer-events:none';
    host.setAttribute('aria-hidden','true');
    const make=(tag,id)=>{const node=document.createElement(tag);node.id=id;host.append(node);return node;};
    const front=make('canvas',`amostra-item-canvas-${idx}`),back=make('canvas',`amostra-item-canvas-verso-${idx}`);
    const emptyFront=make('span',`amostra-item-empty-${idx}`),emptyBack=make('span',`amostra-item-empty-verso-${idx}`);
    const viewer=make('div',`amostra-pdf-viewer-${idx}`);viewer.dataset.pdfOs=osKey;
    const pdfCanvas=make('canvas',`amostra-pdf-canvas-${idx}`);
    make('span',`amostra-pdf-page-info-${idx}`);make('div',`amostra-pdf-nav-${idx}`);
    state.osItens[osKey]=[];state.osItens[osKey][idx]=item;container.append(host);
    const current=()=>original===state.osItens[binding.osId]?.[binding.index] && host.isConnected;
    try {
      // Reutiliza o desenhista oficial, sem upload, autosnapshot ou alteracao do item real.
      await preloadAmostraItemPdfElements(num,idx,osKey,item);
      await drawAmostraFace(item,'front',front,emptyFront,fmt,cor,num,idx,osKey,150/25.4,current);
      if(draft.files.back)await drawAmostraFace(item,'back',back,emptyBack,fmt,cor,num,idx,osKey,150/25.4,current);
      if(!current())throw Error('A janela mudou durante a composiÃ§Ã£o.');
      const result={};
      for(const face of Object.keys(draft.files)) {
        const canvas=face==='back'?back:item.modo_pdf?pdfCanvas:front;
        if(!canvas.width||!canvas.height||canvas.style.display==='none')throw Error('Face da amostra nÃ£o foi desenhada.');
        if(item.modo_pdf&&pdfViewerState[key]?.erro)throw Error('PrÃ©via paginada incompleta.');
        result[face]=canvas.toDataURL('image/png');
      }
      return result;
    } finally {
      if(pdfViewerState[key]?.pdf)await pdfViewerState[key].pdf.destroy();
      delete pdfViewerState[key];delete pdfViewerState[idx];delete state.osItens[osKey];host.remove();
    }
  }
  window.aguardarBackupTraceDraw=async function(osId,model=null) {
    if(window._currentPerms?.perm_lista_arte_edit!==true)return;
    const item=(state.osItens[osId]||[]).find(i=>model===null||String(i.id)===String(model));
    if(!item)throw Error('Modelo não localizado para conferir o backup.');
    const order=Number(item.id_int);
    if(!Number.isSafeInteger(order)||order<=0)throw Error('Pedido não confirmado para conferir backup.');
    for(let attempt=0;attempt<37;attempt++) {
      const {data,error}=await supabaseClient.rpc('imposition_tracedraw_backup_estado',{p_pedido:order,p_modelo:model===null?null:Number(model)});
      if(error)throw Error('Não foi possível conferir o backup no Drive. Tente novamente.');
      if(data?.pending===false)return;
      if(attempt===0&&typeof toast==='function')toast('Aguardando confirmação do backup no Drive…','info');
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
    throw Error('Backup no Drive continua pendente. O PDF está atualizado; tente concluir novamente em instantes.');
  };
  window.ImpositionTraceDraw.configure({request,compose,
    canEdit:()=>window._currentPerms?.perm_lista_arte_edit===true,
    async status(binding) {
      const {data,error}=await supabaseClient.rpc('imposition_tracedraw_estado',{p_pedido:Number(binding.order),p_modelo:Number(binding.model)});
      if(error)throw error;
      if(data?.manifesto?.backup_job_id) {
        const backup=await supabaseClient.rpc('imposition_tracedraw_backup_estado',{p_pedido:Number(binding.order),p_modelo:Number(binding.model)});
        if(backup.error) return {...data,backup_pending:true};
        return {...data,backup_pending:backup.data.pending};
      }
      return {...data,backup_pending:false};
    },
    async reload(binding) {
      await loadOSItens(binding.osId,{atualizar:true,obrigatorio:true});
      renderAmostrasOSItens(binding.osId,{atualizarDados:true});
    }
  });
})();
