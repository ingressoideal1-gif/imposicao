'use strict';
// Somente a Lista de Arte interna. O portal e o motor continuam independentes.
(() => {
  let adapter = null, busy = false;
  const mounted = new Map();
  const label = entry => entry?.art_origin === 'tracedraw' && Number.isInteger(entry.art_revision)
    ? `Arte gerada pelo TraceDraw · revisão ${entry.art_revision} · ${(entry.backup_pending??Boolean(entry.manifesto?.backup_job_id))?'backup no Drive pendente':'backup confirmado'}` : '';
  function configure(value) {
    if (adapter || !['request', 'compose', 'reload', 'canEdit'].every(k => typeof value?.[k] === 'function')) {
      throw Error('Adaptador de produção inválido.');
    }
    adapter = value;
  }
  function refresh() {
    for (const [host, b] of mounted) {
      if (!host.isConnected) {mounted.delete(host);continue;}
      b.open.disabled = b.update.disabled = busy || !adapter.canEdit();
      b.badge.textContent = label(b.entry);
      b.badge.hidden = !b.badge.textContent;
    }
  }
  async function action(binding, name) {
    if (busy || !adapter.canEdit()) return;
    const started=Date.now();
    busy = true; refresh();
    binding.feedback.textContent = name === 'open' ? 'Abrindo no TraceDraw…' : 'Preparando…';
    try {
      const identity = {order:Number(binding.order), model:Number(binding.model)};
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
              const receipt=await adapter.request('publish',{order:identity.order,model:Number(part.model),operation:part.operation,samples});
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
    } finally {busy = false;refresh();}
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
      controls.style.cssText='display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;align-items:center;margin-left:auto;flex:1 1 180px;min-width:180px;padding-top:26px;align-self:flex-start';
      const open=document.createElement('button'),update=document.createElement('button');
      for (const button of [open,update]) {button.type='button';button.className='btn btn-sm btn-secondary';}
      open.style.cssText='grid-column:2;height:36px;white-space:nowrap';
      update.style.cssText='grid-column:3;height:36px;white-space:nowrap';
      open.textContent='TraceDraw';update.textContent='Atualizar';
      update.title='Salve no TraceDraw antes de atualizar o PDF oficial.';
      const badge=document.createElement('span'), feedback=document.createElement('span');
      badge.className='badge badge-teal';feedback.setAttribute('role','status');
      badge.style.cssText='grid-column:1 / -1;justify-self:end';
      feedback.style.cssText='grid-column:1 / -1;text-align:right;overflow-wrap:anywhere;min-width:0';
      const binding={order:String(order),model:String(item.id),osId,index:i,open,update,badge,feedback,controls,entry:null};
      open.onclick=()=>action(binding,'open');update.onclick=()=>action(binding,'update');
      const toolbar=host.closest?.('[data-tracedraw-toolbar]')||host;
      controls.append(open,update,badge,feedback);toolbar.append(controls);mounted.set(host,binding);
      if (typeof adapter.status==='function') {
        const poll=()=>adapter.status(binding).then(entry=>{binding.entry=entry;refresh();
          if(entry.backup_pending&&host.isConnected)setTimeout(poll,5000);
        }).catch(()=>{if(host.isConnected)setTimeout(poll,10000);});
        poll();
      }
    }
    refresh();
  }
  async function artRemoved(osId,model) {
    const binding=[...mounted.values()].find(b=>b.osId===osId&&b.model===String(model)&&b.controls.isConnected);
    if(!binding)return;
    binding.entry=null;
    if(busy){binding.feedback.textContent='PDF excluído. Limpeza no TraceDraw pendente; aguarde e clique em TraceDraw.';return;}
    await action(binding,'clear');
  }
  window.ImpositionTraceDraw=Object.freeze({configure,mount,refresh,label,artRemoved});
})();
