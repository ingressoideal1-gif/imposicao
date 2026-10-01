# Folha 1 da imposição — frente e verso

Implementação local em `feat/folha-1-frente-verso-20261001`, worktree
`C:\ProjetosLocais\ideal-imposition-folha1`, baseada em `origin/main` (`f9bea409`).
Checkout operacional e suas alterações preexistentes preservados.

## Comportamento

Na edição do modelo, em Configuração de Impressão:

- `Folha 1 - FRENTE`: gera PDF ou imprime a frente da primeira folha.
- `Folha 1 - VERSO`: gera PDF ou imprime o verso da primeira folha.
- Ambos marcados: entrega frente e verso da primeira folha.
- Ambos desmarcados: mantém a tiragem e a seleção de faces já existentes.
- Verso fica desabilitado quando o modelo não tem verso.
- Trocar de modelo, seleção ou modo limpa as opções. Redesenhar a mesma seleção mantém a escolha.
- A escolha é temporária; não é salva no modelo nem no preset do produto.
- Os controles de folha 1 e de Apenas Frente/Apenas Verso desmarcam o outro grupo quando selecionados.
- O comando Refazer pede para desmarcar Folha 1, evitando misturar faixas diferentes.

## Implementação

`frontend/index.html` contém os controles, fora das opções exclusivas do driver.
`frontend/pedido.js` captura a seleção e utiliza o filtro existente do motor:
`refazer_de=1`, `refazer_ate=1`, `refazer_set=1`, `refazer_celulas=[]`.
Isso seleciona a folha original do primeiro set, preservando quantidade,
numeração e montagem; não recalcula a tiragem como se tivesse menos itens.

O filtro de faces existente é aplicado antes de salvar/enviar, nos retornos
stream, JSON e PDF. Uma face solicita simplex ao driver. No hot folder,
frente/verso físico continua dependendo do preset do RIP já escolhido.
Os nomes recebem `_folha1` e, para uma face, `_frente` ou `_verso`.
Saída parcial não oferece marcar o modelo inteiro como impresso.
Não houve alteração em Python, API, banco ou dependências.

## Validação e limites

- Harness com cliques reais em Chrome: ambos os controles, seleção conjunta,
  troca de modelo e verso desabilitado.
- 24 cenários do fluxo real: três tipos de resposta, PDF/impressão e quatro
  seleções; destinos simulados, verificando payload, páginas, nomes e status.
- Nove cenários com o motor real: sequencial, Cut & Stack independente e
  montagem estrita, em frente, duplex e duplex único. O PDF filtrado conserva
  texto, pixels e OutputIntent/ICC da primeira folha original.
- Harnesses existentes de faces, fluxo combinado, faixa de modelo e entrega
  imediata aprovados; sintaxe de `pedido.js` e `git diff --check` aprovados.
- A execução conjunta dos 10 testes novos e das duas suítes de Refazer teve
  19 aprovações e 19 falhas. Todas as falhas são de `test_engine_refazer.py`,
  por `base_ticket.pdf` ausente. Esse teste e o motor estão inalterados em
  relação à base; a pendência não foi corrigida nesta tarefa.
- Python utilizado: venv existente em
  `C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\venv`.
  Para Node, `NODE_PATH=C:\ProjetosLocais\ideal-imposition\node_modules`.

## Entrega segura autorizada

Após o pedido de entrega segura, `git fetch origin` confirmou que a base
continua em `f9bea409`, sem divergência. A seleção de validação da entrega
(`test_folha1_pedido.py` e `test_engine_refazer_strict_assembly.py`) passou:
**15 testes aprovados**.

As falhas antigas foram reproduzidas em uma worktree intacta de `origin/main`,
`C:\ProjetosLocais\ideal-imposition-folha1-base-20261001`: a suíte
`test_engine_refazer.py` apresentou as mesmas **19 falhas por ausência de
`base_ticket.pdf` e 4 aprovações**. Nenhum teste foi desabilitado.

Publicação pelo fluxo `entrega-segura.ps1`, escopo Frontend, com simulação,
versionamento de cache e integração direta. A comprovação da publicação deve
comparar os arquivos servidos em ambos os domínios Cloudflare com os arquivos
da entrega após a propagação.

O painel local NewProd exige verificação separada após uma publicação web.
Não houve atualização do painel instalado nem teste de impressão física.
Recuperação: reverter somente o commit desta funcionalidade em nova entrega
isolada, mantendo as demais mudanças de `main`, e publicar com nova versão
de cache; sem descarte do checkout operacional ou reescrita de histórico.
