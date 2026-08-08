# Preview da numeração no Storage, em vez de base64 na tabela

Data: 2026-08-08
Escopo: `frontend/script.js`, um script de migração novo, e um bucket novo no
Supabase Storage.

## Problema

Ao salvar uma numeração, `saveNumeracao()` gera um preview de 100 DPI num canvas
e o grava como data URL base64 na coluna `preview_jpg TEXT` de
`producao_numeracoes` (`frontend/script.js:5977` e `:6000`, atravessando
`db.py:591` e `:617`).

Medido no banco de produção: 42 das 49 numerações têm preview, somando
**454,6 KB de base64 dentro da tabela**. Isso não é apenas armazenamento.
`loadAll()` carrega as numerações com `select *`, então esses 455 KB atravessam a
rede a cada carregamento de página, para um dado que nada na tela usa.

## Objetivo

Guardar o preview como um arquivo `.jpg` num bucket do Supabase Storage e deixar
na coluna apenas a URL pública.

## Quem consome hoje

Ninguém. `preview_jpg` é escrito e nunca lido em nenhum ponto deste repositório —
confirmado por busca em todo o código, e confirmado pelo usuário quanto a
consumidores externos. Isso é o que torna a troca de formato segura: não há
contrato a preservar, e a migração das linhas antigas não precisa de período de
convivência entre os dois formatos.

## O bucket

`previews-numeracoes`, público, criado por API com a `SUPABASE_SERVICE_KEY` que já
existe no `.env.local` (`POST /storage/v1/bucket`), sem passo manual no painel.

Público garante **leitura** por URL direta, que é o que o frontend precisa. Não
garante **escrita**: o upload sai do navegador com a chave anônima e depende de uma
política de INSERT em `storage.objects`. O bucket `artes` tem essa permissão hoje —
o SVG e o PDF da numeração já sobem por lá — mas não é possível determinar, sem
consultar o banco, se a política é global (e o bucket novo já nasce funcionando) ou
restrita ao `artes`.

Resolução: depois de criar o bucket, tentar um upload real **com a chave anônima**.
Se passar, está pronto. Se falhar, gerar um `criar_bucket_previews.sql` com a
política, no padrão dos `alter_*.sql` do repositório (arquivos que instruem
"Execute no SQL Editor do Supabase"), e avisar o usuário.

Um upload de teste feito com a service key não prova nada sobre o caminho real e
não pode ser aceito como verificação.

## Nome do objeto

`previews-numeracoes/<id da numeração>.jpg`, com `upsert: true`.

O id é conhecido no cliente antes da gravação: `api()` faz `let id = body.id` e só
inventa um UUID quando o corpo não traz um (`frontend/script.js:730`). Portanto
`saveNumeracao()` gera o id para numerações novas e o inclui em `data.id`; como o
payload de insert é `{ id, ...body }` (`:752`), o valor do corpo prevalece, sem
conflito.

Isso evita lixo acumulado. O `uploadToStorage` atual nomeia os objetos como
`${path}/${Date.now()}_${nome}`, o que deixaria um `.jpg` órfão no bucket a cada
save. Com o id como nome e `upsert`, salvar a mesma numeração dez vezes sobrescreve
o mesmo objeto: um preview por numeração.

## A mudança no código

`uploadToStorage(content, fileName, path)` (`frontend/script.js:5808`) ganha um
quarto parâmetro opcional, um objeto de opções com duas chaves:

- `buckets` — lista de buckets a tentar, na ordem. Sem ela, mantém
  `['artes', 'imposicao-storage']`.
- `objectPath` — caminho exato do objeto dentro do bucket. Sem ela, mantém
  `${path}/${Date.now()}_${nome}`.

São duas chaves e não só a lista de buckets porque o nome estável depende das duas
coisas ao mesmo tempo: o bucket certo **e** um nome sem timestamp. As três chamadas
existentes passam três argumentos e não mudam de comportamento.

Em `saveNumeracao()`, a linha `preview_jpg: previewJpgBase64` passa a receber o
retorno de um `uploadToStorage` apontando para `previews-numeracoes`.

`db.py` não muda: a coluna segue `TEXT`, apenas com conteúdo diferente. Nenhuma
migração de schema.

## Migração das 42 linhas

Script Python com a service key, no estilo dos `migrate_*.py` do projeto, em quatro
passos:

1. **Backup primeiro.** Grava `id`, `name` e `preview_jpg` das 49 linhas num
   `backup_preview_jpg_<timestamp>.json` na raiz do repositório. Esse padrão entra
   no `.gitignore`: é rede de segurança local, não conteúdo do projeto, e 455 KB de
   base64 não têm por que entrar no histórico do git permanentemente.
2. **Sobe cada preview** como `previews-numeracoes/<id>.jpg`, com
   `content-type: image/jpeg` e `x-upsert: true`.
3. **Troca a coluna** pela URL pública, linha a linha.
4. **Confere.** Relê as 42 linhas exigindo que todas comecem com `https://`, e faz
   um GET em cada URL exigindo status 200 e `content-type: image/jpeg`. Um PATCH
   que retornou sem erro não prova que o arquivo existe.

O script pula linhas cujo `preview_jpg` já seja URL, então reexecutar é inofensivo.
As 7 numerações sem preview permanecem sem.

Se o upload de uma linha falhar, essa linha **não** é alterada: o base64 fica onde
está e a linha é relatada ao final. Trocar a coluna por uma URL que não existe
seria perder o preview de vez. Reexecutar o script tenta de novo só as pendentes.

## O risco de regressão silenciosa

O fallback do `uploadToStorage` devolve o base64 quando o upload falha
(`frontend/script.js:5881-5887`). Para o usuário isso é bom — a coluna continua
funcionando em vez de ficar vazia. Para a verificação é uma armadilha: o trabalho
pode parecer concluído enquanto o app segue gravando base64.

Por isso a conferência final não olha o console nem o retorno da função. Ela salva
uma numeração pelo app rodando e lê a coluna direto no Supabase, exigindo que o
valor comece com `https://` e que a URL devolva um JPEG.

## Verificação

O projeto não tem framework de testes de frontend; a verificação é feita no app
rodando, via skill `rodar-app`, mais consultas diretas ao Supabase:

1. O bucket `previews-numeracoes` existe e é público.
2. Um upload com a **chave anônima** para esse bucket é aceito.
3. Salvar uma numeração nova pelo app grava em `preview_jpg` uma URL `https://`, e
   o objeto `<id>.jpg` existe no bucket.
4. Salvar de novo a **mesma** numeração sobrescreve o mesmo objeto, sem criar um
   segundo arquivo.
5. As chamadas existentes de `uploadToStorage` para SVG e PDF continuam indo para o
   bucket `artes` — o quarto parâmetro é opcional e não muda o padrão.
6. Depois da migração, nenhuma das 42 linhas contém `data:image` e todas as URLs
   respondem 200 com `content-type: image/jpeg`.
7. O payload de `loadAll()` para `producao_numeracoes` encolhe em aproximadamente
   455 KB.
