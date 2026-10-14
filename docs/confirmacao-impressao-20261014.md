# Confirmacao de impressao — NewProd 1.3.6 / web v1056

Restaura a pergunta para marcar os modelos como impressos depois de gerar/salvar
PDF e de concluir o envio para a impressora ou Hot Folder. As formas de envio
incorporadas ao NewProd oficial ainda excluiam a confirmacao por uma condicao
da antiga versao de teste. Essa exclusao foi removida.

O status permanece dependente de confirmacao explicita. Ainda nao, cancelamento,
erro de geracao/envio ou falha ao salvar nao autorizam marcar como impresso.
Refazer e Folha 1 continuam sem confirmar a tiragem completa. Os alvos sao
capturados antes da geracao, preservando o vinculo mesmo se a selecao mudar.
PDF usa mensagem propria, sem afirmar que houve impressao fisica.

## Validacao e escopo

Harness do fluxo com PDF simples, JSON e streaming, selecao combinada, quatro
formas de envio, falhas e refazer. Popup real em navegador sem rede, com Sim e
Ainda nao e persistencia simulada. Testes de configuracao e Hot Folder.
Bateria de compatibilidade e auditoria do MSI fazem parte da entrega.

A correcao do filtro Laser do pedido 23403 nao integra esta entrega.
Nenhuma query, Edge Function ou registro comercial foi alterado.

## Recuperacao

Preservar binarios 1.3.5 e os tres manifestos antes da ativacao. Recuperacao
por atualizacao exige nova versao superior com a reversao localizada; nao ha
downgrade automatico. Na web, reverter apenas este diff com novo cache.
A publicacao nao comprova instalacao, geracao real ou impressao fisica.
