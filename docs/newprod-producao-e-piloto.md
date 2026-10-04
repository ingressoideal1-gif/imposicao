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

O Piloto verifica a revisao em cada selecao e preserva os dados completos do
modelo, NI/NF, bancos, TICKET e regras de Multi-Artes. Ainda existem dependencias
online; nao afirmar processamento integral offline. Conferencia visual e
impressao fisica devem ser registradas separadamente dos testes sinteticos.

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

O painel em http://127.0.0.1:9001/app/ apresenta o selo visivel
"NewProd Piloto - porta 9001", inclusive na entrada. Na tela de impressao,
"Gerenciamento Local" mostra a coleta e os arquivos da estacao. Esse recurso
atua somente na porta 9001; o painel normal da porta 9000 permanece preservado.
O CI reproduz a renderizacao em navegador nos dois enderecos com dados sinteticos.

Para rollback, encerrar somente NewProdPiloto.exe quando estiver ocioso e apontar
versao-ativa.json para o pacote anterior confirmado. Restaurar configuracoes e
dados em conjunto a partir do backup cifrado quando necessario, preservando o
diario. Nunca restaurar por cima do NewProd de producao nem limpar seu spool.

A instalacao nao altera permissao SQL ou configuracao global de impressoras.
As filas fisicas sao do Windows: a coexistencia dos agentes nao autoriza
impressao simultanea na mesma impressora sem coordenacao operacional.
