# -*- coding: utf-8 -*-
"""Os tres ajustes da Lista de Arte pedidos em 19/08/2026.

1. **A caixa "Designers Ideal"** mostra, ao lado de cada pessoa, quantos pedidos
   e quantos modelos ela tem. Contava `state.ordens` inteiro -- somava pedido ja
   aprovado, pedido esperando resposta do cliente e pedido que foi para a
   producao meses atras. Agora conta so o card "Em Arte", que e o trabalho
   aberto de hoje.

   Para isso a classificacao dos pedidos saiu de dentro do `renderOrdens` e
   virou `classificarPedidoNaArte`. Era um trecho solto que so existia enquanto
   a tabela era desenhada; a caixa, que aparece dentro do pedido, nao tinha como
   perguntar nada a ele. Com uma funcao so, card e caixa nao podem divergir.

2. **A linha do pedido perdeu os dois links** -- o icone do Vibe e o botao de
   copiar o link direto. O do Vibe continua vivo, dentro do pedido aberto; o de
   copiar foi excluido, junto com a funcao que so servia a ele. A rota
   `/pedido/20928` continua funcionando: o que sumiu foi o atalho de copiar o
   endereco, nao o endereco.

3. **Entrou a coluna Preview**, entre Vendedor e Data Liberacao, igual a do
   Painel de Producao -- e literalmente igual: o desenho virou a funcao
   `previewDaArteDoPedidoHtml`, usada pelas duas tabelas. Arte em PDF continua
   saindo como atalho para abrir o arquivo, e nao como miniatura rasterizada.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "lista_arte_enxuta_harness.js")


def test_o_harness_da_lista_de_arte_enxuta_passa():
    assert os.path.exists(HARNESS), "o harness da lista de arte enxuta sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
