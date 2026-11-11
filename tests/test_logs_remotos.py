import json
import pytest
from logs_remotos import ARQUIVOS, LIMITE, SincronizadorLogs, linha_segura, snapshot


def test_snapshot_rotativo_limites_e_conteudo_seguro(tmp_path):
    linhas = ['[engine] total_sheets=5 items=100 poses=20'] * 500
    linhas += ['[print] senha=segredo-sintetico', '[print] http://exemplo.invalid/token',
               '[print] contato teste@example.invalid', '[print] C:\\Users\\Sintetico\\arquivo.pdf',
               'payload arbitrario sintetico', '[print][GDI] pagina 2/5']
    (tmp_path / 'agent.log.1').write_text('\n'.join(linhas), encoding='utf-8')
    d = snapshot(tmp_path, 'agent.log.1')
    s = json.dumps(d)
    assert d['parcial'] and len(d['linhas']) == 300
    assert 'total_sheets=5' in s and 'pagina 2/5' in s
    for valor in ['segredo-sintetico', 'example.invalid', 'Users', 'payload arbitrario']:
        assert valor not in s
    assert len(json.dumps(d['linhas'], ensure_ascii=False).encode()) <= LIMITE


def test_arquivo_ausente_e_traversal(tmp_path):
    assert snapshot(tmp_path, 'agent.log')['estado'] == 'ausente'
    with pytest.raises(ValueError): snapshot(tmp_path, '../outro')


def test_nao_le_links(tmp_path, monkeypatch):
    import pacotes_locais
    def recusar(_): raise ValueError('link')
    monkeypatch.setattr(pacotes_locais, '_sem_links', recusar)
    with pytest.raises(ValueError): snapshot(tmp_path, 'agent.log')


def test_fragmento_inicial_e_unicode_limitados(tmp_path):
    (tmp_path / 'agent.log').write_text('x'*70000 + '\n' + ('[print] ' + '漢'*1900 + '\n')*300, encoding='utf-8')
    d = snapshot(tmp_path, 'agent.log')
    assert d['parcial']
    assert len(json.dumps(d['linhas'], ensure_ascii=False).encode()) <= LIMITE
    assert all('xxx' not in l for l in d['linhas'])


def test_retry_ack_e_seis_arquivos_sem_bloquear_impressao(tmp_path):
    enviados = []
    def enviar(d):
        enviados.append(d)
        if len(enviados) == 1: raise TimeoutError()
        return {'confirmado': d['resumo']}
    s = SincronizadorLogs(tmp_path, enviar)
    s.ciclo(0); s.ciclo(1)
    assert len(enviados) == 1 and s.indice == 0
    for i in range(6): s.ciclo(60 + i*30)
    assert [d['arquivo'] for d in enviados[1:]] == list(ARQUIVOS)
    assert s.indice == 0
    s.enviar = lambda d: {'confirmado': 'errado'}
    s.ciclo(300)
    assert s.indice == 0 and s.falhas == 1


def test_sanitizacao_preserva_geracao_sem_dados_da_arte():
    assert 'total_sheets=10' in linha_segura('2026-11-11 10:00:00,001 [engine] total_sheets=10')
    assert 'texto privado sintetico' not in linha_segura('[engine] ATENCAO Texto: texto privado sintetico')
    assert 'sintetico' not in linha_segura('[impose] pdf_content=sintetico')
    erro = 'RuntimeError: Envio do lote nao confirmado; geracao interrompida.'
    assert linha_segura(erro) == erro
    contexto = "[integridade] job=12345678-1234-1234-1234-123456789012 modelos=['123'] etapa=uploads_confirmados"
    assert contexto in linha_segura('2026-11-11 10:00:00,001 [2026-11-11 10:00:00] '+contexto)


def test_heartbeat_nao_expulsa_falha_dos_diagnosticos(tmp_path):
    erro = 'RuntimeError: Envio do lote nao confirmado; geracao interrompida.'
    (tmp_path / 'agent.log').write_text(erro+'\n'+('[agent_worker] heartbeat\n'*4000), encoding='utf-8')
    d = snapshot(tmp_path, 'agent.log')
    assert d['linhas'] == [erro]
