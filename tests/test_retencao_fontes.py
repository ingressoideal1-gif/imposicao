import os
from pathlib import Path
import threading

import pytest

import font_cache
from retencao_fontes import limpar, manter
from test_retencao_cache import preparado, limpar as limpar_pedido


@pytest.fixture(autouse=True)
def perfil(tmp_path, monkeypatch):
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path / 'perfil'))


def arquivo(raiz, nome, idade=31, dados=b'fonte'):
    raiz.mkdir(parents=True, exist_ok=True)
    p = raiz / nome
    p.write_bytes(dados)
    quando = 10_000_000 - idade * 86400
    os.utime(p, (quando, quando))
    return p


def test_legado_exclusivo_remove_vencidos_parciais_e_preserva_windows_e_temp(tmp_path):
    raiz = tmp_path / 'fonts_cache'
    velho = arquivo(raiz, 'a'*64 + '.fonte')
    parcial = arquivo(raiz, 'b'*64 + '.fonte.123.tmp', 2)
    recente = arquivo(raiz, 'c'*64 + '.fonte', 0)
    desconhecido = arquivo(raiz, 'original.ttf')
    windows = arquivo(tmp_path / 'Windows' / 'Fonts', 'instalada.ttf')
    legado_sem_prova = arquivo(tmp_path / 'Temp', 'tmp123.ttf')
    r = limpar(raiz, pedidos_pendentes=False, agora=10_000_000)
    assert r['arquivos_removidos'] == 2 and r['bytes_removidos'] == 10
    assert not velho.exists() and not parcial.exists()
    assert all(p.exists() for p in (recente, desconhecido, windows, legado_sem_prova))


def test_pendentes_protegem_fontes_mesmo_acima_do_teto(tmp_path):
    raiz = tmp_path / 'fonts_cache'
    p = arquivo(raiz, 'a'*64 + '.fonte', 100)
    r = limpar(raiz, pedidos_pendentes=True, agora=10_000_000, limite=1)
    assert p.exists() and r['protegido'] and r['acima_limite']


def test_teto_retira_mais_antiga_sem_tocar_ultimas_24h(tmp_path):
    raiz = tmp_path / 'fonts_cache'
    velho = arquivo(raiz, 'a'*64 + '.fonte', 5)
    novo = arquivo(raiz, 'b'*64 + '.fonte', 2)
    atual = arquivo(raiz, 'c'*64 + '.fonte', 0)
    limpar(raiz, pedidos_pendentes=False, agora=10_000_000, limite=10)
    assert not velho.exists() and novo.exists() and atual.exists()


def test_leitura_renova_ultimo_uso_sem_rede(tmp_path, monkeypatch):
    raiz = tmp_path / 'fonts_cache'
    p = arquivo(raiz, font_cache._nome_em_cache('https://exemplo/fonte'))
    monkeypatch.setattr(font_cache, '_pasta_cache', lambda: str(raiz))
    monkeypatch.setattr(font_cache.urllib.request, 'urlopen', lambda *_: pytest.fail('rede'))
    assert font_cache.obter_bytes('https://exemplo/fonte') == b'fonte'
    assert p.stat().st_mtime > 10_000_000


def test_proibido_usar_raiz_windows_ou_relativa(tmp_path):
    for raiz in (tmp_path / 'Windows' / 'Fonts', Path('fonts_cache')):
        with pytest.raises(ValueError):
            limpar(raiz, pedidos_pendentes=False)


def test_hardlink_e_arquivo_bloqueado_sao_preservados(tmp_path, monkeypatch):
    raiz = tmp_path / 'fonts_cache'
    p = arquivo(raiz, 'a'*64 + '.fonte')
    os.link(p, tmp_path / 'original')
    bloqueado = arquivo(raiz, 'b'*64 + '.fonte')
    original = Path.unlink
    def remover(self, *args, **kwargs):
        if self == bloqueado:
            raise PermissionError('em uso')
        return original(self, *args, **kwargs)
    monkeypatch.setattr(Path, 'unlink', remover)
    r = limpar(raiz, pedidos_pendentes=False, agora=10_000_000)
    assert p.exists() and bloqueado.exists() and r['erros'] == 1


def test_pedido_local_protege_e_so_libera_apos_confirmacao_impresso(tmp_path):
    from canais_newprod import pasta_local
    s, _, _, _ = preparado(tmp_path)
    p = arquivo(pasta_local() / 'fonts_cache', 'a'*64 + '.fonte')
    manter(s)
    assert p.exists() and s.retencao_fontes['protegido']
    limpar_pedido(s)
    s._proxima_retencao_fontes = 0
    # Ciclo seguinte, sob as mesmas travas de producao, libera a fonte vencida.
    limpar_pedido(s, [])
    assert not p.exists() and not s.retencao_fontes['protegido']


def test_limpeza_espera_leitura_do_cache(tmp_path):
    raiz = tmp_path / 'fonts_cache'
    p = arquivo(raiz, 'a'*64 + '.fonte')
    iniciou = threading.Event()
    def executar():
        iniciou.set()
        limpar(raiz, pedidos_pendentes=False, agora=10_000_000)
    with font_cache._lock:
        thread = threading.Thread(target=executar)
        thread.start()
        assert iniciou.wait(2) and p.exists()
    thread.join(3)
    assert not thread.is_alive() and not p.exists()


def test_raiz_com_junction_recusada(tmp_path, monkeypatch):
    import retencao_fontes
    raiz = tmp_path / 'fonts_cache'
    p = arquivo(raiz, 'a'*64 + '.fonte')
    monkeypatch.setattr(retencao_fontes, '_sem_links', lambda _: False)
    with pytest.raises(ValueError):
        limpar(raiz, pedidos_pendentes=False)
    assert p.exists()
