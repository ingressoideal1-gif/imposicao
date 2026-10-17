/* Vibe Entregas: preview isolada. Nenhuma chamada ao ERP nesta versão. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = { disponivel: 'Disponíveis', minha: 'Minhas entregas', concluida: 'Concluídas' };
  const reasons = { entregue: 'Entregue', ausente: 'Destinatário ausente', endereco: 'Endereço incorreto', recusa: 'Entrega recusada' };
  let pedidos = [], filtro = 'disponivel', atual = null, foto = null, fotoURL = '', carregandoFoto = false, enviando = false, instalacao;
  let demo = true, offset = 0, consulta = 0, operacao = null, debounce, fotoLeitura = 0;
  async function carregar() {
    if (demo) { render(); return; }
    const sequencia = ++consulta;
    try {
      const rows = await VibeEntregas.listar($('busca').value.trim(), offset, filtro);
      if (sequencia !== consulta) return;
      pedidos = rows.slice(0, 50); $('proxima').disabled = rows.length <= 50; $('anterior').disabled = offset === 0; render();
    } catch (e) { if(sequencia === consulta) { pedidos = []; render(); aviso(e.message); } }
  }
  $('login').hidden = !VibeEntregas.ativo;
  $('login').onsubmit = async event => {
    event.preventDefault(); const b = $('login').querySelector('button'); b.disabled = true; $('login-erro').textContent = '';
    try {
      await VibeEntregas.entrar($('email').value.trim(), $('senha').value); demo = false; offset = 0; filtro = 'disponivel';
      $('inicio').hidden = true; $('login').hidden = true; $('operacao').hidden = false; $('aviso-demo').hidden = true;
      $('identidade').textContent = 'Entregador autenticado'; $('paginacao').hidden = false; await carregar();
    } catch (e) { $('login-erro').textContent = e.message; }
    finally { $('senha').value = ''; b.disabled = false; }
  };
  $('anterior').onclick = () => { offset = Math.max(0, offset - 50); carregar(); };
  $('proxima').onclick = () => { offset += 50; carregar(); };
  const samples = () => [
    { id: 'DEMO-1001', nome: 'Cliente demonstração A', endereco: 'Praça da Alfândega, Centro Histórico, Porto Alegre, RS', volumes: 2, estado: 'disponivel', nota: 'Exemplo: entregar na recepção.' },
    { id: 'DEMO-1002', nome: 'Cliente demonstração B', endereco: 'Parque Farroupilha, Porto Alegre, RS', volumes: 1, estado: 'disponivel', nota: 'Endereço fictício para teste de navegação.' },
    { id: 'DEMO-1003', nome: 'Cliente demonstração C', endereco: 'Parque Moinhos de Vento, Porto Alegre, RS', volumes: 3, estado: 'disponivel', nota: 'Conferir os três volumes.' }
  ];
  function text(tag, value, cls) { const el = document.createElement(tag); el.textContent = value; if (cls) el.className = cls; return el; }
  function aviso(value) { $('mensagem').textContent = value; }
  function botao(label, acao) { const b = text('button', label); b.type = 'button'; b.onclick = acao; return b; }
  function render() {
    window.RotasEntregas?.atualizar();
    $('titulo').textContent = labels[filtro];
    document.querySelectorAll('[data-filtro]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filtro === filtro)));
    const busca = $('busca').value.trim().toLowerCase();
    const rows = pedidos.filter(p => p.estado === filtro && p.id.toLowerCase().includes(busca));
    $('contador').textContent = `${rows.length} pedido${rows.length === 1 ? '' : 's'}`;
    $('lista').replaceChildren();
    for (const p of rows) {
      const card = text('article', '', 'card');
      card.append(text('span', p.estado === 'concluida' ? (demo ? 'Entrega simulada' : 'Entrega confirmada') : p.estado === 'minha' ? (p.status_erp === 'EM TRANSITO' ? 'Em deslocamento' : 'Com você') : 'Pronto para Expedir · Motoboy', 'tag'), text('h2', `Pedido ${p.id}`), text('p', p.nome), text('p', p.endereco), text('p', `${p.volumes ?? 'Não informado'} volume${p.volumes === 1 ? '' : 's'}`), text('p', p.nota));
      if (p.prevista_em) card.append(text('p', 'Previsão de entrega: '+new Date(p.prevista_em).toLocaleString('pt-BR')));
      if (p.registro) card.append(text('p', `${reasons[p.registro.resultado]} · ${p.registro.recebedor || 'Tentativa registrada'} · ${new Date(p.registro.hora).toLocaleString('pt-BR')}`));
      const actions = text('div', '', 'actions');
      const rota = text('a', 'Abrir rota', 'route'); rota.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(p.endereco); rota.target = '_blank'; rota.rel = 'noopener noreferrer';
      if (p.endereco && p.endereco.trim()) actions.append(rota);
      else card.append(text('p', 'Endereço não informado. Confira com a expedição.'));
      if (p.estado === 'disponivel') actions.append(botao('Assumir entrega', async event => {
        const button = event.currentTarget; button.disabled = true;
        try { if (!demo) { const r = await VibeEntregas.assumir(p); if(r.assumida !== true) throw new Error('Retirada não confirmada.'); } p.estado = 'minha'; filtro = 'minha'; render(); aviso(demo ? 'Pedido adicionado às suas entregas de demonstração.' : 'Retirada confirmada.'); }
        catch(e) { aviso(e.message); button.disabled = false; }
      }));
      if (p.estado === 'minha') actions.append(botao('Informar entrega', () => abrir(p)));
      card.append(actions); $('lista').append(card);
    }
    if (!rows.length) $('lista').append(text('p', busca ? 'Nenhum pedido encontrado para esse número.' : 'Nenhum pedido nesta lista.', 'empty'));
  }
  function limparFoto() { fotoLeitura++; carregandoFoto = false; if (fotoURL) URL.revokeObjectURL(fotoURL); fotoURL = ''; foto = null; $('preview').hidden = true; $('preview').removeAttribute('src'); }
  function abrir(p) { atual = p; operacao = crypto.randomUUID(); $('registro').reset(); limparFoto(); $('erro').textContent = ''; $('resumo').textContent = `${p.id} · ${p.volumes == null ? 'Volumes não informados' : p.volumes + ' volume(s)'} · ${p.nome}`; resultado(); $('formulario').showModal(); }
  function resultado() { const entregue = $('resultado').value === 'entregue'; $('recebimento').hidden = !entregue; $('foto-bloco').hidden = !entregue; $('recebedor').required = entregue; $('volumes').required = entregue; }
  $('resultado').onchange = resultado;
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
    finally { if(leitura === fotoLeitura) carregandoFoto = false; }
  };
  $('registro').onsubmit = event => {
    event.preventDefault(); $('erro').textContent = '';
    if (carregandoFoto) { $('erro').textContent = 'Aguarde o processamento da foto.'; return; }
    if ($('resultado').value === 'entregue' && (!$('recebedor').value.trim() || !foto || !$('volumes').checked)) { $('erro').textContent = 'Informe quem recebeu, confira todos os volumes e tire a foto.'; return; }
    $('confirmar-titulo').textContent = $('resultado').value === 'entregue' ? 'Confirmar entrega?' : 'Registrar tentativa?';
    $('confirmar-resumo').textContent = `${atual.id} · ${reasons[$('resultado').value]}${$('resultado').value === 'entregue' ? ' · Recebido por ' + $('recebedor').value.trim() : ''}`;
    $('confirmar-aviso').textContent = demo ? 'Simulação: este registro não altera o ERP.' : 'A entrega só será concluída após confirmação do servidor.';
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
      atual.registro = registro;
    if (atual.registro.resultado === 'entregue') { atual.estado = 'concluida'; filtro = 'concluida'; }
      $('confirmacao').close(); limparFoto(); atual = null; render(); aviso(demo ? 'Registro simulado. Nenhum dado foi enviado ao ERP. Os exemplos são reiniciados ao sair ou recarregar.' : 'Registro confirmado pelo servidor.');
    } catch(e) { $('envio-erro').textContent = e.message; }
    finally { enviando = false; $('confirmar').disabled = false; $('voltar').disabled = false; }
  };
  $('voltar').onclick = () => { if(enviando) return; operacao = crypto.randomUUID(); $('confirmacao').close(); $('formulario').showModal(); };
  $('confirmacao').addEventListener('cancel', event => { event.preventDefault(); $('voltar').click(); });
  $('fechar').onclick = () => $('formulario').close();
  $('formulario').addEventListener('close', () => { /* Foto preservada ao revisar a confirmação. */ });
  $('demonstrar').onclick = () => { window.RotasEntregas?.limpar(); demo = true; pedidos = samples(); filtro = 'disponivel'; $('inicio').hidden = true; $('login').hidden = true; $('aviso-demo').hidden = false; $('paginacao').hidden = true; $('identidade').textContent = 'Entregador demonstração'; $('operacao').hidden = false; render(); $('busca').focus(); };
  $('sair').onclick = async () => { try { if(!demo) await VibeEntregas.sair(); consulta++; window.RotasEntregas?.limpar(); pedidos = []; atual = null; limparFoto(); $('busca').value = ''; $('lista').replaceChildren(); $('operacao').hidden = true; $('inicio').hidden = false; $('login').hidden = !VibeEntregas.ativo; aviso(''); } catch(e) { aviso(e.message); } };
  $('busca').oninput = () => { if(demo) render(); else { clearTimeout(debounce); consulta++; offset=0; debounce=setTimeout(carregar,300); } };
  document.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { filtro = b.dataset.filtro; offset=0; carregar(); });
  function conexao() { $('conexao').textContent = navigator.onLine ? '' : 'Sem conexão. A demonstração continua disponível; o mapa precisa de conexão.'; }
  window.addEventListener('online', conexao); window.addEventListener('offline', conexao); conexao();
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); instalacao = event; $('instalar').hidden = false; });
  $('instalar').onclick = async () => { if (instalacao) { await instalacao.prompt(); instalacao = null; $('instalar').hidden = true; } };
  window.RotasEntregas?.iniciar({pedidos:()=>pedidos,demo:()=>demo});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => aviso('Instalação offline indisponível neste navegador.'));
})();
