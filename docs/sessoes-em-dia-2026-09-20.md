# Consolidação das sessões — 20/09/2026

O pedido humano autorizou commitar, publicar e alinhar todas as sessões do
repositório. Foram encontradas 25 worktrees e criada uma cópia de entrega;
as 26 foram atualizadas por fast-forward, preservando branches e histórico.
O checkout principal estava parado numa base antiga enquanto outras branches
recebiam entregas. O atraso do checkout não significava que o site publicado
estivesse igualmente atrasado.

## Entrega

- Código integrado publicado em `85912e50`, tag web `v917`.
- Dashboard da Lista de Arte e nome fantasia integrados aos rascunhos revisados
  do principal. As consultas de propostas e nomes usam a rota autenticada.
- Protótipos e registros históricos preservados. Os merges da integração
  histórica e do protótipo conservam a implementação atual, sem reaplicar código
  superado. As alterações originais também permanecem nos commits ancestrais.
- Supabase **e-deal / vwbtitjlpelrcnsytzqw**: `painel` v248,
  `acesso-estacao` v251, `acesso-conta` v267 e `acesso-interno` v253 ativos.
  JWT preservado: ligado nas três funções de usuário; a estação mantém sua
  autenticação própria. As quatro rotas recusaram requisições sem credencial
  com HTTP 401.
- Revisão `sql/link_cliente_nome_fantasia_20260920.sql` aplicada somente à
  função `public.link_cliente_pedido(text,text)`, com transação e asserção da
  definição anterior. Nenhum registro comercial, grant ou política foi alterado.
  MD5 da definição instalada: `9b7bf030cb201f33357b107ba603d200`.
  A primeira tentativa encontrou um terminador SQL ausente e não aplicou a
  transação; o arquivo foi corrigido, reaplicado e conferido.
- NewProd **1.2.336**, tag `agente-v1.2.336`: MSI com ProductVersion
  `1.2.336.0`, **156057600 bytes**. Download pela URL pública simples conferido
  antes de ativar o manifesto. SHA-256:
  `758c8b286bfd6ae8d742405f94291286bc95d67b8a12f29f332fda5121878006`.

## Verificação

- 181 testes Python distintos aprovados nas seleções de integração, sintaxe,
  portal, e-mail e propostas; 268 testes Deno aprovados; 23 cenários de
  Produção por Cor aprovados. Os testes usaram dados sintéticos e serviços
  simulados. Não foi executada a suíte global irrestrita.
- Quatro falhas antigas de harness foram corrigidas: escopo da paleta CSS,
  dependência do filtro Ignorar e duas verificações textuais da lista Impresso.
  O harness de e-mail passou a carregar a função real de nome preferencial.
- PyInstaller e WiX concluídos. Arquivo empacotado contém `propostas_api`,
  `acesso_segredo` e as três DLLs de impressão; os arquivos conferidos do
  frontend empacotado correspondem às fontes.
- **32/32** comparações SHA-256 normalizadas aprovadas: 16 arquivos alterados
  em `https://imposicao.pages.dev` e `https://imposition.ai-ideal.com.br`,
  com parâmetros anticache. O manifesto foi conferido pelo mesmo formato
  `latest.json?t=...` usado pelo agente; o CDN ainda pode servir a versão antiga
  na URL sem parâmetro durante a propagação.

## Recuperação e limites

Backup independente em
`C:\ProjectBackups\sincronizacao-sessoes-20260920-111043`: bundle Git,
snapshots das alterações com hashes, inventários, logs, provas públicas,
MSI baixado, manifesto anterior e candidato, definição SQL anterior e rollback.
O backup anterior do principal também permanece em
`C:\ProjectBackups\checkout-principal-20260920-105155`.

Os arquivos de migração históricos foram preservados; a mudança do portal
está em um arquivo novo. As propostas de fechamento de RLS não foram aplicadas.
Configuração pessoal `.claude/settings.local.json` permanece local, fora dos
commits. Nenhuma credencial de publicação foi versionada.

O alinhamento cobre as worktrees Git deste repositório, não o conteúdo ainda
não salvo nos editores. Instalação nas estações, heartbeat e impressão física
não foram comprovados; a publicação do MSI não constitui essa comprovação.
