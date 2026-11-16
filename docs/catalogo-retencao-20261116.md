# Catalogo e limpeza das estacoes — 16/11/2026

## Mudanca preparada

Base: `agente-v1.4.15` (`ff70634f`), em worktree isolada. A preparacao anterior
em `imposition-catalogo-32768-20261116` permanece intacta. Foram aproveitados
somente o aumento de capacidade e seus testes, depois da revisao do diff.

O limite padrao e maximo de metadados passa de 16.384 para 32.768 registros.
Nao ha migracao nem exclusao implicita. O arquivamento continua protegendo
ultimas revisoes, snapshots, selecoes e recursos referenciados. Ao atingir
o novo teto sem candidato seguro, a admissao continua recusada.

Versao preparada: 1.4.16, sincronizada em `agent_version.py`,
`agent_installer.wxs` e `compilar_msi.ps1`. O painel continua 1335.
Nao ha alteracao de regras de impressao, numeracao, status ou dados comerciais.

## Evidencia de limpeza

Consulta de telemetria em 16/11/2026, aproximadamente 10h32 de Brasilia:

- LASER-01: 1.4.15 validada, cerca de 45,5 GiB livres; ultimo ciclo de retencao
  as 10h30 registrou zero modelos e zero bytes removidos. Na consulta seguinte,
  a estacao estava ocupada. Zero em um lote nao prova ausencia global de candidatos.
- LASER-02, LAPTOP e PC-JR-HOME: retencao ativa, ultimo lote sem remocoes.
- LASER-04 e GUSTAVO-PROD: retencao adiada e estacao ocupada.
- TEX-01: thread de coleta encerrada, ultimo registro de retencao em 13/11.
- TEX-02: 1.3.21; atualizacao para 1.4.15 falhou com MSI 1603.

As tentativas de acesso direto aos IPs informados pelas estacoes na porta 9001
expiraram. Nao houve limpeza manual, reinicio, instalacao ou exclusao de dados
reais. Nao ha comprovacao de espaco liberado nesta execucao.

## Politica de limpeza preservada

O mecanismo existente consulta ate 32 pedidos por minuto, com rodizio persistido.
Somente uma confirmacao online recente de todos os modelos como IMPRESSO
permite descartar copias locais. Producao, spool, preparacao, selecao e leituras
precisam estar livres. Pendencias offline, referencias compartilhadas e capturas
manuais continuam protegidas. Falha de rede conserva os dados.

Os alvos sao os registros de cache e objetos sem referencias sob a raiz de dados
do perfil da propria estacao. Nao limpar manualmente SQLite, snapshots, spool,
TEMP geral ou pastas pessoais. A recuperacao de uma copia descartada exige nova
consulta/download do pedido; isso nao reverte status comerciais. Ver
`docs/retencao-cache-impressos-20261112.md` para as tabelas e travas da rotina.

A limpeza de temporarios e outra operacao: no painel local autenticado de
gestao, usar **Ver previa de limpeza**, revisar caminhos/candidatos e executar
**Limpar temporarios abandonados**. Essa rota so admite temporarios gerenciados
abandonados ha 24 horas com trava livre e nao libera registros do catalogo.

## Entrega e retomada

Pacote local nao comprova publicacao ou adocao. A ativacao deve conferir o MSI
publico inteiro antes de atualizar manifestos e consultar versoes depois.
Nao forcar reinicio com producao ativa. TEX-02 exige diagnostico do MSI 1603;
TEX-01 exige verificar o encerramento da coleta antes de retomar a limpeza.

Na LASER-01, depois da adocao: abrir o pedido que apresentou o alerta, conferir
a preparacao e observar novos ciclos de retencao durante ociosidade. Uma
impressao fisica ainda depende de verificacao operacional.

## Artefatos locais conferidos

- MSI: `dist/NewProdPiloto_Oficial_v1.4.16.msi`, ProductVersion 1.4.16,
  196.882.432 bytes.
- SHA-256 MSI: `4d3ca37b6e7b5cfa63f1e579e1eea6f82bd272f766ced8a1d76049375ddef55a`.
- EXE oficial: `dist/NewProd.exe`; EXE experimental: `dist/piloto/NewProdPiloto.exe`.
- Ambos passaram na auditoria de arquivos privados e contem o limite 32.768.
  Os 390 arquivos de frontend de cada EXE coincidem byte a byte com a fonte.
- Recibos locais: `dist/evidencia-1416.json` e `dist/auditoria-canais-1416.json`.

Na preparacao inicial, publicacao e credencial ficaram pendentes. A autorizacao
posterior de publicacao permitiu usar a configuracao local apenas em memoria,
sem exibir ou versionar credenciais.

## Validacao concluida

Nos perfis producao, piloto e oficial: 1.347 testes Python aprovados,
3 ignorados e 2 subtestes aprovados por perfil; 25 harnesses JavaScript
aprovados por perfil. Aviso preexistente Starlette/httpx. Os testes ignorados
permanecem os de plataforma/privilegio da suite, sem ocultar falhas.
`git diff --check` aprovado. Nenhum teste imprimiu ou validou a operacao
fisica na LASER-01.

## Publicacao concluida

Apos autorizacao explicita, o MSI foi enviado sob nome imutavel. O download
publico completo confirmou 196.882.432 bytes e o SHA-256 registrado acima.
Somente depois foram ativados `newprod-piloto-oficial.json` e `latest.json`
na versao 1.4.16, sem restricao por estacao. Releitura publica com cache-buster
confirmou ambos. O canal de teste permanece 1.3.35. Evidencia:
`docs/evidencias/newprod-1416-publicacao.json`.

Na primeira consulta posterior, LASER-01 e outras sete estacoes ainda
informavam 1.4.15; TEX-02 continuava 1.3.21 com MSI 1603. A publicacao esta
concluida, mas a adocao permanece pendente. Nenhuma estacao foi reiniciada
ou instalada manualmente e nenhuma limpeza remota foi executada.
