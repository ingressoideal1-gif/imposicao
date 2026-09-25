# Publicação das sessões pendentes — 25/09/2026

## Escopo preparado

Base `6990729d` (`origin/main`). Entrega isolada em
`C:\ProjetosLocais\ideal-imposition-publicacao-sessoes-20260925`, branch
`release/sessoes-pendentes-20260925`. O usuário autorizou publicar as sessões
pendentes e incluir novo instalador NewProd.

Novas alterações funcionais:

- Voltar para Arte: retorno confirmado no card, atualização da memória e
  preservação do retorno durante a sincronização automática.
- PDF paginado: validação de quantidade de páginas antes de marcar Pronto.
- Fotos: aceitação em lote somente de correspondências únicas, sem disputas.
- Lista de Arte: atualização automática também com a aba do navegador oculta.
- API local da Cor: validação e persistência das quatro margens visuais.

As correções de Formatos, composição visual das margens e fotos combinadas
já estavam integradas. A comparação de três versões preservou as correções
mais recentes, sem recuar o motor ou as versões de assets. Os únicos conflitos
foram referências antigas de cache em dois HTMLs; as referências atuais foram
preservadas antes do avanço para v965.

Documentação de sessões anteriores, provas públicas e scripts SQL de revisão
foram incorporados como registros históricos. Nenhum SQL foi executado nesta
publicação. Configuração pessoal `.claude/settings.local.json` não foi incluída.
Os worktrees originais continuam preservados, inclusive seus diffs locais.

## Validação da integração

- 90 testes Python passaram: margens, retorno para Arte, páginas do PDF,
  Corrigir Arte e sintaxe dos 76 JavaScripts próprios do frontend.
- Harnesses passaram: PDF Pronto (24), fotos (93), Corrigir Arte (83),
  persistência (37), status de arte (22), ações em lote (84), atualização
  automática, retorno dos dois botões e SDK de margens com HTTP simulado.
- Navegador: cadastro de margens (21), composição frente/verso (24),
  desempenho da Lista de Arte (21 asserções e demais verificações de lotes).
- Regras de bloqueio: 118 verificações passaram com normalização de CRLF no
  leitor do harness; o harness original depende de LF para extrair constantes.
- Dependências existentes reutilizadas: Node do checkout operacional e
  Python do venv da cópia antiga. Nenhuma dependência foi instalada.
- Revisão de diff e scanner de segredos realizados no conjunto da entrega.

## Pacote

Web publicada: **v965**. Agente distribuído: **1.2.342**.

PyInstaller e WiX concluídos. Inspeção do executável confirmou a versão,
o helper de validação da Cor, o módulo de segredo e as três DLLs de impressão.
Os seis arquivos principais do frontend empacotado correspondem às fontes.

- MSI: `NewProd_Setup_v1.2.342.msi`
- ProductVersion: `1.2.342.0`
- Tamanho: `156192768` bytes
- SHA-256: `434edb22f03697567d51c614a3563a6cb626b9193ec05ff82331d247d4081c5a`

O manifesto anterior aponta para 1.2.341. A consulta autenticada confirmou
ausência do objeto 1.2.342 antes do envio e limite de 209715200 bytes no bucket.
A ativação ocorreu após download público com tamanho e hash correspondentes.

## Publicação confirmada

- Commit funcional `c7327098387f798a4baf1f3218ef77b2d8dd2188` integrado em
  `origin/main`; tags `v965` e `agente-v1.2.342` no mesmo código.
- Cloudflare Pages concluiu com sucesso o deploy
  `75e98f80-8cca-4f06-b3d6-70cc758cd9ae`.
- **12/12 hashes normalizados conferiram**: `index.html`, `cliente.html`,
  `producao.html`, `script.js`, `foto-lib.js` e `gerenciador-fotos.js`, em
  `https://imposicao.pages.dev` e `https://imposition.ai-ideal.com.br`,
  com parâmetros anticache.
- MSI enviado com nome novo, sem sobrescrever versões anteriores. O download
  pela URL pública simples confirmou o tamanho e SHA-256 registrados acima.
- `latest.json` ativado somente depois dessa confirmação e relido publicamente
  com cache-bust: versão 1.2.342, tamanho, URL e SHA-256 corretos.
- Os 64 arquivos capturados nas sessões de origem continuam com os mesmos
  hashes do inventário; nenhum worktree original foi sobrescrito ou limpo.

Provas: `web-proof.json`, `msi-proof.json`, `latest-before.json`,
`latest-candidate.json` e `latest-verified.json` no backup abaixo. O site e
o instalador estão disponíveis; isso não equivale à instalação em cada estação.

## Recuperação e limites

Snapshots, patches, inventário com hashes, logs e manifesto anterior em
`C:\ProjectBackups\sessoes-pendentes-20260925-1790356091041`.

Para reverter o site, preparar uma nova entrega a partir do estado anterior.
Para o agente, republicar o código anterior sob versão superior: downgrade
automático não funciona. Não remover dados nem colunas de margens.

Build, testes e publicação não comprovam instalação nas estações ou impressão
física. As pendências de confirmação real do portal registradas nas sessões
antigas não são resolvidas por versionar os relatórios.
