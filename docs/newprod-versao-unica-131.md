# NewProd: versão única a partir da 1.3.1

Decisão do usuário em 14/10/2026: a NewProd 1.3.1 passa a ser a única versão
operacional; todas as estações devem atualizar. Esta decisão substitui a
restrição anterior de entrega somente no teste.

## Distribuição e continuidade

A fonte adotada é o commit `0b55a01e`, com a correção de formato na Montagem,
Hot Folder prioritário, formas de envio salvas por produto/estação e nomes de
produtos. Não manter desenvolvimentos ou releases operacionais divergentes.

O MSI já auditado é preservado byte a byte. Para os agentes antigos que
exigem o prefixo oficial na URL, o mesmo arquivo também é disponibilizado
como `NewProdPiloto_Oficial_v1.3.1.msi`. Os dois nomes de download identificam
um único pacote: mesmo ProductCode, UpgradeCode, tamanho e SHA-256.
Não são duas compilações ou duas versões de comportamento.

`newprod-piloto-oficial.json` e `latest.json` conduzem os agentes normais e
legados ao pacote. `newprod-piloto-teste.json` permanece necessário porque
é consultado pelo preservador e pelo runtime já distribuídos. Os três
manifestos devem acompanhar a mesma versão, com a mesma liberação de estações.
Não remover essa ponte enquanto houver runtimes que a consultem.

O runtime ainda informa `1.3.1-teste.1` e o Windows exibe `NewProd Piloto Teste`:
são identificadores do pacote imutável já distribuído. Trocar esses textos
requer uma próxima versão, sem substituir os bytes publicados da 1.3.1.
A forma de envio mantém o comportamento desta versão, incluindo a ausência
de confirmação comercial automática pelo fluxo de teste.

## Estações e validação

Liberação: LASER-01, PC-JR-HOME, TEX-01, LASER-04, FLEXO, LAPTOP-9BSK81S0,
GUSTAVO-PROD, LASER-02, ACABAMENTO, DESKTOP-PM6TG1B, CESAR-CPD e PRD-ACABAMENTO.
Os dois últimos são cadastros antigos sem presença recente. Entradas com
`[Piloto]` são instalações históricas das mesmas máquinas, não novos alvos.
O registro genérico `Agente Ideal` não identifica um hostname para liberação.
Permissões de coleta e credenciais não são criadas por este manifesto.

Não forçar encerramento de trabalhos ou reinício remoto. O atualizador
existente verifica periodicamente e adia a instalação se houver atividade.
Estação desligada depende de voltar à rede; atualização pode ser solicitada
pelo menu do NewProd. A liberação não comprova instalação.

Auditoria original: `evidencias/release-131-teste-auditoria.json`.
Publicação unificada: `evidencias/newprod-131-unificado-publicacao.json`.
Backups dos manifestos: `dist/compatibilidade/manifestos-antes-unificacao-131.json`.
SHA-256 do MSI: `61e71d4d2c4f913ed43b55eb0157159982c0e0f870c4ad22c910f84246aeb394`.
Recuperação após instalação exige publicar a fonte anterior com versão maior;
restaurar apenas o manifesto não provoca downgrade automático.

Confirmar por estação a versão, o painel HTTP e uma geração real. Heartbeat
sozinho não comprova instalação íntegra nem impressão física.

## Publicação confirmada

Os três manifestos públicos foram relidos e confirmados em 1.3.1, com o mesmo
hash e as 12 estações. O download oficial de 196673536 bytes foi conferido
antes de ativar os manifestos. Não houve recompilação ou mudança funcional.

Na consulta posterior, PC-JR-HOME informou 1.3.1-teste.1 e respondeu HTTP 9001
com essa versão. Seis outras estações com presença recente ainda informavam
versões anteriores; FLEXO, ACABAMENTO, DESKTOP-PM6TG1B, CESAR-CPD e
PRD-ACABAMENTO tinham registros antigos. Evidência com horário da consulta:
`evidencias/newprod-131-estacoes.json`. Atualização de toda a frota e geração
do PDF da Montagem continuam pendentes de confirmação nas estações.
