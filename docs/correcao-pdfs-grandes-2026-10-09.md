# PDFs grandes na conferência do NewProd

## Resultado local

Correção genérica do bloqueio encontrado no pedido 23195, preparada em
`fix/pdfs-grandes-20261009`, a partir de `origin/main` (`fedead4a`). O checkout
operacional e suas alterações preexistentes foram preservados.

- Limite por arquivo unificado em 256 MiB na antecipação, download, coleta de
  dependências e leitura do cache para painel/motor.
- A captura de entrada passa a aceitar até 256 MiB de recursos; o envelope
  multipart mantém uma margem adicional de 4 MiB. O teto agregado da
  antecipação/coleta permanece em 256 MiB por conjunto, não por pedido inteiro.
- Hash SHA-256, tamanho, revisão, autorização e isolamento de empresa permanecem.
  A cópia usa blocos de 1 MiB, conserva reserva de disco e verifica espaço
  durante o download. Leitura em memória continua limitada a 256 MiB por recurso.
- Arquivos acima do teto retornam erro 413 estruturado com modelo e tamanhos,
  sem expor URLs, caminhos ou mensagens internas. A tela informa o motivo e
  diferencia falha de acesso, conferência, incompatibilidade e armazenamento.

Fontes alteradas: `pacotes_locais.py`, `antecipacao_local.py`,
`pacotes_download.py`, `coleta_recursos_local.py`, `pacotes_api.py`,
`estatisticas_piloto.py` e `frontend/selecao-piloto.js`.

## Validação

- Testes iniciais direcionados: 90 aprovados, antes dos quatro casos adicionais
  de fronteira e falta de espaço.
- Bateria obrigatória `conferir_duas_versoes.py --base origin/main`:
  **533 aprovados, 2 ignorados e 2 subtestes aprovados em cada canal**;
  os 16 harnesses JavaScript passaram em cada canal. Sem desabilitar testes.
- Regressão de transporte de 151 MiB: preparação, leitura sem rede, resolvedor
  para o motor e recusa de adulteração mantendo o tamanho original.
- Fronteira inclusiva, excesso por arquivo, excesso agregado, ausência de
  Content-Length, limpeza de parcial, falta de espaço e erro seguro na tela.
- `node --check frontend/selecao-piloto.js` e `git diff --check` aprovados.
- Aviso preexistente: FastAPI/Starlette informa depreciação do TestClient com
  httpx; nenhuma dependência foi modificada.

## PDF real do pedido

Consulta somente leitura e armazenamento temporário isolado, sem o cache das
estações e sem imprimir. Modelo 1002142: **157.955.806 bytes, 13 páginas**.
Preparação e leitura corrigidas retornaram `local_validado`; SHA-256 conferido
e reutilização executada com rede deliberadamente indisponível no ensaio.

SHA-256: `ee4ecaf7742907b79b69a77bfbc39bbf00910f8d2fb028410ee66758a2ff8724`.
O PDF não foi alterado nem mantido no repositório. Evidência local em
`dist/validacao-pdf-23195.json`; tempos em `dist/conferencia-pdfs-grandes.json`.

## Empacotamento e limite da entrega

A seleção automatizada de pacote falhou antes de compilar porque o ambiente
Python contém metadados incompletos de `pip-26.2.1.dist-info` (Name/Version
ausentes), causando TypeError na ordenação do inventário. Não houve alteração
do ambiente nem declaração de cache reutilizável. A compilação de validação
foi encaminhada diretamente ao PyInstaller com o spec existente, para pasta
nova em `dist`, sem executar scripts de publicação.

Compilação concluída: `dist/piloto-validacao/NewProdPiloto.exe`, 142.835.090 bytes,
SHA-256 `f0ac040085c97a7f3526c6bcc649d18c90e2f19264211b8292209d1af6ae021b`.
A auditoria confirmou ausência de arquivos privados e do módulo de segredo.
O bytecode dos seis módulos Python alterados corresponde às fontes corrigidas;
o JavaScript embutido também corresponde byte a byte. Esse executável serve
para validação do pacote; não é um novo MSI oficial nem deve substituir
manualmente o produto nas estações. Não foi executado ou instalado.

Tempo aproximado da preparação, verificações e compilação: 8 minutos.

Esta correção não altera banco, artes, numeração nem regras de impressão.
Publicação, MSI oficial, atualização de estação e validação operacional na
gráfica são etapas distintas da validação local acima.

## Release oficial autorizado

Publicação autorizada pelo usuário após a validação local. Versão reservada:
**1.2.375**, superior à 1.2.374 confirmada nos dois manifestos públicos.
Fonte de versão, ProductVersion do MSI e nome de saída atualizados juntos.
A distribuição deve conservar exatamente as estações liberadas no manifesto
oficial anterior e ativar os manifestos somente após conferir o download
integral do novo MSI. A instalação continua condicionada aos controles de
ociosidade, backup e preservação da própria estação.
