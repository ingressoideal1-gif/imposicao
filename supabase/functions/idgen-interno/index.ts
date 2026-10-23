import { handler } from './handler.ts';

// A assinatura/validade da sessão é confirmada no Auth, além do gateway JWT.
// O RPC confere o papel atual no banco; o navegador não escolhe a identidade.
Deno.serve(handler({
  async usuario(authorization) {
    const res = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {
      headers: { Authorization: authorization, apikey: Deno.env.get('SUPABASE_ANON_KEY')! },
    });
    if (!res.ok) throw Object.assign(new Error('Sessão inválida'), { code: 'AUTH' });
    const user = await res.json();
    return user.id;
  },
  async operar(usuario, acao, dados) {
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const res = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/idgen_editor_operar', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_usuario: usuario, p_acao: acao, p_dados: dados }),
    });
    const result = await res.json();
    if (!res.ok) throw Object.assign(new Error('Operação recusada'), { code: result.code });
    return result;
  },
}));
