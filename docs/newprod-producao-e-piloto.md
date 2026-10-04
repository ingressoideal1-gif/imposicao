# NewProd: producao e Piloto

As duas variantes usam a mesma fonte Python e frontend. Correcao compartilhada
deve passar nos testes dos dois canais antes de qualquer entrega. Os recursos
experimentais permanecem opt-in; nao substituir o codigo completo por uma copia
antiga de outro checkout.

| Aspecto | Producao | Piloto local |
|---|---|---|
| Entrada | agent_tray.py / NewProd.exe | agent_piloto.py / NewProdPiloto.exe |
| Porta | 127.0.0.1:9000 | 127.0.0.1:9001 |
| Instalacao | LocalAppData/NewProd Agent | LocalAppData/NewProd Piloto/versoes |
| Identidade e cache | NewProd Agent | NewProd Piloto |
| Dados protegidos | NewProd Dados Protegidos | NewProd Piloto Dados Protegidos |
| Coleta experimental | Desativada | Catalogo/pacotes/diario preservados em NewProd Piloto/dados |
| Fila remota e heartbeat | Comportamento normal | Nao consume nem publica na fila de producao |
| Atualizacao | Manifesto padrao e sincronismo web | Pacote proprio completo; nao usa o manifesto nem sincronismo padrao |
| Consulta de pacotes | Fluxo normal existente | Edge Function independente piloto-local, somente leitura |

O Piloto verifica a revisao ao abrir ou reabrir o pedido e preserva os dados completos do
modelo, NI/NF, bancos, TICKET e regras de Multi-Artes. Ainda existem dependencias
online; nao afirmar processamento integral offline. Conferencia visual e
impressao fisica devem ser registradas separadamente dos testes sinteticos.

O Piloto .21 prepara os modelos do pedido em uma listagem paginada, prepara ate quatro modelos em paralelo e consulta
as numeracoes completas em lote. Alternar modelos desse pedido reutiliza a
conferencia, sem repetir consultas nem atualizar ETags. Reabrir o pedido inicia
nova conferencia, inclusive de URLs cujos bytes mudaram. Mudanca no modelo
completo exige reabrir; respostas de aberturas abandonadas nao liberam modelos.
Modelos sem arte ou fora do catalogo aprovado continuam visiveis, mas nao sao liberados para impressao local. O limite por abertura e 128
modelos; pedidos maiores exigem ampliar o mecanismo antes de sua utilizacao.

As etapas da janela no Piloto usam dependencias e ordem de execucao, sem as
pausas fixas da interface normal. O resumo local le o catalogo em lote, com
uma conexao SQLite; mudancas fora da tabela de pedidos nao repintam seus selos.
Fontes servidas pela estacao tambem reconhecem a porta 9001. Fotos catalogadas
usam leitura autenticada e cache por revisao. O motor de PDF, tanto sincrono
quanto streaming, recebe referencias imutaveis dos pacotes conferidos e usa
seus recursos locais. Tamanho e SHA-256 continuam obrigatorios em cada leitura.
Recursos fora desse catalogo ainda podem exigir rede na preparacao anterior
ao primeiro PDF; nao declarar que todas as dependencias estao antecipadas.
O contrato de uploads, campos, bancos, NI/NF, TICKET e Multi-Artes permanece.

## Atualizar as duas variantes

1. Trabalhar em checkout isolado atualizado, preservando alteracoes existentes.
2. Aplicar a correcao na fonte comum. Mudanca exclusiva do Piloto exige guarda
   de canal e teste comprovando que o comportamento padrao continua preservado.
3. Rodar `python ferramentas/conferir_duas_versoes.py`. O CI executa producao e
   piloto separadamente; o check de seguranca obrigatorio depende dos dois.
4. Gerar o pacote independente com `ferramentas/compilar-piloto.ps1 -Python ...`.
   O publicar_agente.ps1 exige ambos os testes e este pacote antes do MSI normal.
5. Entrega web tambem exige a conferencia comum e pacote do Piloto atualizado,
   pois o painel experimental e distribuido inteiro no seu executavel.
6. Provisionar configuracoes e dados protegidos separadamente, sem inclui-los
   no executavel, repositorio ou pacote de distribuicao.
7. Instalar em nova pasta versionada, com backup cifrado dos dados e verificacao
   de hash. Atualizar versao-ativa.json e o inicializador exclusivo; nao escrever
   na instalacao, registro de inicializacao ou processo do NewProd de producao.
8. Conferir as duas APIs, processos, hashes e rotas. Gerar PDF sintetico e obter
   aceite visual/fisico do operador antes de afirmar validacao operacional.

## Instalacao e recuperacao

Abrir o Piloto por iniciar-piloto.ps1; ele valida o caminho e SHA-256 da versao
ativa, carrega somente o token DPAPI local e inicia a porta 9001. A coleta inicia
pausada. Retomar pelo painel autenticado ou controlar-piloto.ps1 -Acao retomar.
O comando de coleta nao envia impressao nem confirma status remoto.

Controlar a copia e os pedidos preferenciais exige editar Producao ou acesso
administrativo. O operador de impressao com essa permissao controla sua copia
local sem receber administracao. A grade continua sendo conferida no servidor;
quem tem apenas visualizacao acompanha os dados com os controles desativados.

"Iniciar copia local" inicia imediatamente uma varredura manual, priorizando
os pedidos marcados e atualizando suas copias. Essa copia nao aguarda a fila
do Windows ficar vazia, pois nao envia impressao nem altera trabalhos no spool.
Pausa, encerramento e processamento PDF/impressao ativo no proprio Piloto
continuam interrompendo a coleta. O modo manual termina ao concluir a varredura
ou ao pausar. A coleta automatica consulta o spool do Windows antes de copiar.
O catalogo preserva ate 4096 registros de modelos/revisoes; a fila simultanea
e os pedidos preferenciais continuam limitados a 128. As copias e o historico
existentes sao preservados, sem limpeza automatica para liberar espaco.
O pacote precisa incluir
win32timezone, utilizado dinamicamente por win32print.EnumJobs; a conferencia
do executavel recusa sua ausencia. Trabalho presente ou consulta indisponivel
mantem a coleta automatica em espera.

O painel em http://127.0.0.1:9001/app/ apresenta o selo visivel
"NewProd Piloto - porta 9001", inclusive na entrada. Na tela de impressao,
"Gerenciamento Local" mostra a coleta e os arquivos da estacao. Esse recurso
atua somente na porta 9001; o painel normal da porta 9000 permanece preservado.
As chamadas de Hot Folder e configuracao de impressao usam a mesma origem
do painel da estacao, incluindo hostname e porta. O Piloto nao deve consultar
ou registrar pastas no agente da porta 9000. A sessao local acompanha apenas
as chamadas da propria origem; nenhuma permissao e ampliada por essa escolha.
O rodape e a identidade da estacao na porta 9001 mostram o proprio Piloto.
Seu botao de atualizacao informa a versao instalada e o uso de pacote proprio;
nao chama o atualizador nem compara com o manifesto de producao.
O CI reproduz a renderizacao em navegador nos dois enderecos com dados sinteticos.

O seletor nativo de Hot Folder mantem uma janela por processo. Cliques repetidos
ou outra aba recuperam a mesma janela e aguardam a mesma escolha, sem gerar
o erro de seletor ja aberto. Janela minimizada ou oculta e restaurada; quando
o Windows recusa o foco, sua janela pisca. Cancelamento e erros liberam o estado
para uma nova tentativa. As chamadas ctypes preservam ponteiros de 64 bits;
COM recusado impede a abertura. A regressao faz parte dos checks dos dois canais.
O Piloto 1.2.356-piloto-local.19 inclui esse ajuste; sua instalacao independente
nao atualiza o executavel de producao. A fonte comum prepara a mesma correcao
para a proxima entrega normal, que continua sendo uma operacao separada.

Para rollback, encerrar somente NewProdPiloto.exe quando estiver ocioso e apontar
versao-ativa.json para o pacote anterior confirmado. Restaurar configuracoes e
dados em conjunto a partir do backup cifrado quando necessario, preservando o
diario. Nunca restaurar por cima do NewProd de producao nem limpar seu spool.

A instalacao nao altera permissao SQL ou configuracao global de impressoras.
As filas fisicas sao do Windows: a coexistencia dos agentes nao autoriza
impressao simultanea na mesma impressora sem coordenacao operacional.
