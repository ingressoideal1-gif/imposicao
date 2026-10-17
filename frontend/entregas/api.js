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
  return {
    ativo,
    async entrar(email, password) {
      const c = conectar();
      if (!/^[0-9]{4}$/.test(password)) throw new Error('Informe o PIN de 4 dígitos.');
      const {data: tokens,error:erroLogin} = await c.functions.invoke('vibe-entregas-login',{body:{email,pin:password}});
      if (erroLogin) {
        let mensagem='Não foi possível entrar. Confira o e-mail e o PIN.';
        try {const body=await erroLogin.context.json();if(body.erro)mensagem=body.erro;} catch {}
        throw new Error(mensagem);
      }
      if(!tokens?.access_token || !tokens?.refresh_token) throw new Error('Login não confirmado.');
      const {data,error} = await c.auth.setSession(tokens);
      if(error || !data.user) throw new Error('Sessão não confirmada. Entre novamente.');
      try { await rpc('ve_listar', { p_busca: '', p_offset: 0 }); }
      catch (e) { await conectar().auth.signOut({ scope: 'local' }); throw e; }
      return data.user;
    },
    async sair() { if (client) { const {error} = await client.auth.signOut({scope:'local'}); if(error) throw new Error('Não foi possível encerrar a sessão.'); } },
    listar(busca, offset, filtro) { return rpc('ve_listar', { p_busca: busca, p_offset: offset, p_filtro: filtro }); },
    assumir(p) { return rpc('ve_assumir', { p_proposta: p.chave }); },
    async calcularRota(entrada) {
      const c=conectar(); const {data,error}=await c.auth.getSession();
      if(error||!data?.session)throw new Error('Entre novamente para calcular a rota.');
      const r=await fetch(VIBECODE_SUPABASE_URL+'/functions/v1/vibe-entregas-rotas',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:VIBECODE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify(entrada)});
      const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.erro||'Não foi possível calcular a rota.');return body;
    },
    async confirmarRota(id) { const r=await rpc('ve_rota_confirmar',{p_id:id});if(r!==true)throw new Error('Rota não confirmada.'); },
    rotasAtivas() { return rpc('ve_rotas_status',{}); },
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
      return data;
    }
  };
})();
