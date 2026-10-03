# Publicação — Mapa de Teatro nos bancos do pedido

## Resultado

Frontend **v1004** publicado em 03/10/2026. Em **Lista de Arte → edição do pedido → Gerenciamento de Bancos de Dados → Mapa de Teatro**, pesquisar/selecionar um mapa salvo e associar cada setor a um modelo existente. Cada conjunto (Fila, Mesa, Camarote, Sala etc.) mantém sua quantidade exata de lugares e forma um bloco do modelo.

O **NewProd 1.2.347** foi compilado, auditado e publicado. O download público do instalador confirmou tamanho e SHA-256; somente depois o manifesto `latest.json` foi ativado e relido com cache-buster. A instalação nas estações e a impressão física não foram executadas nesta entrega.

## Identificação da entrega

| Parte | Identificação |
|---|---|
| Motor e capacidade de blocos do teatro | `340ddc3ad46d51edd1c4c8842e76acace907c4d0` |
| Frontend e testes, tag `v1004` | `037ded1cff1cd587acf411296a6426d27a3d4670` |
| Fonte do instalador, tag `agente-v1.2.347` | `ef4bdc258e55a9788e7063f06bca80ed3068bf76` |
| Instalador | `NewProd_Setup_v1.2.347.msi` |
| ProductVersion do MSI | `1.2.347.0` |
| Tamanho do MSI | `156315648` bytes |
| SHA-256 do MSI | `e6a668a3da7d2cac3f64fda2c69d9ad163cfa5652386d2e4fc9e1927f05ae9a5` |

Cloudflare confirmou o frontend. Às 19:34:30 UTC, os hashes normalizados de `index.html`, `producao.html`, `cliente.html`, `controle.html`, `script.js`, `pedido.js`, `teatro-banco.js` e `mapa-teatro-do-pedido.js` coincidiram com a fonte nos dois domínios: [aplicação](https://imposition.ai-ideal.com.br) e [Pages](https://imposicao.pages.dev). A primeira checagem do procedimento automático encontrou cache antigo; somente a verificação foi repetida, sem novo deploy do frontend.

O [instalador público](https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/NewProd_Setup_v1.2.347.msi) foi baixado pela URL simples utilizada pelo agente. Tamanho e hash coincidiram com o pacote auditado. O [manifesto público](https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/latest.json) confirmou versão `1.2.347`, esse endereço, tamanho e hash. A compilação usou o procedimento existente em modo de simulação; a publicação reutilizou suas etapas de upload, conferência e manifesto sobre o mesmo artefato, sem recompilá-lo. O nome novo foi conferido como ausente antes do envio; o manifesto anterior era `1.2.346`.

Evidência de hashes e horários: [Registro JSON da entrega](evidencia-2026-10-03-mapa-teatro-pedido.json).

## Verificações e limites

Passaram 30 testes Python focados, os harnesses dos bancos e dos mapas, a prévia/impressão simulada e o popup no Chromium com dados sintéticos, incluindo quatro setores, modelos distintos, conjuntos desiguais, conflito, revisão alterada, falha parcial e retomada. A validação da publicação repetiu os harnesses alterados e os 14 testes novos do teatro. Sintaxe e `git diff --check` passaram.

O MSI foi consultado sem instalação. O executável foi inspecionado sem execução: contém `app`, `engine`, `teatro_banco`, versão 1.2.347, capacidade `mapa_teatro_blocos_v1`, as três DLLs do runtime de impressão e os seis arquivos principais do painel iguais à fonte v1004. O MSI contém esse executável e o pool existente com 24000000 bytes. Nenhuma dependência foi instalada.

As 17 falhas da suíte antiga foram reproduzidas na base e descritas no [contrato da funcionalidade](mapa-teatro-no-banco-do-pedido-2026-10-03.md). Não houve alteração de schema, SQL remoto, importação em pedidos reais, envio de mensagens ou impressão física. O checkout operacional e suas mudanças preexistentes foram preservados.

## Operação e recuperação

Atualizar as estações pelo menu do NewProd **Atualizar agora**. O frontend verifica a capacidade do motor antes de enviar os bancos do teatro para produção. Utilizar **Blocado → Montagem estrita** e **Folha própria** ao combinar modelos; a regra existente que proíbe combinar BLOCO comercial diferente permanece.

Uma falha na associação pode deixar bancos já gravados: reabrir o popup e repetir a mesma revisão permite reaproveitá-los. Não excluir bancos ou revisões automaticamente. A importação guarda uma cópia da revisão; alterações no desenho exigem nova associação explícita.

Para recuperação de código, reverter somente os commits da funcionalidade em uma nova entrega. Para o agente, publicar o código anterior com uma versão superior a 1.2.347; o atualizador não faz downgrade. A reversão do código não remove bancos já importados. Histórico anterior: frontend v1003 e agente 1.2.346.

Documentação para o ERP: [Integração de mapas, PDFs e modelos](integracao-erp-mapas-teatro-pdfs.md). Tabelas usadas: `producao_mapas_teatro`, `pedidos_bancos` e `pedidos_modelos_banco`; nenhuma migração é necessária para esta associação.
