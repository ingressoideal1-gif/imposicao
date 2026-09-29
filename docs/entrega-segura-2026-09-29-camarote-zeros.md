# Entrega segura — zeros de Camarote

Atualização: após autorização “publicar”, a entrega foi publicada e verificada
como frontend v975 e NewProd 1.2.346. Ver
[publicação e evidências](publicacao-2026-09-29-camarote-zeros.md).
As seções abaixo preservam o plano e a simulação anteriores à autorização.

## Estado

Preparação e simulação concluídas em 29/09/2026. **Frontend: VALIDADA**.
Nenhum commit, push, deploy, build MSI, upload ou ativação de manifesto executado.
Não houve leitura de credenciais, banco compartilhado ou instalação na estação.

O `git fetch origin` confirmou a base `806eb138`. O checkout operacional conserva
os mesmos cinco arquivos não rastreados, sem alterações desta tarefa.

## Pacotes revisáveis

1. Implementação completa e testes:
   `C:\ProjetosLocais\ideal-imposition-camarote-zeros`,
   branch `feat/camarote-zeros-20260929`.
2. Frontend isolado para o publicador:
   `C:\ProjetosLocais\ideal-imposition-camarote-zeros-web`,
   branch `entrega/camarote-zeros-web-20260929`.

A cópia web foi criada da mesma base atual, com aplicação verificada somente do
diff de `frontend/script.js`, `frontend/pedido.js` e `frontend/cliente.js`, mais
`tests/camarote_zeros_harness.js`. Não contém alterações do motor.
Essa separação atende ao publicador, que recusa o escopo misto Frontend/NewProd.

## Evidências

Simulação executada na cópia web, em Windows PowerShell:

```powershell
$env:NODE_PATH = 'C:\ProjetosLocais\ideal-imposition\node_modules'
.\entrega-segura.ps1 publicar -Escopo Frontend -Integracao Direta -Simular `
  -Mensagem 'Adiciona zeros aos elementos de Camarote' `
  -Teste tests/numero_da_pagina_harness.js
```

Resultado: `ESTADO: VALIDADA`, sem efeitos de publicação. O plano calculou
**v975**, com atualização de cache em `cliente.html`, `controle.html`,
`index.html` e `producao.html`. O número será recalculado se outra entrega avançar.

- Sintaxe dos três JS e do harness aprovada pelo publicador.
- 17 verificações de controles/canvas e 28 de sequência passaram na cópia web.
- A implementação completa já passou em 46 testes Python, incluindo o navegador
  e a extração do texto do PDF. Os arquivos funcionais não mudaram desde o teste.
- Escaneamento de segredos aprovado nos sete arquivos da implementação inicial.
- `git diff --check` aprovado.
- Comparação de conteúdo normalizado: 4/4 arquivos web/harness idênticos às fontes
  testadas. A comparação bruta de `script.js` diferiu somente por fins de linha.

SHA-256 normalizado (UTF-8, sem BOM, LF):

| Arquivo | SHA-256 |
| --- | --- |
| frontend/cliente.js | 97a6c66766fd55504a261a6a518cc6b4806c997a007580923200a7f983906159 |
| frontend/pedido.js | 6df46efb66ace4ebb3f7b00183dde7f94ad62c975fde52a51745b07e86cf2143 |
| frontend/script.js | 9daf8d9b24b42f33c507e6c26dbff1b9fb4ac646aff4c581c03b08fff50affc2 |
| tests/camarote_zeros_harness.js | ae688dce686059e0c79b02c697424d8fac75bd0c1eb84b5069002b3a630a8eb0 |
| engine.py | fb86d2378c38a779a5facc5780f3828f3c3c8934b1c0ac01ea3b67cd00d100dc |

## Próxima ação após autorização de publicação

A entrega funcional requer os dois componentes. O agente anterior ignora o pad
de Camarote: publicar só a interface não conclui a mudança na impressão.

1. Reconsultar `origin/main`, versões/tags e manifesto público; integrar avanços
   sem copiar arquivos antigos por inteiro. A versão do agente na base é
   `1.2.345`; `1.2.346` é candidata, ainda sem reserva ou verificação no Storage.
2. Preparar o agente com `engine.py` desta entrega e as versões sincronizadas em
   `agent_version.py`, `agent_installer.wxs` e `compilar_msi.ps1`. Incluir os testes
   e registros da implementação. Não duplicar no commit do agente o diff web
   que já tiver sido integrado.
3. Fazer o build/MSI em diretório isolado, após conferir scripts, destinos de
   limpeza, ferramentas e recursos existentes. Não instalar dependências ou
   baixar/executar ferramentas automaticamente. O build ainda não foi validado.
4. Publicar o frontend com o publicador e conferir hashes normalizados nos dois
   domínios Cloudflare, com cache-buster e espera de propagação.
5. Publicar o MSI sob nome novo; conferir tamanho e SHA-256 do download público
   antes de ativar `latest.json`. Conferir novamente o manifesto público.
6. Registrar separadamente publicação, versão/heartbeat da estação e teste de
   impressão pelo operador. Não instalar automaticamente no piloto local:
   ele requer integração própria e preflight de produção/spool.

Os recursos sensíveis são necessários somente ao build/publicação autorizados;
seus conteúdos não devem aparecer em logs, documentação ou Git.

## Recuperação e autorização

Antes de publicar, a recuperação consiste em manter a base e as cópias isoladas:
nenhuma mudança foi aplicada ao ambiente operacional. Após publicar, eventual
reversão deve ocorrer por novo commit e nova versão de cache; para NewProd,
gerar versão superior com o código anterior, sem presumir downgrade automático.

O pedido atual foi executado como preparação de entrega segura. A etapa de
publicação depende de autorização explícita conforme `AGENTS.md`, seção 5:
“Entrega e infraestrutura: commit, push, PR, merge, release, deploy, publicação”.
A seção 7 acrescenta que o build “limpa saídas e prepara/empacota segredos” e
exige autorização antes de executá-lo.
