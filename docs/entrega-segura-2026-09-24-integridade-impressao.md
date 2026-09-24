# Entrega segura — integridade da impressão

## Candidato preparado

- Worktree: `C:\ProjetosLocais\ideal-imposition-analise-22599`.
- Branch: `fix/integridade-impressao-22599-entrega`, baseada em `origin/main` `4b3e391c`, reconfirmado por fetch nesta entrega.
- Painel v958; NewProd 1.2.339 (MSI ProductVersion 1.2.339.0).
- Escopo: implementação descrita em [execução](execucao-2026-09-24-integridade-impressao.md), referências de cache e empacotamento explícito de `integridade_impressao`.
- Checkout principal preservado com os mesmos três arquivos não rastreados.

## Validação repetida para entrega

- Python: 200 testes e 23 subtestes passaram (12,87 s).
- Navegador: 24 verificações de integridade, carregamento real das funções de Pedido, 49 verificações de entrega imediata, fluxo combinado e cinco regressões de navegação passaram.
- `git diff --check` e verificação de segredos pelo módulo de publicação: sem achados impeditivos.
- Manifesto público anterior confirmado em 1.2.338; ainda não alterado.

## Sequência de liberação

Esta entrega combina frontend e NewProd. O orquestrador `entrega-segura.ps1` não distribui o agente nem aceita esse escopo misto. Usar o procedimento específico do NewProd, com revisão de escopo, testes, empacotamento e verificações públicas; não alterar nem desabilitar os controles do orquestrador.

1. Empacotar com os recursos existentes após autorização para seus efeitos: configuração secreta e pool QR. Não copiar `.env.local` nem versionar dados secretos.
2. Conferir versão, módulos, assets e DLLs do executável/MSI.
3. Integrar a fonte por fast-forward sem modificar o checkout principal; confirmar deploy Cloudflare e hashes normalizados nos dois domínios.
4. Enviar MSI com nome novo e conferir tamanho/SHA-256 por download público antes de ativar `latest.json`.
5. Confirmar manifesto público e registrar separadamente heartbeat da LASER-01 e aceitação física.

## Compatibilidade e recuperação

O painel novo bloqueia agentes sem `integridade_impressao_v1`; o agente novo exige manifesto e bloqueia painéis antigos. Atualizar o agente e reabrir o painel antes de retomar. Durante a transição pode haver bloqueio de geração; não oferecer caminho permissivo.

Falha após envio parcial exige conferência da fila/papel e retomada explícita com a faixa correta. Não há garantia de impressão física exatamente uma vez.

Se necessário, corrigir sob versão superior do agente. Downgrade no manifesto não atualiza estações. Não reativar geração sem confirmação dos dados como forma de recuperação.

## Estado

Build autorizado pelo pedido de publicação e concluído com PyInstaller 6.20.0 e WiX existentes, sem instalar dependências. Configuração secreta usada somente no processo de build; `.env.local` não foi copiado. O módulo gerado `acesso_segredo.py` permanece ignorado no worktree.

- MSI: `dist/NewProd_Setup_v1.2.339.msi`, ProductVersion `1.2.339.0`, 156.176.384 bytes.
- SHA-256: `0ebc0b7e0fc9f87ff125d01e755f68bcb03c21a76fa068311c3f9f178403d775`.
- Arquivo PyInstaller conferido: `integridade_impressao`, `engine`, `app`, `agent_worker`, `agent_version` e módulo do segredo presentes; versão 1.2.339.
- Bytes de index, helper de arte, Pedido, script e Montagem embutidos iguais aos arquivos locais. `win32ui.pyd`, MFC e ambas VCRUNTIME presentes na pasta do runtime.
- LASER-01 consultada em 24/09 às 20h00 BRT: último heartbeat às 18h14, agente 1.2.338 e painel 957. Não confirma conexão atual nem atualização.

## Publicação confirmada — 24/09/2026, 20h03 BRT

- Commit `c1179649bcfa30beb39c2865e21d375452dad4c8` integrado em `origin/main` por fast-forward. Tags `v958` e `agente-v1.2.339` publicadas nesse commit.
- Cloudflare Pages: conclusão `success`, deployment `2c7f8dcc-2046-46fb-880d-b563166efaaf`.
- Oito arquivos em cada domínio (`imposicao.pages.dev` e `imposition.ai-ideal.com.br`): 16/16 hashes normalizados coincidiram com a fonte após propagação. A primeira conferência, enquanto o deploy ainda corria, detectou a versão anterior; a nova conferência confirmou o conteúdo atualizado.
- MSI enviado com nome novo. Download público simples retornou 156.176.384 bytes e SHA-256 `0ebc0b7e0fc9f87ff125d01e755f68bcb03c21a76fa068311c3f9f178403d775`, iguais ao arquivo local.
- Somente após essa prova, `latest.json` foi ativado e relido com cache buster: versão 1.2.339, URL, tamanho e hash conferem.
- Evidências: [web](evidencias/integridade-v958-web-publico.json), [MSI](evidencias/integridade-v958-msi-publico.json), [manifesto](evidencias/integridade-v958-manifesto.json).

## Pendências operacionais e retomada

LASER-01 relida às 20h03 BRT: permanece o heartbeat das 18h14 com agente 1.2.338 e painel 957. Não foi confirmada instalação da versão nova; nenhum trabalho foi enviado à impressora nesta entrega.

Na estação, usar **Atualizar agora** no NewProd, confirmar 1.2.339, reabrir o painel v958 e verificar a capacidade `integridade_impressao_v1`. Depois gerar uma prova do pedido 22599 e conferir arte/numeração por face no PDF e no papel antes da tiragem. Falha de preparação deve bloquear sem enviar; falha após envio parcial exige retomada explícita. Este piloto permanece pendente.

Fonte, painel público, MSI e manifesto estão publicados e verificados. Instalação, capacidade realmente em execução e aceitação física são verificações separadas ainda não concluídas.
