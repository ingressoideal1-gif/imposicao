# Biblioteca interna de fontes CorelDRAW — 31/10/2026

Implementacao local autorizada por “Executar”. Sem publicacao, SQL remoto,
upload real de fontes ou instalacao em estacoes nesta etapa.

## Interface e nuvem

Em Catalogo de Fontes, nova biblioteca interna. TTF/OTF ate 10 MiB, upload em
lote, pesquisa, download autenticado e validado por SHA-256. Nome, familia,
estilo, PostScript e versao lidos do arquivo no servidor. Confirmacao explicita
de permissao para distribuir a fonte; anotacao de origem/licenca opcional.
O indicador fsType descreve incorporacao e nao substitui essa confirmacao.

Biblioteca privada separada: `imposition_fontes_corel` e bucket
`imposition-fontes-corel`. Cada hash e imutavel na API; versoes de mesmo nome
coexistem. Nao modifica catalogo_fontes, chat-ideal, portal, numeracao ou PDF.
Nao exclui arquivos nem oferece sobrescrita por nome.

Acesso interno admin/gerente/designer/atendimento com perm_fontes_view; upload
exige perm_fontes_edit. Permissoes atuais nao foram ampliadas. Nao ha leitura
anonima, e o download usa URL assinada por 60 segundos.

Preparar aplicacao de `sql/fontes_corel_biblioteca.sql` em transacao, depois
painel/frontend/Ponte na entrega autorizada. A migracao cria objetos novos e
falha se os nomes ja estiverem ocupados; nao altera buckets existentes.
Recuperacao funcional: voltar frontend/Ponte anteriores, manter biblioteca
privada e os dados. Nao executar DROP como rollback automatico.

## Ponte (fonte operacional separada)

Codigo em `../imposition-coreldraw-20261030/ponte_imposition/corel_fonts.py`,
integrado a corel_adapter.py e corel_service.py. Preservar esse checkout, que
contem o codigo completo nao rastreado e outras correcoes pendentes.

Ao Atualizar, le FontsUsed dos metadados do CDR, relaciona familias com fontes
TTF/OTF do registro Windows e da pasta monitorada padrao do Corel. Guarda
identidades e hashes dentro de reference.fontes, junto ao CDR no backup.
A lista do Corel pode incluir fontes padrao/alternativas, nao so caracteres
visiveis. Todas as variantes locais identificadas da familia sao registradas;
nao se afirma identificar somente os estilos efetivamente usados no texto.
Inventario usa cache em memoria por caminho/tamanho/mtime.

Ao abrir um CDR com manifesto correspondente ao hash do arquivo, fontes ja
presentes sao reutilizadas. Apenas fontes ausentes com hash exato aprovado na
biblioteca sao baixadas, verificadas e copiadas para Documentos/Corel/Corel
Content/Fonts/Imposition, respeitando o Known Folder Windows. Nao altera registro
nem instala fontes globalmente. O Corel Font Manager precisa monitorar essa
pasta; a configuracao padrao monitora Fonts e subpastas.

Conflitos de versao nao sao sobrescritos. Fonte nao cadastrada, conflito ou
indisponibilidade gera aviso; preserva abertura e o dialogo nativo do Corel.
A Ponte nao escolhe fonte substituta nem muda textos. O Corel pode propor sua
substituicao nativa, que deve ser conferida pelo designer.

CDRs antigos sem manifesto continuam abrindo como antes; Atualizar gera o
manifesto. CDR alterado depois do manifesto nao recebe fonte com base na lista
antiga. Fontes TTC/OTC, Type1 e fontes incorporadas nao sao extraidas/distribuidas.
Fontes em pastas monitoradas personalizadas fora da pasta padrao ainda podem
aparecer como nao identificadas. O envio de fontes e explicito pela biblioteca,
nao ha varredura com upload automatico da estacao.

## Validacao e limites

- 73 testes Python (fontes, abertura, limpeza, integracao, gabaritos e Drive).
- 8 testes Deno: fontes privadas e regressao de gabaritos.
- 21 testes Python do catalogo web existente, preservado.
- 3 harnesses JavaScript: biblioteca de fontes, integracao Corel e transporte.
- Parser servidor conferido localmente com Arial TTF real, sem envio externo.
- Prova local Corel 24.3: documento sintetico criado/salvo/fechado; Arial
  identificada. 0,623 s inventario inicial, 0,042 s em cache. Nenhuma fonte
  instalada ou enviada. MS Gothic (colecao TTC) permaneceu nao identificada.
- Harness frontend dedicado e testes de integracao/transporte registrados na
  entrega. Validacao real de download e reconhecimento em segunda estacao
  depende da publicacao e de uma fonte licenciada selecionada para o teste.

Fontes tecnicas: https://learn.corel.com/tutorials/how-to-import-font-database-in-coreldraw/
e https://kb.corel.com/en/127993 .
