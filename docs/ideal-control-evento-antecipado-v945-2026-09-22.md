# Ideal Control v945 — preparar evento antes da publicação

## Fluxo

O QR já consulta e ativa o celular num evento ativo com setores, mesmo sem ingressos. O aplicativo baixa as configurações, mantém o acesso à lista/edição por PIN e apresenta Aguardando publicação dos ingressos. A validação por câmera ou digitação fica bloqueada enquanto faltarem os ingressos.

As rotas faixa/sincronizar informam uma marca de publicação baseada nos pedidos do evento, sem códigos. Ao detectar publicação concluída, o celular baixa todas as páginas e as entradas/totais, confere se a marca permaneceu igual e grava em IndexedDB antes de anunciar Pronto para uso offline. A consulta ocorre ao voltar a internet, a cada 30 segundos enquanto pendente e pelo sincronismo normal de cinco minutos. Usa o mesmo QR e token.

Falha parcial mantém a carga anterior e permite repetir. A substituição completa só ocorre com fila vazia, verificada também na transação do depósito. Carga legada sem metadados mantém seu caminho anterior de reconfiguração. Nenhum ingresso ou PDF foi inventado/gerado.

## SQL aplicado

Projeto e-deal vwbtitjlpelrcnsytzqw. `sql/ideal_control_ativacao_antes_publicacao.sql` substitui somente a RPC de ativação, removendo a exigência de credenciais. A função remota foi comparada com a origem antes da alteração; um hash de definição no preflight impede sobrescrever uma alteração concorrente. Transação, lock_timeout de 3s, statement_timeout de 30s e conferência de ACL antes do commit.

Sem escrita em registros operacionais. Teste com tabelas e dados sintéticos no schema isolado validacao_ic_20260922_antecipado terminou em ROLLBACK: consulta, ativação sem ingressos, reenvio idempotente, segundo QR, aparelho pausado, revogação e evento inativo. Conferência posterior confirmou schema de teste ausente, SECURITY INVOKER, ausência da condição de credenciais e execução exclusiva para service_role (anon/authenticated bloqueados).

Recuperação da função: extrair somente a definição original de producao_acesso_ativar_qr_evento em schema_acesso_qr_evento.sql e aplicá-la com CREATE OR REPLACE, preservando ACL; não reaplicar o schema inteiro. Cópia exata prévia local em tmp_recuperar_ativacao.sql. Isso voltaria a bloquear novas ativações sem ingressos.

## Validação

- 13 testes Deno: autenticação/PIN, QR sem ingressos e metadados das rotas reais com banco simulado.
- 159 testes Python distintos abrangendo portaria, sincronismo, depósito, PWA, entrega, QR e zeramento. Primeira execução: 156 passaram, 3 falharam. Restaurado caminho legado sem sincronismo extra e atualizada fixture de zeramento para representar seus ingressos publicados; os 3 passaram na repetição direcionada. Cenário antecipado também repetido e aprovado após os ajustes.
- Navegador real com rede simulada: evento vazio configurável, sem enfileirar leituras, publicação posterior, falha na segunda página, repetição, carga completa persistida e mesmo token.
- Tipos Edge, sintaxe JS e revisão de diff. Não equivale a teste físico no iPhone.
