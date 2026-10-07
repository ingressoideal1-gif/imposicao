# Retorno da GUSTAVO-PROD ao NewProd Original

Pedido humano de 07/10/2026: preparar instalador de retorno devido a lentidao
relatada no Piloto. Esta entrega nao diagnostica a causa nem comprova melhoria
de desempenho ou instalacao na estacao.

## Pacote e uso

`NewProd_Original_Retorno_v1.2.370.msi`, 158289920 bytes.
SHA-256: `990628ed1f0254d21451e8d29937624256eb159a497c9e79ba6307ca106c7e3d`.

Somente para GUSTAVO-PROD, executado na mesma conta Windows do NewProd.

1. Concluir os trabalhos na fila das impressoras.
2. No icone NewProd ao lado do relogio, escolher Sair. Fechar o navegador
   sozinho nao encerra o agente.
3. Executar o MSI, sem desinstalar manualmente a versao atual. Nao usar outra
   conta administrativa: a instalacao e por usuario.
4. Abrir o atalho **NewProd Original**, depois `http://127.0.0.1:9000/app/`.
5. Conferir versao 1.2.370, impressoras/configuracoes e uma impressao pequena
   autorizada pelo operador. Comparar o mesmo pedido para avaliar desempenho.

Se o instalador recusar por agente aberto ou fila ocupada, a troca nao deve
prosseguir; concluir o trabalho e sair do agente antes de tentar novamente.
Em outra falha, guardar o erro e nao apagar as pastas de dados. Para gerar log:
`msiexec /i "NewProd_Original_Retorno_v1.2.370.msi" /L*v "%TEMP%\NewProd-retorno-original.log"`.

## Implementacao e recuperacao

Base original anterior a migracao: commit `048e3006`, agente de producao 1.2.363,
porta 9000. Motor/PDF/frontend dessa base permanecem sem alteracoes. A numeracao
1.2.370 permite ao Windows substituir 1.2.368/369 pelo mesmo UpgradeCode;
ela nao significa uma nova versao do Piloto. Nenhum MSI anterior foi alterado.

Entrada explicita de producao remove ambiente herdado do Piloto. Usa o painel
embutido; cache de painel anterior permanece em disco, mas nao e servido.
Atualizacao automatica de agente e de painel fica suspensa neste pacote,
inclusive pelo menu. A retomada exige uma nova entrega deliberada.

Preflight valida nome da estacao, conta/pasta, portas 9000/9001, processos e
filas Windows. Nao mata processos nem cancela impressao. Antes da remocao do
MSI anterior, preserva seu executavel por hash em
`%LOCALAPPDATA%\NewProd Dados Protegidos\retorno-original`, com ACL privada;
cria backups cifrados de configuracoes/SQLite pelo mecanismo existente em
`gestao\backups`, e preserva pool/credencial pelo migrador existente. A recuperacao
dos backups exige a chave DPAPI e a mesma conta Windows. Dados do Piloto e
perfil-oficial.json permanecem em disco; a entrada original nao ativa esse perfil.
Nao altera pedidos no banco nem reproduz trabalhos anteriores.

Rollback transacional de arquivos MSI e mantido pelo Windows Installer. Copia
do executavel anterior fica disponivel para recuperacao assistida; reinstalar
um MSI numericamente inferior sera bloqueado pelo Windows. Nao executar ambas
as versoes simultaneamente. Este retorno nao pode ser distribuido como release
geral nem integrado a main substituindo o produto oficial.

## Validacao

- 461 testes + 2 subtests em cada canal producao/Piloto, 2 skips por canal;
  todos os harnesses JS/browser da conferencia dos canais passaram.
- 28 testes de retorno, preservacao e seguranca passaram, incluindo estacao
  incorreta, processo ocupado, falha de backup, identidade/configuracoes intactas,
  ambiente de producao e bloqueio de consultas/instalacoes automaticas.
- Auditoria de EXE, preservador e MSI: sem arquivos privados/modulo de segredo.
- Codigo extraido dos executaveis confere com entrada, worker, app, versao,
  tray e preservador da fonte; metadata MSI confirma produto, versao e upgrade.
- As primeiras regressoes detectaram dependencia JS ausente nesta worktree e
  fixture isolada sem `os`; corrigidos com ambiente existente e fixture completa.
- Nenhuma instalacao, impressao fisica ou medicao real de desempenho foi
  executada na GUSTAVO-PROD nesta preparacao.

Evidencias: `dist/verificacao-retorno.json`, `dist/publicacao-retorno.json`,
`tmp_regressoes.log`, `tmp_testes_retorno.log`, `tmp_build.log`, `tmp_msi.log`.
Disponibilizacao do binario nao modifica os manifestos automaticos da frota.
