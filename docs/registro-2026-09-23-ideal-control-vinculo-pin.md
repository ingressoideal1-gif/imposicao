# Ideal Control — recuperação de vínculo e PIN — 23/09/2026

## Relato e evidências

Pedido informado: **22066**. Investigação somente de metadados; nenhum PIN, token ou código de ingresso real foi exposto.

- Evento ativo, 400 credenciais; alteração do evento persistida em 23/09 às 10:42:18 UTC.
- Há um aparelho ativo com instalação/PIN e uma segunda instalação sem aparelho.
- Auditoria registra DELETE de aparelho concluído pelo fluxo de PIN às 02:59:38 UTC. O autor/aparelho ficou nulo após a exclusão; a instalação autora ficou sem aparelho.
- O cliente permitia excluir o próprio aparelho; conservava o token local. `/evento` recusado era ignorado; `/elevar-pin` exige aparelho ativo antes de conferir PIN. O painel da gráfica consulta senha por aparelho, portanto não encontra a instalação desvinculada.
- Reler QR com token salvo pulava a ativação. No banco, a ativação anterior fica com `dispositivo_id=NULL` por FK `ON DELETE SET NULL`; a função antiga recusava também uma nova ativação com esse token.
- Esta cadeia foi reproduzida com dados sintéticos. Sem acesso ao iPhone, não se afirma que sua identidade local é a instalação excluída; a versão e o erro exato do aparelho não foram informados.

## Correção

- Leitura do QR sempre confirma ativação no servidor, reutilizando token/instalação existentes; invalida elevação antiga e baixa os ingressos novamente.
- Função SQL recupera somente ativação órfã, mediante convite válido e instalação registrada. Reenvio é idempotente. Aparelho pausado, convite revogado, evento inativo e identidade incompatível continuam recusados.
- PWA e backend impedem que a edição por PIN pause/exclua o próprio aparelho. A gráfica pode continuar gerenciando aparelhos.
- A tela inicial informa vínculo indisponível e oferece leitura do QR; PIN distingue esse erro de senha incorreta e não entra no ciclo de pedir senha novamente.
- Sem novo reset, troca de PIN, remoção de eventos ou descarte de fila. Mantido `ideal_control_fluxo_local=qr-nuvem-947`. Fila pendente continua bloqueando troca/carga destrutiva.

## SQL e backend

Aplicado no Supabase e-deal `vwbtitjlpelrcnsytzqw`: `sql/ideal_control_recuperar_vinculo_qr.sql`, em transação com limites de lock/execução e guarda de assinatura anterior. Zero linhas de negócio modificadas pela migração. Uma função substituída; concedido apenas UPDATE da coluna `dispositivo_id` de `producao_acesso_ativacoes_qr` para `service_role`.

Conferência em conexão posterior:

- MD5 anterior da função: `1525aa57a2883b6a45d803b0d78118ad`.
- MD5 posterior: `dce2fb8c99778746c15f0158fdf773d6`.
- Recuperação presente e permissão da coluna confirmadas; execução negada para `anon` e `authenticated`.
- Uma ativação órfã permanece: o SQL não reativou automaticamente aparelhos reais.
- Função Edge `portaria` publicada com a proteção contra autoexclusão/pausa.

Recuperação da entrega: restaurar o corpo anterior versionado em `sql/ideal_control_ativacao_antes_publicacao.sql`, após conferir a assinatura posterior acima, em nova transação; revogar UPDATE da coluna concedida nesta migração. Não executar o arquivo anterior inteiro, pois seu preflight pertence a outra versão. Rollback do frontend/backend deve manter o marcador de reset; retornar ao código antigo volta a expor o defeito.

## Validação

- 13 testes Deno: PIN, criptografia, autorização, consulta pela gráfica e impedimento de autoexclusão/pausa.
- 16 testes de navegador de QR/PIN e atualização, mais 3 verificações direcionadas (proteção do próprio aparelho, versão única, controles de outros aparelhos): **19 passaram**.
- PostgreSQL local via PGlite: reproduziu falha antiga e validou migração, recuperação sob `service_role` com privilégios limitados, idempotência, pausa, outra instalação, revogação e ACL anon. Não é teste concorrente de carga.
- Sintaxe dos quatro JS alterados aprovada. Revisão de diff/segredos antes do commit.

## Retomada no aparelho

Após obter v948, abrir olho → Ler QR do evento e ler novamente o QR do pedido 22066. Usar a senha já cadastrada naquele celular. Atualizar o painel Ideal Control do Imposition e consultar a senha no aparelho recuperado. Se houver fila pendente ou aparelho pausado, tratar a condição indicada sem limpar os dados.

Publicação web e verificação dos arquivos públicos: registrar abaixo após propagação. Aceitação física no iPhone permanece pendente.
