# Conferência QR12 no site — 06/10/2026

O aviso de colisão dos modelos 1001859 e 1001959 do pedido 23063 continuava
aparecendo no site mesmo depois da reserva QR12. A v1024 corrigiu a pesquisa
local; não corrigiu a origem da consulta usada por esse aviso na web.

## Causa e correção

`conferirColunasQrIdealDosPedidos()` consultava `/api/qr-ideal/contratos` relativo
à origem da página. Essa rota existe no NewProd, mas não no Cloudflare Pages.
Quando a consulta falhava, o código tratava a colisão da regra legada como
confirmada. Não era evidência de colisão nos contratos QR12.

Na web, a consulta agora vai à Edge Function `painel`. A nova rota GET exige JWT
validado pelo gateway e a mesma grade de leitura dos pedidos. Consulta apenas
o pedido solicitado e retorna `pedido`, `modelo` e `versao`. Não cria contratos,
reservas ou eventos; não retorna códigos, offsets, base privada, hashes ou sais.
Não altera ACL, RLS ou schema. Na estação, mantém a API local autenticada.

O alerta confere a resposta completa antes de distinguir contratos legados e
QR12. Duas reservas QR12 não recebem a colisão legada; um legado e um QR12
independente também não. Colisões entre legados confirmados continuam como erro.
Resposta ausente, parcial, inválida ou recusada gera aviso de conferência
inconclusiva, mantendo a orientação de não imprimir até concluir a conferência.
Consultas não usam cache; respostas atrasadas ou de outro usuário não exibem
avisos da consulta anterior. Numerações desconhecidas continuam sinalizadas.

## Validação e entrega

- Regressão reproduzida antes da mudança: o harness do site gera o alerta falso.
- Harness após a correção: casos web/local, QR12, legado, misto, consulta falha,
  contratos incompletos/inválidos, QR comum e resposta atrasada aprovados.
- Deno: 26 testes da função `painel` e regras de propostas aprovados, incluindo
  rota real com banco simulado, acesso anônimo/sem grade, métodos e filtros.
- Python: 110 testes de alerta, integração do painel e sintaxe aprovados.
- Produção e Piloto: 389 testes aprovados e 2 skips previstos em cada canal,
  além dos harnesses comuns e testes de navegador de cada variante.
- Falha preexistente: `test_o_agente_local_nao_recebe_cabecalho`, de
  `test_sessao_vai_junto_no_fetch.py`, também falha na v1024 sem esta mudança.
  Ele pressupõe ausência de Authorization na API local; essa lógica não foi
  alterada nesta entrega. Os outros cinco testes desse arquivo passam.

Entrega coordenada: publicar primeiro a função `painel`, depois o frontend
v1025 e o pacote completo do Piloto. A rotina automática de publicação trabalha
com escopo único; esta entrega inclui função e frontend no mesmo PR, mantendo
checks obrigatórios, compilação/inspeção do pacote e hashes após propagação.
O registro operacional final deve guardar commit, implantação, hashes públicos
e locais, resultado autenticado e backup anterior.

O pedido 23063 continua sujeito ao fluxo normal de aprovação. Esta correção
não aprova, não prepara o evento e não envia impressão. Prova física e leitura
pelo PWA continuam distintas da conferência do alerta do painel.

Recuperação: versões anteriores do painel e do Piloto preservadas; reverter o
frontend por nova entrega rastreável se necessário. A rota de leitura adicionada
é compatível com o frontend anterior e não exige reversão de dados ou contratos.
