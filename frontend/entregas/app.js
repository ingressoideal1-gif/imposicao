/* Execução das entregas atribuídas no Imposition. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = { disponivel: 'Disponíveis', minha: 'Minha rota', concluida: 'Concluídas' };
  const reasons = { repasse: 'Repassado à transportadora', entregue: 'Entregue', ausente: 'Destinatário ausente', endereco: 'Endereço incorreto', recusa: 'Entrega recusada' };
  let pedidos = [], filtro = 'minha', atual = null, foto = null, fotoURL = '', carregandoFoto = false, enviando = false, instalacao;
  let usuario = null, modalidade = 'motoboy';
  let demo = true, offset = 0, consulta = 0, operacao = null, debounce, fotoLeitura = 0;
  async function carregar() {
    if (demo) { render(); return; }
    const sequencia = ++consulta;
    try {
      const [rows] = await Promise.all([filtro === 'minha' ? VibeEntregas.minhas('', modalidade) : VibeEntregas.listar($('busca').value.trim(), offset, filtro, modalidade), RotasEntregas.carregar()]);
      if (sequencia !== consulta) return;
      pedidos = filtro === 'minha' ? rows : rows.slice(0, 50); $('paginacao').hidden=filtro === 'minha'; $('proxima').disabled = rows.length <= 50; $('anterior').disabled = offset === 0; render();
    } catch (e) { if(sequencia === consulta) { pedidos = []; render(); aviso(e.message); } }
  }
  async function abrirSessao(conta) {
    usuario=conta;demo=false;offset=0;filtro='minha';
    $('inicio').hidden=true;$('login').hidden=true;$('operacao').hidden=false;$('aviso-demo').hidden=true;
    $('identidade').textContent=usuario.email||'Entregador';$('paginacao').hidden=false;await carregar();
  }
  $('login').hidden = !VibeEntregas.ativo;
  $('login').onsubmit = async event => {
    event.preventDefault(); const b = $('login').querySelector('button'); b.disabled = true; $('login-erro').textContent = '';
    try {
      await abrirSessao(await VibeEntregas.entrar($('email').value.trim(), $('senha').value));
    } catch (e) { $('login-erro').textContent = e.message; }
    finally { $('senha').value = ''; b.disabled = false; }
  };
  $('anterior').onclick = () => { offset = Math.max(0, offset - 50); carregar(); };
  $('proxima').onclick = () => { offset += 50; carregar(); };
  function text(tag, value, cls) { const el = document.createElement(tag); el.textContent = value; if (cls) el.className = cls; return el; }
  function aviso(value) { $('mensagem').textContent = value; }
  function botao(label, acao) { const b = text('button', label); b.type = 'button'; b.onclick = acao; return b; }
  function render() {
    window.RotasEntregas?.atualizar();
    const rotaAtiva = RotasEntregas.atual();
    const ordem = new Map((rotaAtiva?.paradas || []).map((p,i)=>[p.chave,i]));
    $('titulo').textContent = labels[filtro];
    document.querySelectorAll('[data-modalidade]').forEach(b=>b.onclick=()=>{
    modalidade=b.dataset.modalidade;offset=0;consulta++;pedidos=[];
    document.querySelectorAll('[data-modalidade]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    $('busca').value='';$('modalidade-info').textContent=modalidade==='motoboy'?'Expedição do dia + Prontos para Expedir.':
      (modalidade==='veppo'?'Veppo · CEP 90035-040, nº 70.':'Aéreo · CEP 92020-400, nº 45.')+' Confirme o repasse em grupo à transportadora.';
    render();carregar();
  });
  document.querySelectorAll('[data-filtro]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filtro === filtro)));
    const busca = $('busca').value.trim().toLowerCase();
    const rows = pedidos.filter(p => p.estado === filtro && String(p.id).toLowerCase().includes(busca)).sort((a,b)=>(ordem.get(a.chave) ?? 999)-(ordem.get(b.chave) ?? 999));
    $('contador').textContent = `${rows.length} pedido${rows.length === 1 ? '' : 's'}`;
    $('lista').replaceChildren();
    const gruposExibidos = new Set();
    for (const p of rows) {
      if (p.estado==='minha' && ['veppo','aereo'].includes(p.modalidade) && ordem.has(p.chave)) {
        if(gruposExibidos.has(p.modalidade))continue;gruposExibidos.add(p.modalidade);
        const grupo=pedidos.filter(x=>x.estado==='minha'&&x.modalidade===p.modalidade&&ordem.has(x.chave));
        const nome=p.modalidade==='veppo'?'Veppo':'Aéreo',card=text('article','','card');
        card.append(text('h2',`${nome} · ${grupo.length} pedido(s)`),text('p',p.endereco));
        const lista=document.createElement('ul');for(const x of grupo)lista.append(text('li',`Pedido ${x.id} · ${x.nome} · ${x.volumes ?? 'Volumes não informados'}`));card.append(lista);
        card.append(text('p','Um comprovante para este grupo. O ERP permanece Em trânsito após o repasse.'));
        if(p.prevista_em)card.append(text('p','Previsão de repasse: '+new Date(p.prevista_em).toLocaleString('pt-BR')));
        if(rotaAtiva.iniciada_em&&grupo.every(x=>x.status_erp==='EM TRANSITO')){
          const navegar=text('a','Navegar','route');navegar.href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(p.endereco);navegar.target='_blank';navegar.rel='noopener noreferrer';card.append(navegar);
          card.append(botao('Informar repasse do grupo',()=>abrir({...p,id:grupo.map(x=>x.id).join(', '),grupo,rota_id:rotaAtiva.id,nome:nome+' · Repasse',volumes:grupo.every(x=>Number.isFinite(x.volumes))?grupo.reduce((n,x)=>n+x.volumes,0):null})));
        } else card.append(text('p','Aguardando início da rota.'));
        $('lista').append(card);continue;
      }
      const card = text('article', '', 'card');
      const liberada = !!rotaAtiva?.iniciada_em && ordem.has(p.chave) && p.status_erp === 'EM TRANSITO';
      if (p.estado === 'minha' && p === rows.find(x=>ordem.has(x.chave) && x.status_erp === 'EM TRANSITO') && liberada) { card.classList.add('proxima-entrega'); card.append(text('p', 'PRÓXIMA ENTREGA', 'eyebrow')); }
      if (['NOVO','AGUARDANDO','EM PRODUCAO'].includes(p.status_erp)) { card.classList.add('aguardando'); card.append(text('p','Aguardando produção')); }
      card.append(text('span', p.estado === 'concluida' ? (p.registro?.resultado==='repasse'?'Repasse confirmado':demo ? 'Entrega simulada' : 'Entrega confirmada') : p.estado === 'minha' ? (p.status_erp === 'EM TRANSITO' ? 'Em deslocamento' : 'Aguardando início da rota') : (p.status_erp==='EXPEDICAO'?'Pronto para Expedir':'Expedição do dia · aguardando produção'), 'tag'), text('h2', `Pedido ${p.id}`), text('p', p.nome), text('p', p.endereco), text('p', `${p.volumes ?? 'Não informado'} volume${p.volumes === 1 ? '' : 's'}`), text('p', p.nota));
      if (p.prevista_em) card.append(text('p', 'Previsão de entrega: '+new Date(p.prevista_em).toLocaleString('pt-BR')));
      if (p.registro) card.append(text('p', `${reasons[p.registro.resultado]} · ${p.registro.recebedor || 'Tentativa registrada'} · ${new Date(p.registro.hora).toLocaleString('pt-BR')}`));
      const actions = text('div', '', 'actions');
      const rota = text('a', 'Navegar', 'route'); rota.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(p.endereco); rota.target = '_blank'; rota.rel = 'noopener noreferrer';
      if (p.endereco && p.endereco.trim() && (liberada || p.estado === 'concluida')) actions.append(rota);
      else if(!p.endereco?.trim()) card.append(text('p', 'Endereço não informado. Confira com a expedição.'));
      if (p.estado === 'minha' && liberada) { actions.append(botao('Informar entrega', () => abrir(p))); actions.append(botao('Não consegui entregar', () => abrir(p, 'ausente'))); }
      if(p.estado==='disponivel' && p.status_erp==='EXPEDICAO' && !demo){const b=botao('Assumir entrega',()=>assumir(p,b));b.disabled=enviando;actions.append(b);}
      card.append(actions); $('lista').append(card);
    }
    if (!rows.length) $('lista').append(text('p', busca ? 'Nenhum pedido encontrado para esse número.' : 'Nenhum pedido nesta lista.', 'empty'));
  }
  async function assumir(p, b) {
    if(enviando || demo)return;
    if(!confirm(`Assumir a entrega do pedido ${p.id}? O pedido será incluído na sua rota.`))return;
    enviando=true;b.disabled=true;const dono=usuario?.id;
    try{await VibeEntregas.assumir(p.chave);if(usuario?.id!==dono)return;filtro='minha';offset=0;await carregar();aviso('Entrega atribuída a você. Confira sua rota antes de iniciar.');}
    catch(e){if(usuario?.id===dono){await carregar();aviso(e.message);}}
    finally{enviando=false;b.disabled=false;if(usuario?.id===dono)render();}
  }
  $('iniciar-rota').onclick=async()=>{
    const rota=RotasEntregas.atual();if(enviando||demo||!rota||rota.iniciada_em)return;
    if(!confirm('Iniciar sua rota? Os horários serão calculados automaticamente e os pedidos passarão para em deslocamento.'))return;
    enviando=true;$('iniciar-rota').disabled=true;const dono=usuario?.id;aviso('Calculando previsões e iniciando a rota…');
    try{await VibeEntregas.iniciarRota(rota.id);if(usuario?.id!==dono)return;await carregar();aviso('Rota iniciada. Siga para a próxima entrega.');}
    catch(e){if(usuario?.id===dono)aviso(e.message);}
    finally{enviando=false;$('iniciar-rota').disabled=false;}
  };
  function limparFoto() { fotoLeitura++; carregandoFoto = false; if (fotoURL) URL.revokeObjectURL(fotoURL); fotoURL = ''; foto = null; $('preview').hidden = true; $('preview').removeAttribute('src'); }
  async function abrir(p, motivo = 'entregue') { atual = p; operacao = crypto.randomUUID(); $('registro').reset(); limparFoto(); $('erro').textContent = ''; $('resumo').textContent = `${p.grupo?'Repasse do grupo · ':''}${p.id} · ${p.volumes == null ? 'Volumes não informados' : p.volumes + ' volume(s)'} · ${p.nome}`; $('resultado').value = motivo; $('resultado').disabled=!!p.grupo; $('resultado').querySelector('[value="entregue"]').textContent=p.grupo?'Repasse à transportadora':'Entregue';
    try { const r = await RascunhosEntregas.ler(usuario.id, p.chave); if(r) { operacao=r.operacao; for(const id of ['resultado','recebedor','observacao']) $(id).value=r[id]; $('volumes').checked=r.volumes; foto=r.foto; if(foto){fotoURL=URL.createObjectURL(foto);$('preview').src=fotoURL;$('preview').hidden=false;} $('erro').textContent='Rascunho recuperado. Confira antes de confirmar.'; } } catch { $('erro').textContent='Não foi possível recuperar o rascunho neste aparelho.'; }
    if(p.grupo)$('resultado').value='entregue';
    resultado(); $('formulario').showModal(); }
  function resultado() { const entregue = $('resultado').value === 'entregue'; $('recebimento').hidden = !entregue; $('foto-bloco').hidden = !entregue; $('recebedor').required = entregue; $('volumes').required = entregue; }
  $('resultado').onchange = () => { resultado(); salvarRascunho(); };
  async function salvarRascunho(){ if(!atual || !usuario) return; try { await RascunhosEntregas.salvar(usuario.id, atual.chave, {operacao,resultado:$('resultado').value,recebedor:$('recebedor').value,observacao:$('observacao').value,volumes:$('volumes').checked,foto}); } catch { $('erro').textContent='Rascunho não salvo neste aparelho. Mantenha a tela aberta até confirmar.'; } }
  $('registro').addEventListener('input', salvarRascunho);
  $('foto').onchange = async () => {
    limparFoto(); $('erro').textContent = '';
    const file = $('foto').files[0]; if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { $('erro').textContent = 'Escolha uma foto JPEG, PNG ou WebP de até 10 MB.'; $('foto').value = ''; return; }
    carregandoFoto = true; const leitura = fotoLeitura;
    try {
      const imagem = await createImageBitmap(file);
      if(leitura !== fotoLeitura) { imagem.close(); return; }
      if (imagem.width * imagem.height > 48000000) throw new Error('Imagem muito grande.');
      const scale = Math.min(1, 1600 / Math.max(imagem.width, imagem.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(imagem.width * scale); canvas.height = Math.round(imagem.height * scale);
      canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height); imagem.close();
      const pronta = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .82));
      if(leitura !== fotoLeitura) return;
      foto = pronta;
      if (!foto) throw new Error('Foto inválida.');
      fotoURL = URL.createObjectURL(foto); $('preview').src = fotoURL; $('preview').hidden = false;
    } catch { if(leitura === fotoLeitura) { $('erro').textContent = 'Não foi possível abrir a foto. Tire outra ou escolha uma imagem compatível.'; $('foto').value = ''; } }
    finally { if(leitura === fotoLeitura) { carregandoFoto = false; await salvarRascunho(); } }
  };
  $('registro').onsubmit = event => {
    event.preventDefault(); $('erro').textContent = '';
    if (carregandoFoto) { $('erro').textContent = 'Aguarde o processamento da foto.'; return; }
    if ($('resultado').value === 'entregue' && (!$('recebedor').value.trim() || !foto || !$('volumes').checked)) { $('erro').textContent = 'Informe quem recebeu, confira todos os volumes e tire a foto.'; return; }
    $('confirmar-titulo').textContent = atual.grupo ? 'Confirmar repasse do grupo?' : $('resultado').value === 'entregue' ? 'Confirmar entrega?' : 'Registrar tentativa?';
    $('confirmar-resumo').textContent = `${atual.id} · ${atual.grupo?'Repasse à transportadora':reasons[$('resultado').value]}${$('resultado').value === 'entregue' ? (atual.grupo?' · Transportadora recebeu: ':' · Recebido por ') + $('recebedor').value.trim() : ''}`;
    $('confirmar-aviso').textContent = demo ? 'Simulação: este registro não altera o ERP.' : atual.grupo ? 'Todos os pedidos deste grupo terão o repasse registrado. O ERP permanecerá Em trânsito.' : 'A entrega só será concluída após confirmação do servidor.';
    $('confirmar').textContent = demo ? 'Confirmar simulação' : 'Confirmar registro'; $('envio-erro').textContent = '';
    $('formulario').close(); $('confirmacao').showModal();
  };
  $('confirmar').onclick = async () => {
    if (enviando || !atual || atual.estado !== 'minha') return;
    enviando = true; $('confirmar').disabled = true;
    const registro = { operacao, volumes: $('volumes').checked, resultado: $('resultado').value, recebedor: $('resultado').value === 'entregue' ? $('recebedor').value.trim() : '', hora: new Date().toISOString(), observacao: $('observacao').value.trim() };
    $('voltar').disabled = true;
    try {
      if (!demo) { if (!navigator.onLine) throw new Error('Sem conexão. Mantenha esta tela aberta e tente novamente quando o sinal voltar.'); const r = await VibeEntregas.registrar(atual, registro, foto); registro.hora = r.hora || registro.hora; }
      if(atual.grupo)registro.resultado='repasse';
      atual.registro = registro;
    if (['entregue','repasse'].includes(atual.registro.resultado)) { atual.estado = 'concluida'; filtro = 'minha'; }
      await RascunhosEntregas.remover(usuario.id, atual.chave).catch(()=>{});
      $('confirmacao').close(); limparFoto(); atual = null; $('busca').value=''; offset=0; render(); await carregar(); aviso(demo ? 'Registro simulado. Nenhum dado foi enviado ao ERP. Os exemplos são reiniciados ao sair ou recarregar.' : 'Registro confirmado pelo servidor.');
    } catch(e) { $('envio-erro').textContent = e.message; }
    finally { enviando = false; $('confirmar').disabled = false; $('voltar').disabled = false; }
  };
  $('voltar').onclick = () => { if(enviando) return; operacao = crypto.randomUUID(); salvarRascunho(); $('confirmacao').close(); $('formulario').showModal(); };
  $('confirmacao').addEventListener('cancel', event => { event.preventDefault(); $('voltar').click(); });
  $('fechar').onclick = () => $('formulario').close();
  $('formulario').addEventListener('close', () => { /* Foto preservada ao revisar a confirmação. */ });
  $('sair').onclick = async () => { try { if(!demo) { await VibeEntregas.sair(); await RascunhosEntregas.limpar(usuario.id); } usuario=null; consulta++; window.RotasEntregas?.limpar(); pedidos = []; atual = null; limparFoto(); $('busca').value = ''; $('lista').replaceChildren(); $('operacao').hidden = true; $('inicio').hidden = false; $('login').hidden = !VibeEntregas.ativo; aviso(''); } catch(e) { aviso(e.message); } };
  $('busca').oninput = () => { if(demo) render(); else { clearTimeout(debounce); consulta++; offset=0; debounce=setTimeout(carregar,300); } };
  document.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { filtro = b.dataset.filtro; offset=0; carregar(); });
  function conexao() { $('conexao').textContent = navigator.onLine ? '' : 'Sem conexão. Você pode preencher o comprovante; tente enviar quando o sinal voltar.'; }
  async function atualizar(){if(usuario && !enviando && !document.hidden) await carregar();}
  $('atualizar').onclick=atualizar;
  document.addEventListener('visibilitychange', atualizar);
  window.addEventListener('online', atualizar);
  setInterval(atualizar, 60000);
  window.addEventListener('online', conexao); window.addEventListener('offline', conexao); conexao();
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); instalacao = event; $('instalar').hidden = false; });
  $('instalar').onclick = async () => { if (instalacao) { await instalacao.prompt(); instalacao = null; $('instalar').hidden = true; } };
  window.RotasEntregas?.iniciar({pedidos:()=>pedidos, identidade:nome=>{if(nome)$('identidade').textContent=nome;}});
  async function restaurarEntrada(){
    if(!VibeEntregas.ativo)return;
    const b=$('login').querySelector('button');b.disabled=true;$('login').hidden=true;$('login-erro').textContent='Verificando sessão…';
    try{const conta=await VibeEntregas.restaurarSessao();$('login-erro').textContent='';if(conta)await abrirSessao(conta);}
    catch(e){$('login-erro').textContent=e.message;}
    finally{b.disabled=false;$('login').hidden=!!usuario;}
  }
  restaurarEntrada();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => aviso('Instalação offline indisponível neste navegador.'));
})();
