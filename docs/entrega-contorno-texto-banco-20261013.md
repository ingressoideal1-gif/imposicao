# Contorno em Texto — Banco de Dados

## Entrega em 13/10/2026

Campos Fio de contorno (mm) e Cor do contorno no elemento TEXT com
database_text. Zero desativa. Preenchimento e contorno vetoriais no PDF,
com a mesma ordem de desenho nas previas. Nao altera dados do CSV, quantidade,
numeracao, textos legados ou texto fixo.

A consulta publica encontrou NewProd 1.2.399 nos manifestos oficial e latest,
enquanto origin/main 20d875c7 declara 1.2.381. A entrega do agente parte da fonte
publicada fb68038d, preservando cache, capas e Montagem da 1.2.399. Nao substituir
essa base pela main antiga. A web parte de origin/main, preservando a portaria.
Os checkouts operacionais permanecem intactos.

## Fontes e artefatos

- Implementacao original: 354aa962, branch feat/contorno-texto-banco-20261013.
- Agente: ad2a6de1 e 97505100, branch remota release/contorno-texto-banco-400.
- Web: 8fea7c80 e 0aefdb89, branch feat/contorno-texto-banco-web; cache v1051.
- PR #134 integrado em 3259cfb204120a88b419f2c2d4dc32f4b4ac72fb, tag v1051.
- MSI: dist/NewProdPiloto_Oficial_v1.2.400.msi, 194985984 bytes.
- SHA-256: 793c9928ec23a044308c3f3f1712f273fcc46136b13a0c4d76cf90e7acfa2798.
- Auditoria local: dist/contorno-400-auditoria.json.
- Log completo: dist/contorno-400-preparacao.log.
- Previa sintetica: dist/contorno-previa.png.
- Tag remota: agente-v1.2.400, fonte 97505100.
- Evidencias versionadas: docs/evidencias/contorno-400-auditoria.json e
  docs/evidencias/contorno-400-publicacao.json.

Worktrees irmas em C:\Users\Junior\Projetos Ingresso ideal:
imposicao-contorno-texto-banco-400 e imposicao-contorno-texto-banco-web.

## Validacao

46 testes focados aprovados, incluindo PDF persistido, cores, espessura,
shrink/wrap/condense, rotacao, limites e compatibilidade. Browser confirma
visibilidade, alteracao, serializacao e previas do painel e cliente.

Agente: 543 testes e 2 subtestes aprovados, 2 ignorados, em cada perfil
producao, piloto e oficial; harnesses JavaScript tambem aprovados. Aviso
existente de depreciacao Starlette/httpx. Build e auditorias do executavel,
preservador e MSI aprovados. Auditoria adicional confirma bytecode do contorno,
versao do MSI, hashes dos dois arquivos do painel e DLLs GDI.

Web: simulacao, sintaxe, segredo/diff e testes dos dois canais aprovados.
A etapa pacote-piloto parou antes do push/deploy: importlib.metadata encontrou
pip-26.2.1.dist-info sem METADATA/RECORD, retornando Name e version nulos.
Os ambientes consultados convergem para o mesmo venv. Apos autorizacao humana,
450 arquivos do pip foram comparados com a wheel oficial 26.2.1, SHA-256
71138adf1f4ca900cdb7d289c21b7494329f2332b6d85f0e1c42108c0384ed3e. Somente
METADATA, WHEEL e RECORD foram restaurados; nenhuma versao ou codigo de pacote
foi alterado. Backup em dist/pip-metadados-antes e recibo em
dist/pip-metadados-reparo.json. O inventario nao retorna mais nomes nulos.
Logs web: dist/contorno-web-entrega.log e dist/contorno-web-entrega-retomada.log.

## Estado publicado e validacao em campo

Uso da variavel SUPABASE_SERVICE_KEY autorizado expressamente. Valor usado
somente no processo de publicacao, sem exibir ou registrar. MSI enviado sob
nome novo, baixado integralmente e comparado por tamanho/SHA-256. Manifestos
newprod-piloto-oficial.json e latest.json ativados e relidos em 1.2.400,
mantendo exatamente as oito estacoes anteriormente autorizadas. Guardas
confirmaram base 1.2.399 e ausencia de mudanca concorrente antes da ativacao.
Manifestos anteriores preservados em dist/contorno-400-manifestos-antes.json
e nos backups gerados pelo publicador. Nenhum canal de teste foi promovido.

Web v1051 publicada. A retomada do entrega-segura.ps1 concluiu validacoes e
compilacao/auditoria do pacote de compatibilidade, mas o GitHub recusou push
direto por exigir PR e check de seguranca. A integracao seguiu pelo PR #134,
sem alterar protecoes: os seis checks, incluindo os tres perfis NewProd,
consulta autenticada, seguranca/recuperacao e previa Cloudflare, passaram.
O merge usou o SHA exato conferido. Tag v1051 criada no commit integrado.

Cloudflare de producao: c25c55f3-f62f-47f5-beb2-7a2f6a08e8ba, sucesso.
Comparacao normalizada com cache-buster: index.html, producao.html,
cliente.html, script.js e texto-ajuste.js correspondem a fonte nos dominios
imposition.ai-ideal.com.br e imposicao.pages.dev (10/10). Evidencias em
docs/evidencias/contorno-v1051-publico.json, contorno-v1051-deploy.json e
contorno-v1051-pr.json. Artefato de compatibilidade preparado pelo fluxo web
nao foi instalado nem distribuido como substituto do MSI oficial 1.2.400.

Nenhuma instalacao, reinicio, geracao com dados reais ou impressao fisica foi
comandada nesta entrega. Atualizacao efetiva de cada estacao e validacao em
campo continuam sendo provas distintas. Apos atualizar o agente, conferir
um Texto — Banco de Dados com cor/espessura e com zero no PDF real, antes
de validar a impressao fisica. Fontes e evidencia do agente ficam na branch
release/contorno-texto-banco-400; nao foi feita integracao ampla das mudancas
anteriores da base 1.2.399 na main.

## Recuperacao

Preservar fonte 1.2.399, MSI e logs. Recuperar por nova versao superior com reversao
apenas do contorno, sem desfazer cache, capas ou Montagem. Web deve usar novo
commit de reversao restrita ou rollback comprovado da hospedagem. Manter
configuracoes, filas e dados das estacoes; validar PDF real e impressao em
campo separadamente da disponibilidade dos pacotes.
