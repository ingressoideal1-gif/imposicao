# Instalador independente do NewProd Piloto

Solicitacao: instalar Piloto na LASER-01 por MSI, mantendo o original.
Fonte isolada de main 54101451; checkout operacional e entrega de gestao preservados.

## Pacote

`NewProdPiloto_Setup_v1.2.363.29.msi`, produto e UpgradeCode independentes
do NewProd Agent. O MSI contem somente executavel Piloto, inicializador,
manifesto e instrucoes. O executavel e o .29 previamente auditado, SHA-256
`8c17bacae50bff20ce8fcf105e3a56bc979d4c9ed5129948dfc033ca87d39b64`.
Nenhum painel/Python do agente foi recompilado ou substituido nesta entrega.

O inicializador `piloto_instalacao.py` prepara sob a conta Windows da estacao:

- confere hash, caminho, canal, conta original configurada, espaco e colisoes;
- recusa links/junctions e Piloto manual/mais novo ja ativo;
- copia somente quatro configuracoes e dados QR/credencial protegida existentes
  na propria estacao, conferindo hashes; nunca copia `agent_config.json`;
- cifra ajustes em DPAPI, ensaia recuperacao e grava manifesto por ultimo;
- inicia em 9001, com nome real da estacao, token DPAPI proprio e coleta pausada;
- preserva processos, arquivos, registro de inicio e spool do NewProd original.

O MSI cria atalhos "NewProd Piloto" e seu inicio automatico, mas nao encerra o
original nem troca silenciosamente atalhos preexistentes. A desinstalacao remove
apenas o pacote MSI, seus atalhos e seu inicio automatico; runtime/configuracoes
e historico permanecem para recuperacao. Para voltar a usar o original, fechar
o Piloto pela bandeja e abrir o atalho original. Nao manipular a fila de impressao.

## Habilitacao por estacao

A Edge Function `piloto-local` conserva a configuracao legada do Junior.
Outras estacoes precisam de cadastro unico e ativo em `imposition_acessos_locais`,
com `piloto_instalacao_autorizada=true`, nome exato, empresa e responsavel vinculado.
As permissoes do responsavel sao reconsultadas em toda operacao. Autenticacao
do agente ocorre antes da consulta; ambiguidades, revogacao e falha de consulta
bloqueiam a operacao. Nao ha impressao, escrita de pedido ou codigo no MSI.
Este controle usa a identidade declarada pelo agente autenticado; nao e um
certificado individual de hardware.

Alvo da habilitacao: producao vwbtitjlpelrcnsytzqw, um registro da LASER-01.
As permissoes seguem a grade restrita existente (consulta de producao/impressao
para conferencia, sem edicao, geracao ou administracao), mantendo o responsavel
do Piloto. Inclusao individual e atomica; rollback por desativacao do ID criado,
com filtro adicional `permissoes->>piloto_estacao=eq.LASER-01`. Nao apagar cadastro.

## Validacao

- Dez testes do instalador: preservacao, reexecucao, conta incorreta, colisao,
  caminho alterado, hash divergente, credencial ausente, token DPAPI, junction
  e recuperacao de configuracao sintetica.
- 27 testes de rotas/catalogo/revisao/vinculo do Piloto, com servicos simulados.
- Extracao administrativa do MSI retornou zero; quatro arquivos conferidos.
  Inicializador compilado executou a preparacao e repeticao em pasta sintetica,
  sem iniciar NewProd ou tocar configuracoes reais. Backup DPAPI decifrado e
  original sintetico inalterado. ProductVersion e UpgradeCode conferidos.
- Regressao comum dos dois canais e checks remotos devem passar antes da entrega.

MSI gerado: 153489408 bytes; SHA-256
`a51e10da97e2e5dd4b0b4a26aa2938b3e5a4f21a074cca145c0f93262ccf0051`.
Instalacao efetiva na LASER-01 e impressao fisica dependem da execucao na estacao.
O MSI do Piloto nao substitui nem ativa `agent-releases/latest.json` da producao.
