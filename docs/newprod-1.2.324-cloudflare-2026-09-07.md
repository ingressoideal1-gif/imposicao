# NewProd 1.2.324 — validação local Cloudflare

Data: 07/09/2026. Atualização local solicitada pelo usuário para aceitar as
origens Cloudflare já integradas no repositório.

## Origem e escopo

- Base: `origin/main` no commit `784728a4` (PRs #5 e #6 integrados).
- Worktree: `C:/Users/Junior/Projetos Ingresso ideal/newprod-cloudflare-1324`.
- Branch local: `update/newprod-cloudflare-20260907`.
- Versão elevada de 1.2.323 para 1.2.324 em `agent_version.py`,
  `agent_installer.wxs` e `compilar_msi.ps1`.
- As origens vieram do código integrado; não foi aberto CORS indiscriminadamente.
- Alterações não commitadas de propostas, e-mail e acabamento da pasta original
  não foram incluídas. O workspace original foi preservado.

## Build

Foram usados PyInstaller 6.20.0, Python 3.14.5 e WiX já instalados, sem downloads
ou instalação de dependências. A compilação ocorreu exclusivamente no worktree.
Os scripts de build existentes têm caminhos fixos para a pasta original; por
isso foram usadas diretamente as ferramentas, com a especificação revisada e
saídas novas no worktree, sem limpeza das saídas anteriores.

A credencial específica já existente do agente foi reutilizada sem exibir seu
conteúdo, e o pool existente de 24.000.000 bytes foi preservado no pacote.
Esses arquivos permanecem ignorados pelo Git. O MSI contém material restrito do
agente: não anexar ao GitHub nem divulgar como artefato público genérico.

O artefato compilado foi inspecionado para confirmar a versão, origens
Cloudflare/Vercel, presença do módulo de credencial e módulos/DLLs essenciais
de impressão. A credencial não foi extraída nem exibida na inspeção.

## Instalador e recuperação

- Pacote: `dist/NewProd_Setup_v1.2.324.msi` (74.575.872 bytes).
- SHA-256: `F581FA90D470BEACC3CCC9A766ED83D7AAA52D50D05215D9C3516DDE5D00A85F`.
- Log de instalação: `dist/instalacao-1.2.324.log`, restrito ao ambiente local.
- Executável anterior e MSI 1.2.323 preservados em `dist/recuperacao-1.2.323/`.

O MSI foi aplicado somente nesta estação, com retorno 0. Antes da interrupção
do agente foram verificadas dez impressoras cadastradas e zero trabalhos no
spooler. Os processos interrompidos foram identificados pelo caminho exato do
executável instalado. O NewProd foi iniciado novamente após a instalação.

O executável instalado em `%LOCALAPPDATA%/NewProd Agent/NewProd.exe` tem o mesmo
SHA-256 do executável recém-compilado. `/api/status` confirmou `running`,
`NewProd 1.2.324`, `onde=local`. A escuta continua em `127.0.0.1:9000`.

Os arquivos de recuperação foram guardados; a recuperação não foi executada.
O MSI usa MajorUpgrade e bloqueia downgrade simples. Para uma recuperação
emergencial, a TI deve coordenar a reversão da instalação, preservando dados da
estação; não basta rodar o MSI antigo sobre a versão nova. Para distribuição
geral de uma reversão, usar versão superior com o código anterior validado.

## Validação

- 70 testes pytest de configuração/origens/rotas e sintaxe JavaScript passaram.
- O motor do código preparado gerou uma página PDF com quatro artes sintéticas,
  com rede bloqueada no processo de teste. Arquivo em
  `dist/validacao-sintetica/imposicao.pdf`. Não houve impressão física.
- Esse teste do motor foi feito no Python de build; não equivale a executar o
  fluxo de imposição pela interface usando o executável instalado.
- Preflight local OPTIONS a `/api/impor`, solicitando POST e cabeçalhos
  `content-type,authorization`, após a instalação:

| Origem | Resultado |
|---|---|
| `https://imposition.ai-ideal.com.br` | HTTP 200; origem autorizada |
| `https://ideal-imposition.vercel.app` | HTTP 200; origem autorizada |
| `https://imposicao.pages.dev.exemplo.com` | HTTP 400; origem não autorizada |

O preflight incluiu acesso à rede privada, aceito pelas origens legítimas.
Não foi enviado arquivo à API de impressão nem usado pedido real.
O sucesso do preflight não comprova permissão de rede local no navegador.

## Pendências

- Validar login por senha/Google, renovação e logout no domínio novo com usuário
  de teste autorizado. Não fornecer credenciais por chat.
- Validar instalação/atualização PWA e vínculo de aparelho em celular de teste.
- Validar imposição pela interface e uma impressão física após definir
  impressora e papel. Pergunta enviada ao usuário; nenhuma folha foi impressa.
- Não trocar ainda as URLs canônicas de links/QR codes nem retirar a Vercel.
- Reservar/coordenar a versão 1.2.324 antes de eventual publicação geral: esta
  versão está preparada e instalada localmente, mas não foi commitada nem
  publicada no manifesto de atualização.

Nenhum push, PR, merge, deploy de site/Edge Functions ou atualização do
manifesto/Storage foi executado. As demais estações não foram atualizadas.
Ao reiniciar, o agente retoma suas rotinas normais de sincronização; não foi
executado teste de escrita em dados de produção.
