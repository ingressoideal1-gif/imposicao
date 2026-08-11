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

### A gravação cria o arquivo — não renomeia para dentro da pasta

> **Revisado em 11/08/2026, depois de falhar em produção.** A decisão original
> era o contrário do que está escrito abaixo, e está registrada logo em seguida.
>
> **Confirmado em produção** com o agente 1.2.32: a impressão direta para o hot
> folder passou a funcionar. `direto` é o método certo para o Epson Edge Print.
> A explicação abaixo descreve o que foi observado, mas não fecha — ver a
> ressalva ao final desta seção.

O arquivo é **criado já com o nome final**, numa única escrita. Não há `.tmp` e
não há renomeação.

**A decisão original, e por que ela quebrou.** O desenho era gravar
`<nome>.pdf.tmp` dentro da pasta e renomear: a troca é atômica, então o RIP nunca
veria um PDF pela metade. Em produção, o Edge Print simplesmente **ignorava** o
arquivo. Fechar e reabrir o RIP importava o mesmo arquivo sem problema, e um PDF
gerado fora e arrastado pelo Explorer sempre funcionou.

Os três fatos juntos dizem uma coisa só. Se o arquivo estivesse truncado ou
inválido, reabrir o RIP não o salvaria — logo o conteúdo estava bom. O Edge Print
varre a pasta ao iniciar e, em regime, depende de uma notificação do Windows.
Renomear para dentro da pasta emite `FILE_ACTION_RENAMED_NEW_NAME`; criar emite
`FILE_ACTION_ADDED`. Um observador que só trate "arquivo criado" — o caso comum, e
o comportamento padrão de quem usa `FileSystemWatcher.Created` — nunca vê um
arquivo que chegou por renomeação.

A proteção contra leitura parcial estava escondendo o arquivo do próprio RIP que
ela deveria proteger.

**O que se perde e o que se ganha.** Perde-se a atomicidade. Ganha-se o único
comportamento observado como funcional nesta máquina: arrastar pelo Explorer
produz exatamente esta sequência de operações e sempre deu certo, o que mostra que
o Edge Print sabe lidar com um arquivo ainda crescendo. A escrita sai numa única
chamada, a partir de bytes já em memória, então a janela é a menor possível.

**A consequência que exige cuidado novo:** com o nome final desde o início, uma
escrita interrompida deixa um PDF truncado com nome de PDF bom, e o RIP importaria
lixo. Por isso qualquer falha no meio remove o arquivo da pasta — o que com o
rename era desnecessário.

**A ressalva, para quem voltar aqui.** A correção funciona, mas a explicação não
fecha. O operador relatou que gerar o PDF pelo botão "Impor" e salvar na pasta do
hot folder também funcionava — e esse caminho é o gerenciador de download do
Chrome, que grava `nome.pdf.crdownload` e **renomeia**. Se o RIP simplesmente
ignorasse renomeação, esse caso falharia também. Não falha.

Ou seja: "criar em vez de renomear" é o comportamento que resolve, e está
verificado em produção; "o RIP ignora renomeação" é a melhor descrição que temos
do porquê, e ela tem um contraexemplo conhecido. Se o assunto voltar, o
`diagnostico_hotfolder.ps1` compara `rename` com `chrome` e separa as duas
explicações — as hipóteses vivas são a extensão do temporário e o ritmo em que o
agente larga vários arquivos seguidos.

**Escape hatch.** `hot_folders.json` aceita `"metodo"` por pasta, e trocá-lo exige
apenas reiniciar o agente, não um release novo. Três valores:

| Método | Como o arquivo aparece |
| --- | --- |
| `direto` (padrão) | criado com o nome final, escrita única |
| `exclusivo` | idem, porém trancado (`dwShareMode=0`) enquanto escreve — quem tentar ler no meio recebe `ERROR_SHARING_VIOLATION` e repete |
| `rename` | o desenho original; só serve para RIP que trate evento de renomeação |

`ferramentas/diagnostico_hotfolder.ps1` larga o mesmo PDF na pasta por seis
caminhos diferentes e relata qual o RIP consome. É o que decide a escolha.

É PowerShell puro de propósito: quem tem acesso ao Edge Print é o operador, na
estação, e ele não tem Python nem o repositório. Um `.ps1` roda em qualquer
Windows. **O arquivo precisa de BOM UTF-8** — sem ele o PowerShell 5.1 lê na
codepage ANSI e os acentos quebram o parser, o mesmo cuidado que o
`publicar_agente.ps1` documenta.

O sexto método é `chrome`: cria `nome.pdf.crdownload` e renomeia, que é
exatamente o que o navegador faz ao baixar. Ele existe porque o operador relatou
que **gerar o PDF pelo botão "Impor" e salvar na pasta do hot folder funciona
100%** — e esse caminho é um rename, igual ao que falhava. Comparar `chrome` com
`rename` é o que separa "o RIP ignora rename" de "o RIP ignora outra coisa".

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
- nenhum `.tmp` sobra ao final, em nenhum dos três métodos;
- falha no meio da gravação não deixa `.tmp` nem arquivo final — o PDF parcial é
  removido da pasta, senão o RIP importaria lixo;
- o método padrão é `direto`, e o teste falha se alguém voltar a renomear;
- `"metodo"` escrito no `hot_folders.json` é respeitado, e um valor inválido cai
  no padrão em vez de impedir a impressão;
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
