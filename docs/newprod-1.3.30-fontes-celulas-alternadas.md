# NewProd 1.3.30 — numeros nas celulas alternadas

Base: `agente-v1.3.29` (`63b5fc93`), confirmada nos tres manifestos publicos
em 22/10/2026. Trabalho em checkout isolado, preservando a raiz operacional.

## Defeito e correcao

No pedido 24008, os modelos 1004003 e 1004004 usam a mesma montagem com seis
poses e rotacao de 180 graus nas poses 0, 2 e 4. Os textos giram 90 graus.
No lote fornecido, os comandos dos numeros pares existiam, mas a referencia
Arial existia apenas nos recursos dos XObjects das poses giradas. A folha
nao tinha `/Resources/Font`, e os numeros diretos ficavam invisiveis.

O PyMuPDF pode devolver em `insert_font` a fonte encontrada no XObject sem
vincula-la aos recursos da folha. O motor agora vincula explicitamente o xref
retornado antes de inserir o texto. Preserva outras fontes, XObjects, bytes
da fonte, posicoes, rotacoes, sequencia e regras de montagem. Falha ao criar
o vinculo interrompe a geracao em vez de permitir numeros invisiveis.

## Evidencia local

- Regressao sintetica com Arial embutida reproduziu apenas tres numeros nas
  seis poses antes da correcao. Apos a correcao, todos aparecem.
- Oito combinacoes cobrem fonte embutida/Base14, folha a 0/90 graus e
  frente/frente e verso, em duas folhas, conferindo texto e tinta renderizada.
- Testes direcionados de fonte, altura e recorte: 62 passaram.
- Geracao local com artes e configuracoes atuais dos dois modelos: 500 numeros
  por modelo (250 pares e 250 impares), sem faltas ou duplicatas, com tinta
  conferida em todos os numeros. Saidas privadas em dist/validacao-pedido24008.
- Nenhum dado remoto do pedido foi alterado, nem houve envio a impressora.

## Entrega e recuperacao

A versao unica usa o mesmo MSI nos aliases historicos. Publicar somente apos
validacao das tres identidades, auditoria do pacote e conferencias de versao,
tamanho e SHA-256. Ativar manifestos somente apos os downloads publicos
completos conferidos. As provas de compilacao/publicacao ficam em dist/.

Recuperacao: preservar a tag 1.3.29 e os manifestos anteriores; se necessario,
republicar a fonte anterior sob uma versao maior, pois o atualizador nao faz
downgrade automatico. Publicacao nao comprova adocao em estacao nem impressao
fisica. PDFs antigos precisam ser gerados novamente pelo agente corrigido.

## Validacao da release

- Producao, Piloto e Oficial: 1.161 testes passaram, dois pulados e dois
  subtestes passaram por identidade; todos os harnesses JavaScript passaram.
  Aviso preexistente de depreciacao de httpx no Starlette, sem falha.
- Publicacao: oito testes passaram. Base main: 54 testes direcionados passaram;
  correcao encaminhada pelo PR #189.
- Build PyInstaller, preservador e MSI auditados sem arquivos privados.
- Correcao confirmada no modulo engine empacotado, versao 1.3.30 e DLLs GDI.
- ProductVersion: 1.3.30; tamanho: 196780032 bytes.
- SHA-256 MSI: `05a379a62109564c7e05d84c9ed612eb8ae7ae3a3551a4c1bdc1d72f82d33f21`.
