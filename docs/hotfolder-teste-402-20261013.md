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
- Bateria `conferir_duas_versoes.py`: perfis producao, piloto e oficial,
  cada um com 939 testes Python, 2 subtestes e 19 harnesses JavaScript.
  Dois testes por perfil exigem pool QR real ausente e ficaram ignorados;
  houve um aviso preexistente de depreciacao Starlette/httpx por perfil.
  As 60 etapas terminaram com sucesso. Logs e tempos estao em
  `dist/compatibilidade/hotfolder-402-*validacao.log` e `*tempos.json`.
- Auditoria do EXE/MSI/preservador: sem arquivos privados; identidade de teste
  e ProductVersion conferidos; 375 arquivos do painel identicos a fonte.
- Evidencia do pacote: `evidencias/hotfolder-402-teste-auditoria.json`.

O instalador anterior 1.2.401 foi preservado. Seus executaveis de compilacao
foram arquivados em `dist/compatibilidade/base-401-binarios` antes do rebuild.
Recuperacao de codigo exige novo numero superior, pois o atualizador nao faz
downgrade. Nao restaurar configuracoes ou filas para reverter apenas codigo.

O agente de desenvolvimento nao executou instalacao, reinicio nem impressao
fisica nesta entrega. O aceite posterior do usuario esta registrado abaixo.

## Publicacao concluida

Fontes enviadas na branch `fix/compatibilidade-newprod-teste-20261013`,
commit `fe4b2db5`. O pacote foi publicado sob nome novo, baixado integralmente
e conferido antes da ativacao de `newprod-piloto-teste.json` em 1.2.402.
Tamanho: 196669440 bytes. SHA-256:
`fde52ff4e4abcaf1007558aae2e3ca76bca79067621b4e19ba142cff6a74162d`.

Manifesto relido com cache-buster; mantidas exatamente LASER-01 e PC-JR-HOME.
`newprod-piloto-oficial.json` e `latest.json` foram relidos e permanecem
identicos aos anteriores, em 1.2.401. Nenhuma publicacao web de producao.
Evidencia: `evidencias/hotfolder-402-teste-publicacao.json`.
Manifestos anteriores preservados em
`dist/compatibilidade/manifestos-antes-hotfolder-402.json` e no backup
criado pelo publicador. MSI anterior mantido, sem sobrescrita.

## Aceite do usuario — 13/10/2026

Apos a publicacao, o usuario confirmou: "hotfolder na teste ok".
Registrado o funcionamento do Hot Folder na versao de teste por validacao
do usuario. O problema relatado de selecionar uma pasta e enviar para a
impressora fica encerrado com esse aceite.

A confirmacao nao especificou estacao, pedido, pasta ou RIP, nem informou
saida fisica em papel. Portanto, nao comprova instalacao em todas as estacoes
liberadas ou impressao fisica. Nao houve nova alteracao de codigo, pacote,
manifesto ou configuracao para registrar este aceite.
