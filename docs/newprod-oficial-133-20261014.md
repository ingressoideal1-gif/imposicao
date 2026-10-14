# NewProd 1.3.3 oficial — capas de montagem

Entrega autorizada após aprovação pelo usuário do PDF de exemplo. Fonte
`740bbedd`. Existe um único NewProd oficial; os caminhos históricos de
atualização conduzem ao mesmo instalador.

Em Cut & Stack / Estrito + Montagem, as capas de conjuntos `assembly`
preenchem as colunas de cima para baixo, da esquerda para a direita, na
orientação final do PDF. Abrange várias colunas, as quatro rotações, capas
de Camarote e capas por fila de Teatro quando classificadas como montagem.
Os conjuntos atuais do planejador de Teatro são estritos e ficam preservados.
Detalhes: `capas-montagem-colunas-20261014.md`.

## Validação e pacote

126 testes específicos e 60 etapas da bateria de compatibilidade aprovados,
com 1.027 testes Python, dois subtestes e 19 harnesses JavaScript em cada
configuração. Duas exclusões por falta do pool QR real e um aviso preexistente
Starlette/httpx por configuração. Mais 40 testes dos contratos de atualização
aprovados após incrementar a versão.

No exemplo aprovado de 1.500 itens, apenas o PDF de capas de montagem mudou
entre os 12 arquivos gerados. Texto e imagem de miolo, capas estritas e
contracapas permaneceram idênticos. A montagem continua com 38 folhas.

Instalador `NewProdPiloto_Oficial_v1.3.3.msi`, produto Windows `NewProd`,
196677632 bytes, SHA-256
`6f6c6f85af98b7ce9acabbe5121ab48b87c8ef4331266ef2f5bdc97f37a42e91`.
Auditoria confirmou a identidade MSI, ausência de arquivos privados, 375
arquivos do painel e igualdade do código compilado do motor com a fonte.
Evidência: `evidencias/release-133-oficial-auditoria.json`.

A cópia com prefixo histórico de teste contém exatamente os mesmos bytes;
serve somente aos validadores de atualização antigos. Não é outro produto
nem outra versão funcional. Preservar as 12 estações já liberadas.

## Recuperação e limites

Executáveis anteriores preservados em `dist/compatibilidade/base-132-binarios`.
Instaladores anteriores mantidos. Manifestos anteriores em
`dist/compatibilidade/manifestos-antes-release-133.json`.
Recuperação automática exige uma versão superior com a fonte anterior;
restaurar somente o manifesto não provoca downgrade de máquinas atualizadas.

Não houve instalação forçada, reinício manual, gravação em pedidos nem envio
à impressora nesta entrega. Aprovação do PDF não comprova impressão física;
confirmar versão instalada e resultado na estação após atualizar.

## Publicação concluída

Ambos os downloads públicos foram conferidos integralmente por tamanho e
SHA-256 antes de ativar a atualização. Os três manifestos foram relidos em
1.3.3, com o mesmo hash e as mesmas 12 estações. Evidência:
`evidencias/release-133-oficial-publicacao.json`. Instalação efetiva nas
estações e validação física permanecem separadas da publicação.
