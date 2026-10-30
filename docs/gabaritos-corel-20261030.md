# Gabaritos por produto — entrega 1.8.0

## Comportamento

- Card Gabaritos na Lista de Arte, independente dos filtros de pedidos.
- Designer, atendimento, gerente e administrador: carregar, substituir e baixar PDF por código ERP do produto; respeita recusa explícita de acesso à Lista de Arte.
- Um gabarito ativo por produto. Substituição gera revisão; arquivos anteriores ficam preservados. PDFs sem senha, até 30 MiB e uma ou duas páginas.
- Checkbox Gab. desmarcado, ao lado de CorelDRAW. Quando marcado, adiciona o gabarito somente às páginas do modelo clicado, na camada de arte editável e imprimível.
- Uma página: mesma base nas faces. Duas páginas: primeira frente e segunda verso; pares multipáginas repetem o mapeamento. Verso único usa a segunda página uma vez. Modo duplicar para verso mantém o contrato de arte existente, sem criar páginas extras.
- Dimensões devem coincidir com a página do produto, sem redimensionar os elementos. Referências de numeração, cor e observações continuam fora da publicação.
- Marcador nativo evita duplicação na reabertura, inclusive após recuperar o CDR do Drive. Edições existentes são preservadas. Substituir o gabarito na biblioteca não sobrescreve gabaritos já editados no CDR. Desmarcar Gab. não remove arte já inserida.
- Exclusão da arte pelo fluxo existente remove também o marcador da página, permitindo nova inclusão. Outros modelos permanecem intactos.
- Ponte antiga apresenta instrução para atualizar ao usar Gab.; não ignora a seleção silenciosamente.

## Fontes e limites

Frontend, API e SQL: checkout `imposition-gabaritos-corel-20261030`, branch `feat/gabaritos-corel-20261030`, base `430e8e056bcb3faa56eae022e3c1194124c49e0b`.

Fonte completa da Ponte: checkout `imposition-coreldraw-20261030`. Alterações desta tarefa: `ponte_imposition/corel_templates.py`, `corel_adapter.py`, `corel_service.py`, `runtime.py`, `tests/test_corel_templates.py`, `tests/prova_corel_gabaritos.py`. Versão candidata 1.8.0. Esse checkout já possuía fontes não rastreadas; não adicionar todo o checkout nem substituir o frontend público por sua cópia antiga.

Entrega autorizada em 30/10/2026. Migração aplicada e API painel publicada. PR do backend: https://github.com/ingressoideal1-gif/imposicao/pull/235. Instalador 1.8.0 publicado no mesmo arquivo do Drive, com revisão anterior preservada e downloads autenticado/público conferidos. A integração do frontend segue o PR protegido desta entrega. Nenhuma estação foi instalada automaticamente.

## Persistência e ativação preparada

Projeto Supabase existente `vwbtitjlpelrcnsytzqw`. Script `sql/gabaritos_produtos.sql` cria somente `imposition_gabaritos`, `imposition_gabaritos_revisoes`, RPC `imposition_publicar_gabarito` e bucket privado `imposition-gabaritos`. Não atualiza pedidos, produtos ou artes. Quantidade inicial de registros de negócio: zero.

A API autenticada `/painel/api/gabaritos/{listar,salvar,baixar}` confere papel no servidor. Tabelas acessíveis somente ao serviço; política restritiva impede acesso direto ao bucket por anon/authenticated mesmo se houver políticas permissivas antigas. Download usa URL assinada por 60 segundos. A Ponte valida destino, produto, tamanho e SHA-256; não recebe credenciais administrativas.

Publicação de revisão usa trava por produto e compara revisão anterior, evitando substituição concorrente silenciosa. Exige uma linha persistida como recibo. Arquivos usam endereço produto/hash.pdf; nenhum arquivo é removido automaticamente. Falha entre upload e confirmação pode deixar arquivo não vinculado; limpeza futura deve verificar referências.

Antes de ativar: revisar existência/conflito dos novos objetos e política; aplicar SQL em transação autorizada; publicar função painel; empacotar Ponte 1.8.0 preservando o instalador anterior; publicar frontend pela entrega protegida; atualizar manifesto/distribuição. Verificar download público por hash e instalação separadamente. A migração não é executada pelos testes.

Reversão: restaurar frontend e Ponte anteriores e manter novas tabelas/arquivos preservados. Nenhum modelo é alterado pela migração. Elementos já inseridos em CDR continuam editáveis e fazem parte do PDF, como arte normal.

## Validação realizada

- Deno: 385 testes aprovados na suíte; quatro testes específicos de acesso, PDF inválido/mais de duas páginas, recibo persistido, conflito de revisão e URL assinada; type-check do endpoint painel.
- Python: 49 testes de integração Corel e gabaritos, incluindo frente/verso, verso único, pares multipáginas, isolamento de modelo, hash e cache de download.
- Navegador headless: biblioteca para atendimento, pesquisa, estado de download, nomes tratados como texto e ocultação para cliente.
- Harnesses: checkbox desmarcado e envio da opção, atualização conjunta existente, recusa de ponte sem suporte; sintaxe JS e whitespace.
- CorelDRAW real com documento sintético: três páginas, gabarito nas primeiras duas; contagens [1,1,0], dimensões preservadas, camada editável/imprimível; alteração manual simulada preservada ao repetir; PDF exportado contém o gabarito e a terceira página continua vazia. Apenas documentos sintéticos dessa prova foram fechados.

Testes não comprovam upload/download na nuvem nem instalação de designers. Retomada: após ativação autorizada, cadastrar gabarito sintético de duas páginas em produto escolhido, abrir um modelo frente/verso com Gab., conferir edição e PDF antes da distribuição geral.

## Referência de automação

A cópia entre documentos usa `ShapeRange.Copy` e `Layer.PasteEx` com opções explícitas; `CopyToLayer` foi testado e recusado pelo Corel por serem documentos diferentes. A área de transferência anterior é restaurada se ainda pertence à operação. Documentação: https://community.coreldraw.com/sdk/api/draw/24/m/layer.pasteex

## Artefato e verificação remota

Instalador: 189052067 bytes; SHA-256 `6af55b053852f62d115d6d287ba69b632b43fced047baa1fcb6c1fdc216d5660`.
Arquivo Drive: `1NPpDiuIsx1ccnt7NxsXNSbV5xnU7CQUo`; revisão `0B5eKrKA9HYFtTnR1cE02RzlWNjR1WWhEUzJ3SC9PZE43WUFRPQ`.
Build preservado em `../ponte-build-corel-20261030-12`; fontes alteradas copiadas em `source-review` com SHA-256. Autoteste do executável: ready/icc/node/engine verdadeiros.

Após a migração: zero gabaritos e revisões, duas tabelas com RLS, bucket público=false, uma política restritiva; authenticated sem execute na RPC. Endpoint sem credencial responde 401. Não houve upload de gabarito de teste em produto real nem alteração de pedido.
