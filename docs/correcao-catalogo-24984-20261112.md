# Catálogo local — pedido 24984

## Diagnóstico

Em 12/11/2026, o diagnóstico `D-9782a9cadc93`, em PC-JR-HOME com
NewProd 1.4.11, registrou falha ao abrir o pedido 24984. A consulta local
somente leitura encontrou 4.096 revisões para 4.084 modelos e 9.518
revisões já arquivadas. As 12 revisões antigas restantes têm observações
referenciadas por pedidos; não podem ser arquivadas pela regra vigente.

## Mudança local

Base: `6029f669`, com a entrega 1.4.11. Worktree separado:
`imposition-catalogo-24984-20261112`, branch `fix/catalogo-24984-20261112`.

`pacotes_api.py` amplia o padrão e máximo aceito de 4.096 para 16.384
revisões, oferecendo quatro vezes a capacidade anterior sem eliminar o
teto. Limites explícitos menores continuam aceitos. O arquivamento e suas
proteções permanecem iguais. Não há alteração de schema, limpeza de banco,
remoção de PDFs, bases QR, pacotes, histórico ou referências de pedidos.

O novo teto também pode ser atingido no futuro. A ampliação permite maior
retenção de metadados e pode aumentar custo de listagens; não representa
capacidade ilimitada nem uma medição de desempenho com dados reais.

## Validação

Regressão sintética com 4.084 modelos e 12 revisões antigas protegidas:
falhou antes da correção com `CatalogoCheio` em `catalogo_revisoes.py:48`.
Depois da correção, reabriu o SQLite existente, preparou um pedido e leu
seu recurso sintético, preservando todas as 4.096 entradas e o histórico.
Outro teste verificou recusa segura com 16.384 últimas revisões.

Comando executado usando o Python do venv existente, sem instalação:

```text
python -E -s -m pytest -n 0 tests/test_catalogo_revisoes.py tests/test_pacotes_api.py tests/test_revisao_pedido_piloto.py -q
```

Resultado: 58 passaram; um aviso de depreciação de Starlette/httpx.
`git diff --check` passou. Os testes usam diretórios temporários, dados
sintéticos e transporte simulado, sem acessar o banco remoto.

## Instalação local autorizada e concluída

Após a autorização humana “instalar”, foi gerada e instalada a versão
1.4.12 somente em PC-JR-HOME. `agent_version.py`, `agent_installer.wxs` e
`compilar_msi.ps1` receberam a nova versão. Sem commit, push ou publicação
de manifestos; a versão pública consultada antes da instalação era 1.4.11.

Validação completa por `ferramentas/conferir_duas_versoes.py`: Produção,
Piloto e Oficial tiveram, cada um, 1.299 testes aprovados, 2 ignorados,
2 subtestes aprovados e 24 harnesses aprovados. Apenas o aviso conhecido
de Starlette/httpx. Build e auditoria do executável, preservador e MSI
aprovados, sem arquivos privados. A inspeção dos módulos embutidos confirmou
versão 1.4.12, limite 16.384 e presença da impressão autônoma.

Pacote: `dist/NewProdPiloto_Oficial_v1.4.12.msi`, 196.853.760 bytes,
SHA-256 `a20180b382a54be74d5566c235ebe87e9cea822d07e841fef80a046675a2b214`.
Executável instalado idêntico ao compilado, SHA-256
`5b161525ab052e37d21b80cd62e1a243d4260453451419aacd2eae9180d404c0`.

Antes da troca: filas remota/local/Windows vazias, nenhum trabalho autônomo
ativo e coleta pausada. Backups cifrados de configurações e SQLite foram
gerados e tiveram decifragem e integridade verificadas por `backup_gestao`:

- `NewProd Agent/gestao/backups/runtime-20261112T155605Z-298c31df.iib`;
- `NewProd Piloto/gestao/backups/runtime-20261112T155606Z-7e1bf796.iib`.

Caminhos relativos a `%LOCALAPPDATA%`. A recuperação requer a mesma conta
Windows e o `backup-chave.dpapi` do respectivo canal. O executável anterior
e snapshot do banco de impressão autônoma foram preservados na pasta com
ACL privada `NewProd Agent/gestao/recuperacao-antes-1412`.

O atualizador existente confirmou `etapa=validado`, versão 1.4.12,
em 12/11/2026 às 13:04:17 BRT. A API respondeu `NewProd 1.4.12`,
canal `piloto`, porta 9001; `/app/` respondeu HTTP 200. O processo foi
confirmado em `NewProd Agent/NewProd.exe`, escutando em 127.0.0.1.

Antes de retomar a coleta, foram confirmadas as mesmas 4.096 revisões,
9.518 arquivadas, 13.614 coletas e 1.233 revisões de pedidos, com SQLite
íntegro. Configurações mantiveram seus hashes, exceto `acessos_locais.json`:
o conteúdo decifrado foi comparado ao backup e permaneceu idêntico;
somente o envelope DPAPI mudou. A coleta voltou à preferência anterior
(`pausado=false`); spool permaneceu vazio.

Evidências locais em `.tmp/`: relatórios e logs de validação dos canais,
build/MSI, pacote, backups, preservação e instalação confirmada.
A abertura autenticada real do pedido 24984 e impressão física não foram
executadas nesta instalação; não foi enviado nenhum trabalho de impressão.

Uma reversão de código não exige migração, mas retornar ao teto antigo
com mais de 4.096 registros pode voltar a impedir novas admissões;
não reduzir o catálogo mediante exclusão para contornar isso.
