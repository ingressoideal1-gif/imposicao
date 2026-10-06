# Capas de Mapa de Teatro por FILA — 06/10/2026

Pedido autorizado: corrigir, verificar e fazer entrega segura. A FILA do banco
representa um bloco de acabamento: cada fila recebe exatamente uma capa.
O nome editado do conjunto e seu identificador devem coincidir com o PDF do
mapa, por exemplo `Mesa VIP 02` ou `Fileira Especial AA`.

## Comportamento

O miolo continua vertical por modelo, com `ceil(quantidade / poses)` folhas.
Filas diferentes continuam na sequência do banco. A altura das pilhas e o
BLOCO comercial não definem os limites das capas.

Os planos JS e Python conservam a montagem do miolo e acrescentam a lista
de primeiro/último ingresso de cada FILA. As capas usam essa lista em ordem,
uma por célula, em tantas folhas quantas necessárias. Cada modelo/setor tem
seus próprios grupos; filas com identificadores iguais em setores diferentes
não são combinadas. A contracapa conserva seu conteúdo em branco e acompanha
a quantidade de folhas de capas.

O título é `Conjunto + Fila`, preservado no banco da revisão associada, igual
à identificação do PDF do mapa. A informação complementar mostra setor,
primeiro/último lugar e quantidade real. Não se consulta o mapa atual para
substituir rótulos de um banco histórico.

Prévia do Pedido e da Imposição usam as mesmas posições de capas, exibem sua
quantidade de folhas e deixam as células excedentes vazias. O limite de
Refazer permanece o do miolo. A geração respeita `has_cover` do formato.

O motor anuncia `teatro_capas_fila_v1`. Ao gerar capas de banco importado,
o frontend recusa motor antigo e orienta atualizar o NewProd. TEATRO legado
sem marcadores de mapa mantém sua montagem e distribuição de capas anterior.

## Validação local

28 regressões focadas passaram, incluindo PDFs reais com 17 filas em oito
poses (três folhas de capas), nomes editados Mesa/Fileira Especial/Camarote,
quantidades diferentes e conferência dos rótulos com a preparação real dos
PDFs dos mapas. Prévia: seleção individual/combinada, várias folhas, última
folha incompleta, troca de setor, retorno ao miolo e limite de Refazer.

`ferramentas/conferir_duas_versoes.py` passou: 402 testes e dois skips em cada
canal, além dos harnesses e testes de navegador nas páginas index/producao.
Os skips existentes e o aviso de depreciação Starlette não foram alterados.

A entrega preserva a correção de conferência de mapas já instalada no Junior
em 1.2.359. O executável relê apenas o mapa solicitado para conferir a revisão,
com prazo de 15 segundos, sem sincronizar ou gravar o catálogo local. Erros de
consulta continuam bloqueando a geração. As nove regressões dessa conferência
foram incorporadas à validação obrigatória dos dois canais.

Verificação adicional: 101 testes passaram; 19 testes de
`test_engine_refazer.py` falharam porque usam `base_ticket.pdf` inexistente.
A mesma falha foi reproduzida na base intacta `a85cf84b`, em checkout separado.
As regressões de Refazer para TEATRO, da suíte focada, passaram. Não foi
introduzido arquivo artificial para mascarar essa falha preexistente.

## Entrega e recuperação

Fonte preparada em checkout isolado de `origin/main`, preservando a pasta
operacional e suas mudanças. Cache planejado v1032; NewProd 1.2.360 e pacote
independente Piloto 1.2.360-piloto-local.27. Publicação e instalação só devem
ser consideradas concluídas com a evidência correspondente da entrega.

Backup AES-256-GCM foi criado antes da entrega, incluindo refs/patches,
arquivos pendentes e runtime explícito. O ensaio de restauração separado e
a cópia cifrada no Drive Desktop foram conferidos. Banco/Storage comerciais
não foram alterados.

Recuperação web: publicar a fonte anterior com versão de cache nova.
Recuperação do agente: empacotar a fonte anterior com versão superior; não
reutilizar nome de MSI nem esperar downgrade automático. Piloto: usar seu
manifesto/pacote anterior preservado, após conferir que está ocioso.
Impressão física não foi executada.
