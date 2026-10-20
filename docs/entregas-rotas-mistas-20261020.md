# Entregas: pedidos individuais e rotas mistas

Implementação local sobre v1088. Sem publicação ou execução de SQL em produção nesta etapa.

## Comportamento

- Aba Todas no Imposition e no PWA, preservando os filtros Motoboy, Veppo e Aéreo.
- O editor de rota consulta todas as modalidades, independentemente da aba aberta. Cada pedido é adicionado/removido separadamente.
- A sequência manual não é mais reagrupada automaticamente por transportadora. A otimização solicitada continua podendo reunir paradas no mesmo destino.
- O mapa consulta todas as modalidades para desenhar a rota completa. Pedidos com o mesmo destino de transportadora compartilham o marcador, com números e seletores individuais no popup.
- As listas de rotas do Imposition mostram a sequência completa, incluindo rotas mistas.
- No PWA cada pedido tem seu próprio cartão. Veppo/Aéreo permitem repasse individual e, opcionalmente, de todos os pedidos pendentes daquela transportadora na própria rota. O diálogo enumera os pedidos antes de confirmar.
- Um repasse não inclui pedidos de outro lote, outra rota ou outro entregador. Destinos fixos e status ERP Em trânsito permanecem; não há gravação da entrega final ao cliente.

## Servidor

Novo script `sql/vibe_entregas_rotas_mistas.sql`, sem editar a migração já aplicada. Atualiza seis funções existentes:

- `ve_agrupar_paradas`: preserva a ordem recebida.
- Quatro leitores `*_modalidades`: aceitam o filtro Todas, restrito às três modalidades previstas.
- `ve_registrar_repasse`: aceita um subconjunto explícito da própria rota iniciada, de uma única transportadora. Mantém travas, autorização por empresa, foto, atomicidade, idempotência e auditoria.

O script não atualiza registros existentes nem cria tabelas. As escritas de repasse só acontecem quando um entregador confirma a operação.

## Validação

PGlite com dados sintéticos: rota Veppo/Aéreo/Motoboy/Veppo sem reordenação forçada; outro lote Veppo permanece disponível; repasse individual não conclui o restante; pedido fora da rota é recusado; falha mantém atomicidade; idempotência e isolamento preservados.

Chromium: editor combina modalidades mesmo aberto pela aba Veppo; mapa, atribuição, PWA com cartões individuais e repasse de um pedido, sessão persistente. Contrato de API com transporte simulado. Sintaxe JS e diff conferidos.

## Publicação e recuperação

Antes da publicação autorizada, salvar as seis definições atuais (`pg_get_functiondef`) e conferir os alvos no projeto e-deal. Aplicar o script em transação antes de publicar o frontend/PWA. Comparar definições após aplicação e verificar os assets nos dois domínios.

Não requer novos segredos, Edge Functions ou instalador NewProd. O service worker muda para v11; versionar os assets do painel no release.

Para recuperação, restaurar primeiro os assets anteriores e depois as definições salvas. Não apagar repasses já confirmados. A publicação e a validação autenticada com usuários reais permanecem pendentes.
