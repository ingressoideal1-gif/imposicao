# Hot Folder — envio do PDF para uma pasta em vez da impressora

Data: 2026-08-11
Contexto: Epson SureColor F9470H com RIP Epson Edge Print.

## Problema

Nem toda impressora da gráfica recebe trabalho pela fila do Windows. A F9470H é
conduzida pelo Epson Edge Print, que observa uma pasta ("hot folder"), importa o
PDF que aparece ali e aplica a esse trabalho o preset associado àquela pasta.
Hoje o painel só sabe falar com o spooler: o operador precisa exportar o PDF à
mão e arrastá-lo para a pasta, o que desfaz o ganho de tempo que justifica o
agente local existir.

## O que será construído

Uma caixa **HOT FOLDER** no painel "Configuração de Impressão". Quando marcada,
o material imposto é gravado numa pasta escolhida na própria estação, e não
enviado à impressora. A escolha fica gravada por produto, na estação, junto do
resto da configuração de impressão.

## Decisões

### A pasta é propriedade da estação, não do banco compartilhado

O caminho da pasta vai para `print_configs.json`, ao lado de `printer_name`,
`tray` e `paper_size`, pela mesma razão registrada em `db.py`: é uma propriedade
física da máquina. Duas estações podem imprimir o mesmo produto de formas
diferentes — uma pelo spooler, outra pelo hot folder — e isso passa a funcionar
sem nenhum trabalho extra.

Dois campos novos no objeto que já é gravado:

```json
{
  "produto_id": "42",
  "printer_name": "Epson SureColor F9470H",
  "hot_folder": true,
  "hot_folder_path": "\\\\RIP-EPSON\\EdgePrint\\Ingresso_Sublimacao"
}
```

Nenhuma migração de banco, nem no Supabase nem em disco: `upsert_print_config`
já preserva todos os campos que recebe.

### Quem abre o seletor de pasta é o agente

O navegador não enxerga o disco da estação. O agente ganha um endpoint que abre
um diálogo nativo de pasta e devolve o caminho escolhido.

O diálogo é o `SHBrowseForFolderW` do `shell32`, chamado por `ctypes`. A
alternativa natural seria o `filedialog` do tkinter, mas **o tkinter está
excluído do executável** (`excludes` em `agent_tray.spec`), e reintroduzi-lo
engordaria o instalador sem necessidade. O `ctypes` não acrescenta dependência
alguma. As flags usadas são `BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE |
BIF_EDITBOX`, que dão a árvore redimensionável moderna e uma caixa de texto onde
um caminho UNC pode ser colado.

Se o diálogo não abrir — agente parado, ou painel servido pela Vercel sem
alcançar o `127.0.0.1` — a interface cai para um campo de texto onde o caminho é
digitado, e o agente o valida antes de aceitar.

### Somente pastas registradas recebem arquivo

O endpoint que grava um PDF num caminho arbitrário da estação é uma primitiva de
escrita, e o agente aceita requisições de origem externa por CORS. Sem trava,
qualquer página aberta no navegador do operador poderia gravar arquivos no disco.

As travas:

1. o arquivo só é gravado em pastas previamente registradas pelo seletor nativo
   ou validadas explicitamente pelo operador — a lista vive em
   `hot_folders.json`, ao lado do `print_configs.json`;
2. o nome é sempre reduzido ao seu último componente, sanitizado (sem `..`, sem
   separador de caminho, sem caractere proibido pelo Windows) e forçado a `.pdf`;
3. há teto de tamanho por arquivo.

### A gravação é atômica

O arquivo é escrito como `<nome>.pdf.tmp` **dentro da própria pasta de destino** e
só então renomeado para `<nome>.pdf` com `os.replace`. Escrever num temporário do
sistema e copiar depois não serve: o rename só é atômico dentro do mesmo volume.

Sem isso o Edge Print importa um PDF pela metade. Esse é o modo de falha clássico
de hot folder, e ele não aparece como erro claro — aparece como arte cortada ou
trabalho abortado no RIP, horas depois, sem ninguém saber por quê.

Um watcher pode enxergar o `.tmp`; por isso a extensão dupla, que nenhum RIP
associa a PDF, e por isso o `.tmp` é apagado se a gravação falhar no meio.

### Nunca sobrescreve

Se `00001_Ingresso.pdf` já existe na pasta, o arquivo novo vira
`00001_Ingresso (2).pdf`. Sobrescrever poderia acontecer exatamente enquanto o
RIP lê o arquivo anterior, e apagaria em silêncio um trabalho que ainda não foi
impresso.

### A ordem continua sendo o prefixo do nome

`nomeParaSpool()` já gera `00001_`, `00002_`… e isso passa a servir a dois donos:
o título do job no spooler e a ordem alfabética que o watcher do Edge Print
respeita ao importar. Os arquivos são largados um a um, cada um esperando o seu
rename, nunca em paralelo.

### As opções do driver ficam desabilitadas

Hot folder não carrega DEVMODE. Bandeja, papel, frente/verso, cor e cópias são do
preset da pasta no Edge Print — e, numa impressora de rolo para sublimação,
metade desses conceitos não existe. Com a caixa marcada, o seletor de impressora e
o bloco inteiro de opções do driver ficam esmaecidos e desabilitados, com um aviso
explicando de onde vêm os ajustes.

Isso não é enfeite: sem o aviso, o operador marca "Duplex" no painel, recebe
simplex no papel e conclui que o sistema está errado.

**Impressão reversa e Folha a Folha continuam ativas.** Elas são aplicadas ao PDF
no navegador, com PDFLib, antes do envio (`processPrintQueueOptions`), então valem
igual para hot folder.

### O caminho da nuvem viaja dentro do `ppd_options`

O envio pelo relay (painel na Vercel) grava o PDF no Storage e insere uma linha em
`print_queue`. O caminho da pasta vai dentro de `ppd_options`, que já é uma coluna
JSON — nenhuma coluna nova no Supabase. O `process_queue` do agente verifica
`ppd_options.hot_folder_path`: havendo caminho, larga o arquivo na pasta em vez de
spoolar. A lista branca vale também aqui: pasta não registrada nesta estação faz o
trabalho terminar como `error` com a razão no log.

### Confirmação de consumo

O Edge Print importa o arquivo e o remove da pasta. Se, alguns segundos depois do
envio, os arquivos continuarem lá, o watcher provavelmente não está rodando — e
hoje, depois de largar o PDF, o sistema fica completamente cego quanto ao que
acontece do outro lado.

Passados ~12 segundos do último arquivo, o painel pergunta ao agente quais
caminhos ainda existem e, havendo algum, mostra um aviso. É **aviso, nunca erro**:
há RIP que deixa o arquivo no lugar, e o operador é quem decide se aquilo é
problema. Vale apenas no modo local; pelo relay, o agente apenas registra no log.

## Componentes

| Arquivo | Papel |
| --- | --- |
| `hotfolder.py` (novo) | Toda a lógica de estação: validar pasta, sanitizar nome, resolver colisão, gravar atomicamente, abrir o seletor nativo, conferir consumo. Não conhece HTTP. |
| `db.py` | `hot_folders.json` — registrar, listar e consultar a lista branca de pastas. |
| `app.py` | Quatro endpoints finos sobre o `hotfolder.py`. |
| `agent_worker.py` | `process_queue` desvia para o hot folder quando `ppd_options.hot_folder_path` existe. |
| `frontend/index.html` | A caixa HOT FOLDER, o campo de pasta, o botão de escolha e o aviso. |
| `frontend/script.js` | Estado da caixa, envio, memória por produto, conferência de consumo. |

`local_print_agent.py` **não** é alterado: ele só roda em desenvolvimento; o
executável distribuído serve o `app.py` (ver `agent_tray.run_server`).

## Endpoints

| Método | Rota | Faz |
| --- | --- | --- |
| POST | `/api/hotfolder/escolher` | Abre o seletor nativo na estação, registra e devolve o caminho. Um de cada vez. |
| POST | `/api/hotfolder/validar` | Valida e registra um caminho digitado (existe, é pasta, é gravável). |
| POST | `/api/hotfolder/drop` | Recebe o PDF e o nome, grava atomicamente na pasta registrada. |
| POST | `/api/hotfolder/conferir` | Recebe caminhos e devolve quais ainda existem. |

## Fluxo de erro

- **Pasta sumiu / share caiu** — o envio para naquele arquivo, com toast dizendo o
  caminho e o motivo do sistema operacional. Os anteriores já largados permanecem;
  não há rollback, e não deve haver: PDF já importado pelo RIP não volta.
- **Pasta não registrada** — recusa com mensagem pedindo para escolher a pasta de
  novo pelo botão.
- **Sem espaço em disco** — o `.tmp` falha, é removido, e o erro sobe como os
  demais.
- **Diálogo já aberto** — o segundo pedido recebe recusa imediata em vez de
  enfileirar um diálogo invisível atrás da janela.
- **Agente inalcançável** — o botão de escolher pasta explica e libera o campo de
  texto.

## Aviso sobre unidade mapeada

Caminho começando com letra de unidade (`Z:\...`) recebe aviso recomendando a
forma UNC (`\\servidor\pasta`). Letra mapeada pertence à sessão do usuário; se o
agente um dia rodar como serviço ou sob outra conta, ela não existe, e o envio
quebra em silêncio.

## Testes

`tests/test_hotfolder.py`, executável direto por `python tests/test_hotfolder.py`,
no mesmo estilo dos demais scripts de `tests/`. Cobre a lógica pura, sem HTTP e
sem diálogo:

- sanitização rejeita `..`, separador de caminho e caractere proibido;
- extensão é forçada a `.pdf`;
- colisão gera `(2)`, `(3)` e nunca sobrescreve;
- gravação é atômica — nenhum `.tmp` sobra ao final;
- falha no meio da gravação não deixa `.tmp` nem arquivo final;
- pasta fora da lista branca é recusada;
- pasta inexistente e arquivo no lugar de pasta são recusados;
- validação detecta pasta sem permissão de escrita;
- conferência de consumo devolve exatamente os caminhos que ainda existem.

## Fora do escopo

Decididos fora nesta versão, registrados para não se perderem:

- **Várias pastas nomeadas por produto** (uma por preset do Edge Print). Uma pasta
  por produto por estação resolve o caso de hoje.
- **Cópia de segurança em `_enviados/`** para reimpressão sem refazer a imposição.
- **Intervalo configurável entre arquivos**, para RIP que se atrapalha com muitos
  de uma vez.
- **Job ticket XML/JDF** — descartado: o Epson Edge Print não aceita job ticket de
  terceiros. As opções vêm do preset da pasta, e é assim que fica.
