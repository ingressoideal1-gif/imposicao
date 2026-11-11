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

Nenhum pedido foi reimpresso e nenhuma estacao foi reiniciada durante o desenvolvimento.

## Entrega verificada

Fonte do agente: `704c00ea`, tag `agente-v1.4.11`, branch `fix/impressao-autonoma-20261111`. MSI `NewProdPiloto_Oficial_v1.4.11.msi`, 196853760 bytes, SHA-256 `d642e5df2dcf6ec99102a27407685843a483c20b689cdacddf38d833dde9c489`. ProductVersion, modulos de impressao autonoma/SQLite, cinco assets embutidos e ausencia de dados privados conferidos. Executavel Piloto tambem compilado e auditado, sem instalacao.

Baterias do agente: Producao 1289 aprovados, Piloto e Oficial 1291 cada; todos com dois skips preexistentes e dois subtestes aprovados. Os testes adicionais de trava entre processos e OutputIntent passaram separadamente; por isso as contagens diferem entre rodadas. Todos os harnesses dos tres canais passaram. Web: 912 aprovados e dois skips em cada canal, com Mapas de Teatro aprovado apos adaptar a chamada ao fluxo web. Oito contratos adicionais da chamada do Pedido passaram em cada fonte (agente e web).

Upload publico completo conferido por tamanho e SHA-256 antes de ativar `latest.json` e `newprod-piloto-oficial.json` em 1.4.11. Canal de teste permaneceu 1.3.35. Recibos e manifestos anteriores preservados em `dist/publicacao-unica-1.4.11-*`.

A publicacao web esta no PR #279, commit `b3561d4fbf8cd385f64a19ba299b2e430ff125b9`, preservando a main atual. Em 11/11/2026 20:49 UTC, o workflow obrigatorio `43096995555` permanecia queued, sem jobs iniciados, desde 20:35:58 UTC. PR nao integrado e assets publicos da web ainda nao substituidos. O MSI oficial contem seu proprio painel corrigido, independente dessa publicacao web.

Ultima consulta da LASER-01: heartbeat 20:49:12 UTC (17:49 Brasilia), ainda 1.4.10, painel saudavel na porta 9001. GUSTAVO-PROD: ainda 1.4.7, painel saudavel, tentativa anterior de atualizacao sem confirmacao por agente ainda executando. Nao se forcou atualizacao ou encerramento. Publicacao nao comprova adocao nem impressao fisica.

Retomada: depois de confirmar 1.4.11 na estacao e conferir trabalhos anteriores, validar um pequeno trabalho autorizado com capa e miolo frente/verso, fechar/reabrir o painel durante o envio e conferir a fila e as folhas. Nao reimprimir automaticamente a OS inteira. Recuperacao de release exige nova versao superior, preservando registros locais e conferindo qualquer envio incerto; nao forcar downgrade.
