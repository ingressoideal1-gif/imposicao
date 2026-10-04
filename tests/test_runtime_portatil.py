"""A chave AES deve permitir recuperacao sem depender do perfil Windows perdido."""
import json
import pytest
from ferramentas.runtime_portatil import recuperar_para_aes
from ferramentas.provisionar_runtime_recuperado import provisionar
from segredos_estacao import proteger_texto, recuperar_texto


@pytest.mark.parametrize('name,purpose,value',[
    ('acessos_locais.json','acessos-locais', json.dumps({'acessos':[{'codigo':'ABC123','nome':'Teste'}]})),
    ('credencial-publicacao.json','publicacao-faixas','somente-sintetico')])
def test_exportacao_reprotecao_e_preservacao(name,purpose,value,tmp_path):
    protected=json.dumps(proteger_texto(value,purpose)).encode()
    portable=recuperar_para_aes(name,protected)
    source=tmp_path/'recuperado'/name
    source.parent.mkdir()
    source.write_bytes(portable)
    destination=tmp_path/'nova-conta'/name
    destination.parent.mkdir()
    provisionar(source,destination)
    restored=recuperar_texto(json.loads(destination.read_text()),purpose)
    assert json.loads(restored)==json.loads(value) if name=='acessos_locais.json' else restored==value
    before=destination.read_bytes()
    with pytest.raises(ValueError):
        provisionar(source,destination)
    assert destination.read_bytes()==before


def test_smtp_preserva_configuracao_e_remove_senha_aberta_na_nova_estacao(tmp_path):
    config={'formatos':[{'name':'Sintetico'}], 'email_config':{'host':'example.invalid',
            'password_protegida':proteger_texto('smtp-sintetico','smtp')}}
    portable=recuperar_para_aes('formats_db.json',json.dumps(config).encode())
    source=tmp_path/'fonte'/'formats_db.json'
    source.parent.mkdir()
    source.write_bytes(portable)
    destination=tmp_path/'destino'/'formats_db.json'
    destination.parent.mkdir()
    provisionar(source,destination)
    restored=json.loads(destination.read_text())
    assert restored['formatos']==config['formatos']
    assert 'password' not in restored['email_config']
    assert recuperar_texto(restored['email_config']['password_protegida'],'smtp')=='smtp-sintetico'


def test_exportacao_nao_inspeciona_arquivos_fora_da_lista():
    assert recuperar_para_aes('qualquer-credencial.json',b'conteudo nao inspecionado') is None
