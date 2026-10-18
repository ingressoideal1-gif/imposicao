# Mapa de planejamento das entregas

Implementacao local em `feat/entregas-mapa-20261018`, baseada em v1077.
Frontend aguardando publicacao. SQL aplicado em 18/10/2026: consulta ADM e
configuracao propria Vibe; uma linha configurada. ERP preservado. Leitura real
confirmou 9 pedidos no primeiro lote, sem expor enderecos nos registros de teste.

- Mapa independente dos filtros de historico: todos os pedidos Motoboy pendentes,
  em EXPEDICAO ou EM TRANSITO, excluindo conclusoes e expedicoes ambiguas.
- Origem: Rua Felizardo de Farias, 81, Medianeira, Porto Alegre, RS, 90660-130.
- `ve_admin_mapa`: leitura paginada por UUID (200 + sentinela), acesso somente ADM
  via `ve_e_gestor`. Inclui endereco, entregador e posicao na rota confirmada.
  O novo script SQL cria consultas, grants e a configuracao propria do Vibe.
  Nenhuma tabela ou registro do ERP e alterado.
- Google Maps JavaScript: marcadores por pedido, cor por entregador, legenda
  selecionavel, trajetos pelas ruas com `Route.computeRoutes`, sem reordenar as
  paradas. Retorno respeita a rota salva. Mostra apenas paradas ainda pendentes.
- Pedidos sem rota/enderecos incompletos/imprecisos ficam explicitamente sinalizados.
  Nenhuma linha reta e apresentada como trajeto. Nenhuma localizacao GPS ao vivo.
- Popup encaminha o pedido ao filtro existente para atribuicao. Edicao da sequencia,
  inicio de deslocamento, previsoes manuais e comprovantes usam os fluxos atuais.
- Cache somente em memoria, removido ao sair da sessao/perder acesso ADM.
  Atualizacao relê pedidos; trajetos/endereco identicos reutilizam resultado da sessao.

## Configuracao e entrega

1. Google Cloud: projeto e faturamento; habilitar Maps JavaScript API, Geocoding API
   e Routes API. Configurar quotas conforme uso pretendido.
2. Criar chave de navegador restrita a sites:
   `https://imposition.ai-ideal.com.br/*` e `https://imposicao.pages.dev/*`.
   Restringir APIs as tres acima. Nao reutilizar chave de servidor.
3. Armazenar localmente com `ferramentas/configurar_google_maps.ps1` (entrada oculta,
   DPAPI do usuario Windows, fora do Git). Nao enviar a chave no chat.
4. A chave de navegador e configurada em um unico registro da tabela propria
   `vibe_entregas_mapa_config`, com RLS e sem acesso direto anon/authenticated.
   `ve_admin_mapa_config` retorna essa configuracao somente ao ADM autenticado.
   A chave nunca entra no Git; e necessariamente visivel no navegador do ADM,
   por isso precisa das restricoes de sites/APIs no Google Cloud.
   Opcional: Map ID JavaScript proprio; sem ele usa DEMO_MAP_ID do Google.
5. Aplicar `sql/vibe_entregas_mapa.sql`; conferir grants e contagem de configuracoes.
   A configuracao altera somente a linha id=true do novo cadastro Vibe.
6. Publicar frontend e conferir os dois dominios. Pendente nesta revisao. Google real validado em navegador com origem autorizada, da Ideal ate um
   endereco publico de teste, sem pedidos reais. Testes automatizados usam mocks.

## Validacao local

- `node tests/entregas_mapa_browser_harness.cjs`: duas cores, ordem salva, retorno,
  endereco ausente, 202 pedidos, ausencia de chave, cache, XSS e resposta atrasada
  apos revogacao do ADM.
- `node tests/vibe_entregas_pglite.cjs`: SQL real em memoria; ADM vs anon/entregador,
  cursor, transito, exclusao de concluidos/expedicoes duplicadas, fluxos existentes.
- `node tests/entregas_gestao_browser_harness.cjs`: cadastro, senha, rotas e revogacao.
- Sintaxe JS e `git diff --check`.

Fontes: https://developers.google.com/maps/documentation/javascript/routes/start
e https://developers.google.com/maps/documentation/javascript/routes/intermediate-waypoints

Recuperacao: frontend anterior v1077 preserva os fluxos antigos; as novas RPCs sao
aditivas e somente leitura. Nenhum dado de pedido precisa ser restaurado.
