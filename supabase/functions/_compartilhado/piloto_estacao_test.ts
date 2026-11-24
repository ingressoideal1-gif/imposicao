import { strict as assert } from 'node:assert';

Deno.test('rota autonoma: exige segredo, opt-in de estacao e operador ativo autorizado',async()=>{
  const serve=Deno.serve,fetchOriginal=globalThis.fetch,env=Deno.env.get;
  let handler!:(req:Request)=>Promise<Response>;
  const vars:Record<string,string>={SUPABASE_URL:'https://banco.invalid',SUPABASE_SERVICE_ROLE_KEY:'sintetica',
    ACESSO_AGENTE_SEGREDO:'agente-sintetico',PILOTO_LOCAL_EMPRESA:'teste',
    PILOTO_LOCAL_ESTACAO:'PC-JR-HOME',PILOTO_LOCAL_OPERADOR:'ABC123'};
  let pode=true,ativo=true,leituras=0;
  try {
    Deno.serve=((fn:typeof handler)=>{handler=fn;return {}}) as unknown as typeof Deno.serve;
    Deno.env.get=nome=>vars[nome];
    globalThis.fetch=(async(input,op)=>{
      assert.equal(op?.method,'GET');leituras++;
      const url=String(input);
      if(url.endsWith('/auth/v1/user'))return Response.json({}, {status:401});
      if(url.includes('imposition_acessos_locais?'))return Response.json(ativo?[{role:'impressor',permissoes:{perm_producao_view:true,perm_imprimir:pode}}]:[]);
      if(url.includes('pedidos_modelos?'))return Response.json([]);
      if(url.includes('propostas?'))return Response.json([]);
      throw new Error('Consulta inesperada');
    }) as typeof fetch;
    handler=(await import('../piloto-local/index.ts')).handler;
    const req=(chave='agente-sintetico',estacao='PC-JR-HOME')=>new Request('https://funcao.invalid/functions/v1/piloto-local/listar',{
      method:'POST',headers:{'Content-Type':'application/json','X-Agente-Segredo':chave},body:JSON.stringify({estacao,empresa:'teste',cursor:0})});
    assert.equal((await handler(req('invalido'))).status,401);assert.equal(leituras,0);
    assert.equal((await handler(req('agente-sintetico','outra'))).status,403);assert.equal(leituras,1);
    const r=await handler(req());assert.equal(r.status,200);assert.deepEqual(await r.json(),{itens:[],proximo:0,fim:true});
    const cache=()=>new Request('https://funcao.invalid/functions/v1/piloto-local/estado-cache',{
      method:'POST',headers:{'Content-Type':'application/json','X-Agente-Segredo':'agente-sintetico'},
      body:JSON.stringify({estacao:'PC-JR-HOME',empresa:'teste',pedidos:['99']})});
    const estado=await handler(cache());assert.equal(estado.status,200);
    assert.deepEqual((await estado.json()).pedidos,[{pedido:'99',impresso:false,modelos:[]}]);
    pode=false;assert.equal((await handler(req())).status,403);
    assert.equal((await handler(cache())).status,403);
    ativo=false;assert.equal((await handler(req())).status,401);
    delete vars.PILOTO_LOCAL_ESTACAO;assert.equal((await handler(req())).status,503);
    assert.equal((await handler(new Request('https://funcao.invalid/piloto-local/listar'))).status,405);
    assert.equal((await handler(new Request('https://funcao.invalid/piloto-local/listar', {method:'POST',headers:{origin:'https://fora.invalid'}}))).status,403);
    assert.equal((await handler(new Request('https://funcao.invalid/piloto-local/conferir-sessao', {method:'POST',headers:{authorization:'Bearer forjado'}}))).status,401);
  } finally {Deno.serve=serve;globalThis.fetch=fetchOriginal;Deno.env.get=env;}
});


Deno.test('abrir-pedido transmite Ticket 5 grande em partes e preserva os dois bancos', async () => {
  const { handler } = await import('../piloto-local/index.ts');
  const env = Deno.env.get, fetchOriginal = globalThis.fetch;
  const vars: Record<string,string> = {
    SUPABASE_URL:'https://banco.invalid', SUPABASE_SERVICE_ROLE_KEY:'sintetica',
    ACESSO_AGENTE_SEGREDO:'agente-sintetico', PILOTO_LOCAL_EMPRESA:'teste',
    PILOTO_LOCAL_ESTACAO:'PC-TESTE', PILOTO_LOCAL_OPERADOR:'TESTE1',
  };
  const revisao = 'a'.repeat(64);
  const frente = 'https://banco.invalid/storage/v1/object/public/artes/frente.pdf';
  const colunas = Array.from({length:5}, (_, i) => 'Ticket ' + (i + 1));
  const link = (n: number) => 'https://ticket.invalid/' + 'c\u00e9lula-'.repeat(11) + String(n);
  const linhas = Array.from({length:8000}, (_, i) =>
    Object.fromEntries(colunas.map((coluna, pos) => [coluna, link(200003 + i * 5 + pos)])));
  const original = Array.from({length:40002}, (_, i) => ({link:link(200003 + i)}));
  const elementos = colunas.flatMap((_, i) => ['QR', 'TEXT'].map(type => ({
    id:type+'-'+i, type, ticket_pos:i+1, source:'database', csv_column:'link',
  })));
  const mapa = Object.fromEntries(elementos.map(e => ['el:'+e.id, colunas[e.ticket_pos - 1]]));
  const snapshot = {
    modelos:[{id:10,id_int:99,status_arte:'APROVADO',amostra_num_id:'n',arte_url:frente,quantidade:8000}],
    numeracoes:[{id:'n',tipo:'TICKET',ticket_qtd:5,elements:elementos}],
    bancos:[{id:'vinculado',csv_data:linhas},{id:'original',csv_data:original}],
    vinculos:[{modelo_id:'10',banco_id:'vinculado',csv_mapa:mapa}],
    pedidos:[{id_int:99,status_interno:'EM PRODUCAO'}],
    produtos:[],origens:[],prazos:[],recursos:[],artes:[],mapas:[],
  };
  let consultas = 0;
  const abrir = (partes: boolean, anterior = '', segredo = 'agente-sintetico') => {
    const headers: Record<string,string> = {'X-Agente-Segredo':segredo,'X-NewProd-Versao':'1.4.20'};
    if (partes) headers['X-NewProd-Pedido-Partes'] = '1';
    return handler(new Request('https://funcao.invalid/piloto-local/abrir-pedido', {
      method:'POST', headers, body:JSON.stringify({empresa:'teste',pedido:'99',estacao:'PC-TESTE',revisao:anterior}),
    }));
  };

  try {
    Deno.env.get = nome => vars[nome];
    globalThis.fetch = (async (input, op) => {
      const url = String(input);
      if (url.includes('imposition_acessos_locais?')) {
        return Response.json([{role:'impressor',permissoes:{perm_producao_view:true,perm_imprimir:true}}]);
      }
      assert.ok(url.endsWith('/rpc/piloto_snapshot_pedido_v2'));
      assert.equal(op?.method, 'POST');
      consultas++;
      const sem_mudanca = JSON.parse(String(op?.body)).p_revisao === revisao;
      return Response.json({protocolo:2,pedido:'99',revisao,sem_mudanca,...(sem_mudanca ? {} : {snapshot})});
    }) as typeof fetch;
    assert.equal((await abrir(true, '', 'invalido')).status, 401);
    assert.equal(consultas, 0);

    const r = await abrir(true);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('X-NewProd-Pedido-Partes'), '1');
    const tamanho = Number(r.headers.get('X-NewProd-Pedido-Bytes'));
    assert.ok(tamanho > 8 * 1024 * 1024);
    const leitor = r.body!.getReader();
    const bytes = new Uint8Array(tamanho);
    let recebidos = 0;
    while (true) {
      const {value, done} = await leitor.read();
      if (done) break;
      assert.ok(value.length <= 512 * 1024);
      bytes.set(value, recebidos);
      recebidos += value.length;
    }
    assert.equal(recebidos, tamanho);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    assert.equal(r.headers.get('X-NewProd-Pedido-SHA256'),
      Array.from(digest, n => n.toString(16).padStart(2, '0')).join(''));
    const dados = JSON.parse(new TextDecoder().decode(bytes));
    assert.equal(dados.revisao, revisao);
    assert.deepEqual(dados.itens[0].fontes, {frente});
    assert.deepEqual(dados.snapshot, snapshot);
    assert.equal(consultas, 1);

    const igual = await abrir(true, revisao);
    assert.equal(igual.headers.get('X-NewProd-Pedido-Partes'), null);
    assert.equal((await igual.json()).sem_mudanca, true);

    const legado = await abrir(false);
    assert.equal(legado.headers.get('X-NewProd-Pedido-Partes'), null);
    assert.deepEqual((await legado.json()).itens[0].fontes, {frente});
    assert.equal(consultas, 3);
  } finally {
    globalThis.fetch = fetchOriginal;
    Deno.env.get = env;
  }
});
