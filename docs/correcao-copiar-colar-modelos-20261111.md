# Copiar e colar modelos — correção local de 11/11/2026

Base: origin/main 674763f7. Branch: fix/copiar-colar-arte-20261111.

## Defeito e correção

Uma tentativa de copiar um modelo sem URL retornava sem invalidar a cópia
anterior. Colar reutilizava essa cópia, inclusive pelo armazenamento do navegador.
Os botões também guardavam a URL no HTML, sujeita a ficar antiga após recargas
parciais. A hipótese de seleção de página de PDF não foi comprovada no pedido.

Os botões agora resolvem a URL pelo pedido/modelo no clique. Uma tentativa sem
original invalida a cópia anterior; a amostra de aprovação não é aceita como
original. Colar usa a última cópia interna compartilhada entre abas, sem recuperar
silenciosamente o clipboard do sistema. Só após salvar o destino, invalida o
editor anterior, solicita nova amostra e redesenha. Cor e numeração são preservadas.

O botão CorelDRAW permanece disponível. Após colagem confirmada, o navegador
marca a necessidade de reabrir o modelo e impede Atualizar enquanto essa etapa
estiver pendente. Ao abrir, há confirmação antes da sincronização existente da
ponte. Cancelamento ou erro preservam a pendência. Colagem e operações da ponte
não podem executar simultaneamente na mesma tela.

A ponte existente já compara as URLs com as fontes do CDR e substitui as páginas
correspondentes, com backup anterior à troca. Nenhuma fonte Python da ponte foi
modificada. A pendência adicional do painel é local ao navegador; não substitui
validação do documento em outra estação nem comprova a versão instalada.

## Validação

Harness novo: fonte atual por ID, ausência de original, rejeição de amostra,
cópia entre abas, falha de gravação, recibo negativo, preservação da origem,
cor/numeração e colagem no verso. Integração: CorelDRAW disponível após colagem,
Atualizar aguardando reabertura, cancelamento, persistência da pendência e exclusão
mútua entre colagem e ponte. Harnesses de origem, documento e transporte mantidos.

O harness geral lista_arte_harness.js falha também na base sem alterações:
verificação de releitura de numerações e ReferenceError: window is not defined
em bancoDeDadosIncompletoDoModelo. Não foi alterado nesta tarefa.

## Entrega e retomada

Somente arquivos locais; sem publicação, instalação, SQL ou alteração de pedidos.
Na consulta anterior, 1007401–1007403 do pedido 25095 tinham amostras JPEG, mas
não tinham arte_url. A correção impede copiar uma arte antiga nessa situação;
ela não reconstrói o original a partir da amostra. Publicar o original correto
pela ponte continua necessário para esses modelos.

Após publicação autorizada, validar com modelos de teste: copiar um original A,
tentar copiar modelo vazio, confirmar que Colar recusa; copiar B e colar no destino,
reabrir no CorelDRAW, conferir a página do destino e a preservação da origem.
Confirmar a nova amostra após recarregar. Não usar pedidos reais para esse teste
sem autorização. Recuperação: republicar os três arquivos frontend da base anterior;
nenhuma migração foi preparada ou aplicada.
