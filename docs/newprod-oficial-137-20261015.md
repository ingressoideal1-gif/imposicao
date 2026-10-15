# NewProd 1.3.7 — nomes dos arquivos de impressão

Atualização do único NewProd oficial, baseada na fonte publicada 1.3.6
(`6871135c`), preservando as correções de montagem, formas de envio e
confirmação de impressão existentes. Não usa a base antiga 1.2.401 da web.

Os PDFs passam a usar número do pedido e nome descritivo do modelo:
`23541_VIP_Azul_set1_01_capa.pdf`. Preserva sufixos de set, capa, miolo,
contracapa e refazer. Montagens usam o mesmo nome-base; múltiplos modelos
incluem seus pedidos e nomes, com saneamento e limite de comprimento.

## Validação

- Testes focados de nomes e fluxo de PDF/impressão simulada aprovados.
- 3.569 verificações do núcleo das montagens aprovadas.
- Bateria completa: 1.027 testes Python aprovados, dois pulados e dois
  subtestes aprovados em cada configuração de compatibilidade e no perfil
  oficial; 19 harnesses JavaScript por configuração aprovados.
- O harness amplo `montagem_tela_harness.js` apresenta falhas de fixture:
  ausência de `confirmarIntegridadeDoTrabalho` e expectativas antigas dos
  rótulos físicos. Reproduzidas na fonte 1.3.6 sem alterações, em cópia
  separada. Nenhum teste foi desabilitado; essa limitação fica registrada.
- Auditoria do MSI e dos 375 arquivos do painel: `evidencias/release-137-oficial-auditoria.json`.

## Distribuição e recuperação

O MSI oficial e o alias histórico de teste contêm os mesmos bytes. Os três
manifestos existentes devem apontar para 1.3.7, mantendo as sete estações
liberadas na consulta atual. O alias é apenas compatibilidade de atualização.
A ativação depende da conferência integral de tamanho e SHA-256 dos downloads.

Backup local cifrado e restauração conferida antes da atualização:
`C:\ProjectBackups\IdealImpositionProtegido\newprod-antes-137-20261015-125539`.
412 arquivos; fila de impressão vazia. A coleta foi pausada para a atualização.
A chave de recuperação permanece separada, no local protegido já existente.

Recuperação automática exige nova versão superior com a fonte anterior.
Publicação, instalação e impressão física são verificações distintas.
