# Impressao progressiva e blocagem padrao 10

Entrega autorizada em 27/10/2026. Fonte do agente baseada na tag publicada
agente-v1.4.2, preservando o motor e o atualizador mais recentes dessa linha.
Painel web preparado separadamente sobre origin/main, PR 213, cache v20261031.
O checkout operacional e suas alteracoes anteriores permanecem preservados.

## Comportamento

- Folha a Folha corta no motor apos a folha fisica (frente e verso juntos),
  preservando a distribuicao das celulas, capas e contracapas.
- O callback aguarda o painel confirmar o envio ao destino antes de continuar.
  Tokens aleatorios valem somente para uma entrega pendente; a rota mantem
  a autorizacao local de imposicao. Desconexao, erro ou falta de confirmacao
  interrompem a geracao. Confirmacao de envio nao comprova papel impresso.
- Impressao reversa conserva a geracao completa para preservar a ordem global.
- Blocagem: escolha salva no modelo, bloco do ERP, tipo_blocagem do produto,
  padrao 10. Ausencia nao grava o fallback no banco. Valor presente e invalido
  continua bloqueado. As restricoes de combinacao e de Teatro sao preservadas.
- O painel novo pode ser carregado em agente anterior; a entrega progressiva
  completa exige o executavel 1.4.3. Nao foi feita instalacao manual ou impressao.

## Validacao e evidencias

Testes novos verificam ordem entre desenho/envio, confirmacao por lote,
interrupcao, frente/verso, capas, refazer, paginas e blocagem no payload.
Baterias obrigatorias: ferramentas/conferir_duas_versoes.py nos canais
producao, piloto e oficial. Logs e recibos em dist/entrega, fora do Git.

O ensaio adicional faixa_modelo_ausente_harness.js da linha do agente falha
em sua verificacao antiga de arquivo salvo (linha 63, 0 != 1). A mesma falha
foi reproduzida na tag 1.4.2 intacta, em worktree separado, antes da entrega.
O harness atualizado da linha web passa. Nao foram removidas as assercoes.

Build e MSI passam pela auditoria conferir_pacote_agente.py. A publicacao
exige download publico integral e comparacao de SHA-256/tamanho antes de
ativar latest.json e newprod-piloto-oficial.json. O manifesto de teste e os
pacotes anteriores ficam preservados. Nao ha migracao SQL nesta entrega.
Rollback do agente exige novo pacote com versao maior; nao fazer downgrade.
