# Gerenciamento de cores com perfis .icm — Design

Data: 2026-08-14
Status: aprovado pelo usuário (abordagem A)

## Problema

Hoje não há gerenciamento de cores em nenhum ponto do caminho entre o PDF gerado
e o papel:

- O engine gera tudo em DeviceRGB (hex → RGB) e o PDF imposto sai **sem
  OutputIntent** — quem interpreta o arquivo chuta o que o RGB significa.
- O modo de impressão padrão (GDI raster) faz **duas conversões não
  gerenciadas** em cascata: o MuPDF rasteriza CMYK→RGB por fórmula rápida, e o
  driver Windows converte RGB→CMYK do jeito dele. É a origem da variação de cor.
- O modo PDF RAW entrega o PDF à controladora sem OutputIntent; ela aplica os
  padrões de fábrica.
- O modo Ghostscript roda sem nenhum parâmetro ICC.
- Único caminho gerenciado hoje: Hot Folder (Epson Edge Print) — o RIP aplica o
  preset. Esse caminho fica intocado.

A arte do cliente inserida via `show_pdf_page` preserva o espaço de cor original
(CMYK, spot, ICC) — isso continua assim.

## Solução (abordagem A): marcar na origem + converter na saída

A cor é tratada em dois momentos, sem tocar no código de desenho do motor:

1. **Na geração** (`engine.py`): o PDF imposto sai com **OutputIntent sRGB**
   embutido (objeto de baixo nível via PyMuPDF). Declara "este RGB é sRGB".
   Nenhuma mudança visual ou nos bytes de desenho.
2. **Na impressão** (`print_service.py`): o agente aplica o **.icm da impressora
   de destino** no último momento, do jeito certo para cada estratégia. Tudo
   local, na estação — o requisito de tempo da gráfica é preservado.

## Cadastro de perfis por impressora

Espelha o padrão que já existe para PPDs:

- Pasta `perfis_icc/` ao lado de `ppds/` com os `.icm`/`.icc` enviados por
  upload.
- `printer_icc_map.json` ao lado do `printer_ppd_map.json`. Por impressora:
  `{ "perfil": "arquivo.icm", "intento": "perceptual" | "relativo",
  "ativo": true|false }`. Intento relativo usa compensação de ponto preto.
- Endpoints novos no app/agente:
  - `GET /api/icc` — lista perfis (nome do arquivo, nome interno, classe
    RGB/CMYK).
  - `POST /api/icc/upload` — valida com Pillow `ImageCms.ImageCmsProfile`;
    perfil corrompido é rejeitado com mensagem clara.
  - `GET/POST /api/printers/icc-map` — lê/grava o mapa.
- O perfil é propriedade da **impressora**, não do trabalho: configurado uma
  vez, vale para todo pedido que vá para ela.

## Aplicação por estratégia de impressão

- **GDI raster (padrão):** após `get_pixmap`, os pixels sRGB passam por
  transformação LittleCMS (Pillow `ImageCms`) antes do driver.
  - Perfil classe RGB → conversão direta sRGB→perfil.
  - Perfil classe CMYK → transformação de prova (sRGB→CMYK→sRGB), que assa o
    gamut e o comportamento da impressora no raster entregue ao driver.
  - A transformação é criada uma vez por trabalho e reaproveitada em todas as
    folhas (~1s por folha A3 @ 300 DPI, fora do caminho da imposição).
- **Ghostscript:** acrescentar ao comando `-sOutputICCProfile=<perfil>`,
  `-sColorConversionStrategy=CMYK` (ou `RGB`, conforme a classe do perfil),
  `-dRenderIntent=<n>` e `-dBlackPointCompensation=true`. É a conversão mais
  correta: o GS converte colorimetricamente inclusive o CMYK da arte do cliente.
- **PDF RAW:** o `.icm` da impressora é embutido como **OutputIntent** no PDF
  temporário antes do spooler — Fiery, Konica e Ricoh modernas honram e
  convertem no RIP delas.
- **Hot Folder:** intocado.

## Interface

Box **"Gerenciamento de Cores"** na janela de impressão:

- Dropdown de perfil (mostra o nome interno do perfil e a classe, não só o nome
  do arquivo), dropdown de intento, chave liga/desliga.
- Upload de `.icm` na mesma box (ou junto do gerenciamento de PPDs).
- Rótulos em texto explicando cada escolha e uma linha dizendo o que acontece
  quando está desligado — a interface se explica sozinha.

## Comportamento sem perfil e erros

- Impressora sem perfil configurado (ou chave desligada) imprime **exatamente
  como hoje** — nenhuma regressão no que está aprovado.
- Perfil sumido na hora de imprimir (arquivo apagado) → aviso no retorno da
  impressão e o trabalho sai sem gerenciamento. **Nunca bloqueia a produção.**
- Distribuímos junto só o `sRGB IEC61966-2.1` (livre, ~3 KB), necessário para o
  OutputIntent da geração. Os `.icm` das impressoras vêm do usuário (fabricante
  ou calibração própria).

## Testes

- OutputIntent presente e bem-formado no PDF gerado pelo engine.
- Montagem do comando Ghostscript com e sem perfil.
- Validação de upload: perfil bom, corrompido, classe errada.
- Transformação GDI com perfil sintético.
- Caso "sem perfil = comportamento idêntico ao de hoje".

## Publicação

`engine.py`, `print_service.py`, `app.py` e o frontend são todos embutidos no
executável do agente: esta mudança exige publicar o **site e o agente na mesma
leva**, com número de versão novo do agente.
