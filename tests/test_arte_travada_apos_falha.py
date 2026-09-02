# -*- coding: utf-8 -*-
"""Uma arte que falhou ao baixar pode ser tentada de novo.

## O que estava errado (02/09/2026)

Na folha combinada, cada arte é baixada pela URL dentro do próprio desenho da
prévia. Para não disparar o mesmo download várias vezes, o código marca a URL em
`state.multiArtesPdfLoading[url]` antes de começar — e **nunca apagava a marca**,
nem no sucesso nem no erro.

No sucesso isso era inofensivo: a arte passa a estar em
`state.multiArtesPdfCache`, e essa pergunta vem antes. No erro, não: a arte não
está no cache, a marca bloqueia qualquer nova tentativa, e aquela arte fica
ausente da folha **pelo resto da sessão**. Recarregar a página era a única saída,
e nada na tela dizia isso.

Reproduzido num Chrome, com a rede falhando UMA vez ao baixar a segunda arte:

    tentativas de baixar a arte 2: 1
    seis redesenhos, 12 segundos: "A A" em todos
    arte2NoCache: false | arte2MarcadaCarregando: true

Basta a rede oscilar um instante — ou o Storage demorar — para o operador montar
uma folha faltando um modelo, sem aviso nenhum.

## A forma do conserto

`finally`, no molde que este mesmo arquivo já usa para as páginas do PDF
(`finally { delete pagesRendering[cacheKey]; }`): terminada a tentativa, com
sucesso ou sem, a marca sai. No sucesso o cache assume; no erro, o próximo
desenho tenta outra vez e a arte aparece sozinha quando a rede voltar.

Não há risco de laço: o redesenho só é disparado no caminho de sucesso, e a
prévia já é limitada por rajada.
"""
import io
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_toda_marca_de_carregando_e_apagada_no_fim_da_tentativa():
    """Cada ponto que MARCA precisa de um que APAGA.

    São quatro: frente e verso, na prévia e no caminho de impressão. Todos
    escrevem no mesmo `state.multiArtesPdfLoading`, então um só que fique para
    trás já trava a arte para os outros três.
    """
    pedido = _ler("frontend/pedido.js")

    marcam = len(re.findall(r"state\.multiArtesPdfLoading\[[^\]]+\] = true;", pedido))
    apagam = len(re.findall(r"delete state\.multiArtesPdfLoading\[[^\]]+\];", pedido))

    assert marcam == 4, f"o número de pontos que marcam mudou ({marcam}); confira os que apagam"
    assert apagam == marcam, (
        f"{marcam} pontos marcam a arte como 'carregando' e só {apagam} apagam a "
        f"marca. O que ficar para trás trava aquela arte até o F5."
    )


def test_a_marca_sai_no_finally_e_nao_so_no_sucesso():
    """No `then` não serve: o erro é justamente o caso que trava."""
    pedido = _ler("frontend/pedido.js")

    for trecho in re.findall(r"\.finally\(\(\) => \{[^}]*\}\)", pedido):
        pass  # só para deixar claro o formato procurado abaixo

    assert pedido.count(".finally(() => { delete state.multiArtesPdfLoading[") == 4, (
        "a marca deixou de ser apagada num `finally`. Apagá-la só no `then` "
        "mantém o defeito: quem falha nunca chega lá."
    )


def test_o_desenho_so_e_refeito_no_caminho_de_sucesso():
    """Senão a nova tentativa vira laço.

    O `catch` não pode chamar o desenho: cada falha dispararia outro desenho,
    que tentaria baixar de novo, que falharia de novo.
    """
    pedido = _ler("frontend/pedido.js")
    for bloco in re.findall(
            r"state\.multiArtesPdfLoading\[[^\]]+\] = true;.{0,1600}?\.finally",
            pedido, re.S):
        catch = re.search(r"\.catch\(e => \{(.*?)\}\)", bloco, re.S)
        assert catch, "um dos carregamentos perdeu o `catch`"
        assert "drawPedPreview" not in catch.group(1), (
            "o `catch` passou a redesenhar a prévia: com a URL quebrada isso vira "
            "laço de tentativa"
        )
