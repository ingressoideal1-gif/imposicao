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
| Fila remota e heartbeat | Comportamento normal | Publica presenca com identidade propria; nao consome fila remota |
| Atualizacao | Manifesto padrao e sincronismo web | Executavel proprio ou painel com base comprovada; nao usa o manifesto nem sincronismo padrao |
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

O Piloto .24 mostra um popup modal com a logo local da Ideal e o texto
"Aguarde, conferencia de dados" desde o clique para abrir o pedido. O popup
acompanha o carregamento e a conferencia, fecha ao concluir, retornar sem abrir
ou ocorrer erro; uma resposta antiga nao fecha o popup de uma abertura nova.
Alternar modelos nao inicia essa conferencia. A imagem integra o pacote proprio,
sem download externo, e o comportamento da producao permanece preservado.

A visualizacao da imposicao, ao selecionar um modelo, mostra a logo original
da Ideal e "Aguarde, gerando Imposição" nos dois canais. Reutiliza a logo ja
embutida no painel e apresenta um popup no centro da tela, independente da
posicao da linha do modelo e da rolagem. Mantem o descarte da previa anterior
e a liberacao pelo desenho atual; fechar a janela tambem remove o aviso.
O popup de conferencia do pedido continua exclusivo do Piloto.
O pacote .26 inclui esse ajuste comum;
a tela da producao recebe os mesmos arquivos pelo sincronismo do painel, sem
necessidade de substituir o executavel ou o MSI.

## Atualizar as duas variantes

O Piloto .27 substitui a conferencia remota por modelo por uma revisao do pedido
em snapshot consistente no banco. O recibo compacto da nuvem e consultado em
cada abertura, sem prazo de tolerancia. Modelos com copias atuais e fontes
versionadas sao reutilizados; recursos sem versao/ETag verificavel continuam
revalidando HTTP. O cache da revisao persiste na estacao e e independente por
pedido. Mudanca de modelo, banco compartilhado, produto, status ou objeto do
Storage altera a revisao, inclusive substituicao na mesma URL. Downloads exigem
uma nova consulta ao terminar; mudanca durante a copia bloqueia a liberacao.
Na abertura, copias reutilizadas conferem existencia e tamanho; a leitura real
da arte pelo painel/motor continua obrigatoriamente verificando SHA-256.
Nao ha notificacoes Realtime nesta etapa nem autorizacao de uso offline.
O NewProd padrao conserva seu fluxo; nao recebe o pacote nem o cache do Piloto.
Ver [registro da revisao por pedido](registro-2026-10-05-piloto-revisao-pedido.md).

1. Trabalhar em checkout isolado atualizado, preservando alteracoes existentes.
2. Aplicar a correcao na fonte comum. Mudanca exclusiva do Piloto exige guarda
   de canal e teste comprovando que o comportamento padrao continua preservado.
3. Rodar `python ferramentas/conferir_duas_versoes.py --base origin/main` para
   selecionar por impacto; sem `--base`, a bateria continua completa. O CI
   executa producao e piloto separadamente; seguranca depende dos dois.
4. Gerar o pacote independente com `ferramentas/compilar-piloto.ps1 -Python ...`.
   O publicar_agente.ps1 exige ambos os testes e este pacote antes do MSI normal.
5. Entrega web exige a conferencia comum e artefato do Piloto atualizado.
   O fluxo compara fontes, dependencias, protocolo e hash do executavel auditado:
   reutiliza o pacote identico ou prepara somente o painel compativel. Sem base
   comprovada, compila. A entrega separada do painel usa a pasta externa ja
   suportada pelo agente, mantendo o executavel. Ver [entrega por impacto](entrega-por-impacto.md).
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

O Piloto 1.2.356-piloto-local.22 corrige a carga da numeracao apos conferir o
pedido: o digest continua usando a linha bruta integral; uma copia passa pelo
mesmo normalizador do catalogo antes de entrar no estado da tela. METADATA
define o modo efetivo e nao vira elemento de impressao. Isso evita um falso
bloqueio na conferencia final, que continua recusando mudancas reais. A
conferencia por abertura do pedido e a troca rapida de modelos sao preservadas.
Os testes de carga e da barreira final rodam nos dois canais; a instalacao .22
atualiza somente o Piloto e preserva o NewProd padrao 1.2.356.

O [registro da entrega de 04/10/2026](registro-2026-10-04-piloto-desempenho-e-conferencia.md)
reune alteracoes, commits, versoes conferidas, testes, recuperacao e limites
da validacao da .22. Diagnosticos e inventarios de producao ficam no registro privado.

A revisao .23 corrige a publicacao concorrente de recursos com o mesmo hash.
Dois modelos podem compartilhar uma arte ou fonte: um objeto valido existente
nao deve ser substituido enquanto outro leitor o abre. O cache publica os bytes
completos sem overwrite e mantem a verificacao de integridade e o reparo de
corrupcao. Os testes reproduzem a disputa entre instancias independentes no
Windows, mantendo a preparacao paralela dos modelos e o comportamento opt-in.
