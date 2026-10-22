# NewProd 1.3.28 — provisionamento QR v2

Fonte: `f63fd02f`, tag `agente-v1.3.28`, baseada em `agente-v1.3.27`.
Checkout isolado; preservadas as alteracoes do checkout operacional.

## Validacao

- Testes direcionados: 55 passaram; suite offline adicional: 16 passaram.
- Edge Functions: 366 passaram com Deno em cache, sem instalar dependencias.
- Compatibilidade das tres identidades historicas: 1140 passaram e 2 pulados por identidade, alem dos harnesses JavaScript.
- Testes de atualizacao/instalador/publicacao: 37 passaram.
- MSI ProductVersion 1.3.28; modulo qr_provisionamento confirmado no executavel.
- Auditoria do executavel, preservador e MSI: nenhum pool privado ou modulo de segredo.
- MSI: 196763648 bytes; SHA-256 `4a18b7b73e8d055288621d2b64479f59134e82461cbc730f51578f754a5d2096`.

## Nuvem e pendencia de ativacao

Em 22/10/2026, piloto-local passou de v19 para v20 ACTIVE, preservando
verify_jwt=false e a autenticacao privada existente. Os 12 arquivos anteriores
correspondiam a base da release. Os 16 arquivos baixados apos o deploy
correspondem a fonte local. Rota sem credencial: 401; com Origin: 403.
Snapshots anteriores e posteriores em dist/cloud-before e dist/cloud-after.

A tentativa de criar NEWPROD_QR_V2_ESTACOES foi recusada pela API com
Missing required permission(s): edge_functions_secrets_write. Nenhum contorno
da permissao foi aplicado. Enquanto essa configuracao estiver ausente, o
provisionamento recusa todas as estacoes, mesmo atualizadas para 1.3.28.

Um administrador deve configurar o secret no projeto vwbtitjlpelrcnsytzqw:

```
NEWPROD_QR_V2_ESTACOES=FLEXO,GUSTAVO-PROD,LAPTOP-9BSK81S0,LASER-01,LASER-02,LASER-04,PC-JR-HOME,TEX-01
```

Essa lista corresponde aos vinculos ativos autorizados e a estacao legada
confirmada por digest. TEX-02 e ACABAMENTO-TEX aparecem na telemetria, mas nao
possuem vinculo autorizado encontrado para esta rota. Nenhuma permissao de
usuario ou registro de autorizacao foi alterado. O MSI e universal; a entrega
da base privada continua condicionada aos vinculos existentes.

Depois da configuracao, conferir sua persistencia, versao efetiva da estacao
e nova abertura do pedido 23063. Publicacao e heartbeat nao comprovam download
da base, abertura do pedido, geracao ou impressao fisica.

## Publicacao confirmada

MSI publicado nos dois enderecos historicos; ambos os downloads publicos
completos conferidos por tamanho e SHA-256 antes de ativar os tres manifestos.
latest.json, newprod-piloto-oficial.json e newprod-piloto-teste.json confirmados
em 1.3.28, sem restricao por estacao. Sao os mesmos bytes da versao unica.
Provas em dist/publicacao-unica-1.3.28-*/. A primeira consulta apos a ativacao
ainda nao confirmou adocao 1.3.28 nas estacoes. A configuracao da lista privada
continua pendente do administrador; usuario recebeu instrucoes para encaminhar.
