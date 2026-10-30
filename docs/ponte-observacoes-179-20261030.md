# Ponte 1.7.9 — posicao e destaque das observacoes

Os quadros passam a usar a mesma ancora relativa a cada pagina: borda esquerda,
12 pontos abaixo da borda inferior. Foi removido o deslocamento acumulado por
modelo. O nome do modelo/face aparece em negrito com 14 pontos; o texto das
observacoes continua com 10 pontos. Titulos longos quebram em linhas.

As observacoes por produto e as anotacoes do modelo continuam juntas no quadro,
na camada bloqueada da numeracao. Reabrir pelo Imposition atualiza a referencia.
Nenhuma referencia participa da exportacao do PDF. Camadas de arte, tamanhos de
pagina, cadastro e regras de frente/verso permanecem inalterados.

Fonte local: imposition-coreldraw-20261030/ponte_imposition/corel_adapter.py e
corel_notes.py; runtime 1.7.9. Build isolado ponte-build-corel-20261030-11.

Prova sintetica real no Corel: duas paginas com quadros de alturas distintas,
mesma ancora (0, -12 pt), referencias bloqueadas, PDF com as mesmas dimensoes e
sem quadros. Precisao COM verificada com tolerancia de 0,001 pt; a leitura inicial
estava em polegadas, corrigida apenas no teste. Arte original preservada.
Evidencia local: %TEMP%/corel-fixed-notes-_zaqhxrp/prova.cdr, saida.pdf e novo0.png.

Mantida a correcao 1.7.8: consulta produtos_proposta.amostra_obs, nao a coluna
inexistente observacao_arte. Nenhum pedido real foi alterado nos testes.

## Adocao e recuperacao

Sair da ponte, baixar novamente pelo Imposition e instalar 1.7.9. A publicacao
nao atualiza automaticamente as estacoes. Reabrir pelo botao CorelDRAW para
recriar os quadros; CDRs mantidos abertos nao recebem alteracoes automaticamente.
Versao anterior do instalador preservada no Drive; retorno pelo instalador,
sem excluir documentos ou backups. Nao retornar a 1.7.7 (consulta incorreta).

## Retomada

Confirmar 1.7.9 na estacao e abrir um pedido com dois modelos e observacoes.
Trocar entre paginas: o quadro deve manter a mesma posicao e o titulo deve
ficar em destaque. Conferir PDF exportado sem referencias. Esse teste autenticado
na estacao do designer e a prova de impressao nao sao comprovados pela publicacao.
