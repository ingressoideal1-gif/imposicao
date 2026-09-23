# Ideal Control v944 — emissão antecipada do QR

A v943 bloqueou indevidamente a emissão do convite quando ainda não havia ingressos publicados. O usuário informou que o QR não era gerado.

## Correção

- Emitir QR exige evento ativo e setores ativos; a publicação dos ingressos deixa de ser condição de emissão.
- O painel informa que o carregamento no celular depende da publicação, sem desabilitar Gerar QR.
- Consulta/ativação no PWA continuam exigindo ingressos ativos; não foi alterada a RPC nem criado SQL de migração.
- Mantidos os filtros de pedidos aptos, autenticação, revogação e proteção das senhas.

## Validação

12 testes Deno e 14 testes de navegador aprovados. O novo teste gera e decodifica o QR da tela para um evento sem ingressos. O teste de backend confirma emissão, aviso de pendência e reutilização do mesmo QR após publicar. Setor ausente, autorização e revogação seguem cobertos. Sintaxe JS e tipos das funções aprovados.

Nenhum ingresso, PDF ou impressão de produção foi gerado. Isso corrige a emissão; a carga completa do pedido 19521 ainda depende dos ingressos publicados.

## Entrega confirmada

Commit `8077c3dd`, tag `v944`, main atualizado sem força. Cloudflare Pages completed/success. Seis de seis hashes normalizados corresponderam nos dois domínios públicos para index.html, ideal-control.js e qr-evento-envio.js, com cache-buster.

Funções ACTIVE: acesso-interno v257 (verify_jwt=true), portaria v255 (verify_jwt=false). Evidência em `docs/evidencias/ideal-control-v944-public-verification.json`.
