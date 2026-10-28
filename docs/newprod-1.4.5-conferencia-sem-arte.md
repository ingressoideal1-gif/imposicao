# NewProd 1.4.5: conferencia antes de gerar sem arte de base

O pedido 24409 abriu na 1.4.4, mas a conferencia local anterior a gerar/imprimir
retornou HTTP 409 na PC-JR-HOME. A releitura do cache ainda classificava todo
modelo sem PDF frontal como indisponivel, apesar do marcador validado pela nuvem.

`selecao_piloto.py` compartilha a classificacao entre preparacao, abertura online
e releitura local: frente presente ou `gabarito_sem_arte_base is True`.
Continuam obrigatorios pacote, digest, revisao, vinculo ao pedido e catalogo.
A correcao vale para todos os gabaritos e para arte incorporada na numeracao.
Nao modifica dados do pedido, calculos, numeracao nem a Edge Function publicada.

Regressao reproduzida antes da correcao: HTTP 409 no caso valido e dois testes
do motor bloqueados na conferencia intermediaria. Depois: 72 testes direcionados
aprovados, incluindo sete cenarios HTTP, reinicio offline e PDFs de 1 a 200 com
e sem arte incorporada. A bateria de canais e a auditoria do MSI integram a
entrega; publicacao, adocao da estacao e impressao fisica sao provas distintas.

Fonte baseada na 1.4.4 publicada, preservando as atualizacoes do agente que
ainda nao estao em main. Reversao: manter os manifestos anteriores; nao
sobrescrever artefatos imutaveis. O manifesto de teste permanece separado.
