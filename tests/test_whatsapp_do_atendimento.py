# -*- coding: utf-8 -*-
"""O botão "Falar com meu Atendimento" do link do cliente.

Pedido do usuário em 25/08/2026: trocar *"Ligar para o meu atendimento"* por
*"Falar com meu Atendimento"*, e dar a cada atendente o seu link de WhatsApp.

## O que os cinco links dele têm em comum

**Todos apontam para o mesmo telefone** — `555195343478`. O que separa um
atendente do outro é o recado que já vai escrito na conversa. Por isso o código
guarda um número só e monta o texto: cinco linhas seriam cinco coisas a manter.

Conferido antes de escrever: reconstruindo os endereços com `encodeURIComponent`,
os cinco batem **byte a byte** com os que ele ditou.

## De onde sai o nome do atendente

De `propostas.vendedor`, que a função `link_cliente_pedido` passou a devolver no
mesmo dia. Os quatro nomeados são também os quatro maiores do banco — medidos
naquele dia, 3.700 dos 3.981 pedidos dos últimos 90 dias. Os outros nomes que
existem por lá (Lisiane Colbeich, Everton Dev, Edison Jr, Everton Farias) caem no
recado genérico, que é o link "Outros" que ele mandou.

O casamento ignora acento e caixa: `propostas.vendedor` é texto livre, e um
acento perdido não pode tirar o cliente do atendente dele.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "whatsapp_do_atendimento_harness.js")


def test_o_harness_do_whatsapp_do_atendimento_passa():
    """Ele compara o que o código monta com os endereços ditados, byte a byte.

    Mexer no texto do recado, na ordem dos parâmetros ou na codificação passaria
    despercebido de outro jeito — e o resultado seria um link que abre a conversa
    com o atendente errado, ou sem nome nenhum.
    """
    assert os.path.exists(HARNESS), "o harness do WhatsApp do atendimento sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, "o harness falhou:\n" + saida
    assert "OK:" in saida, "o harness nao relatou sucesso:\n" + saida
