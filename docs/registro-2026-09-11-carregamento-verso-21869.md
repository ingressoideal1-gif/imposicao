# Pedido 21869: aguardar a arte do verso antes de gerar

## Evidência e limite do diagnóstico

Após publicar NewProd 1.2.328, o usuário informou que a arte voltou a faltar ao
adicionar capa. Confirmou a versão instalada e enviou capa e miolo do modelo
1000930. O miolo tem 100 páginas: todos os 50 versos contêm texto de numeração,
sem imagens, vetores ou XObjects. O original do verso continua disponível e
tem uma página com arte. Os arquivos fornecidos não foram alterados.

Uma montagem sintética de 250 itens, cinco poses e bloco de 50 manteve as 250
artes do verso com e sem capa quando o arquivo separado foi fornecido. Sem o
arquivo, ambos os casos produziram verso somente com numeração. Isso não
atribui a causa histórica à capa: os PDFs finais não registram o upload recebido.

Foi reproduzida outra falha no frontend: a prévia baixa o verso em segundo
plano, mas a geração podia enviar o trabalho antes de terminar esse download,
ou reaproveitar um arquivo da outra tela. A regressão executada contra a fonte
anterior confirmou o envio antecipado. O usuário autorizou seguir com a correção.

## Alteração local

- `frontend/arte-de-impressao.js`: helper que baixa o original do verso do modelo
  ativo no momento da geração. Aguarda a resposta e a leitura do conteúdo, valida
  HTTP, tamanho e assinatura PDF/imagem, com limite de 30 segundos. Mudança do
  pedido/modelo ou das URLs de arte durante a espera cancela a geração.
- `frontend/pedido.js` e `frontend/script.js`: os dois caminhos individuais
  aguardam o helper antes de adicionar `file_verso` e enviar o trabalho ao motor.
  Falhas mostram mensagem e permitem tentar novamente. O arquivo retornado fica
  restrito ao trabalho, sem ser sobrescrito por callbacks atrasados da prévia.
- Um modelo sem original de verso continua permitido; não herda o arquivo de
  outro modelo, de Cor ou de amostra de aprovação. A imposição manual sem modelo
  ativo conserva seu arquivo local. A montagem combinada conserva seu fluxo.
- Referências JavaScript nos quatro HTMLs em v853. A validação encontrou versões
  misturadas preexistentes; a atualização também invalida o cache do helper.

Não há mudança adicional de Python, API, banco ou regras de numeração. O motor
necessário para aceitar o verso separado já está na versão 1.2.328. O checkout
original permanece intacto; trabalho em `imposicao-verso-individual-21869`.

## Validação

156 testes passaram na suíte selecionada: carregamento, arte de impressão,
PDF final com e sem capa, FxVersoUnico, recorte, montagem por blocos e sintaxe JS.
O harness de carregamento cobre ambos os caminhos, download pendente, erro HTTP,
resposta vazia/HTML/assinatura inválida, timeout, nova tentativa, troca de modelo
ou URL, callback atrasado da prévia, frente simples, falta legítima de verso,
amostra de aprovação, modo manual, helper desatualizado e montagem combinada.

Testes locais com arquivos sintéticos e rede simulada; nenhuma impressora foi
acionada. A assinatura do arquivo é uma validação inicial; o motor continua
responsável por abrir o conteúdo completo. `git diff --check` sem erros.

## Estado da entrega

Correção complementar local. Não foi feito novo commit, deploy, MSI ou ativação
de manifesto nesta etapa. A instalação confirmada pelo usuário é 1.2.328;
os novos scripts v853 ainda precisam ser publicados para chegar à operação.
Após publicar, conferir o PDF do modelo 1000930 com capa antes da tiragem.
Recuperação: reverter somente este complemento e invalidar novamente o cache;
nenhuma migração de dados é necessária.

## Publicação autorizada

O usuário autorizou publicar este complemento. Release preparado: NewProd
**1.2.329**, MSI **1.2.329.0** e frontend **v853**. A versão pública anterior
foi conferida em 1.2.328. Branch `fix/aguardar-verso-21869`, baseada no merge
`7dd93125573391bf766d17e21543158e263749f1` da correção anterior.

O instalador leva o painel atualizado; o motor permanece com a correção da
1.2.328. Build direto no worktree com PyInstaller/WiX existentes, sem rodar
scripts que apontam para o checkout original e sem instalar dependências.
Ativação de manifesto condicionada à conferência do MSI pela URL pública.
Provas deste release ficam em `dist/release329/`, separadas das anteriores.
