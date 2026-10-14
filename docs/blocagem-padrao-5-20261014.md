# Blocagem padrão 5 — todos os produtos

Solicitação: quando a blocagem não estiver definida, usar 5 em vez de 50.
O usuário confirmou a aplicação a todos os produtos, não somente Triband.

## Comportamento

Alinhados cadastro de formato, valores iniciais dos campos, alternativas da
prévia, montagem, seleção combinada, payload e configuração do motor.
Valores explícitos permanecem, inclusive 25, 50 e 100. Registros existentes
e migrações não foram alterados; um formato já gravado com 50 continua com 50.
No motor, zero explícito conserva o significado de não cortar a entrega em
lotes. Ausência, null ou texto vazio usam 5. As regras de compatibilidade
entre modelos, numeração TICKET e quantidades físicas foram preservadas.

## Validação e entrega

Teste novo compara o PDF gerado sem blocagem com aquele gerado com 5 explícito,
incluindo número de páginas, tamanho dos conjuntos e texto. Também verifica
valores explícitos e o contrato de zero do motor. Harnesses: 99 verificações
de modelos somados e 3569 de montagem. O harness de modelos passou a carregar
as dependências reais de verso/escala que já eram exigidas pela fonte.

Publicação autorizada por "entrega segura": web v1054, PR #137, fonte c8e3ac8d.
NewProd 1.3.5 preparado sobre a base oficial 1.3.4. Apenas o diff desta tarefa
foi aplicado em worktree de origin/main para integração web, preservando
alterações paralelas e os checkouts operacionais.

Base web: 823 testes, dois subtestes e 19 harnesses por configuração, 40 etapas
aprovadas. Base NewProd oficial: 1027 testes, dois subtestes e 19 harnesses,
20 etapas aprovadas. Em cada execução, duas exclusões por ausência do pool QR
real e um aviso existente Starlette/httpx. Mais 48 testes de blocagem e
contratos do pacote aprovados. O PDF sintético foi validado, sem impressão física.

Fonte do instalador: `77b09ae6`. MSI 1.3.5: 196677632 bytes, SHA-256
`3158b259c9fc86bcd8104bb21d21a554a129d1078b1fe78ac78ade533a3d77f6`.
Auditoria conferiu os 375 arquivos do painel, identidade MSI, motor compilado
igual à fonte e ausência de arquivos privados. Evidência:
`evidencias/release-135-oficial-auditoria.json`.

## Recuperação

Binários 1.3.4 preservados em `dist/compatibilidade/base-134-blocagem-binarios`.
Manifestos anteriores preservados antes de ativar a versão nova. Recuperação
automática do agente exige pacote de versão superior com a regra anterior;
reverter somente o manifesto não provoca downgrade. Para web, reverter apenas
este diff e publicar com novo cache. Não regravar blocagens dos modelos.

As sete estações consideradas permanecem: LASER-01, PC-JR-HOME, TEX-01,
LASER-04, LAPTOP-9BSK81S0, GUSTAVO-PROD e LASER-02. Não houve instalação
forçada, reinício manual nem impressão física nesta entrega.

## Publicação concluída

PR #137 integrado em `18d940138db821b1afbd56759e8600f5d59bd0da`, tag v1054,
após os seis checks passarem. Cloudflare confirmou sucesso no deployment
`e8b838bc-7743-46e7-bf06-5e490ac9b8e2`. Os sete arquivos afetados conferem nos
dois domínios, 14/14 hashes normalizados. A primeira consulta ainda encontrou
conteúdo anterior; a seguinte passou após propagação, sem repetir deploy.
Evidência: `evidencias/blocagem-v1054-publico.json`.

NewProd 1.3.5 publicado, tag agente-v1.3.5. Os dois downloads completos foram
conferidos por tamanho/SHA-256 antes da ativação. Os três manifestos foram
relidos com versão 1.3.5, hash e sete estações esperados. A cópia com prefixo
histórico Teste contém os mesmos bytes e atende somente atualizadores antigos.
Evidência: `evidencias/release-135-oficial-publicacao.json`.

Estado: PUBLICADA_E_VERIFICADA_SINCRONIA_PENDENTE. Checkouts operacionais
preservados. O diff da tarefa está integrado à main; a base completa do
instalador permanece na branch histórica de empacotamento. Instalação efetiva
nas estações e confirmação com trabalhos reais não foram verificadas nesta
entrega e não são comprovadas pela disponibilidade do pacote.
