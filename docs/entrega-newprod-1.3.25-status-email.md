# NewProd 1.3.25 — status do operador e artes por e-mail

Base: `agente-v1.3.24`, preservando a correção das faixas nas capas e as entregas.
Painel local: 1319. O checkout operacional e a sessão de e-mail foram preservados.

## Comportamento

- Apenas Aguardando, Impresso e Corrigir Arte. A divergência de sincronização
  deixa de criar o quarto status ou exigir o novo caminho por Refazer.
- A confirmação do popup e do seletor continua persistida na estação.
- Antes da volta manual a Aguardando ou Corrigir Arte, a estação aguarda o envio
  de confirmação em andamento e reserva a decisão no SQLite. Recibos anteriores
  desse modelo deixam de ser enviados; outros modelos permanecem independentes.
- A apresentação da decisão manual só muda depois da escrita online confirmada.
  Sem rede ou resposta verificável, há erro, sem sucesso fictício. A reserva
  persiste em reinícios para impedir reaplicação de recibos antigos; repetir a
  escolha permite concluir. Uma nova confirmação de impressão substitui a decisão.
- Corrigir Arte conserva a devolução da aprovação ao designer.
- A segunda opção de e-mail incorpora as prévias dos modelos no corpo da mensagem;
  o envio por link permanece disponível. Não se envia mensagem ao abrir o editor.

## Validação

- 1.140 testes Python, dois pulados e dois subtestes em cada perfil:
  produção, Piloto e Oficial; harnesses de compatibilidade aprovados.
- Regressões locais de retorno à lista, seleção manual, reinício, reserva
  incerta, concorrência com envio, autorização e origem HTTP.
- Chromium: Impresso → Aguardando → reabrir → Impresso; falha com zero linhas
  não produz sucesso; snapshots de arte não são alterados.
- E-mail: quatro harnesses, 41 testes Deno e preservação da correção de capas.
- PyInstaller, auditoria de segredos do pacote, WiX e igualdade dos cinco
  arquivos principais do painel dentro do executável.
- MSI ProductVersion 1.3.25, 196751360 bytes,
  SHA-256 `c148ed7198e7b72eee64849580d02ae953512c5d508bd933efb43c06925f89d7`.
- Função `painel`: versão 257 preservada como recuperação; versão 258 ativa,
  JWT mantido e as 19 fontes conferidas após publicação. Apenas três fontes
  de e-mail diferem; nenhum pedido foi alterado para testar e nenhum e-mail enviado.

## Limites e recuperação

Os recibos são locais a cada estação. A origem histórica dos retornos relatados
não foi reconstruída sem acesso ao diário da LASER-01. A proteção não substitui
a conferência de adoção da versão nas estações. Publicação do MSI não comprova
instalação, impressão física nem entrega de e-mail na caixa do destinatário.

Os relatórios e backups de publicação ficam em `dist/entrega` e no diretório
`dist/publicacao-unica-1.3.25-*`. Reversão do agente exige nova versão superior
com a fonte anterior, preservando os dados locais; não forçar downgrade.

## Publicação confirmada

Os dois downloads públicos completos passaram por tamanho e SHA-256.
`latest.json`, `newprod-piloto-oficial.json` e `newprod-piloto-teste.json`
foram relidos com cache-buster: versão 1.3.25, hash acima e sem restrição
por estação. Fonte publicada na tag `agente-v1.3.25` (`8349092b`).
Na consulta anterior à ativação, LASER-01 ainda reportava 1.3.23 / painel 1318.
Nenhuma instalação ou reinicialização foi forçada.

A integração do e-mail no frontend web está no PR #186, baseada em main
para preservar alterações web que não pertencem ao agente.
