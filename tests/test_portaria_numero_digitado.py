"""Número impresso resolve a mesma identidade do QR, sem mudar regras de acesso."""
import pytest
from test_portaria_validacao import chamar, carga, PISTA, VIP
from test_portaria_tela import ler, hash_de


def preparada():
    c = carga()
    c['publicacao'] = {'versao': 'numero-impresso-v1:teste', 'concluida': True}
    c['publicacao_baixada'] = c['publicacao']['versao']
    c['credenciais'] = [
        {'id': 'pulseira', 's': PISTA, 'n': 150, 'ni': 250, 'h': hash_de('QR-sintetico')},
        {'id': 'outra', 's': PISTA, 'n': 250, 'ni': 350, 'h': hash_de('250')},
    ]
    return c


def numero(texto, c=None, **kwargs):
    return chamar('decidir', dict(carga=c or preparada(), numeroDigitado=texto,
                                 agora='2026-11-13T12:00:00Z', entradas={}, **kwargs))


@pytest.mark.parametrize('texto', ['250', '000250', ' 250 '])
def test_impresso_resolve_credencial_e_nao_ordinal_ou_hash(texto):
    r = numero(texto)
    assert (r['estado'], r['credencial_id'], r['numero']) == ('permitido', 'pulseira', 250)


def test_ordinal_nao_substitui_numero_impresso():
    assert numero('150')['motivo'] == 'numero_nao_encontrado'


@pytest.mark.parametrize('texto', ['', ' ', '-1', '+250', '2.5', '2e2', '0xFA', 'QR-sintetico', '9007199254740992'])
def test_apenas_inteiros_decimais_seguros(texto):
    assert numero(texto)['motivo'] == 'numero_invalido'


def test_numero_zero_e_legado_sem_ni_sao_aceitos_em_carga_atual():
    c = preparada()
    c['credenciais'] = [{'id': 'legado', 's': PISTA, 'n': 0, 'h': 'h'}]
    assert numero('000', c)['credencial_id'] == 'legado'


@pytest.mark.parametrize('versao', [None, 'versao-antiga'])
def test_cache_antigo_nao_pode_selecionar_ordinal_por_engano(versao):
    c = preparada()
    c['publicacao']['versao'] = versao
    assert numero('250', c)['motivo'] == 'numeracao_desatualizada'


def test_download_incompleto_nao_pode_validar_numero():
    c = preparada()
    c['publicacao_baixada'] = 'anterior'
    assert numero('250', c)['motivo'] == 'numeracao_desatualizada'


@pytest.mark.parametrize('regra', ['evento_inativo', 'setor_nao_autorizado', 'setor_bloqueado', 'fora_da_janela', 'bloqueado', 'ja_entrou'])
def test_digitacao_mantem_as_mesmas_recusas_do_qr(regra):
    c = preparada()
    entradas = {}
    if regra == 'evento_inativo': c['evento']['ativo'] = False
    elif regra == 'setor_nao_autorizado': c['aparelho']['setores'] = [VIP]
    elif regra == 'setor_bloqueado': c['setores'][0]['bloqueado'] = True
    elif regra == 'fora_da_janela': c['setores'][0]['fecha_em'] = '2026-11-12T00:00:00Z'
    elif regra == 'bloqueado': c['bloqueios'] = [{'setor_id': PISTA, 'de': 150, 'ate': 150}]
    else: entradas['pulseira'] = '2026-11-13T11:00:00Z'
    base = dict(carga=c, agora='2026-11-13T12:00:00Z', entradas=entradas)
    manual = chamar('decidir', dict(base, numeroDigitado='250'))
    qr = chamar('decidir', dict(base, hashes=[hash_de('QR-sintetico')]))
    assert manual == qr
    assert manual['motivo'] == regra


def test_numero_repetido_no_mesmo_setor_nao_escolhe_primeiro():
    c = preparada()
    c['credenciais'][1]['ni'] = 250
    r = numero('250', c)
    assert r['motivo'] == 'numero_ambiguo'
    assert r['credencial_id'] is None


def test_setores_repetidos_pedem_escolha_e_respeitam_escolhido():
    c = preparada()
    c['aparelho']['setores'] = [PISTA, VIP]
    c['credenciais'][1].update(ni=250, s=VIP)
    assert numero('250', c)['estado'] == 'ambiguo'
    assert numero('250', c, setorEscolhido=VIP)['credencial_id'] == 'outra'
    assert numero('250', c, setorEscolhido='nao-autorizado')['estado'] == 'negado'


def test_numero_repetido_so_considera_setores_liberados_no_celular():
    c = preparada()
    c['credenciais'][1].update(ni=250, s=VIP)
    # VIP tem o mesmo número, mas este celular só está autorizado para PISTA.
    r = numero('250', c)
    assert r['estado'] == 'permitido'
    assert r['credencial_id'] == 'pulseira'
    assert r['setor']['id'] == PISTA


def test_tela_nao_oferece_setor_que_nao_esta_liberado_no_celular():
    c = preparada()
    c['credenciais'][1].update(ni=250, s=VIP)
    r = ler(c, texto='250', digitar=True)
    assert r['titulo'] == 'LIBERADO'
    assert r['detalhe'] == 'PISTA'
    assert r['telaAmbiguo'] is False
    assert r['filaCredenciais'] == ['pulseira']


def test_tela_digita_250_e_rele_qr_como_ja_entrou():
    r = ler(preparada(), textos=['250', 'QR-sintetico'], digitar=[True, False], confirmarProximo=True)
    assert r['titulo'] == 'JÁ ENTROU'
    assert r['filaCredenciais'] == ['pulseira', 'pulseira']
    assert r['filaResultados'] == ['permitido', 'negado']


def test_tela_le_qr_e_redigita_numero_como_ja_entrou():
    r = ler(preparada(), textos=['QR-sintetico', '250'], digitar=[False, True], confirmarProximo=True)
    assert r['titulo'] == 'JÁ ENTROU'
    assert r['filaCredenciais'] == ['pulseira', 'pulseira']


def test_tela_escolhe_setor_sem_perder_busca_por_numero():
    c = preparada()
    c['aparelho']['setores'] = [PISTA, VIP]
    c['setores'][1]['tipo_uso'] = 'unico'
    c['credenciais'][1].update(ni=250, s=VIP)
    r = ler(c, texto='000250', digitar=True, escolherSetor='VIP')
    assert r['titulo'] == 'LIBERADO'
    assert r['detalhe'] == 'VIP'
    assert r['numeroDestaque'] == '250'
    assert r['filaCredenciais'] == ['outra']


def test_tela_repetido_no_mesmo_setor_exige_qr():
    c = preparada()
    c['credenciais'][1]['ni'] = 250
    r = ler(c, texto='250', digitar=True)
    assert r['titulo'] == 'NÚMERO REPETIDO'
    assert 'Leia o QR' in r['detalhe']
    assert r['filaResultados'] == ['negado']
    assert r['filaCredenciais'] == [None]


def test_reentrada_digitada_sem_internet_nao_libera():
    c = preparada()
    c['setores'][0]['tipo_uso'] = 'reentrada'
    r = ler(c, texto='250', digitar=True)
    assert r['movimentoVisivel']
    assert r['movimentoTitulo'] == 'Confirmação pendente'
    assert r['movimentoPendente']['leitura']['credencial_id'] == 'pulseira'
    assert 'permitido' not in r['filaResultados']


def test_reentrada_digitada_confirma_saida_da_mesma_credencial():
    c = preparada()
    c['setores'][0]['tipo_uso'] = 'reentrada'
    versao = '00000000-0000-4000-8000-000000000050'
    r = ler(c, texto='250', digitar=True, online=True, acoesMovimento=['saida'], mock={
        'pathname': '/functions/v1/portaria/movimento', 'method': 'POST',
        'movimentos': [{'resultado': 'confirmar', 'versao': versao},
                       {'resultado': 'permitido', 'tipo': 'saida'}],
    })
    assert r['titulo'] == 'SAÍDA REGISTRADA'
    assert r['numeroDestaque'] == '250'
    assert [p['credencial_id'] for p in r['movimentos']] == ['pulseira', 'pulseira']
    assert r['movimentos'][1]['acao'] == 'saida'
    assert r['movimentos'][1]['versao'] == versao
    assert r['fila'] == 0


def test_digitacao_respeita_recusa_online_de_outro_celular():
    r = ler(preparada(), texto='250', digitar=True, online=True, mock={
        'pathname': '/functions/v1/portaria/entrada', 'method': 'POST', 'status': 200,
        'body': {'resultado': 'negado', 'motivo': 'ja_entrou', 'primeira': False},
    })
    assert r['titulo'] == 'JÁ ENTROU'
    assert r['filaResultados'] == ['negado']
    assert r['filaCredenciais'] == ['pulseira']
