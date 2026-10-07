# Descrição editada nas capas dos snapshots ERP — 07/10/2026

O PDF enviado do modelo 1002131, pedido 23183, contém 40 capas em dez páginas,
mas identifica as mesas como `Fila 1`, `Fila 2` etc. A versão instalada 1.2.360
estava correta quanto à distribuição das capas e incompleta quanto à origem
da descrição em snapshots antigos.

Consulta atual de produção, somente leitura: os modelos 1002131/1002133 têm
82 lugares e snapshots cujo setor contém apenas id/nome, sem `nomeConjunto`.
O mapa atual e sua exportação PDF registram `nomeConjunto: Mesa`. A revisão
histórica dos modelos difere da atual. Os outros dois modelos têm 515 lugares
cada, no setor de plateia. Não preencher o snapshot com o mapa atual.

## Correção

As capas recebem `teatro_capa.nomeConjunto`, metadado separado dos lugares.
A abertura do pedido confere o mapa e resolve essa apresentação; a geração
relê o mapa e recalcula o texto no backend a partir da configuração conferida.
O texto enviado pelo navegador não substitui o valor conferido pelo motor.
Quando o mapa não tem descrição explícita, mantém-se a descrição do snapshot
ou `Fila`. Falha ao abrir elimina o metadado de uma abertura anterior.

CSV, filas, lugares, quantidades, snapshot e revisão histórica permanecem
iguais. O miolo e a imposição vertical permanecem iguais. Os avisos de revisão
continuam obrigatórios. A mesma descrição aparece nas prévias do Pedido e
Imposição e nos PDFs de capas. Multi-Artes leva o metadado por modelo.

O motor anuncia `teatro_capa_descricao_atual_v1`; geração de capas de snapshots
ERP exige essa capacidade. Isso impede que a web nova use silenciosamente
o motor anterior, que ignora o novo metadado. Entrega web v1034, NewProd
1.2.362 e Piloto independente 1.2.362-piloto-local.28. A base integra a gestão
das estações já instalada no Junior, preparada no PR 109, para preservar seus
controles e a escolha do Piloto como principal. A integração pública depende
da entrada dessa base em main antes da correção de capas.

## Validação

53 regressões focadas passaram, com dois subtests: snapshot ausente/inválido,
timeout, revisão, quantidade, linhas adulteradas, múltiplos modelos/mapas e
PDFs reais com Mesa/Fileira Especial/Camarote em snapshots sem descrição.
Harnesses verificam a conferência de abertura, falha sem cache antigo,
compatibilidade do motor e metadado nas duas prévias.

Conferência offline dos dados atuais do 23183 nos caminhos JS e Python:
quatro modelos, 1.194 lugares, snapshots idênticos; 40 capas `Mesa` em cada
modelo de mesas e 15 capas `Fila` em cada modelo de plateia. O motor gerou
PDFs técnicos com 80 capas de mesas e 30 de plateia, sem arte e sem imprimir.
Esses documentos comprovam rótulos e quantidades; não são a tiragem final.

Validação dos dois canais por `ferramentas/conferir_duas_versoes.py`: 405
testes aprovados e dois skips por canal, além dos harnesses e navegador, na
base anterior à integração da gestão. A base integrada será validada novamente.
O aviso de depreciação Starlette e os skips existentes permanecem.

## Entrega segura e limites

Fonte preparada em worktree isolado de `origin/main`, preservando o checkout
operacional. Backend, web e pacotes dos dois canais devem ser comprovados
separadamente. MSI público deve ser baixado e conferido antes de ativar o
manifesto. Backups/restauração e evidências finais ficam no registro da entrega.

Não houve escrita no banco nem alteração dos snapshots do parceiro. Nenhum
trabalho foi enviado à impressora. O PDF originalmente enviado permanece
intacto; será necessário gerar novamente as capas após atualização e reabertura
do pedido. A correção não contém IDs específicos no código de execução.
