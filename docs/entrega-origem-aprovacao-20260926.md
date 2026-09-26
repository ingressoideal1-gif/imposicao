# Indicador Cliente/Atendente

Entrega frontend a partir de `ddb02416` (v966), worktree
`ideal-imposition-entrega-origem-20260926`, branch `entrega/origem-aprovacao-20260926`.
SQL aplicado manualmente pelo usuário. Imagens enviadas confirmam permissões,
três tabelas com RLS, dois triggers ativos e função de diagnóstico disponível.

Verificação HTTP na RPC temporária em 26/09/2026:

- Chamada normal: HTTP 200, `ip_valido=true`, `ip_de_teste_aceito=false`.
- Cabeçalho `cf-connecting-ip: 192.0.2.123`: HTTP 403, bloqueio Cloudflare.
- Cabeçalho `x-forwarded-for: 192.0.2.123`: HTTP 200, IP válido e marcador falso não aceito.

Não foram consultados pedidos reais, IPs ou tokens de clientes. Os testes do gateway
validam estes caminhos e tentativas específicas; não constituem prova de identidade.

A Lista de Arte registra a conexão de colaboradores autorizados por sete dias e
consulta rótulos por lote. Cliente/Atendente aparece abaixo dos status de arte e
dados, conforme decisões futuras capturadas no banco. Sem referência/evidência,
não mostra rótulo. Não atribui retrospectivamente aprovações anteriores.

Simulação do entrega-segura: VALIDADA, versão prevista v967. Passaram testes de
carregamento/atualização da lista, cache, sessão, lotes, concorrência, falhas de RPC
e células reais em desktop/celular, incluindo cliques e recarga.

Após a publicação, o usuário deve abrir a Lista com conta interna para estabelecer
a referência. A confirmação da captura em uma aprovação real permanece operacional;
não foram feitas aprovações sintéticas em produção.

Fechar o diagnóstico temporário no SQL Editor após os testes:

```sql
REVOKE ALL ON FUNCTION public.diagnostico_origem_aprovacao_ip()
FROM anon, authenticated, PUBLIC;
```

O diagnóstico não é usado pelo indicador. Essa revogação não interfere no recurso.
Recuperação: a migração manual contém script de desativação preservando histórico;
reversão de frontend deve usar nova versão de cache, sem descarte de histórico Git.
