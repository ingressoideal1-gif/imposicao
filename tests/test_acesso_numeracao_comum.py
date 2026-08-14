# -*- coding: utf-8 -*-
"""O Ideal Control também aceita ingresso com QR ou código de barras comum.

Regra do usuário, 14/08/2026: mesmo que o modelo não tenha QR Ideal, desde que
tenha um elemento QR ou BARCODE, o controle de acesso tem de funcionar — e a
leitura será pelo dado contido no elemento de numeração.

Isso é possível porque o QR e o código de barras imprimem exatamente o mesmo
`val_str` que o `engine._render_element` monta: `prefixo + numero.zfill(pad) +
sufixo`. O agente consegue recalcular esse texto para a tiragem inteira sem
depender do pool.

## O que muda de natureza, e está registrado de propósito

O código do pool é imprevisível: 2,82 trilhões de combinações. O `0002` de uma
numeração comum é adivinhável por quem tem o `0001` — mas não é *inventável*,
porque pertence a um ingresso de verdade, na mão de outra pessoa. A fraude deixa
de ser falsificação e vira clonagem, e quem a pega é a detecção de entrada
repetida na portaria, não o sigilo do código.

## A ambiguidade, e a decisão que a resolve

Nas 59 numerações do catálogo real, o QR sai com `prefix=''` e `pad=4`. Logo o
item 1 do VIP e o item 1 do CAMAROTE são os dois `0001` — no mesmo evento.

Decisão do usuário: **o aparelho resolve pelo setor dele**. Cada aparelho valida
uma lista de setores, e o código é interpretado nesse contexto. Quando o aparelho
valida vários setores e o código casa em mais de um, a portaria pergunta qual —
mostrando só os que casaram. Isso é trabalho da parte 3; o que estes testes
cobram é a metade de cá: que os códigos cheguem à nuvem separados por modelo.
"""

import acesso_publicacao as ap


# ── O conteúdo impresso, recalculado ────────────────────────────────────────
#
# Se esta conta divergir do `engine._render_element`, a portaria recusa todo
# ingresso do evento — e só dá para descobrir ali.

def test_conteudo_igual_ao_que_o_papel_recebe():
    num = {"tipo": "QR", "prefix": "", "pad": 4, "suffix": ""}
    assert ap.conteudo_numeracao(num, 1) == "0001"
    assert ap.conteudo_numeracao(num, 150) == "0150"


def test_prefixo_e_sufixo_entram_na_conta():
    num = {"tipo": "QR", "prefix": "V", "pad": 4, "suffix": "-A"}
    assert ap.conteudo_numeracao(num, 7) == "V0007-A"


def test_sem_pad_o_numero_vai_cru():
    """`pad=0` é o padrão do engine quando ninguém escolheu."""
    assert ap.conteudo_numeracao({"tipo": "QR", "pad": 0}, 42) == "42"


def test_o_zfill_nao_corta_numero_maior_que_o_pad():
    """Tiragem de 12.000 com pad=4: o item 12.000 tem de sair inteiro.

    `zfill` preenche, nunca trunca — mas se alguém trocasse por uma formatação
    de largura fixa, os ingressos acima de 9.999 sairiam errados no papel e o
    hash bateria mesmo assim aqui. Este teste tranca a conta certa.
    """
    assert ap.conteudo_numeracao({"tipo": "QR", "pad": 4}, 12000) == "12000"


# ── Qual elemento manda ──────────────────────────────────────────────────────

def test_qr_ideal_ganha_de_qr_comum():
    """O seguro vence o adivinhavel sempre que os dois existirem."""
    els = [{"type": "QR", "pad": 4}, {"type": "QR_IDEAL"}]
    assert ap.numeracao_do_modelo(els)["tipo"] == "QR_IDEAL"


def test_qr_ganha_de_barcode():
    els = [{"type": "BARCODE", "pad": 6}, {"type": "QR", "pad": 4}]
    assert ap.numeracao_do_modelo(els)["tipo"] == "QR"


def test_barcode_sozinho_serve():
    els = [{"type": "TEXT"}, {"type": "BARCODE", "pad": 6, "prefix": "B"}]
    n = ap.numeracao_do_modelo(els)
    assert n["tipo"] == "BARCODE"
    assert ap.conteudo_numeracao(n, 3) == "B000003"


def test_numeracao_sem_codigo_nenhum_nao_publica():
    """Etiqueta com texto e picote nao tem o que a portaria leia."""
    assert ap.numeracao_do_modelo([{"type": "TEXT"}, {"type": "PICOTE"}]) is None


def test_elemento_alimentado_pelo_csv_nao_publica():
    """O conteudo vem de uma coluna, e nao do numero do item.

    Publicar a conta sequencial aqui gravaria um hash que NAO corresponde ao
    que foi impresso: todo ingresso recusado na portaria, e a causa invisivel.
    """
    els = [{"type": "QR", "source": "database", "csv_column": "codigo"}]
    assert ap.numeracao_do_modelo(els) is None


def test_o_primeiro_qr_da_lista_e_o_que_vale():
    """Dois QR no mesmo modelo imprimem o MESMO val_str.

    Nao ha escolha a fazer entre eles: a conta e a mesma. O que este teste
    tranca e que a funcao nao devolva os dois nem se confunda com a repeticao.
    """
    els = [{"type": "QR", "pad": 4, "prefix": "A"}, {"type": "QR", "pad": 4, "prefix": "A"}]
    n = ap.numeracao_do_modelo(els)
    assert n["tipo"] == "QR"
    assert ap.conteudo_numeracao(n, 1) == "A0001"


# ── A geração dos itens ──────────────────────────────────────────────────────

class PoolFalso:
    def conteudo(self, pedido, modelo, numero):
        return f"POOL-{pedido}-{modelo}-{numero}"


def test_gera_a_tiragem_inteira_do_modelo_com_qr_comum():
    """Tiragem inteira, nunca so a folha: reimpressao parcial deixaria o
    restante recusado na porta."""
    itens = list(ap.itens_do_pedido(
        20272, {1000105: 3}, "00" * 32, None,
        numeracoes={1000105: {"tipo": "QR", "pad": 4}},
    ))
    assert [i["numero"] for i in itens] == [1, 2, 3]
    assert all(i["modelo_id"] == 1000105 for i in itens)
    assert len({i["hash"] for i in itens}) == 3


def test_modelo_sem_numeracao_conhecida_e_pulado():
    """O outro modelo do pedido nao estava nesta folha: publica quando imprimir.

    Publicar com uma conta suposta seria pior do que nao publicar: gravaria
    hash errado, e reimprimir NAO consertaria — o servidor ignora duplicata.
    """
    itens = list(ap.itens_do_pedido(
        20272, {1000105: 2, 1000106: 5}, "00" * 32, None,
        numeracoes={1000105: {"tipo": "QR", "pad": 4}},
    ))
    assert {i["modelo_id"] for i in itens} == {1000105}


def test_qr_ideal_continua_saindo_do_pool():
    itens = list(ap.itens_do_pedido(
        20272, {1000105: 2}, "00" * 32, PoolFalso(),
        numeracoes={1000105: {"tipo": "QR_IDEAL"}},
    ))
    assert len(itens) == 2
    esperado = ap.qr_ideal.hash_codigo("POOL-20272-1000105-1", "00" * 32)
    assert itens[0]["hash"] == esperado


def test_sem_mapa_de_numeracoes_o_comportamento_antigo_continua():
    """Compatibilidade: quem chamava sem o mapa esperava o pool para tudo."""
    itens = list(ap.itens_do_pedido(20272, {1000105: 2}, "00" * 32, PoolFalso()))
    assert len(itens) == 2


def test_dois_modelos_com_o_mesmo_0001_geram_hashes_iguais():
    """Registrado de proposito: e a ambiguidade que a portaria resolve.

    O sal e por PEDIDO, entao VIP 0001 e CAMAROTE 0001 do mesmo pedido dao o
    MESMO hash. Duas linhas com modelo_id diferente e codigo_hash igual — e o
    indice unico do banco e sobre `codigo_hash` sozinho, entao a segunda e
    ignorada.

    Nao e defeito a consertar aqui: e o motivo de o aparelho resolver pelo setor
    dele, e o motivo de a portaria precisar perguntar quando o aparelho valida
    os dois. Se um dia isso mudar, este teste falha e obriga a reler a decisao.
    """
    itens = list(ap.itens_do_pedido(
        20272, {1000105: 1, 1000106: 1}, "00" * 32, None,
        numeracoes={1000105: {"tipo": "QR", "pad": 4},
                    1000106: {"tipo": "QR", "pad": 4}},
    ))
    assert len(itens) == 2
    assert itens[0]["hash"] == itens[1]["hash"]
    assert itens[0]["modelo_id"] != itens[1]["modelo_id"]


# ── O mapa que o app.py monta a partir do trabalho impresso ─────────────────
#
# Este e o unico ponto do sistema que sabe, ao mesmo tempo, QUAIS modelos estao
# na folha e QUAL numeracao cada um usa. Errar aqui e publicar hash que nao
# corresponde ao papel.

import app as _app


class ConfigFalso:
    def __init__(self, elements=None, multi_artes=None, modelo=None):
        self.elements = elements or []
        self.multi_artes = multi_artes or []
        self.modelo = modelo


def test_mapa_de_uma_arte_so():
    cfg = ConfigFalso(elements=[{"type": "QR", "pad": 4}], modelo="1000105")
    assert _app._numeracoes_por_modelo(cfg) == {
        1000105: {"tipo": "QR", "prefix": "", "pad": 4, "suffix": ""}
    }


def test_mapa_de_multi_artes_da_um_por_modelo():
    cfg = ConfigFalso(multi_artes=[
        {"modelo": "1000105", "numeracao": {"elements": [{"type": "QR", "pad": 4, "prefix": "V"}]}},
        {"modelo": "1000106", "numeracao": {"elements": [{"type": "QR_IDEAL"}]}},
    ])
    mapa = _app._numeracoes_por_modelo(cfg)
    assert mapa[1000105]["prefix"] == "V"
    assert mapa[1000106]["tipo"] == "QR_IDEAL"


def test_o_qr_do_verso_tambem_conta():
    """A numeracao 2 e o verso. O `ImpositionConfig` achata as duas, e aqui
    tambem tem de achatar: um QR so no verso e um QR mesmo assim."""
    cfg = ConfigFalso(multi_artes=[
        {"modelo": "1000105",
         "numeracao": {"elements": [{"type": "TEXT"}]},
         "numeracao_2": {"elements": [{"type": "QR", "pad": 5}]}},
    ])
    assert _app._numeracoes_por_modelo(cfg)[1000105]["pad"] == 5


def test_arte_sem_codigo_fica_de_fora_do_mapa():
    cfg = ConfigFalso(multi_artes=[
        {"modelo": "1000105", "numeracao": {"elements": [{"type": "QR", "pad": 4}]}},
        {"modelo": "1000106", "numeracao": {"elements": [{"type": "TEXT"}]}},
    ])
    assert list(_app._numeracoes_por_modelo(cfg)) == [1000105]


def test_sem_modelo_nao_da_para_publicar():
    """Sem modelo nao ha a que amarrar o codigo. Melhor nao publicar nada."""
    cfg = ConfigFalso(elements=[{"type": "QR", "pad": 4}], modelo=None)
    assert _app._numeracoes_por_modelo(cfg) == {}


def test_trabalho_de_etiqueta_nao_publica_nada():
    cfg = ConfigFalso(elements=[{"type": "TEXT"}, {"type": "PICOTE"}], modelo="1000105")
    assert _app._numeracoes_por_modelo(cfg) == {}


def test_o_pool_so_e_exigido_por_quem_usa_qr_ideal():
    """Estacao sem o pool continua publicando faixa de numeracao comum."""
    assert ap._precisa_do_pool({1: {"tipo": "QR"}}) is False
    assert ap._precisa_do_pool({1: {"tipo": "QR"}, 2: {"tipo": "QR_IDEAL"}}) is True
    assert ap._precisa_do_pool(None) is True
