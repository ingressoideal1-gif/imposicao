# Retenção de cache dos pedidos impressos

Implementação local na branch `fix/cache-impressos-20261112`, baseada em
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

Nenhuma exclusão foi feita em dados reais. Esta política ainda não está na
versão 1.4.12 distribuída. A ativação exige uma nova entrega do agente e a
publicação da função `piloto-local`, preservando as alterações posteriores
do ambiente publicado. Servidor antigo que não reconheça `estado-cache`
faz o agente conservar os arquivos.

Antes da ativação, registrar a prévia dos alvos e o backup recuperável das
estações. Após a entrega, conferir versão, métricas de retenção, bytes em
disco e abertura/reimpressão autenticada. Para interromper a política,
pausar a coleta até uma versão corretiva; cópias já retiradas precisam ser
baixadas novamente. Nenhuma recuperação deve reverter estados comerciais.
