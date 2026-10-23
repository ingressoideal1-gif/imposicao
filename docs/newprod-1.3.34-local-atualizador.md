# NewProd 1.3.34 — instalacao local em 23/10/2026

Instalado na PC-JR-HOME, substituindo o executavel 1.3.32. O MSI terminou
com retorno 0 e o novo coordenador confirmou `validado`, versao alvo 1.3.34,
apos recibo novo de partida com painel validado. A coleta foi retomada ao
estado anterior: sem pausa, sem preparacao ativa e sem itens pendentes.

## Fonte preservada

Worktree `imposition-newprod-1334-local`, branch
`local/newprod-1.3.34-atualizador`, baseada na tag publicada `agente-v1.3.33`
(commit `0f560939`). Aplicado somente o diff revisado do atualizador e seus
testes, mais a versao MSI/Python/nome do pacote.

A preparacao anterior partiu de `origin/main`, cuja versao base do agente
era 1.2.401. Essa base nao foi instalada: divergia das correcoes ja publicadas
do agente. O transporte para 1.3.33 preservou as fontes do motor, painel e
demais funcionalidades dessa entrega. Checkouts anteriores permanecem intactos.

## Validacao e pacote

- Baterias completas de producao, Piloto e oficial: 1.178 testes aprovados,
  2 ignorados e 2 subtestes aprovados por canal; todos os harnesses aprovados.
- 54 testes focados adicionais aprovados em cada canal.
- Aviso de depreciacao Starlette/httpx nas baterias; nenhuma dependencia alterada.
- PyInstaller, preservador MSI e auditoria do pacote aprovados.
- Bytecode conferido: versao 1.3.34 e novo atualizador incluidos.
- MSI: `dist/NewProdPiloto_Oficial_v1.3.34.msi`, ProductVersion 1.3.34,
  196.792.320 bytes.
- SHA-256 MSI: `65c9f6c776b41e343408a0990323f8c95a9d18756338a1eeb313060af51c649d`.
- SHA-256 executavel compilado e instalado:
  `8d90f347cccde77bfccaaceae5905951b2a7060cd27381d613eb19373489e184`.

Logs de testes: `%TEMP%/newprod-1334-validacao-48h1le7k/`.
Logs de compilacao e evidencias locais: `dist/local-1334/`.

## Backup e preservacao

Antes do MSI, coleta pausada e estado confirmado sem atividade. Agente
encerrado para snapshot consistente, sem comandos de alteracao do spool.

Backup cifrado com o mecanismo AES existente e chave de recuperacao existente:
`C:/ProjectBackups/IdealImpositionProtegido/newprod-1334-local-20261023-185830/snapshot.iib`.

2.425 arquivos restaurados em ensaio e conferidos por SHA-256. O ensaio fica
em `ensaio-restaurado/`, no mesmo diretorio privado. Escopo: instalacao NewProd
Agent completa, diretorios de dados protegidos, configuracoes e bases SQLite
do Piloto anterior. Caches e executaveis historicos do Piloto nao foram alterados.
O backup tem 1.939.081.002 bytes, SHA-256
`f9e21e125af92dc7c04ce01d845ec10d7abefb7d0e3053cd801272572ebccc07`.

Conferencia posterior:

- Identidade da estacao, formatos, configuracoes de impressao, hot folders,
  mapeamento ICC, perfil e token local identicos por hash.
- 389 arquivos dos diretorios protegidos identicos por hash.
- 23 acessos locais com conteudo identico. O envelope DPAPI foi renovado pelo
  sincronismo; a comparacao ocorreu em memoria, sem exibir ou gravar credenciais.
- Quatro trabalhos antigos do spool preservados, com os mesmos
  identificadores, estado, datas e contadores de paginas.

## Prova de instalacao e limites

- Windows Installer: dois retornos `MainEngineThread` iguais a 0.
- Registro de desinstalacao HKLM, visao 32 bits: NewProd 1.3.34.
- `http://127.0.0.1:9001/api/version`: NewProd 1.3.34.
- `http://127.0.0.1:9001/app/`: HTTP 200.
- `ultimo_update.json`: `validado`, sem erro, alvo 1.3.34.
- `oficial-validado.json`: versao 1.3.34 e painel validado.
- Coleta retomada; ultima consulta: pausado=false, ativo=false, ocupado=false,
  pendentes=0, 4.096 modelos catalogados.

Instalacao local assistida pelo coordenador novo, apos backup. Nao e prova
de atualizacao automatica pelo coordenador antigo nem de resolucao do erro
1722 na LASER-01. Nenhum manifesto foi alterado e nenhum pacote foi publicado.
Nao houve commit/push. Geracao real e impressao fisica nao foram executadas.

Recuperacao: preservar o backup e o log `update-1.3.34.log` da instalacao.
Nao aplicar o ensaio sobre agente ativo nem forcar downgrade MSI. O backup
inclui o executavel anterior e dados para recuperacao controlada, se necessaria.
