# Complemento da consulta — NewProd 1.2.391

## Causa reproduzida no Junior
A 1.2.390 estava instalada e a correcao anterior era insuficiente:
1. O agente Teste inclui modelos nao aprovados em sem_arte. O frontend os
   excluia da lista de consultas. Agora reconhece ambos os contratos sem
   contar duas vezes o mesmo modelo.
2. Na abertura direta da tela de Imposicao, o carregador ainda exigia
   pacote imprimivel para baixar a arte da previa. Um leitor
   especifico aceita somente frente/verso do modelo conferido para consulta;
   o leitor para impressao permanece estrito. A geracao em Imposicao tambem
   recebe o motivo de bloqueio.

## Validacao e evidencia de estacao
- Harness cobre sem_arte vazia e preenchida, arte reprovada/em arte,
  aprovado sem pacote, leitura da URL correta, recusa de outra URL,
  bloqueio de geracao/lote e invalidacao por troca/alteracao.
- Revisao local do 23381 consultada em SQLite somente leitura: 21 modelos
  com consulta aceita e impressao bloqueada no ensaio de estado.
- Harness de carregamento em navegador passou.
- Usuario confirmou abertura, mas esclareceu que ANTES aprovou novamente
  os modelos na Lista de Arte. Isso NAO comprova consulta de reprovados
  na estacao; essa evidencia foi corrigida antes da publicacao.
- A primeira substituicao em painel/selecao-piloto.js nao alterou a rota
  efetiva. /api/pacotes-locais/painel.js le o frontend de _MEIPASS.
  A correcao local final foi conferida nessa rota, byte a byte, com backup
  em NewProd Agent/backups/consulta-runtime-20261013-092040.
- script.js do painel tambem ajustado com backup; nenhum agente reiniciado,
  nenhuma fila alterada, nenhum status de aprovacao/impresso modificado.

O ajuste local temporario da 1.2.390 nao substitui a instalacao da 1.2.391.
Os MSIs preliminares .391 foram preservados e NAO publicados; os pacotes
finais devem ser auditados contra pedido.js, script.js e selecao-piloto.js.
A previa de arte reprovada pode exigir internet; nao promete cache offline
para modelos ainda nao preparados. Impressao fisica nao foi testada.

## Regressao isolada em navegador

consulta_reprovados_browser_harness.js usa as funcoes reais de abertura de
Pedido e Imposicao, com transporte/PDF e catalogos sinteticos. Dois modelos
permanecem REPROVADA_CLIENTE, com CAMAROTE e SEQUENCIAL: arte carregada,
geracao bloqueada, nenhuma gravacao ou aprovacao. Passou nos dois canais.
