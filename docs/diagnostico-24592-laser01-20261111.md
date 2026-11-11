# Pedido 24592 — impressão incompleta na LASER-01

Investigação somente de leitura dos três logs fornecidos pelo usuário em
11/11/2026. Origem: `Desktop/AAA IMPOSIÇÃO/agent.log.txt`, `agent.log.1` e
`agent.log.2`. Nenhum arquivo bruto foi copiado ao repositório.
Horários abaixo são os registrados pelo relógio da estação.

## Conclusão demonstrada

A entrega progressiva interrompeu a geração enquanto o envio do miolo ao
spool ainda estava em andamento. `EntregasPendentes.esperar()` limita a espera
a 300 segundos. O frontend confirma o lote somente depois de `entrega.enviar()`.
Em dois casos o envio experimental GDI de 100 páginas excedeu esse prazo.

| Modelo | Início do trabalho | Interrupção da geração | Envio do miolo concluído no Windows |
|---|---|---|---|
| 1005819 — CHANCE EXTRA | 10/11 18:13:59 | 18:19:15: lote não confirmado | 18:19:49, spool 10, 100 páginas, 334,177 s |
| 1005818 — FABRICA DE SONHOS | 11/11 11:18:31 | 11:23:51: lote não confirmado | 11:24:17, spool 59, 100 páginas, 329,965 s |

Referências no `agent.log.txt`: identificação 31173 e 35279; interrupções
31211 e 35339; envio tardio 31214 e 35345. A ligação do envio ao modelo é pela
sequência temporal do trabalho; as linhas do spool não incluem o modelo.

O traceback passa por `engine.py`, append do miolo, `app.py:on_file_gen` e
`entrega_progressiva.py:esperar`. No fluxo strict_assembly, a sequência é capa,
miolo, contracapa, próxima camada. A exceção no append do miolo interrompe
essa sequência, antes da contracapa e dos conjuntos posteriores. Isso é
compatível com capas e miolo faltantes; não é necessário supor perda no driver
para explicar a interrupção da geração.

O log registra 725 folhas de imposição / 5800 itens / oito poses para FABRICA
DE SONHOS e 50 folhas / 400 itens / oito poses para CHANCE EXTRA. Não confundir
esses valores com páginas do PDF ou quantidade de folhas físicas entregues.
Os miolos observados tinham 100 páginas e renderização GDI de aproximadamente
322–326 segundos. O PDF de poucos MB se transforma em cerca de 2,61 bilhões
de bytes RGB acumulados ao renderizar 100 páginas; isso não é prova de RAM
simultaneamente ocupada nem de falta de memória.

## Outras tentativas

- CHANCE EXTRA, 10/11 18:00:20: conexão encerrada às 18:03:41 (linha 31018);
  miolo de 100 páginas ainda foi reportado enviado às 18:06:12 (spool 250).
- FABRICA DE SONHOS, 11/11 08:27:56: conexão encerrada às 08:29:08 (33124);
  não há conclusão do miolo nessa sequência antes de reinícios do agente.
- FABRICA DE SONHOS, 11/11 11:08:15: conexão encerrada (35174), seguida por
  envio de duas páginas (35177).
- Há tentativas que terminaram gerando/enviando somente duas páginas. Elas
  não comprovam recuperação integral da tiragem. O log não permite afirmar
  qual opção de refazer ou seleção o operador utilizou.
- Há erros de porta 9001 já ocupada e tentativas de abrir outra instância.
  São ocorrências secundárias; não foram atribuídas como causa do timeout.

## Limites e próximo passo

O erro por prazo é confirmado. O motivo específico das desconexões não está
demonstrado: cancelamento, fechamento/recarregamento do painel ou outro corte
da conexão não podem ser distinguidos com esses registros.
Spool enviado não comprova papel impresso nem quantidade física faltante.
Não reenviar automaticamente: um lote continuou sendo enviado após a exceção,
e uma repetição integral pode duplicar a parte já produzida.

Correção a preparar em tarefa autorizada: permitir acompanhar um envio ativo
demorado sem encerrar a geração aos 300 segundos, mantendo limites para envio
travado, cancelamento e proteção contra duplicação. Reproduzir com driver
simulado que leva mais de 300 s (relógio simulado), confirmar que a próxima
contracapa/camada só avança após confirmação e testar desconexão/erro real.
Não alterar blocagem, quantidades, numeração ou status como contorno.

Nenhuma correção no protocolo de impressão foi aplicada nesta investigação.
A implementação paralela dos logs remotos encontra-se documentada em
`logs-remotos-estacoes-20261111.md`; ainda não foi publicada/instalada.
