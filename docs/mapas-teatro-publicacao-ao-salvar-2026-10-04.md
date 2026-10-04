# Publicação dos PDFs ao salvar mapas de teatro

Em 04/10/2026, o parceiro informou que as revisões atuais de Master Hall - São Paulo e Laércio Boim retornavam `pendente`. O usuário autorizou publicar e definiu que a publicação deve acontecer ao salvar os mapas.

## Comportamento

Salvar confirma a gravação por releitura e, em seguida, gera e publica o PDF completo e os PDFs de todos os setores, sem exigir um segundo clique. Duplicar agora também executa essa publicação usando o ID e os dados confirmados da cópia.

O editor mantém a proteção contra nova gravação até terminar a publicação. A mensagem de sucesso do conjunto aparece somente após `estado = pronto`. Se geração, autenticação ou envio falhar, conserva o cadastro gravado e mostra **Mapa salvo; publicação pendente**, com o motivo e acesso aos PDFs para repetir apenas a publicação.

A consulta antes do envio reaproveita uma exportação já pronta para a mesma revisão. A revisão continua sendo JCS da config inteira; o gerador permanece `a3-v1-20261003`. Históricos e snapshots de modelos não são substituídos.

## Autenticação e origens

O endpoint exige sessão Supabase de usuário com permissão de ADM ou Atendimento para publicar. O login por código da estação não fornece essa sessão. Essa exigência permanece; nenhuma permissão foi ampliada.

O preflight de produção foi consultado em 04/10 e retornou 204 com a origem correspondente para `https://imposition.ai-ideal.com.br`, `https://imposicao.pages.dev` e `http://localhost:9000`, incluindo autorização dos cabeçalhos `authorization,content-type,apikey`. A informação de que apenas localhost está liberado não corresponde a essa conferência do serviço.

## Mapas existentes

Leitura atual, limitada aos dois mapas solicitados, confirmou as revisões abaixo. Foram gerados PDFs reais localmente com o mesmo gerador versionado; preparação local não é publicação na API.

| Mapa | ID | Lugares | Revisão |
| --- | --- | --- | --- |
| Master Hall - São Paulo | `a1184de9-1dd8-4d1a-a668-bfe124000e6a` | 597 (82 e 515 por setor) | `a27a03ee856345a5d0eb26e67a53edf73f6c4442bcb30bd235fcbe53b7068d45` |
| Laércio Boim | `aaa35d4c-3299-4caa-b672-ee06909ec5d6` | 273 | `37a8fed126ad67a38dcf5be2f2a452fea35a3a3b0b49d4f92357599828e7b78c` |

Os arquivos preparados ficam no checkout operacional em `rascunhos/teatro-pdfs-publicacao-20261004/`, separados por ID, com um manifesto de hashes e tamanhos. Nenhum cadastro real foi alterado nessa preparação.

Para concluir cada publicação, usar uma sessão Supabase autorizada e **Mapas de Teatro → PDFs → Salvar PDFs para o ERP**. Essa ação envia os arquivos sem regravar nem modificar o mapa existente. A API exige o mapa completo e todos os setores; publicar apenas o arquivo completo não finaliza a exportação.

Confirmar por GET `/exportacao?gerador=a3-v1-20261003`, sem revisão, que `estado = pronto` e a revisão corresponde à tabela acima. Em seguida, baixar o item `tipo = mapa`, `setor_id = null`, por `pdf_recurso` com a mesma autenticação e comparar SHA-256 e tamanho dos bytes ao manifesto. Só depois anunciar disponibilidade ao parceiro.

## Validação e recuperação

As regressões usam dados sintéticos e serviços simulados: publicação da cópia, confirmação antes de envio, proteção durante publicação, falha de upload e ausência do módulo com aviso explícito. O navegador percorre as duas telas com as bibliotecas reais de PDF, incluindo persistência, repetição e erro de envio.

Recuperação do frontend por reversão seletiva da alteração em `frontend/mapas.js`. Não apagar exportações, arquivos ou snapshots históricos. Esta alteração não muda Python, Edge Functions, schemas, dependências ou o contrato de download do ERP.
