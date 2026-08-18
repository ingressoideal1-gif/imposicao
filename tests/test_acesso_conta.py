# -*- coding: utf-8 -*-
"""Um login só para a tela do cliente.

`controle.html` — a casa do aplicativo, de onde o cliente entra com a própria
conta — usa o login deste módulo. Até 17/08/2026 o `evento.html` também o
usava, com a mesma frase; a tela saiu junto com o QR do Pedido, e o login
compartilhado deixou de ter uma segunda cópia para divergir.

Também mora aqui o `navegadorId()`: o identificador da instalação do navegador,
que a elevação assina junto. Ele NÃO é o aparelho de portaria cadastrado no
banco — são coisas diferentes, e confundi-las faria o celular do dono virar
aparelho de portaria.
"""

import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_existe_uma_implementacao_so_de_login():
    """`signInWithPassword` num arquivo so, entre os que fazem o login DO CLIENTE.

    `script.js` tambem chama `signInWithPassword`, mas para o login da EQUIPE da
    grafica no painel interno (`index.html`/`producao.html`, com
    `ensureUserPermissions` e `auth-overlay`) — uma conta e um fluxo diferentes,
    que existiam antes desta tarefa e nao fazem parte dela. Unificar os dois
    trocaria uma refatoracao de login do cliente por uma reescrita do login da
    equipe, fora do escopo pedido aqui.

    Os `.min.js` tambem ficam de fora, e por outra razao: sao BIBLIOTECAS
    vendorizadas, nao codigo nosso. Desde 16/08/2026 o SDK do Supabase e
    servido daqui (`supabase-js.min.js`), e ele contem `signInWithPassword`
    porque e ele quem DEFINE o metodo -- contar isso como "mais um dono do
    login" seria acusar a biblioteca de implementar a si mesma.
    """
    donos = []
    for nome in os.listdir(os.path.join(RAIZ, "frontend")):
        if nome == "script.js" or nome.endswith(".min.js"):
            continue
        if nome.endswith(".js") and "signInWithPassword" in _ler(f"frontend/{nome}"):
            donos.append(nome)
    assert donos == ["acesso-conta.js"], f"mais de um dono do login do cliente: {donos}"


def test_o_modulo_nao_depende_de_nada_alem_do_sdk():
    texto = _ler("frontend/acesso-conta.js")
    assert "import " not in texto
    assert "require(" not in texto
    assert "supabaseClient" in texto


@pytest.mark.parametrize("nome", ["acesso-conta.js"])
def test_o_modulo_esta_na_lista_que_as_estacoes_baixam(nome):
    """Sem isto o controle.html da estacao pede um arquivo que nunca chega."""
    import security_config
    assert nome in security_config.PAINEL_ARQUIVOS


def test_o_navegador_id_nao_pode_conter_ponto():
    """O corpo assinado da elevacao e montado com pontos.

    Um ponto no identificador deslocaria os campos e faria uma assinatura valer
    para outra combinacao de evento e conta. O `acesso_elevacao.py` recusa, e o
    gerador daqui nunca produz um.
    """
    texto = _ler("frontend/acesso-conta.js")
    assert "randomUUID" in texto or "crypto.getRandomValues" in texto
    assert "acesso_navegador_id" in texto


def test_a_frase_do_login_manda_usar_a_conta_do_Vibe():
    """A conta e a MESMA do ERP. Uma conta criada aqui passaria no login e
    deixaria o evento pendurado numa identidade sem relacao com o cadastro."""
    texto = _ler("frontend/acesso-conta.js")
    assert "Vibe" in texto
    assert "signUp" not in texto
