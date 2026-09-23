"""Novo contrato de 22/09: Meus Pedidos é histórico; carregar somente por QR."""
import sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).parent))
from test_controle_tela import _no_navegador

PREPARAR = """
    localStorage.clear(); conta.esconderEntrar();
    AcessoConta.sessao=async()=>null;
    const chamadas=[];
    AcessoConta.pedir=async(path)=>{chamadas.push(path);throw new Error('Sem rede');};
    window.fetch=async()=>{throw new Error('Sem rede');};
    const tick=()=>new Promise(r=>setTimeout(r,30));
    const visivel=id=>!!document.getElementById(id)?.getClientRects().length;
    ['ativo','finalizado','encerrado','inativo'].forEach(status=>chaveiro.guardar({
        evento_id:status,nome_evento:'Evento '+status,status,token:'token-'+status,por_qr:true
    }));
    await listaEventos.carregar(null);
"""

@pytest.mark.parametrize('botao',['btn-meus-pedidos','btn-meus-pedidos-mais'])
def test_historico_abre_sem_login_sem_buscar_pedidos_da_grafica(botao):
    r=_no_navegador(PREPARAR + """
        menuGeral.abrir();document.getElementById(BOTAO).click();await tick();
        return {aberto:visivel('meus-pedidos'),menu:visivel('menu-geral'),login:visivel('bloco-entrar'),
            texto:document.getElementById('finalizados').textContent,
            casa:document.getElementById('eventos').textContent,chamadas,
            conferencia:!!document.getElementById('btn-conferencia-pedidos')};
    """.replace('BOTAO',repr(botao)))
    assert r['aberto'] and not r['menu'] and not r['login'] and not r['conferencia']
    assert 'Evento ativo' in r['casa'] and 'Evento encerrado' not in r['casa']
    for estado in ['finalizado','encerrado','inativo']:
        assert 'Evento '+estado in r['texto']
    assert 'Evento ativo' not in r['texto'] and '/meus-pedidos' not in r['chamadas']

def test_atualizar_historico_e_voltar_ao_menu_sem_sobrepor_telas():
    r=_no_navegador(PREPARAR + """
        await meusPedidos.abrir();
        document.getElementById('btn-atualizar-pedidos').click(); await tick();
        const atualizado=visivel('meus-pedidos')&&!visivel('lista');
        document.getElementById('btn-voltar-pedidos').click(); await tick();
        return {atualizado,menu:visivel('menu-geral'),historico:visivel('meus-pedidos'),
            qr:visivel('btn-ler-qr-evento'),chamadas};
    """)
    assert r['atualizado'] and r['menu'] and r['qr'] and not r['historico']
    assert '/meus-pedidos' not in r['chamadas']

def test_vazio_orienta_carga_pelo_qr_e_nao_por_pedido_impresso():
    r=_no_navegador(PREPARAR + """
        localStorage.clear();await listaEventos.carregar(null);await meusPedidos.abrir();
        return {vazio:visivel('sem-finalizados'),frase:document.getElementById('sem-eventos').textContent,
            historico:document.getElementById('meus-pedidos').textContent};
    """)
    assert r['vazio'] and 'Ler QR do evento' in r['frase']
    assert 'Conferir pedidos' not in r['historico'] and 'já imprimiu' not in r['frase']

def test_historico_fecha_engrenagem_antes_de_abrir():
    r=_no_navegador(PREPARAR + """
        let fechou=0;
        document.getElementById('engrenagem').classList.remove('sumindo');
        Controle.fecharEngrenagem=async()=>{fechou++;document.getElementById('engrenagem').classList.add('sumindo');};
        await meusPedidos.abrir();return {fechou,historico:visivel('meus-pedidos'),eng:visivel('engrenagem')};
    """)
    assert r['fechou']==1 and r['historico'] and not r['eng']
