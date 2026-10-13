# Contorno em Texto — Banco de Dados

## Resultado preparado em 13/10/2026

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
- Web: 8fea7c80, branch local feat/contorno-texto-banco-web; cache v1050.
- MSI: dist/NewProdPiloto_Oficial_v1.2.400.msi, 194985984 bytes.
- SHA-256: 793c9928ec23a044308c3f3f1712f273fcc46136b13a0c4d76cf90e7acfa2798.
- Auditoria local: dist/contorno-400-auditoria.json.
- Log completo: dist/contorno-400-preparacao.log.
- Previa sintetica: dist/contorno-previa.png.

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
Os ambientes consultados convergem para o mesmo venv; nenhuma dependencia foi
instalada, removida ou atualizada. Log em dist/contorno-web-entrega.log.

## Estado e retomada

Nao publicado no site, MSI nao enviado e manifestos nao alterados. Nenhuma
instalacao, reinicio, geracao com dados reais ou impressao fisica executada.
Apenas a branch de fonte do agente foi enviada ao GitHub.

Solicitadas, ainda sem resposta nesta etapa, autorizacoes para:

1. Usar somente SUPABASE_SERVICE_KEY do .env.local operacional, em memoria,
   sem exibir o valor, para publicar o MSI.
2. Reparar os metadados do pip 26.2.1 sem trocar versoes/dependencias, para
   permitir a verificacao obrigatoria do pacote da entrega web.

Depois das autorizacoes: conferir novamente versoes publicas e origin/main;
se continuarem na base prevista, preservar o MSI atual e retomar upload por
dist/publicar_contorno_400.py. O helper verifica versao/hash da base, conserva
estacoes autorizadas, salva manifestos anteriores, confere download integral
antes da ativacao e recusa concorrencia observada entre upload e ativacao.
Nao executar o helper sem autorizacao para ler a credencial.

Retomar entrega-segura.ps1 na worktree web depois do reparo autorizado.
Conferir os cinco assets nos dois dominios com cache-buster; helper preparado
em dist/conferir_contorno_publico.py. Publicacao deve ser registrada como
concluida somente depois dessas provas.

## Recuperacao

Antes de publicar nao ha estado remoto a restaurar. Preservar fonte 1.2.399,
MSI e logs. Depois da ativacao, recuperar por nova versao superior com reversao
apenas do contorno, sem desfazer cache, capas ou Montagem. Web deve usar novo
commit de reversao restrita ou rollback comprovado da hospedagem. Manter
configuracoes, filas e dados das estacoes; validar PDF real e impressao em
campo separadamente da disponibilidade dos pacotes.
