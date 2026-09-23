"""Entrega por QR e consulta de PIN no painel, sem rede de produção."""
from test_ideal_control_tela import _no_navegador, SERVIDOR


def test_instalacao_disponivel_sem_cliente_e_evento_sem_emissao():
    r = _no_navegador(SERVIDOR + """
        document.getElementById('ic-instalacao-abrir').click();
        return {aberto:document.getElementById('ic-instalacao-dialogo').open,
            link:document.getElementById('ic-qr-link').textContent,
            gerar:document.querySelector('[data-qr-gerar]').disabled,
            texto:document.getElementById('ic-instalacao-dialogo').textContent,
            escritas:_chamadas.filter(c=>c.metodo!=='GET').length};
    """)
    assert r['aberto'] and r['gerar'] and r['escritas'] == 0
    assert '/ic/' in r['link'] and 'Não precisa criar conta' in r['texto']


def test_evento_sem_conta_pode_ser_enviado_mas_inativo_nao_emite_qr():
    r = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        const habilitado=!document.getElementById('ic-enviar-evento').disabled;
        document.getElementById('ic-enviar-evento').click();
        const aberto=document.getElementById('ic-instalacao-dialogo').open;
        PAINEL.evento.status='encerrado'; IdealControl.desenhar();
        document.querySelector('[data-qr-gerar]').click();
        return {habilitado,aberto,gerar:document.querySelector('[data-qr-gerar]').disabled,
            enviar:document.getElementById('ic-enviar-evento').disabled,
            qrChamadas:_chamadas.filter(c=>c.caminho.endsWith('/qr')).length};
    """)
    assert r == dict(habilitado=True, aberto=True, gerar=True, enviar=True, qrChamadas=0)


def test_pin_falha_permite_repetir_e_mudar_aba_oculta_senha():
    r = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-aba-aparelhos').click();
        const b=document.querySelector('#ic-aparelhos .ic-aparelho button');
        __respostas['/aparelhos/a1/senha-edicao']=new Error('Falha sintética');
        b.click(); await new Promise(r=>setTimeout(r,30));
        const falha=document.getElementById('ic-aparelhos').textContent.includes('Falha sintética');
        __respostas['/aparelhos/a1/senha-edicao']={pin:'042815',aparelho_id:'a1'};
        b.click(); await new Promise(r=>setTimeout(r,30));
        const visivel=b.textContent==='Ocultar senha' && document.getElementById('ic-aparelhos').textContent.includes('042815');
        document.getElementById('ic-aba-setores').click();
        return {falha,visivel,limpo:!document.getElementById('ic-aparelhos').textContent.includes('042815'),
            consultas:_chamadas.filter(c=>c.caminho.endsWith('/senha-edicao')).length};
    """)
    assert r == dict(falha=True, visivel=True, limpo=True, consultas=2)


def test_instrucoes_copiadas_identificam_evento_sem_senha():
    r = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        let copiado='';
        Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{copiado=t;}}});
        document.getElementById('ic-enviar-evento').click();
        document.querySelector('[data-qr-mensagem]').click();
        await new Promise(r=>setTimeout(r,30));
        return {copiado,escritas:_chamadas.filter(c=>c.metodo!=='GET').length};
    """)
    assert 'Baile do Hawaii' in r['copiado'] and 'Importar da galeria' in r['copiado']
    assert '6 números' in r['copiado'] and 'https://imposition.ai-ideal.com.br/ic/' in r['copiado']
    assert '042815' not in r['copiado'] and r['escritas'] == 0


def test_qr_generico_decodifica_antes_de_selecionar_cliente():
    r = _no_navegador("""
        for(const name of ['qrcode-generator.min.js','qr-canvas.js','jsqr.min.js']) {
            await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/'+name;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
        }
    """ + SERVIDOR + """
        document.getElementById('ic-instalacao-abrir').click();
        const c=document.getElementById('ic-qr-instalacao');
        const data=c.getContext('2d').getImageData(0,0,c.width,c.height);
        return {url:jsQR(data.data,c.width,c.height).data};
    """)
    assert r['url'] == 'https://imposition.ai-ideal.com.br/ic/'


def test_resposta_pin_atrasada_nao_revela_senha_apos_trocar_aba():
    r = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-aba-aparelhos').click();
        let concluir;
        IdealControl._pedirParaTeste=()=>new Promise(r=>{concluir=r;});
        document.querySelector('#ic-aparelhos .ic-aparelho button').click();
        await new Promise(r=>setTimeout(r,20));
        document.getElementById('ic-aba-setores').click();
        concluir({pin:'042815',aparelho_id:'a1'});
        await new Promise(r=>setTimeout(r,20));
        return {limpo:!document.getElementById('ic-aparelhos').textContent.includes('042815')};
    """)
    assert r['limpo']


def test_grafica_gera_qr_decodificavel_antes_de_publicar_ingressos():
    r = _no_navegador("""
        for(const name of ['qrcode-generator.min.js','qr-canvas.js','jsqr.min.js']) {
            await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/'+name;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
        }
    """ + SERVIDOR + """
        PAINEL.publicacao.total_credenciais=0;
        await IdealControl.abrirPedido(19521);
        const conteudo='IDEAL-CONTROL-EVENTO:1:'+'ab'.repeat(32);
        __respostas['/eventos/'+PAINEL.evento.id+'/qr']={conteudo};
        document.getElementById('ic-enviar-evento').click();
        await document.querySelector('[data-qr-gerar]').onclick();
        const c=document.querySelector('[data-qr-resultado] canvas');
        const data=c.getContext('2d').getImageData(0,0,c.width,c.height);
        const qr=jsQR(data.data,c.width,c.height);
        return {habilitado:!document.querySelector('[data-qr-gerar]').disabled,
            mensagem:document.querySelector('[data-qr-nome]').textContent,
            visivel:!document.querySelector('[data-qr-resultado]').hidden,
            decodificado:qr && qr.data===conteudo,
            escritas:_chamadas.filter(c=>c.metodo==='POST' && c.caminho.endsWith('/qr')).length};
    """)
    assert r['habilitado'] and r['visivel'] and r['decodificado'] and r['escritas'] == 1
    assert 'Os ingressos serão sincronizados após a publicação' in r['mensagem']
