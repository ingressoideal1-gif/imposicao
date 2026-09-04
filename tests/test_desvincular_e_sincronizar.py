# -*- coding: utf-8 -*-
"""As duas saídas que faltavam: tirar um pedido do evento e conferir os setores.

Até 04/09/2026 estas eram as duas únicas situações do Ideal Control cuja
resposta era "a gráfica mexe no banco à mão":

1. o cliente carrega o pedido no evento errado — o `carregar` recusa com "este
   pedido já está num evento" e não havia caminho de volta em tela nenhuma;
2. um modelo ganha numeração com código DEPOIS do carregar — que é exatamente o
   conserto quando a gráfica errou a numeração — e o setor dele nunca aparece.

Regra deste projeto: toda trava tem de dizer, na própria tela, como se sai dela.

A REGRA em si é testada em `supabase/functions/_compartilhado/vinculo_test.ts`,
com banco de mesa. Aqui se testa o que aquele arquivo não alcança: que as duas
telas chamam as rotas certas, que a escrita do cliente passa pela elevação, e
que as duas pontas usam a MESMA função.
"""

import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CONTA = "supabase/functions/acesso-conta/index.ts"
INTERNO = "supabase/functions/acesso-interno/index.ts"
VINCULO = "supabase/functions/_compartilhado/vinculo.ts"


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


# ── A regra mora num lugar só ───────────────────────────────────────────────

def test_as_duas_telas_chamam_a_MESMA_funcao():
    """Duas cópias divergiriam, e o sintoma seria a gráfica desfazendo de um
    jeito que o cliente não consegue reproduzir — a mesma razão pela qual a
    configuração do evento já é compartilhada entre as duas."""
    for arquivo in (CONTA, INTERNO):
        texto = _ler(arquivo)
        assert '_compartilhado/vinculo.ts' in texto, f"{arquivo} não importa a regra"
        assert "desvincularPedido" in texto
        assert "sincronizarSetores" in texto


def test_a_regra_nao_foi_copiada_para_dentro_das_funcoes():
    """As duas rotas só chamam; quem escreve no banco é o módulo compartilhado.
    Um `PATCH ... status: excluido` dentro de uma delas seria a segunda cópia
    nascendo."""
    for arquivo in (CONTA, INTERNO):
        texto = _ler(arquivo)
        assert 'status: "excluido"' not in texto, f"{arquivo} desliga setor por conta própria"


# ── As rotas ────────────────────────────────────────────────────────────────

def test_as_duas_rotas_existem_nas_duas_funcoes():
    for arquivo in (CONTA, INTERNO):
        texto = _ler(arquivo)
        assert '"desvincular"' in texto, f"{arquivo} não tem a rota de desvincular"
        assert '"sincronizar-setores"' in texto, f"{arquivo} não tem a rota de sincronizar"


def _bloco_da_rota(texto, nome):
    """O corpo do `if` daquela rota, para conferir o que ele exige."""
    m = re.search(
        r'p\[2\] === "' + re.escape(nome) + r'"\) \{(.*?)\n  \}',
        texto, re.S,
    )
    assert m, f"não achei a rota {nome}"
    return m.group(1)


def test_no_aplicativo_do_dono_as_duas_ESCREVEM_e_exigem_elevacao():
    """São escrita como qualquer outra desta função: sem a elevação, quem
    pegasse o celular do dono destrancado desfaria o evento no meio da noite —
    e o celular fica com o porteiro."""
    texto = _ler(CONTA)
    for nome in ("desvincular", "sincronizar-setores"):
        bloco = _bloco_da_rota(texto, nome)
        assert "exigirElevacao" in bloco, f"a rota {nome} do cliente não exige elevação"
        assert "pedidoDoDono" in bloco, f"a rota {nome} do cliente não confere o dono"


def test_a_elevacao_e_exigida_contra_o_evento_DO_PEDIDO():
    """Nunca contra um `evento_id` que o chamador mandasse por fora: isso
    deixaria a senha de um evento abrir a escrita de outro. É a mesma regra que
    o comentário do roteamento já registra para as demais escritas."""
    texto = _ler(CONTA)
    for nome in ("desvincular", "sincronizar-setores"):
        bloco = _bloco_da_rota(texto, nome)
        assert "exigirElevacao(alvo.evento.id" in bloco, (
            f"a rota {nome} eleva contra um evento que não veio do pedido"
        )


def test_na_tela_da_grafica_basta_o_papel_como_no_resto_daquela_funcao():
    """Decisão do usuário em 15/08/2026: a edição pela gráfica é sem senha,
    basta estar logado como ADM ou Atendimento. O que isso NÃO dispensa é a
    identificação, e ela é de toda a função — `quemConfigura`."""
    texto = _ler(INTERNO)
    assert "quemConfigura" in texto
    for nome in ("desvincular", "sincronizar-setores"):
        assert "exigirElevacao" not in _bloco_da_rota(texto, nome)


def test_pedido_sem_evento_recusa_antes_de_tocar_no_banco():
    """"Este pedido não está em nenhum evento" é a resposta certa, e ela vem
    antes de qualquer escrita: sem isso, o `eventoId` nulo entraria no filtro do
    PostgREST e a operação varreria linha que não é de ninguém."""
    for arquivo in (CONTA, INTERNO):
        texto = _ler(arquivo)
        assert "nao esta em nenhum evento" in texto or "ainda nao esta em nenhum evento" in texto


# ── A tela do cliente ───────────────────────────────────────────────────────

def test_a_engrenagem_tem_os_dois_cartoes():
    html = _ler("frontend/controle.html")
    assert 'id="cartao-conferir-setores"' in html
    assert 'id="cartao-desvincular"' in html


def test_conferir_os_setores_fica_na_secao_SETORES_e_nao_na_zona_de_risco():
    """Conferir não é arriscado: ele cria o que falta e não desfaz nada. Na
    zona de risco, ficaria atrás do aviso vermelho que existe para segurar o
    dedo de quem passa — e ninguém tocaria nele."""
    html = _ler("frontend/controle.html")
    assert html.index('id="cartao-conferir-setores"') < html.index('id="bloco-zona-de-risco"')
    assert html.index('id="cartao-desvincular"') > html.index('id="bloco-zona-de-risco"')


def test_o_desvincular_pergunta_antes():
    """Ele muda o evento inteiro. A confirmação é a mesma caixa do zerar e do
    finalizar — um segundo jeito de perguntar nesta tela seria um segundo lugar
    para errar."""
    js = _ler("frontend/controle.js")
    m = re.search(r"function desvincularPedido\(pedido, botao\) \{(.*?)\n    \}", js, re.S)
    assert m, "não achei o desvincular da tela do cliente"
    assert "caixaConfirmar.perguntar" in m.group(1)
    assert "'/pedidos/' + pedido + '/desvincular'" in m.group(1)


def test_os_botoes_do_cliente_ficam_atras_da_senha():
    """`so-com-senha` é o que a `travarCampos()` desliga enquanto não há
    elevação. Sem a classe, o dono tocaria no botão e receberia um 401 do
    servidor — aceitar o toque e não gravar é a pior das combinações."""
    js = _ler("frontend/controle.js")
    m = re.search(r"function linhaDePedido\((.*?)\n    \}", js, re.S)
    assert m, "não achei a linha de pedido"
    assert "so-com-senha" in m.group(1)


def test_um_botao_POR_PEDIDO_e_nao_um_para_o_evento():
    """Um evento pode reunir vários pedidos — a pista num, o camarote noutro.
    Conferir "o primeiro" seria conferir metade do evento e dizer que está tudo
    certo."""
    js = _ler("frontend/controle.js")
    assert "pedidos.forEach" in js
    assert 'id="pedidos-para-conferir"' in _ler("frontend/controle.html")
    assert 'id="pedidos-do-evento"' in _ler("frontend/controle.html")


def test_a_tela_do_cliente_relata_o_que_mudou_item_por_item():
    """"Pronto" não serve: uma conferência que não diz o resultado é
    indistinguível de uma que não rodou, e o dono a repetiria achando que não
    funcionou."""
    js = _ler("frontend/controle.js")
    assert "Está tudo certo: nada a mudar." in js
    assert "mantidos_com_ingresso" in js


# ── A tela da gráfica ───────────────────────────────────────────────────────

def test_a_tela_da_grafica_esconde_a_secao_sem_evento():
    """Sem evento não há vínculo a desfazer nem setor a conferir: os dois botões
    agiriam sobre nada, e o atendente tocaria neles para descobrir."""
    js = _ler("frontend/ideal-control.js")
    m = re.search(r"function desenharVinculo\(\) \{(.*?)\n    \}", js, re.S)
    assert m, "não achei o desenharVinculo"
    assert "temEvento" in m.group(1)


def test_a_grafica_nao_redesenha_por_cima_de_outro_pedido():
    """A resposta pode chegar depois de o atendente abrir outro pedido, e
    redesenhar ali mostraria os setores deste embaixo do número daquele. É a
    mesma guarda que o bloco "Acesso do cliente" já tem — e lá ela existe porque
    a senha provisória chegou a aparecer sob o cliente errado."""
    js = _ler("frontend/ideal-control.js")
    assert js.count("if (estado.pedido === pedido) { return abrirPedido(pedido); }") == 2
