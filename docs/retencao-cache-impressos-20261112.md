# Retenção de cache dos pedidos impressos

Implementação na branch `fix/cache-impressos-20261112`, baseada em
`7ef0021d` (NewProd 1.4.12). A política foi solicitada depois da ampliação
do catálogo: pedidos marcados Impresso devem sair do cache.

## Critério

A nova operação autenticada `piloto-local/estado-cache` é somente leitura.
Ela valida estação, permissões e empresa e consulta todos os modelos de
cada pedido solicitado, com paginação e limites explícitos. Só confirma
`impresso=true` quando existe o pedido, existem modelos e todos têm
`status_impressao` igual a Impresso, desconsiderando apenas caixa/espaços.
Status comercial, ausência de resultado, falha de rede ou resposta
incompleta não autorizam descarte. Não altera nenhum status no servidor.

O agente consulta até 32 pedidos locais a cada minuto, em rodízio com
cursor persistido. Só aceita recibo de até 120 segundos e correspondência
exata dos pedidos solicitados. A limpeza é oportunista: aguarda produção,
spool, preparação, seleção, leitura e sincronização ficarem livres.
Pausa ou encerramento da coleta também impedem limpeza.

## O que é retirado

Para cada pedido confirmado e seguro, são retirados os registros dos seus
modelos em `catalogo`, `catalogo_arquivo`, `coletas`, `origens`,
`conferencias`, `modelos_pedidos` e no índice de pacotes. Saem também o
snapshot em `revisoes_pedidos_piloto`, a abertura/preferência automática e
o cursor específico daquele pedido. Estados de preparação e tentativas
em memória são descartados.

Objetos PDF e demais recursos só são excluídos quando nenhum pacote,
coleta ou manifesto restante os referencia. A seleção dos caminhos usa
somente SHA-256 validado e recusa links/junctions e alvos fora da pasta de
objetos. Não há varredura ou limpeza recursiva de TEMP, de pastas pessoais
ou da instalação. O caminho de armazenamento é o `ServicoPacotes.raiz`
validado da estação: em PC-JR-HOME, o perfil atual usa
`C:\Users\Junior\AppData\Local\NewProd Piloto\dados`, com objetos sob
`pacotes\<hash-da-empresa>\objetos\<sha256>`.

SQLite e índice de pacotes são alterados na mesma transação com ATTACH;
modos de journal incompatíveis são recusados. A exclusão física ocorre
depois do commit e usa diário persistido `cache_objetos_pendentes`.
Arquivo ocupado é tentado novamente; referências recriadas são conferidas
antes de cada novo ciclo. A trava de cache não fica retida durante espera
do checkpoint de download por ociosidade da impressão.

## O que permanece

- Histórico de impressão, confirmações locais, configurações e bases QR.
- Arquivos compartilhados com qualquer outro pedido/revisão.
- Pedidos parciais, referências ambíguas ou modelos ausentes no recibo.
- Pedidos com confirmação pendente, decisão manual pendente, conflito ou
  publicação de faixa ainda não enviada.
- Capturas manuais/entradas online que possam ser a única cópia original.
- Catálogos globais e fontes/dependências compartilhadas da estação.

A coleta por pedido também deixa de baixar modelos impressos. A abertura
explícita para reimpressão continua autorizada e busca os recursos novamente
na nuvem; após descarte, esses pedidos deixam de estar disponíveis offline.
Os pedidos pendentes continuam com suas cópias offline.

Os objetos excluídos liberam bytes em disco. As páginas SQLite liberadas
ficam disponíveis para reutilização; não há VACUUM nem promessa de redução
imediata do tamanho dos arquivos SQLite. As métricas de retenção enviam
apenas contagens, bytes, horário e estado, sem IDs ou caminhos privados.

## Validação local

- 222 testes Python aprovados em retenção, catálogo, pacotes, coleta,
  offline, seleção, reimpressão, controle de produção e telemetria.
- Um teste de symlink real ignorado porque a conta não permite criá-lo.
- Um aviso preexistente de depreciação Starlette/httpx.
- 56 testes Deno do domínio piloto aprovados, incluindo a rota autenticada,
  paginação, modelo pendente após a primeira página, isolamento e reimpressão.
- `git diff --check` aprovado.

O Deno padrão falhou na resolução local de `npm:@types/node`. Foi usado o
ambiente já disponível com `--no-config --no-lock --cached-only
--node-modules-dir=none --allow-env --allow-read`, sem instalar dependências
e sem acesso de rede nos testes. A nova suíte de retenção foi adicionada ao
verificador dos canais para futuras entregas do agente.

## Situação da entrega

### Temporários e fontes — ampliação solicitada

`retencao_fontes.py` trata também arquivos legados no diretório exclusivo
`pasta_local()/fonts_cache`: nomes SHA-256 `.fonte` e downloads incompletos
`.fonte.<pid>.tmp`. Não adota arquivos do TEMP pela aparência. Os `tmp*.ttf`
soltos e `_MEI` sem marcador permanecem sem prova de autoria e não são apagados.
Não toca em `Windows/Fonts`, fontes instaladas por usuário, `fonts/` da
aplicação, configurações nem originais. A limpeza já existente dos trabalhos
marcados e bundles `_MEI` identificados continua com prazo de 24 horas.

A cada hora o cache de fontes pode remover arquivos sem uso há 30 dias e,
acima de 512 MiB, os mais antigos, preservando as últimas 24 horas. Downloads
incompletos identificados podem sair após 24 horas. Leituras atualizam o
último uso e compartilham trava com a limpeza. A limpeza valida raiz absoluta,
filhos diretos, ausência de links/junctions/hardlinks e arquivo inalterado.
Falhas de remoção preservam o arquivo para o próximo ciclo.

Proteção conservadora: **qualquer modelo/pedido ainda no catálogo, arquivo,
coletas ou snapshots, ou confirmação/faixa offline pendente, protege todo o
cache de fontes**, inclusive fontes de fallback cuja URL não consta no pedido.
O teto não supera essa proteção. A eliminação de todos os pedidos impressos
permite a retenção no próximo ciclo horário. Isso não garante teto rígido em
estações permanentemente com pendências; a telemetria informa `protegido` e
`acima_limite`. A execução usa as mesmas travas de produção/admissão e verificação
de spool da retenção dos pedidos. Pausa ou falha de confirmação mantém o cache.

Testes sintéticos cobrem legado exclusivo, Windows e TEMP preservados, prazo,
teto, último uso, leitura concorrente, hardlink, junction, arquivo bloqueado e
proteção real de um pedido até a confirmação de Impresso. Nenhum teste usa o
perfil real da estação para essa limpeza.

Validação da ampliação: 123 testes aprovados e 1 ignorado em cada canal
(`producao`, `piloto`, `oficial`), abrangendo retenção, temporários, bundles,
telemetria, fontes instaladas, recursos locais e alternância de fontes no motor.
O teste ignorado exige privilégio para criar symlink; a recusa de junction é
também exercitada com simulação. Permanece o aviso Starlette/httpx preexistente.
Não foi executado build nem teste contra dados reais nesta ampliação.

Na preparação e nos testes sintéticos não houve exclusão de dados reais.
Esta política não integra a versão 1.4.12; a entrega preparada é 1.4.13.
Servidor antigo que não reconheça `estado-cache` faz o agente conservar os
arquivos. A situação da publicação e da instalação está registrada abaixo.

Antes da ativação, registrar a prévia dos alvos e o backup recuperável das
estações. Após a entrega, conferir versão, métricas de retenção, bytes em
disco e abertura/reimpressão autenticada. Para interromper a política,
pausar a coleta até uma versão corretiva; cópias já retiradas precisam ser
baixadas novamente. Nenhuma recuperação deve reverter estados comerciais.

## Entrega 1.4.13 — 12/11/2026

- Fonte: commit `e2c6fb97`, tag `agente-v1.4.13`, branch publicada no GitHub.
  A base é a versão do agente distribuída, não um merge amplo de `main`, que
  tem evolução diferente. O site público não foi alterado.
- Validação completa: **1.344 testes Python aprovados, 3 ignorados e 2
  subtestes aprovados em cada canal** (`producao`, `piloto`, `oficial`), mais
  24 harnesses de interface por canal. Permanece o aviso Starlette/httpx.
  Os 56 testes Deno do domínio piloto passaram sem rede/dependências novas.
- `piloto-local` passou da revisão 39 para **40**, ACTIVE, com a autenticação
  existente preservada (`verify_jwt=false` e credencial/permissões no handler).
  Antes da entrega, os arquivos publicados coincidiam com a base. Depois,
  os **18 arquivos baixados do servidor** coincidiram com a fonte entregue.
  Nenhuma outra função, migração, status de pedido ou dado comercial foi escrito.
- Prova autenticada somente leitura: 32 pedidos locais consultados, 25
  confirmados impressos e 7 preservados. Pedido **24984 não impresso**,
  com um modelo, foi preservado. A mesma chamada sem credencial retornou 401.
- MSI: `NewProdPiloto_Oficial_v1.4.13.msi`, **196.890.624 bytes**, SHA-256
  `0c4dd65081759bea16bee5ecccb7277643185807efa6993b205025216dfd6a08`.
  Download público integral conferido. ProductVersion 1.4.13, módulos de
  retenção presentes, limite de catálogo 16.384, auditoria de segredos aprovada.
- EXE: SHA-256
  `4119cc287304d5c8a4efac5c061f84bbbfc8d1c2974eb03be13b97ce186ad9e4`.
- PC-JR-HOME antes da instalação: catálogo 4.123, arquivo 9.518, coletas
  13.641, vínculos 4.094 e snapshots 1.239; integridade SQLite `ok`.
  Fila ociosa, sem preparação pendente, coleta pausada para instalação.
- Backups cifrados e verificados em `%LOCALAPPDATA%/<canal>/gestao/backups`:
  Agent `runtime-20261112T171719Z-876e5fd6.iib` e Piloto
  `runtime-20261112T171719Z-d0aa293a.iib`. Exigem a mesma conta e respectivas
  `backup-chave.dpapi`. Escopo: configurações/SQLite, não PDFs, QR ou nuvem.
  EXE anterior e snapshot da impressão autônoma também preservados em
  `C:\Users\Junior\AppData\Local\NewProd Agent\gestao\recuperacao-antes-1413`,
  com ACL restrita. Restaurar apenas metadados não recupera PDFs descartados;
  a recuperação normal do cache é nova consulta/download do pedido.

Provas locais estão em `.tmp/testes-canais.json`, `.tmp/testes-oficial.json`,
`.tmp/deno.log`, `.tmp/pacote-verificado.json`, `.tmp/servidor-validado.json`,
`.tmp/servidor-fonte-conferida.json`, `.tmp/backups-1413.json` e
`dist/publicacao-unica-1.4.13-*`. Esses arquivos não contêm credenciais.

### Resultado da ativação e primeiro ciclo real

`newprod-piloto-oficial.json` e `latest.json` confirmados publicamente em
**1.4.13**, mesmo hash/tamanho, sem restrição por estação. O manifesto de
teste continua 1.3.35. Não houve sobrescrita do objeto MSI já verificado.

PC-JR-HOME: atualização `validado` às **17:25:36 UTC (14:25:36 BRT)**,
EXE instalado com hash idêntico, `/api/status` 1.4.13, `/app/` HTTP 200 e
porta 9001 somente em 127.0.0.1. Filas local/autônoma/remota e spool foram
verificados vazios antes do instalador; nenhuma fila foi descartada. Os
contadores permaneceram idênticos após o upgrade e antes de retomar a coleta.
Ensaio de restauração em pasta nova protegida conferiu 19 arquivos; configurações
de formato, acessos, impressão, hotfolders, ICC, identidade e perfil preservadas.
Envelopes DPAPI foram comparados pelo conteúdo sem registrar valores secretos.

Coleta retomada. Primeiro ciclo confirmado às **14:26:10 BRT**:

| Evidência local | Resultado |
|---|---:|
| Modelos retirados | 92 |
| Bytes de objetos removidos | 126.015.985 |
| Catálogo | 4.123 → 4.019 |
| Arquivo de revisões | 9.518 → 9.049 |
| Coletas | 13.641 → 13.068 |
| Vínculos modelo/pedido | 4.094 → 4.002 |
| Snapshots de pedidos | 1.239 → 1.214 |
| Pedido 24984 | 1 modelo preservado |
| SQLite após limpeza | `quick_check=ok` |
| Cache de fontes | Protegido por pendências, abaixo do teto, 0 erros/remoções |

Este é um ciclo observado, não a conclusão de toda a varredura. A limpeza
continua em lotes e pode ser adiada pelo uso da estação. Não houve geração ou
impressão física de teste nem reimpressão autenticada de um pedido descartado.

Telemetria das outras estações às **14:26 BRT**, ainda sem adoção da 1.4.13:

| Estação | Versão observada | Situação registrada antes desta entrega |
|---|---|---|
| GUSTAVO-PROD | 1.4.7 | `agente_ainda_executando`, alvo antigo 1.4.11 |
| LASER-01 | 1.4.11 | `sem_confirmacao_apos_reinicio`, alvo antigo 1.4.11 |
| LASER-02 | 1.4.12 | Instalação anterior validada |
| TEX-01 | 1.4.12 | Confirmação do reinício anterior pendente |
| TEX-02 | 1.3.21 | MSI 1603 no alvo antigo 1.4.11 |

LASER-04/LAPTOP ainda 1.4.11 e RIP-EPSON-WF2 1.4.12. Manifesto disponível não
comprova instalação ou limpeza remota. Nenhuma estação remota foi reiniciada.
O atualizador consulta automaticamente em intervalo de seis horas; o operador
pode usar Atualizar agora quando a estação estiver ociosa. Falhas anteriores
de instalação exigem diagnóstico do respectivo log, sem forçar sobre produção.

Provas adicionais: `.tmp/instalacao-confirmada.json`, `.tmp/preservacao-1413.json`,
`.tmp/retencao-executada-local.json`, `.tmp/frota-final.json`. Para interromper a
retenção, pausar a coleta. A função anterior está preservada em
`.tmp/server-before`; eventual reversão do agente deve ser publicada sob uma
versão superior, pois o atualizador não aplica downgrade. Não restaurar status
comerciais nem presumir que o backup de metadados contenha os PDFs removidos.
