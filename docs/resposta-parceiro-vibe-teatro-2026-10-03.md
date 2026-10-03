# Resposta ao parceiro — 03/10/2026

Ajustamos e publicamos o contrato de revisão como SHA-256 dos bytes UTF-8 de JCS(config), RFC 8785 completa, hexadecimal minúsculo de 64 caracteres. ID e nome externo do mapa não participam. O nome do setor integra a config: se mudar, o hash muda, mas o vínculo aprovado fica preservado pelo snapshot.

1. A borracha do editor remove a propriedade de posição: `delete cadeiras[chave]`. Depois de apagar `0,2`, essa chave fica ausente de `cadeiras`; não gravamos automaticamente isErased ou um tipo Apagado. Os dois mapas cadastrados consultados hoje não possuem objetos marcados como apagados, portanto não temos um objeto real apagado desses mapas para anexar. O leitor aceita os marcadores legados `isErased=true` ou o ID literal `tipo="Apagado"` e os exclui. O nome descritivo de um tipo personalizado sozinho não significa cadeira apagada.
2. O motor aceita `num` inteiro ou texto. Preserva 1, "01" e "Z" sem converter ou renumerar. O setor Mesas 01 a 46 pode conservar seus rótulos de texto e zeros iniciais.
3. As cadeiras do snapshot são localizadas pela `chave`, como "0,2"; a ordem da lista não é identidade. A revisão é lida exclusivamente de `mapa_teatro_revisao` do modelo, fora do snapshot. Testamos a lista invertida com o mesmo resultado.

Confirmamos no fluxo implementado: o carregamento lê os quatro campos do modelo; o motor confere os IDs e que o setor pertence ao mapa; a geração usa só os lugares ativos do snapshot, com as etiquetas cadastradas; em revisão divergente, avisa e conserva snapshot/revisão histórica; quantidade divergente bloqueia. O snapshot v1 não exige revisão interna. Vínculos incompletos ou mapa/setor indisponíveis também bloqueiam.

Históricos não foram convertidos. Na leitura atual encontramos dois modelos de teatro ligados a bancos antigos, ambos PENDENTE, e nenhum PDF exportado cadastrado. Não encontramos modelos aprovados ou PDFs cadastrados com a revisão antiga nos vínculos consultados; isso não cobre PDFs locais externos ao cadastro.

Disponibilizamos localmente os JSONs canônicos exatos das duas configs atuais e o manifesto de hashes para encaminhamento. Master Hall: o valor recebido tinha 63 caracteres; o cálculo completo tem um b adicional entre 235fc e e53:

```text
a27a03ee856345a5d0eb26e67a53edf73f6c4442bcb30bd235fcbe53b7068d45
```

Laércio Boim confere:

```text
37a8fed126ad67a38dcf5be2f2a452fea35a3a3b0b49d4f92357599828e7b78c
```

Web v1008, função mapas-teatro-pdfs versão 2 e NewProd 1.2.350 publicados e verificados. Cada estação precisa instalar/atualizar o NewProd para usar o contrato; a instalação e a impressão física ainda precisam de conferência operacional. Os testes foram feitos com serviços simulados e geração de PDF sintético. Este texto foi preparado, sem envio ao parceiro.
