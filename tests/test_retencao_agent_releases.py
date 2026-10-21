import copy
import hashlib
import json
from pathlib import Path

import pytest

from ferramentas import retencao_agent_releases as r


def objeto(nome, dados=b'msi'):
    return dict(name=nome, id=nome, updated_at='2026-10-21', metadata=dict(size=len(dados)))


def nome(v, familia='NewProdPiloto_Oficial'):
    return f'{familia}_v{v}.msi'


def manifestos(v='1.3.26'):
    return {n: dict(url=r.BASE+nome(v), version=v, size=3,
                    sha256=hashlib.sha256(b'msi').hexdigest()) for n in r.MANIFESTOS}


def inventario():
    return [objeto(nome(v)) for v in ['1.3.9', '1.3.24', '1.3.25', '1.3.26']]


class FakeStorage:
    def __init__(self):
        self.objetos = inventario()
        self.docs = manifestos()
        self.deletes = []
        self.downloads = []

    def listar(self):
        return copy.deepcopy(self.objetos)

    def manifestos(self):
        return copy.deepcopy(self.docs)

    def baixar(self, n, destino=None):
        self.downloads.append(n)
        if destino:
            destino.write_bytes(b'msi')
        return dict(bytes=3, sha256=hashlib.sha256(b'msi').hexdigest())

    def excluir(self, nomes):
        self.deletes.extend(nomes)
        self.objetos = [x for x in self.objetos if x['name'] not in nomes]
        return [{'name': n} for n in nomes]


def preparado(tmp_path):
    s = FakeStorage()
    pasta = r.preparar(s, tmp_path)
    r.backup(s, pasta)
    return s, pasta


def test_ordenacao_numerica_por_familia_e_preserva_desconhecidos():
    itens = inventario()
    for f in r.FAMILIAS:
        if f == 'NewProdPiloto_Oficial':
            continue
        itens += [objeto(nome(v, f)) for v in ['1.2.9', '1.2.100', '1.2.101', '1.2.102']]
    extras = ['latest.json', 'modelos', 'Outro_v1.0.0.msi', 'NewProd_Setup_v1.0.0.msi.bak',
              'sub/NewProd_Setup_v1.0.0.msi', 'NewProd_Setup_v1.0.0-beta.msi']
    itens += [objeto(n) for n in extras]
    p = r.planejar(itens, manifestos())
    assert len(p['excluir']) == 5
    assert set(extras).issubset(p['preservar'])
    assert nome('1.3.9') in {x['name'] for x in p['excluir']}


def test_quarto_componente_e_manifesto_antigo_protegido():
    itens = inventario() + [objeto(nome(v, 'NewProdPiloto_Setup'))
                            for v in ['1.2.363.9', '1.2.363.29', '1.2.364', '1.2.365']]
    docs = manifestos()
    docs['latest.json'] = manifestos('1.3.9')['latest.json']
    p = r.planejar(itens, docs)
    assert [x['name'] for x in p['excluir']] == [nome('1.2.363.9', 'NewProdPiloto_Setup')]


@pytest.mark.parametrize('falha', ['ausente', 'externo', 'duplicado', 'sem_msi', 'sem_hash'])
def test_plano_inseguro_recusado(falha):
    itens, docs = inventario(), manifestos()
    if falha == 'ausente': docs.pop('latest.json')
    if falha == 'externo': docs['latest.json']['url'] = 'https://outro/arquivo.msi'
    if falha == 'duplicado': itens.append(itens[0])
    if falha == 'sem_msi': itens.pop()
    if falha == 'sem_hash': docs['latest.json']['sha256'] = ''
    with pytest.raises(ValueError): r.planejar(itens, docs)


def test_backup_e_exclusao_confirmada_com_download_final(tmp_path):
    s, pasta = preparado(tmp_path)
    result = r.executar(s, pasta)
    assert result['completo'] and result['bytes_liberados'] == 3
    assert result['apagados'] == [nome('1.3.9')]
    assert (pasta/'msi'/nome('1.3.9')).read_bytes() == b'msi'
    assert result['publicos_antes'] == result['publicos_depois']
    assert s.downloads.count(nome('1.3.26')) == 2
    assert r.datetime.fromisoformat(result['guardar_ate']) > r.agora() + r.timedelta(days=29)


@pytest.mark.parametrize('falha', ['backup', 'manifesto', 'objeto', 'plano', 'download'])
def test_nenhuma_exclusao_quando_precondicao_muda(tmp_path, falha):
    s, pasta = preparado(tmp_path)
    if falha == 'backup': (pasta/'msi'/nome('1.3.9')).write_bytes(b'xxx')
    if falha == 'manifesto': s.docs['latest.json']['notes'] = 'mudou'
    if falha == 'objeto': s.objetos[0]['updated_at'] = 'mudou'
    if falha == 'plano':
        p = json.loads((pasta/'plano.json').read_text())
        p['excluir'].append(p['inventario'][-1])
        r.gravar(pasta/'plano.json', p)
    if falha == 'download':
        s.baixar = lambda *a: dict(bytes=3, sha256='0'*64)
    with pytest.raises(ValueError): r.executar(s, pasta)
    assert not s.deletes


def test_resposta_vazia_nao_e_sucesso(tmp_path):
    s, pasta = preparado(tmp_path)
    s.excluir = lambda nomes: []
    with pytest.raises(ValueError, match='exatamente'): r.executar(s, pasta)
    result = json.loads((pasta/'resultado.json').read_text())
    assert result['em_exclusao'] == nome('1.3.9')
    assert not result['completo'] and result['bytes_liberados'] == 0


def test_estado_verificado_entre_exclusoes(tmp_path):
    s = FakeStorage()
    s.objetos.append(objeto(nome('1.3.8')))
    pasta = r.preparar(s, tmp_path)
    r.backup(s, pasta)
    excluir = s.excluir
    def muda(nomes):
        retorno = excluir(nomes)
        s.docs['latest.json']['notes'] = 'publicacao concorrente'
        return retorno
    s.excluir = muda
    with pytest.raises(ValueError, match='Manifestos mudaram'): r.executar(s, pasta)
    assert len(s.deletes) == 1


def test_automatico_exige_publicacao_concluida(monkeypatch):
    monkeypatch.setattr(r, 'Storage', lambda *a: pytest.fail('Nao pode acessar rede'))
    for resultado in ({}, {'ativado': True}, {'download_conferido': True}):
        with pytest.raises(ValueError): r.apos_publicacao(resultado)


def test_backup_falhou_nao_gera_comprovante_final(tmp_path):
    s = FakeStorage()
    pasta = r.preparar(s, tmp_path)
    s.baixar = lambda *a: dict(bytes=0, sha256='0'*64)
    with pytest.raises(ValueError): r.backup(s, pasta)
    assert not (pasta/'backup.json').exists()
    assert not s.deletes


def test_paginacao_inventario(monkeypatch):
    s = r.Storage('sintetica')
    offsets = []
    def paginar(caminho, dados):
        offsets.append(dados['offset'])
        return [objeto(str(i)) for i in range(1000)] if dados['offset'] == 0 else []
    monkeypatch.setattr(s, 'json', paginar)
    assert len(s.listar()) == 1000
    assert offsets == [0, 1000]


def test_trava_concorrente_impede_exclusao(tmp_path):
    s, pasta = preparado(tmp_path)
    (pasta.parent/'.retencao-em-execucao').write_text('outra execucao')
    with pytest.raises(ValueError, match='Outra retencao'): r.executar(s, pasta)
    assert not s.deletes


def test_backup_retomado_revalida_copia_sem_baixar_de_novo(tmp_path):
    s, pasta = preparado(tmp_path)
    s.downloads.clear()
    r.backup(s, pasta)
    assert s.downloads == []
