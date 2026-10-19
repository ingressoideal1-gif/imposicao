/* Contrato Vibe implantado; acesso por cadastro explicito no servidor. */
window.VibeEntregas = (() => {
  let client;
  const ativo = true;
  function conectar() {
    if (!ativo) throw new Error('Integração ainda não ativada. Utilize a demonstração.');
    if (!client) client = supabase.createClient(VIBECODE_SUPABASE_URL, VIBECODE_ANON_KEY, { auth: { storageKey: 'vibe-entregas-auth', storage: sessionStorage, persistSession: true } });
    return client;
  }
  async function rpc(nome, args) {
    const { data, error } = await conectar().rpc(nome, args);
    if (error) throw new Error(error.message || 'Não foi possível concluir. Atualize e tente novamente.');
    if (data == null) throw new Error('O servidor não confirmou a operação.');
    return data;
  }
  async function recalcular(id) {
    const {data,error}=await conectar().functions.invoke('vibe-entregas-previsoes',{body:{id,acao:'atualizar'}});
    if(error || data?.confirmado!==true)throw new Error('Previsões aguardando atualização.');
  }
  return {
    ativo,
    async entrar(email, password) {
      const { data, error } = await conectar().auth.signInWithPassword({ email, password });
      if (error || !data.user) throw new Error('Não foi possível entrar. Confira sua conta e senha.');
      try { if(await rpc('ve_entregador_autorizar',{})!==true)throw new Error('Entregador sem acesso ativo.'); await rpc('ve_listar', { p_busca: '', p_offset: 0, p_filtro: 'minha' }); }
      catch (e) { await conectar().auth.signOut({ scope: 'local' }); throw e; }
      return data.user;
    },
    async sair() { if (client) { const {error} = await client.auth.signOut({scope:'local'}); if(error) throw new Error('Não foi possível encerrar a sessão.'); } },
    async iniciarRota(id) { const {data,error}=await conectar().functions.invoke('vibe-entregas-previsoes',{body:{id,acao:'iniciar'}});if(error||data?.confirmado!==true||!data.iniciada_em)throw new Error(data?.erro || 'Não foi possível calcular os prazos e iniciar a rota. Tente novamente.');return data; },
    async assumir(chave) { const r=await rpc('ve_assumir',{p_proposta:chave});if(r?.confirmado!==true)throw new Error('Atribuição não confirmada. Atualize a lista.');return r; },
    listar(busca, offset, filtro) { return rpc('ve_listar', { p_busca: busca, p_offset: offset, p_filtro: filtro }); },
    async minhas(busca) {
      const rows=[]; let offset=0;
      while(true){const pagina=await rpc('ve_listar',{p_busca:busca,p_offset:offset,p_filtro:'minha'});rows.push(...pagina.slice(0,50));if(pagina.length<=50)return rows;offset+=50;}
    },
    async rotasAtivas() { let rows=await rpc('ve_rotas_status',{});const r=rows.find(r=>r.minha&&r.previsao_pendente);if(r){try{await recalcular(r.id);rows=await rpc('ve_rotas_status',{});}catch{/* Flag persistida no servidor; próxima atualização tenta novamente. */}}return rows; },
    async registrar(p, registro, foto) {
      const c = conectar(); const { data: { user }, error } = await c.auth.getUser();
      if (error || !user) throw new Error('Sua sessão expirou. Entre novamente.');
      let caminho = null;
      if (registro.resultado === 'entregue') {
        caminho = `${user.id}/${p.chave}/${registro.operacao}.jpg`;
        const { error: uploadError } = await c.storage.from('vibe-entregas-comprovantes').upload(caminho, foto, { contentType: 'image/jpeg', upsert: false });
        // Um reenvio pode encontrar a mesma foto da operacao anterior. O RPC
        // confere caminho/objeto e devolve o resultado idempotente.
        if (uploadError) {
          if (!['409','400'].includes(String(uploadError.statusCode))) throw new Error('Falha ao enviar a foto. Mantenha esta tela aberta e tente novamente.');
          const { data: existente, error: erroLeitura } = await c.storage.from('vibe-entregas-comprovantes').download(caminho);
          if (erroLeitura || !existente) throw new Error('Não foi possível conferir a foto enviada. Tente novamente.');
          const hash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).join(',');
          if (await hash(existente) !== await hash(foto)) throw new Error('A foto desta tentativa mudou. Volte e revise o registro.');
        }
      }
      const data = await rpc('ve_registrar', { p_proposta: p.chave, p_operacao: registro.operacao, p_resultado: registro.resultado, p_recebedor: registro.recebedor, p_foto: caminho, p_observacao: registro.observacao, p_volumes: registro.volumes });
      if (data.confirmada !== true) throw new Error('Entrega não confirmada pelo servidor.');
      if(registro.resultado==='entregue') {
        try{const rows=await rpc('ve_rotas_status',{});const rota=rows.find(r=>r.minha&&r.previsao_pendente);if(rota)await recalcular(rota.id);}
        catch{data.previsoes_pendentes=true;}
      }
      return data;
    }
  };
})();
