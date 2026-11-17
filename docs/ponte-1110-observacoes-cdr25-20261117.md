# Ponte 1.10.10 — observações e CDR no Drive

Entrega autorizada em 17/11/2026.

- Observações por produto na primeira página de cada modelo; anotações de
  alteração vinculadas exclusivamente ao modelo, sem herdar a anotação do produto.
- Somente CDRs menores que 25.000.000 bytes são enviados ao Drive. Arquivos a
  partir desse tamanho ficam na estação de origem, com cópias locais preservadas.
- PDFs e amostras continuam publicados nos modelos; os PDFs continuam na fila
  persistente de backup do Drive. CDR grande não bloqueia exportação dos PDFs.
- Revisão local não oferece um CDR remoto antigo como se fosse o atual.

## Banco e serviço

SQL `ponte_cdr_local_25mb.sql` aplicado em transação no projeto
`vwbtitjlpelrcnsytzqw`. Coluna `public.imposition_tracedraw_backups.tamanho`
confirmada como bigint, com a nova restrição conferida após a aplicação.
Nenhuma linha de negócio foi modificada ou excluída.

`ponte-drive` publicado na versão 22, ativo e com verificação JWT preservada.
Bundle remoto conferido e endpoint de saúde HTTP 200. Bundle anterior v21
preservado para recuperação; não retornar o worker antigo com jobs `native_local`
pendentes. O schema ampliado é compatível com registros anteriores.

## Pacote e validação

Instalador: `Instalar-Ponte-Imposition.exe`, versão 1.10.10, 189.858.550 bytes.
SHA-256: `878c254a07ce707fe2159fa728e7b831bb167609c2c114d6bf631830b7bfcfec`.

143 testes Python aprovados, seis harnesses do serviço e verificação do botão
de download aprovados. Executável e instalador retornaram `ready=true` em
diretórios isolados. Os 116 arquivos declarados do runtime tiveram seus hashes
conferidos; conjunto de arquivos igual ao da 1.10.9.

Comparação do código empacotado com a 1.10.9 delimitou as mudanças aos seis
módulos necessários e à versão do runtime. Alteração local de diagnóstico
preexistente ficou preservada fora desta entrega. Fontes congeladas e hashes
foram arquivados com o build, sem credenciais.

## Ativação e limites

Publicar o pacote e o manifesto não comprova instalação nas estações. Após
instalar, salvar e fechar o CDR e reabrir pelo Imposition para recompor as
referências. Conferir a primeira página de dois modelos, anotação em apenas um,
e atualização dos PDFs com CDR abaixo e a partir de 25 MB.

Nenhum CDR de pedido real foi alterado nos testes. Instalação dos designers,
automação CorelDRAW real e impressão física não foram validadas nesta entrega.
