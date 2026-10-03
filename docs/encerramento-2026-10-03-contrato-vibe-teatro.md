# Entrega e retomada — contrato Vibe dos mapas de teatro

Atualizado em 03/10/2026 após autorização explícita para executar pendências e publicar. Substitui o encerramento anterior de preparação local; sua cópia foi preservada em `rascunhos/backup-teatro-jcs-20261003/encerramento-anterior-a-publicacao.md` no checkout operacional.

## Entrega comprovada

| Área | Entrega | Evidência |
|---|---|---|
| Web | v1008, commit `ee4c973b`, tag `v1008` | Cloudflare `2951e678-bc4b-4c8c-b254-0d8a7735d117`; 16 comparações com cache-buster conferem nos dois domínios, incluindo `/`, `/index.html`, `/producao.html` e cinco módulos JS |
| Função Supabase | `mapas-teatro-pdfs`, versão 2, commit `335f3313a7add9685dfafc9ab28ba343e06df66a` | `ACTIVE`, `verify_jwt=true`; deploy incluiu o JCS compartilhado e as dependências do serviço |
| NewProd | 1.2.350, ProductVersion MSI 1.2.350.0, commit `3a1ecada`, tag `agente-v1.2.350` | MSI público baixado, tamanho e SHA-256 iguais ao pacote local; `latest.json` confirmado com cache-buster |

Domínios: `https://imposition.ai-ideal.com.br` e `https://imposicao.pages.dev`. MSI: 156.327.936 bytes; SHA-256 `94580e9a8273a0bdf70991600d9512840cd04ea11a1400e9f7e42cdea88a2189`.

As entregas intermediárias v1007/1.2.349 foram substituídas por v1008/1.2.350. A conferência final encontrou o cliente Supabase procurado em `window`, enquanto o painel o declara com `let`. O teste novo reproduziu a queda indevida no endpoint local; após a correção, confirma a leitura pelo cliente lexical e a trava de capacidade do agente. A versão final do painel está dentro do MSI auditado. Não reutilizar o nome do MSI 1.2.349 nem indicar essa versão para instalação.

O primeiro comparador automático do frontend observou HTML antigo logo após o sucesso do Cloudflare. Não houve republicação para tentar resolver cache: a conferência posterior dos hashes confirmou a propagação em ambos os domínios. A primeira suíte Deno falhou pela resolução local de tipos npm; com `DENO_NO_PACKAGE_JSON=1`, todos os 296 testes passaram sem mudar dependências ou lockfiles. A primeira tentativa Edge exigiu referência local do projeto; configurada `supabase/.temp/project-ref` com `vwbtitjlpelrcnsytzqw` no checkout isolado, a publicação ocorreu. O download posterior do bundle pela CLI foi recusado pela proteção de caminhos; ela não foi contornada. A confirmação remota da função é o deploy e seu estado/versionamento, não comparação byte a byte do bundle remoto.

## Contrato implementado

- Revisão nova: `SHA-256(UTF-8(JCS(config)))`, RFC 8785 completa, hex minúsculo de 64 caracteres. Config inteira; IDs e nome externo do mapa não entram. Não usar `jsonb::text` ou `json.dumps` genérico como substituto.
- Renomear o mapa externo mantém o hash. Renomear setor dentro da config muda o hash, conservando o vínculo aprovado pelo snapshot; sinaliza a diferença sem substituir a revisão histórica.
- O carregamento completo do modelo conserva os quatro campos Vibe. O snapshot v1 observado foi implementado: `mapa`, `setor`, `cadeiras[]` com `chave`, `prefixo`, `num`, `tipo`, e `tiposAssento[]`. A revisão está na coluna do modelo, fora do snapshot.
- O snapshot tem prioridade sobre bancos legados. O motor valida IDs e relação setor/mapa, releitura do mapa atual e quantidade; gera somente lugares do snapshot, conserva etiquetas, lacunas e revisão gravada; sinaliza divergências. Não converte ou grava dados no ERP.
- A borracha do editor faz `delete cadeiras[chave]`: cadeira apagada é posição ausente. Leitores também excluem `isErased=true` e o ID literal `tipo="Apagado"`. Um tipo personalizado apenas chamado Apagado não é um marcador automático.
- `num` inteiro ou texto é aceito; `"01"` preserva o zero, `"Z"` permanece texto. A localização é por `chave`, nunca pela ordem de `cadeiras[]`; inverter a lista não muda os lugares.
- Vínculo parcial, posição/etiqueta repetida, quantidade divergente, leitura falha ou setor fora do mapa bloqueiam. A regra atual exige mapa/setor ainda existentes. Reimpressão após excluir mapa/setor precisa de alinhamento prévio com o parceiro.
- Capacidades exigidas da estação: `teatro_vertical_modelo_v1` e `teatro_snapshot_v1`. Montagem vertical da v1005 e regras de BLOCO/TICKET permanecem.

Detalhamento: [contrato Vibe v5](integracao-erp-mapas-teatro-v5.md). Resposta preparada: [texto ao parceiro](resposta-parceiro-vibe-teatro-2026-10-03.md). Provas: [evidência da entrega](evidencia-2026-10-03-vibe-teatro-v1008-newprod350.json).

## Dados e anexos conferidos

Leitura somente GET do projeto `vwbtitjlpelrcnsytzqw`: dois mapas; modelos 1001961/1001962 com bancos legados de 82/515 lugares e status PENDENTE; modelo 1001963 com snapshot v1 de Laércio Boim, 273 lugares e PENDENTE; nenhuma exportação de PDF cadastrada. Não foram encontrados aprovados com a revisão antiga nos vínculos consultados. PDFs locais externos não foram inventariados. Históricos continuam preservados, inclusive uma consulta explícita cuja revisão antiga não exista.

O hash de Master Hall recebido no chat tinha 63 caracteres. A config atual produz:

```text
a27a03ee856345a5d0eb26e67a53edf73f6c4442bcb30bd235fcbe53b7068d45
```

Faltava um `b` entre `235fc` e `e53`. Laércio Boim confere:

```text
37a8fed126ad67a38dcf5be2f2a452fea35a3a3b0b49d4f92357599828e7b78c
```

Os anexos originalmente mencionados pelo parceiro não estavam disponíveis. Foram produzidos anexos locais da config atual consultada: `rascunhos/teatro-entrega-20261003/tmp_contrato_vibe_anexos.zip`. Contém dois JSONs JCS UTF-8 exatos (33.254 e 14.368 bytes, sem BOM ou nova linha final) e manifesto. SHA-256 dos arquivos conferido independentemente via Get-FileHash. O ZIP fica local, fora do Git; não foi enviado ao parceiro. Nos dois cadastros atuais não há objetos marcados como apagados; não criar um exemplo falsamente apresentado como registro real.

## Validação e limites

122 testes Python focados passaram (13 do snapshot, 22 do teatro e 87 de sintaxe frontend); 296 Deno passaram, incluindo 20 do serviço de PDFs. Harnesses JCS, snapshot, banco e montagem vertical passaram. Editor real em index/producao e popup do pedido passaram em navegador com serviços simulados e PDFs reais. Regressões posteriores confirmam cliente lexical, capacidade do agente, ordem invertida e zero inicial. O PDF sintético preservou A/1, A/3 Cad e B/Z.

O MSI contém os módulos obrigatórios, incluindo `teatro_snapshot`, a capacidade `teatro_snapshot_v1`, o painel exato da fonte compilada e as três DLLs esperadas. Fonte do instalador e fonte publicada conferidas por hashes normalizados. Não foi executado o agente empacotado para geração real; inspeção do executável é estática.

Não houve alteração de dados de negócio, aplicação de SQL, conversão de históricos, aprovação, e-mail/mensagem ao parceiro, instalação ou impressão física. Foram publicados código web, uma função e os artefatos de release do agente. A consulta local em `127.0.0.1:8000/api/version` não respondeu; isso não identifica a versão instalada. SQL de auditoria antigo continua apenas preparado.

## Retomada segura em 04/10

1. Na estação usada para produção, executar Atualizar agora para instalar 1.2.350 e conferir `/api/version`, as duas capacidades e os assets locais. O download público não comprova instalação.
2. Conferir um modelo com snapshot numa prévia e num PDF; validar uma impressão física com o operador. Não marcar aprovado nem alterar modelo para fazer teste por conveniência.
3. Entregar ao parceiro o texto preparado e os anexos se o usuário autorizar o envio. Solicitar confirmação do hash completo de Master Hall e preservar os quatro campos no Duplicar do ERP. Aguardar alinhamento sobre reimpressão após exclusão de setor/mapa, se esse fluxo for necessário.
4. Para nova alteração, partir de `origin/main` em checkout isolado; não integrar o antigo rascunho JCS sobre arquivos atuais nem fazer pull/stash/reset/clean no checkout operacional.

Checkout operacional preservado em main/`21c4b722`, com seus arquivos preexistentes. Fontes finais de publicação: `rascunhos/teatro-publicar-web-final-20261003`, `rascunhos/teatro-publicar-edge-20261003` e `rascunhos/teatro-publicar-newprod-final-20261003`; pacote final em `rascunhos/teatro-final-20261003/dist/NewProd_Setup_v1.2.350.msi`. O antigo backup JCS permanece; a documentação anterior de preparação não representa a entrega final.

Recuperação: commits anteriores `293ccd1b`/v1005/1.2.348 são referências, não instrução para sobrescrever o estado atual. Reverter web/Edge por mudança seletiva revisada. Para agente, publicar código anterior sob versão maior: o atualizador não faz downgrade automático. Preservar snapshots e hashes históricos; não apagar MSI ou reescrever tags.
