from test_controle_tela import _no_navegador


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
