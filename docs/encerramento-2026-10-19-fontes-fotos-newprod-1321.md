# Encerramento de 19/10/2026 — NewProd 1.3.21

Trabalho encerrado a pedido do usuario. Este registro descreve as evidencias obtidas durante a entrega; nao constitui uma nova consulta de adocao pelas estacoes.

## Entrega concluida

- Funcao Supabase `piloto-local`, projeto `vwbtitjlpelrcnsytzqw`: v18 ACTIVE. Os 12 modulos publicados foram relidos e comparados com a fonte preparada. Autenticacao preservada, com 401 sem credencial.
- NewProd 1.3.21 publicado universalmente nos manifestos `latest.json`, `newprod-piloto-oficial.json` e `newprod-piloto-teste.json`, relidos com cache-buster.
- Os aliases `NewProdPiloto_Oficial_v1.3.21.msi` e `NewProdPiloto_Teste_v1.3.21.msi` tiveram download publico completo e hash conferidos duas vezes. Tamanho: 196698112 bytes. SHA-256: `8a0a39903eab51b7e0488092c8dc26117ce8ab56b59abca15558794b42cff169`.
- Base publica: https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/
- Fonte publicada: branch `fix/fontes-fotos-23941`, commit `2549a1ca`, tag `agente-v1.3.21`. Registro detalhado posterior: `c341c27a`.

Nenhuma instalacao ou reinicializacao de estacao foi executada. Nao houve alteracao de dados comerciais/status nem comprovacao de impressao fisica.

## Correcoes e verificacoes dos pedidos

### 23941 — modelo 1003810

Corrigida a preparacao das fontes obrigatorias: Comic Sans MS tinha nomes de arquivos/catalogo diferentes do nome da familia. A preparacao offline agora compartilha a resolucao de familia e estilo do motor, incluindo Arial/Comic normal e negrito. Fontes reais consultadas estavam acessiveis e validas.

### 23468 — modelo 1002605

Corrigida a descoberta das 13 fotos armazenadas em `__fotos.FOTO`. O filtro anterior introduzido para o pedido 23840 omitia esses metadados. A verificacao somente leitura confirmou 13/13 URLs incluidas e fotos validas. Metadados de colunas usadas como arquivos sao incluidos; colunas auxiliares de QR continuam excluidas.

O marcador local `recursos_fotos=1` exige uma conferencia completa unica para recibos antigos, mesmo sem mudanca na revisao comercial. Objetos anteriores sao preservados. A primeira renovacao precisa de conexao.

### 23840 — modelo 1003557

Mantida a correcao da descoberta de recursos: conteudo de QR nao deve ser baixado como arquivo. Foram removidos os tetos de 256 recursos e 100000 valores percorridos. A regressao cobre 100001 recursos; o banco real de 2000 registros resultou em dois recursos necessarios. O limite independente de transporte de 8 MiB em `coleta_autonoma.py` continua existente; nao declarar ausencia de limites em todo o fluxo.

### 22714 — modelo 1001460

A foto historica mostra 00001, enquanto o inicio esperado era 01001. O fluxo atual testado nao reproduziu a falha: PDFs sequencial, cut_stack e multi_artes com banco QR preservaram 01001; o teste completo de 10000 itens produziu 01001–11000 sem lacunas ou duplicidades. O payload do frontend preservou inicio 1001.

Sem o PDF historico e a versao usada na impressao antiga, a causa daquele evento permanece indeterminada. Nenhum dado ou status do pedido entregue foi alterado. Evidencias locais em `../imposition-camadas-pdf-23802/dist/verificacao-22714/`.

### Correcoes anteriores preservadas

A entrega incorpora a base 1.3.20, incluindo rotacao de paginas pares, e preserva a correcao de camadas PDF da 1.3.19 para o pedido 23802. Nao houve alteracao adicional dos modos GDI/RAW.

## Validacao final

- 1134 testes aprovados em cada perfil: producao, piloto e oficial; dois skips e dois subtests por perfil.
- 21 harnesses de interface aprovados em cada perfil, mais o harness de faces/impressao com paginas pares.
- 25 testes da Edge aprovados.
- Auditoria do executavel: oito modulos iguais a fonte, 375 arquivos de frontend iguais, tres DLLs GDI presentes e MSI ProductVersion 1.3.21. Auditoria de arquivos privados/segredos aprovada.
- `git diff --check` aprovado na entrega.

Detalhes em [correcao-fontes-fotos-23941-23468.md](correcao-fontes-fotos-23941-23468.md). Recibos locais, nao versionados: `dist/validacao-1.3.21.json`, `dist/auditoria-1.3.21.json`, `dist/msi-1.3.21.json`, `dist/preupload-1.3.21.json`, `dist/manifestos-1.3.21-verificados.json` e `dist/publicacao-unica-1.3.21-*`. Backup da Edge anterior: `dist/edge-1.3.21/antes`; estados e provas em `dist/edge-1.3.21/`.

## Retomada

1. Consultar somente leitura a versao e o ultimo contato de cada estacao. Manifesto publicado comprova disponibilidade, nao instalacao. Nao instalar ou reiniciar automaticamente.
2. Nas estacoes com 1.3.21, reabrir online os pedidos 23941 e 23468 para renovar os recursos locais.
3. Gerar e conferir os PDFs: fontes corretas em 23941 e todas as 13 fotos em 23468. A validacao fisica depende de impressao acompanhada pelo operador; nao foi realizada nesta entrega.
4. Planejar separadamente a integracao da base runtime em main. A tentativa de aplicar apenas esta correcao nao foi efetivada porque main nao possui os modulos offline necessarios. Nao copiar a base inteira sem revisao. A fonte publicada esta preservada na branch e tag acima.

Checkout de trabalho: `C:\Users\Junior\Projetos Ingresso ideal\imposition-fontes-fotos-23941`. O checkout operacional `ideal-imposition` possui mudancas preexistentes e foi preservado. A disponibilidade publica de 1.3.21 e Edge 18 esta confirmada; adocao pelas estacoes e resultado fisico permanecem pendentes.
