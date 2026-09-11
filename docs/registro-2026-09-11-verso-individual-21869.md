# Pedido 21869 — arte do verso na impressão individual

## Diagnóstico e escopo autorizado

O usuário confirmou que a falha acontece imprimindo um modelo por vez e
autorizou executar a correção. A análise anterior consultou somente os modelos
do pedido e suas numerações e baixou as artes para inspeção em memória.

Os cinco modelos duplex (1000930 a 1000934) têm PDFs separados de frente e
verso, com uma página de 210 x 59 mm cada, acessíveis por HTTP 200 e com conteúdo.
A numeração vinculada está em `print_mode = duplex`, com elementos no verso.
O modelo 1000935 é somente frente e não faz parte da falha de verso.

Na impressão individual, `pedido.js` e `script.js` enviavam `file_verso` apenas
em `duplex_unico`. O motor também só anexava esse arquivo nesse modo. Em
`duplex`, procurava a segunda página no arquivo da frente; como havia apenas
uma, desenhava a numeração do verso sem a arte. Não era ausência do arquivo
no cadastro. A versão pública não foi confirmada na análise (HTTP 403), nem
foi inspecionado o executável instalado na estação.

## Implementação local

Worktree: `C:/Users/Junior/Projetos Ingresso ideal/imposicao-verso-individual-21869`.
Branch: `fix/verso-individual-21869`.
Base: `origin/main`, commit `8e78d846623a1b88d4c187b3b04d678317e4319d`.
O checkout original e suas alterações preexistentes foram preservados.

- `frontend/pedido.js` e `frontend/script.js`: enviam o arquivo separado do
  verso nos dois modos duplex, usando o campo de upload já existente.
- `engine.py`: no FxVerso individual, anexa a primeira página do verso quando
  a frente tem uma página. Mantém o verso embutido em arquivos com duas ou mais
  páginas e o comportamento do FxVersoUnico. A arte continua vetorial. Se o
  arquivo separado recebido no novo caminho não puder ser aberto, interrompe
  a geração com erro em vez de entregar um PDF incompleto. A ausência de
  arquivo continua permitida para trabalhos legitimamente sem arte.
- `app.py`: apenas o comentário do campo de upload foi atualizado; o endpoint
  já recebia o arquivo e o encaminhava ao motor.
- `tests/test_verso_individual.py`: regressão do PDF final e do envio de upload.
- `tests/test_fxversounico_painel.py`: atualiza a expectativa do seletor de modo.

Não foram alterados cadastros, quantidades, numeração, regras de combinação de
modelos, dependências ou arquivos de credenciais.

## Validação

Antes da correção, os novos testes tiveram 6 falhas e 4 aprovações. Os PDFs
sequencial e por blocos continham apenas `NV1/NV2` (ou a ordem de empilhamento)
no verso, sem `ARTE-VERSO`. Os dois blocos de upload não enviavam o verso no
modo duplex. Isso reproduziu a falha antes de alterar o código funcional.

Após a correção: **141 testes aprovados**, em execução serial, com:

```powershell
& '..\ideal-imposition\venv\Scripts\python.exe' -m pytest -n 0 tests/test_verso_individual.py tests/test_pdf_duplex_unico.py tests/test_fxversounico_painel.py tests/test_engine_recorte_celula.py tests/test_engine_refazer_strict_assembly.py tests/test_gabarito_frente_e_verso.py tests/test_o_javascript_do_frontend_compila.py -q
```

A regressão confere presença de texto e vetores da arte no PDF final, números
de 1 a 4 sem perdas ou duplicações, separação das faces, montagem por blocos,
arquivo inválido, frente simples, falta de verso e verso já embutido. Executa
os blocos reais de upload dos dois JavaScripts com arquivos simulados.
O teste existente de FxVersoUnico confere frente paginada e verso repetido.
Os testes são locais, com artes sintéticas; não acionam a impressora.
`git diff --check` sem erros.

## Entrega local e pendências

Correção local concluída, sem commit, push, PR, build, release ou publicação.
Para chegar à operação, será necessário publicar o frontend e distribuir uma
versão do NewProd que contenha o motor corrigido (incluindo o painel empacotado).
Publicar somente o JavaScript não corrige o motor antigo da estação.

Após a entrega autorizada: confirmar a versão instalada, gerar o PDF individual
de um dos modelos duplex e conferir as duas faces antes da tiragem. Atualização
instalada e impressão física ainda não foram comprovadas.

Recuperação local: o diff está isolado nesta branch/worktree, sem mudanças de
banco. Uma reversão futura deve reverter apenas a correção; a reversão do agente
publicado exige o procedimento de release com versão superior, sem presumir
downgrade automático. Não descartar o checkout original.

## Publicação autorizada

Após a entrega local, o usuário autorizou publicar. Preparados NewProd
**1.2.328** (MSI `1.2.328.0`) e referências dos scripts alterados em **v852**
nos quatro HTMLs que os carregam. O manifesto público anterior está em 1.2.327.
Os 141 testes passaram novamente após a atualização das versões.

O build usa diretamente PyInstaller e WiX já instalados, a partir deste
worktree. Os scripts legados de build apontam para o checkout original; não
foram executados. Apenas a credencial restrita do agente e o pool existentes
foram preparados pelo procedimento de empacotamento, sem copiar `.env` ou
chaves de serviço ao worktree/pacote. Nenhuma dependência foi instalada.

Ativar `latest.json` somente após conferir o MSI pela URL pública com tamanho
e SHA-256 idênticos ao pacote validado. Instalação na estação e conferência
física são etapas posteriores e não são comprovadas pelo deploy.
