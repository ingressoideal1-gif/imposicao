# Limpeza automatica de bundles NewProd

Preparacao local de 26/10/2026. Nao representa publicacao, instalacao ou
espaco recuperado em qualquer estacao.

Consolidada em `feat/correcoes-sessao-20261026`, base `7dd3cbfd` (QR12 ja
integrado). O checkout operacional e a preparacao anterior permanecem intactos.
Nenhum SQL remoto foi reaplicado e nenhuma configuracao de estacao foi alterada.

O executavel onefile extrai bibliotecas em `_MEI...`. A limpeza anterior de
`newprod_temp` atende apenas trabalhos `job-*`; nao trata sobras do executavel.

## Escopo

- `newprod_mei_runtime.py`, incluido no spec comum, registra exclusivamente
  `sys._MEIPASS` quando e filho direto do TEMP do usuario e possui nome `_MEI...`.
- O marcador `.newprod-mei-v1.lock` tem assinatura propria. Cada processo,
  inclusive filhos multiprocessing, mantem uma trava compartilhada durante
  sua vida. A limpeza exige trava exclusiva. Nao encerra processos.
- A manutencao existente chama a limpeza ao iniciar e a cada hora. Somente
  marcadores com pelo menos 24 horas podem ser limpos. O bundle atual tambem
  e excluido explicitamente da selecao.
- Execucao Python de desenvolvimento nao limpa o TEMP real. Testes fornecem
  raiz sintetica explicitamente; import do modulo nao executa manutencao.
- Falha ao criar/gravar o marcador, inclusive disco cheio durante flush, deixa
  o sentinela `.newprod-mei-v1.incompleto` e permite iniciar sem habilitar a
  limpeza dessa pasta. Um marcador vazio existente nunca e adotado. Essa
  protecao impede que uma gravacao incompleta autorize exclusao futura.
- Pastas legadas sem marcador e pacotes de outros programas sao preservados.
  Isso **nao limpa automaticamente as 121 pastas antigas da TEX-01**.
- Caminhos absolutos devem permanecer filhos diretos da raiz; links,
  junctions, reparse points, hardlinks e conteudo nao regular impedem limpeza.
- Inventario antes de apagar, limite de entradas e tempo. Remocao direta sem
  backup, sem Lixeira, sem rmtree. Falhas podem deixar remocao parcial; marcador
  permanece para retry, sem mascarar erro ou contabilizar bytes nao apagados.
- Nao remove PDFs de trabalhos, spool, cache, bancos ou arquivos soltos no TEMP.

## Diagnostico

`printers_json.armazenamento.ultima_limpeza_mei` acompanha o heartbeat existente:
pastas removidas, bytes de arquivos efetivamente removidos, ativos, recentes,
sem identificacao, erros, parcial e horario. Nao publica caminhos, nomes de
arquivos nem conteudos. Bytes logicos removidos nao equivalem necessariamente
a variacao livre do disco (compressao e outros programas podem interferir).

O campo antigo `temp_geral_somente_leitura` continua referindo-se ao inventario
geral. A excecao explicita e `mei_marcados_limpeza_automatica=true`.

## Validacao e entrega

Testes sinteticos exercitam exclusao, locks compartilhados entre processos,
queda de processo, idade, pasta atual, origem desconhecida, links, hardlinks,
falha parcial/retry, limites e integracao com a manutencao. Sem acessar nuvem
ou limpar TEMP real. A bateria de canais inclui esses testes.

Regressao inicial da consolidacao: 57 testes Python aprovados (limpeza,
temporarios e contratos QR12). Tambem passaram 19 verificacoes SQL do QR12
em PGlite em memoria, com dependencia ja instalada fora do projeto. Nenhuma
dependencia instalada ou atualizada. A bateria completa dos canais acompanha
esta preparacao nos relatorios locais `rascunhos/validacao-limpeza-*.json`.

Validacao final da mesma fonte nos tres canais (producao, Piloto e oficial):
886 testes aprovados, 2 ignorados e 2 subtestes aprovados em cada canal;
todos os harnesses JavaScript aprovados. Aviso preexistente de depreciacao
httpx/Starlette. `git diff --check` e revisao dos arquivos novos aprovados.
Nenhuma regressao detectada nessas verificacoes; nao substituem o teste
do MSI instalado, geracao real e impressao fisica.

Ainda exige build autorizado do executavel/MSI, verificacao do bundle e
instalacao controlada para comprovar o hook no executavel real. Nenhum build
ou instalacao foi realizado nesta preparacao.

Referencias de implementacao:
[runtime hooks do PyInstaller](https://pyinstaller.org/en/stable/when-things-go-wrong.html#changing-runtime-behavior)
e [LockFileEx do Windows](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-lockfileex).
