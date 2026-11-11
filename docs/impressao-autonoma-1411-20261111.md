# Impressao progressiva independente do painel — NewProd 1.4.11

## Problema e comportamento

Na OS 24592, Laser 01, o envio progressivo dependia da conexao HTTP do painel para confirmar cada lote e liberar o proximo. Arquivos locais nao removiam essa dependencia. A simulacao anterior reproduziu a parada ao desconectar durante o quarto envio.

No fluxo de impressora local com entrega progressiva, o agente agora aceita um trabalho, registra seu identificador em SQLite e assume geracao e envio. Cada lote de ate dez paginas segue imediatamente para o servico de impressao existente; o proximo so e gerado depois do retorno desse servico. O painel consulta andamento e solicita cancelamento explicitamente. Fechar ou recarregar a pagina nao cancela o trabalho.

O painel reaberto mostra os trabalhos recentes da estacao. Em site hospedado, preserva somente o endereco local da estacao (portas 9000/9001), sem tokens ou dados de arte no armazenamento do navegador. Quando a resposta ao aceite e perdida, nao repete o POST: a consulta permite localizar o trabalho.

## Seguranca e recuperacao

- Estado e identificador de cada envio persistidos antes de chamar o driver. Repetir um identificador nao inicia outro trabalho; reutiliza-lo com conteudo diferente e recusado.
- Uma trava de processo impede dois agentes de recuperar o mesmo registro. Uma reserva exclusiva impede intercalar a fila remota ou outro envio local enquanto o trabalho autonomo esta ativo e bloqueia atualizacoes durante a impressao.
- Cancelamento para os proximos lotes depois do envio em curso; nao remove trabalhos do spool do Windows.
- Reinicio com trabalho pendente ou falha durante o envio exige conferencia da fila e do papel. Nao ha retomada ou reenvio automatico. O operador encerra a pendencia apos conferir e usa Refazer para a parte realmente faltante.
- SQLite guarda somente estado, contagens e identificadores, sem artes, credenciais ou mensagens brutas do driver. Temporarios continuam sob responsabilidade do agente e sao liberados quando o motor termina.
- As novas rotas /api/print/trabalhos usam identidade e permissao de impressao existentes. O aceite em /api/impose exige tambem permissao de impressao, alem da permissao de geracao.

## Capas e escopo

Capas e contracapas permanecem na ordem do motor, com a escolha de bandeja ja existente. Refazer Capas envia somente a capa de abertura dos blocos selecionados. Refazer Folhas continua sendo somente miolo; a ajuda da tela agora explicita essa distincao. Nos registros consultados da OS, os envios recentes estavam identificados como reimpressao de miolo; isso nao prova qual opcao foi selecionada na estacao nem confirma impressao fisica de capas.

Selecao de frente/verso e rotacao das paginas pares passam a ocorrer localmente para esses envios, preservando o OutputIntent do PDF. Nao se alteram numeracao, quantidades, empilhamento, opcoes de duplex, modo de driver, DPI ou perfis de cor. Hot Folder, ordem reversa e fluxos sem entrega progressiva conservam seus caminhos existentes. A lentidao de rasterizacao e a opcao de driver somente frente observadas na Laser 01 sao questoes separadas.

## Validacao

Testes novos: sequencia de lotes sem navegador; identificador repetido; admissoes concorrentes; cancelamento durante envio; falha com resultado incerto; encerramento abrupto de subprocesso e recuperacao sem reenvio; exclusao entre processos; permissao nas rotas; bandejas; faces/rotacao e OutputIntent.

Teste HTTP/Chromium: fechar a janela durante o trabalho e reabrir, concluir 110 paginas em 15 lotes sem duplicacao, conferir duas capas de abertura por Refazer Capas e cancelar outro trabalho depois de seu primeiro envio. O motor e o ramo de aceite reais foram executados com PDFs sinteticos; somente o destino fisico foi substituido. Nao comprova comportamento do driver da Laser 01, consumo de papel ou resultado autenticado de producao.

Regressao inicial apontou falta do novo JS na lista de sincronismo; corrigida em security_config.py. Teste adicional detectou que selecionar paginas com Document.select retirava OutputIntent; a implementacao usa remocao das faces no documento original e a regressao passou.

Resultados dos tres canais, hashes de artefatos e provas de publicacao serao registrados apos a conclusao da entrega. Nenhum pedido foi reimpresso e nenhuma estacao foi reiniciada durante o desenvolvimento.
