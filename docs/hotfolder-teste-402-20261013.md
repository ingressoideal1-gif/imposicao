# Hot Folder no NewProd Teste 1.2.402

O painel de teste 1.2.401 removia `hot_folder_path` ao capturar o trabalho,
mesmo com uma pasta selecionada. Os modos GDI e PDF RAW seguiam para a fila
da impressora. A pasta continuava cadastrada e visivel.

A correcao conserva a pasta no snapshot do trabalho e lhe da prioridade
sobre o modo de driver anterior, inclusive quando nenhuma impressora esta
selecionada. Os controles de impressora ficam desativados enquanto houver
pasta selecionada. Ao retirar a selecao da pasta, os tres modos de driver
voltam a ficar disponiveis. Uma falha no Hot Folder interrompe o trabalho
sem usar a impressora como alternativa.

O snapshot continua identificado como teste: nenhum dos quatro caminhos de
conclusao marca o pedido como impresso. O PDF conserva as transformacoes
comuns de paginas. Geracao do motor, API de Hot Folder, cadastro de pastas,
regras de numeracao e versao normal nao foram alterados.

## Preparacao e validacao

- Runtime `1.2.402-teste.1`; MSI `NewProdPiloto_Teste_v1.2.402.msi`.
- Cache atualizado para `script.js?v=1052-hotfolder1` e
  `impressao-teste-modelo.js?v=4` somente no painel do teste.
- Harness do teste: pasta nos quatro estados do seletor, captura imutavel,
  erro sem desvio para impressora, tres modos de driver e bloqueio comercial.
- Ladrilhos de Hot Folder: 48 verificacoes; logica de arquivos: 47 testes.
- Auditoria do EXE/MSI/preservador: sem arquivos privados; identidade de teste
  e ProductVersion conferidos; 375 arquivos do painel identicos a fonte.
- Evidencia do pacote: `evidencias/hotfolder-402-teste-auditoria.json`.

O instalador anterior 1.2.401 foi preservado. Seus executaveis de compilacao
foram arquivados em `dist/compatibilidade/base-401-binarios` antes do rebuild.
Recuperacao de codigo exige novo numero superior, pois o atualizador nao faz
downgrade. Nao restaurar configuracoes ou filas para reverter apenas codigo.

Esta entrega nao executa instalacao, reinicio nem impressao fisica. A versao
em uso e a recepcao pelo RIP devem ser verificadas separadamente na estacao.
