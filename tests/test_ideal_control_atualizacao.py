from test_controle_tela import _no_navegador


def test_celular_qr_nao_pode_pausar_ou_excluir_a_si_mesmo_na_tela():
    r = _no_navegador("""
        Controle.estado.sessao={access_token:'sintetico'};
        Controle.estado.evento_id='ev-1';
        await Controle.carregarPainel();
        chaveiro.guardar({evento_id:'ev-1',aparelho_id:'a1',por_qr:true,token:'sintetico'});
        Controle.estado.elevacao={token:'sintetico',expira_em:Math.floor(Date.now()/1000)+900};
        Controle.desenhar();
        return {pausar:document.getElementById('aparelho-pausar-a1').disabled,
            excluir:document.getElementById('aparelho-excluir-a1').disabled,
            renomear:document.getElementById('aparelho-renomear-a1').disabled};
    """)
    assert r == dict(pausar=True, excluir=True, renomear=False)


def test_vinculo_recusado_avisa_sem_apagar_dados_e_recuperacao_atualiza():
    r = _no_navegador("""
        const id='11111111-1111-4111-8111-111111111111';
        chaveiro.guardar({evento_id:id,nome_evento:'Antigo',token:'sintetico',por_qr:true});
        let recusado=true;
        window.fetch=async()=>recusado ? new Response('{}',{status:401}) : new Response(JSON.stringify({evento:{id,nome_evento:'Atualizado',status:'ativo'}}));
        await listaEventos.carregar(null);
        const aviso=document.getElementById('aviso-vinculos').textContent;
        const token=chaveiro.procurar(id).token;
        document.querySelector('#aviso-vinculos button').click();
        const qr=document.getElementById('qr-evento-dialogo').open;
        document.querySelector('[data-evento-fechar]').click();
        recusado=false; await listaEventos.carregar(null);
        return {aviso,token,qr,oculto:document.getElementById('aviso-vinculos').hidden,nome:chaveiro.procurar(id).nome_evento};
    """)
    assert 'vínculo' in r['aviso'] and r['token'] == 'sintetico' and r['qr']
    assert r['oculto'] and r['nome'] == 'Atualizado'


def test_tela_inicial_nao_restaura_historico_da_conta_nem_vinculo_antigo():
    r = _no_navegador("""
        localStorage.clear();
        localStorage.setItem('ideal_portaria_token','token-antigo');
        localStorage.setItem('ideal_portaria_evento','evento-antigo');
        AcessoConta.sessao=async()=>({access_token:'sessao-sintetica'});
        conta.conferirSenhaProvisoria=()=>{};
        AcessoConta.pedir=async()=>({eventos:[{id:'evento-antigo',nome_evento:'PEDIDO ANTIGO',status:'ativo'}]});
        await listaEventos.arrancar();
        return {lista:document.querySelector('#eventos').textContent,chaves:chaveiro.listar()};
    """)
    assert 'PEDIDO ANTIGO' not in r['lista'] and r['chaves'] == []


def test_lista_qr_atualiza_nome_data_local_sem_login_e_preserva_token():
    r = _no_navegador("""
        const id='11111111-1111-4111-8111-111111111111';
        chaveiro.guardar({evento_id:id,nome_evento:'Antigo',token:'token-sintetico',por_qr:true});
        AcessoConta.sessao=async()=>null;
        let falhar=false;
        window.fetch=async (url,op)=>{
            if(falhar)throw new Error('offline sintético');
            if(!url.endsWith('/portaria/evento')||op.headers.Authorization!=='Bearer token-sintetico')throw new Error('Rota inesperada');
            return new Response(JSON.stringify({evento:{id,nome_evento:'Novo nome',data_evento:'2026-10-02T20:00:00Z',local_evento:'Novo local',status:'ativo'}}));
        };
        await listaEventos.carregar(null);
        const texto=document.getElementById('eventos').textContent;
        falhar=true;await listaEventos.carregar(null);
        const p=chaveiro.procurar(id);
        chaveiro.atualizarEvento({id,nome_evento:'Resposta de identidade antiga'},'outro-token');
        return {texto,offline:document.getElementById('eventos').textContent,p,atual:chaveiro.procurar(id).nome_evento};
    """)
    assert 'Novo nome' in r['texto'] and 'Novo local' in r['texto']
    assert 'Novo nome' in r['offline'] and r['p']['token'] == 'token-sintetico'
    assert r['p']['por_qr'] and r['atual'] == 'Novo nome'


def test_menu_olho_contem_meus_pedidos_e_leitor_qr():
    r = _no_navegador("""
        conta.esconderEntrar();
        const visivel=id=>!!document.getElementById(id).getClientRects().length;
        const antes=[visivel('btn-meus-pedidos'),visivel('btn-ler-qr-evento')];
        document.getElementById('btn-menu-geral').click();
        const depois=[visivel('btn-meus-pedidos'),visivel('btn-ler-qr-evento')];
        document.getElementById('btn-ler-qr-evento').click();
        const abriu=document.getElementById('qr-evento-dialogo').open;
        document.querySelector('[data-evento-fechar]').click();
        document.getElementById('btn-voltar-menu').click();
        return {antes,depois,abriu,final:[visivel('btn-meus-pedidos'),visivel('btn-ler-qr-evento')],
          unicos:document.querySelectorAll('#btn-meus-pedidos').length===1&&document.querySelectorAll('#btn-ler-qr-evento').length===1};
    """)
    assert r == dict(antes=[False,False],depois=[True,True],abriu=True,final=[False,False],unicos=True)


def test_sincronismo_atualiza_evento_setores_e_aparelho_preservando_ingressos():
    from test_portaria_sincronismo import aplicar
    c = {'evento': {'id':'e1','nome':'Antigo','sal':'preservado'},
         'aparelho': {'id':'a1','nome':'Antigo','setores':['s1']},
         'setores':[{'id':'s1','nome':'Antigo'}], 'credenciais':[{'id':'c1'}]}
    novo = {'evento':{'id':'e1','nome':'Novo','data_evento':'2026-10-02','local_evento':'Novo local'},
            'aparelho':{'id':'a1','nome':'Novo celular','setores':['s2']},
            'setores_completos':True,'setores':[{'id':'s2','nome':'Novo setor','quantidade':20}]}
    r = aplicar(c,novo)
    assert r['evento']['nome']=='Novo' and r['evento']['sal']=='preservado'
    assert r['evento']['local_evento']=='Novo local' and r['aparelho']['setores']==['s2']
    assert r['setores']==novo['setores'] and r['credenciais']==c['credenciais']
    assert aplicar(r,{'setores_completos':True,'setores':[]})['setores']==[]
