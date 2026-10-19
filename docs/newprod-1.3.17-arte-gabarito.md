# NewProd 1.3.17 — PDFs no gabarito

Correção do bloqueio de abertura do modelo 1003374 do pedido 23588, autorizado
para publicação universal em 19/10/2026.

## Fonte e comportamento

Base do agente: tag `agente-v1.3.16`, commit `fcaf7838`. A fonte operacional
foi preservada; somente a correção, testes, versão e notas foram adicionados.
A otimização de leituras de `piloto_catalogo.ts` já publicada na nuvem foi
preservada após comparar o download da função com a fonte local.

Quando `arte_url` está ausente, a preparação reconhece um PDF HTTPS de elemento
visível na frente do gabarito. Os demais recursos continuam no pacote; não
altera a composição da arte nem os dados comerciais. Fotos, fontes, verso
isolado e conteúdo inline não são classificados como arquivo de frente.

O cache ganha a marca `fontes_gabarito`. Na primeira abertura após atualizar,
um cache anterior exige nova conferência completa na nuvem, mesmo sem mudança
da revisão comercial. Arquivos antigos não são apagados. As validações de
aprovação, empresa, digest e integridade continuam ativas.

## Evidências

- Função `piloto-local` publicada antes do agente; os 12 arquivos baixados
  após o deploy conferiram com as fontes preparadas.
- Consulta somente leitura do modelo real, com a função baixada após deploy:
  arte aprovada, `arte_url` ausente e frente do gabarito reconhecida.
- 356 testes Deno na base do agente; 65 testes dirigidos incluindo offline;
  1.112 testes aprovados por perfil Produção, Piloto e Oficial, além dos
  harnesses previstos, incluindo navegador (dois testes pulados por perfil).
- MSI `NewProdPiloto_Oficial_v1.3.17.msi`: ProductVersion 1.3.17,
  196.689.920 bytes, SHA-256
  `90facd4fc6e2ec6bdb6d6082eb6b25160a310fc462ae667cc8f33cbdc5f45cf0`.
- Executável com versão e correção de cache verificadas no arquivo empacotado;
  375 arquivos de painel idênticos às fontes e DLLs GDI presentes.
- Auditoria do executável, migrador e MSI sem arquivos privados.

A publicação usa um único MSI e aliases históricos Oficial/Teste com bytes
idênticos. Os três manifestos devem apontar para 1.3.17 sem `estacoes`, somente
depois de conferir os dois downloads públicos completos. Recibos ficam em
`dist/publicacao-unica-1.3.17-*` no worktree de release.

Não houve instalação ou reinício remoto de estações. Disponibilidade do MSI
não comprova adoção; geração real e impressão física continuam dependendo de
validação na estação após atualizar e reabrir o pedido.

PR da correção na branch principal:
https://github.com/ingressoideal1-gif/imposicao/pull/166
