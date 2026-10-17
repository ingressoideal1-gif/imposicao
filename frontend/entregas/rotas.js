window.RotasEntregas = (() => {
  const $=id=>document.getElementById(id),grafica='Rua Felizardo de Farias, 81, Medianeira, Porto Alegre, RS, 90660-130, Brasil';
  let fonte,rascunho=null,ativa=null,geracao=0;const selecionados=new Map();
  const chave=p=>p.chave||p.id;
  function limpar(){geracao++;selecionados.clear();rascunho=null;ativa=null;$('rota-revisao').hidden=true;$('rota-ativa').hidden=true;$('rota-proxima').hidden=true;$('rota-proxima').removeAttribute('href');$('rota-erro').textContent='';$('rota-selecao').replaceChildren();}
  function invalidar(){geracao++;rascunho=null;$('rota-revisao').hidden=true;}
  function atualizar(){
    if(!fonte)return;
    $('rota-selecao').replaceChildren();
    for(const p of fonte.pedidos()) {
      if(p.estado!=='minha'){selecionados.delete(chave(p));continue;}
      const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.checked=selecionados.has(chave(p));
      input.onchange=()=>{invalidar();if(input.checked){if(selecionados.size>=20){input.checked=false;$('rota-erro').textContent='Selecione no máximo 20 pedidos.';return;}selecionados.set(chave(p),p);}else selecionados.delete(chave(p));ultima();};
      label.append(input,document.createTextNode('Pedido '+p.id));$('rota-selecao').append(label);
    }
    ultima();
    if(ativa){for(const p of fonte.pedidos()){const stop=ativa.paradas.find(x=>x.chave===chave(p));if(stop&&p.estado==='concluida')stop.entregue=true;}andamento();}
  }
  function ultima(){const valor=$('rota-ultima').value;$('rota-ultima').replaceChildren();for(const [id,p] of selecionados){const o=document.createElement('option');o.value=id;o.textContent='Pedido '+p.id;$('rota-ultima').append(o);}if(selecionados.has(valor))$('rota-ultima').value=valor;$('rota-ultima').hidden=$('rota-retorno').checked;$('rota-ultima-label').hidden=$('rota-retorno').checked;}
  function andamento(){
    $('rota-ativa').hidden=!ativa;if(!ativa)return;
    const entregues=ativa.paradas.filter(p=>p.entregue).length;$('rota-progresso').textContent=`${entregues} de ${ativa.paradas.length} entregas concluídas`;$('rota-andamento').replaceChildren();
    for(const p of ativa.paradas){const li=document.createElement('li');li.textContent=`Pedido ${p.pedido} · ${p.entregue?'Entregue':p.status_erp==='EM TRANSITO'?'Em deslocamento':p.status_erp==='EXPEDICAO'?'Planejado':'Conferir situação no ERP'}`;$('rota-andamento').append(li);}
    const proxima=ativa.paradas.find(p=>!p.entregue),destino=['EXPEDICAO','EM TRANSITO'].includes(proxima?.status_erp)?proxima.endereco:!proxima&&ativa.retorno?grafica:null;
    $('rota-proxima').hidden=!destino;if(destino){$('rota-proxima').href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destino);$('rota-proxima').textContent=proxima?'Navegar para próxima entrega':'Retornar à gráfica';}else $('rota-proxima').removeAttribute('href');
  }
  function iniciar(opcoes){fonte=opcoes;
    for(const id of ['rota-origem','rota-modo','rota-retorno','rota-ultima'])$(id).onchange=()=>{invalidar();ultima();};
    $('rota-calcular').onclick=async()=>{
      invalidar();const turno=geracao;$('rota-erro').textContent='';$('rota-calcular').disabled=true;
      try{
        const stops=[...selecionados.values()];if(!stops.length)throw new Error('Selecione os pedidos em Minhas entregas.');
        if(stops.some(p=>!p.endereco?.trim()))throw new Error('Confira os endereços dos pedidos.');
        const entrada={id:crypto.randomUUID(),pedidos:stops.map(chave),origem:$('rota-origem').value,retorno:$('rota-retorno').checked,ultima:$('rota-ultima').value,modo:$('rota-modo').value};
        if(entrada.origem==='atual') {if(!navigator.geolocation)throw new Error('Localização indisponível. Use a saída da gráfica.');const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error('Não foi possível obter sua localização. Use a saída da gráfica.')),{timeout:10000,maximumAge:30000}));entrada.localizacao={latitude:pos.coords.latitude,longitude:pos.coords.longitude};}
        let resultado;
        if(fonte.demo()){const last=entrada.retorno?null:stops.find(p=>chave(p)===entrada.ultima);const ordem=[...stops.filter(p=>p!==last),...(last?[last]:[])];resultado={id:entrada.id,paradas:ordem.map(p=>({chave:chave(p),pedido:p.id,endereco:p.endereco,status_erp:'EXPEDICAO'})),avisos:[]};}
        else resultado=await VibeEntregas.calcularRota(entrada);
        if(turno!==geracao)return;
        rascunho={...resultado,retorno:entrada.retorno};$('rota-ordem').replaceChildren();for(const p of rascunho.paradas){const li=document.createElement('li');li.textContent=`Pedido ${p.pedido} · ${p.endereco}`;$('rota-ordem').append(li);}
        $('rota-estimativa').textContent=fonte.demo()?'Demonstração: sequência ilustrativa, sem cálculo do Google.':`${(resultado.metros/1000).toFixed(1)} km · aproximadamente ${Math.ceil(resultado.segundos/60)} min de deslocamento · Google Maps`;
        $('rota-avisos').textContent=(resultado.avisos||[]).join(' ');$('rota-revisao').hidden=false;
      }catch(e){if(turno===geracao)$('rota-erro').textContent=e.message;}finally{$('rota-calcular').disabled=false;}
    };
    $('rota-iniciar').onclick=async()=>{if(!rascunho)return;const plano=rascunho,turno=geracao;$('rota-iniciar').disabled=true;try{if(!fonte.demo())await VibeEntregas.confirmarRota(plano.id);if(turno!==geracao)return;ativa={...plano,paradas:plano.paradas.map(p=>({...p,status_erp:'EXPEDICAO',entregue:false}))};$('rota-revisao').hidden=true;andamento();}catch(e){$('rota-erro').textContent=e.message;}finally{$('rota-iniciar').disabled=false;}};
    $('rota-recuperar').onclick=async()=>{const turno=geracao;try{if(fonte.demo()){andamento();return;}const rows=await VibeEntregas.rotasAtivas();if(turno!==geracao)return;ativa=rows.find(r=>r.minha)||null;andamento();if(!ativa)$('rota-erro').textContent='Nenhuma rota ativa.';}catch(e){if(turno===geracao)$('rota-erro').textContent=e.message;}};
  }
  return {iniciar,atualizar,limpar};
})();
