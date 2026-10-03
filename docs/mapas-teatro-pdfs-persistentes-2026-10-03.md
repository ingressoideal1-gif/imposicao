# Mapas de Teatro — PDFs persistentes

## Escopo e autorização

Em 03/10/2026, após a proposta revisável e a explicação do novo escopo de backend/banco, o usuário solicitou **executar**. A implementação mantém o gerador da v1002 e adiciona armazenamento privado, manifesto por revisão e consulta autenticada para o ERP.

O checkout principal foi preservado. A implementação usa a branch isolada `feat/mapas-pdfs-persistentes-20261003`. Não instala dependências, altera modelos comerciais ou modifica o agente Windows.

## Prévia do banco

Consulta somente de leitura no projeto **e-deal / vwbtitjlpelrcnsytzqw**, PostgreSQL 17.4. Confirmados: um mapa, ID UUID, `name` TEXT, `config` JSONB e `created_at` TIMESTAMPTZ. Os setores desse cadastro não apresentaram IDs ausentes/duplicados. `imposition_user_permissions.user_id` é UUID e `role` é TEXT. Tabela de exportações, RPC e bucket novos estavam ausentes.

Conferidas as permissões existentes de leitura do serviço em mapas, Storage e permissões, a possibilidade de bloquear a linha do mapa e a leitura por usuários autenticados. A nova leitura respeita as políticas do mapa; não foram criados vínculos de empresa que não existam no cadastro.

## Aplicação e recuperação

1. Conferir a [prévia somente de leitura](../sql/mapas_teatro_pdf_exportacoes_previa.sql).
2. Aplicar a [migração transacional](../sql/mapas_teatro_pdf_exportacoes.sql) no projeto identificado. Efeito: uma tabela, um bucket privado, um RPC e políticas dedicadas. Zero mapas, modelos e assentos alterados; nenhum PDF importado automaticamente. A migração recusa objetos preexistentes e tipo incompatível.
3. Executar a [verificação de objetos e permissões](../sql/mapas_teatro_pdf_exportacoes_verificar.sql).
4. Implantar somente a Edge Function `mapas-teatro-pdfs`, com `verify_jwt=true`. O serviço usa a biblioteca PDF já versionada em `frontend/pdf-lib.min.js`, sem nova dependência.
5. Publicar a integração frontend com validação e comprovação dos arquivos públicos. O fluxo mantém download local e sinaliza envio pendente se o serviço falhar.
6. Exportar mapas existentes por ação explícita **Salvar PDFs para o ERP** ou durante salvamento autorizado do mapa. A preparação e os testes não usam escrita em cadastros reais para validação.

Em caso de falha da migração, a transação inteira é revertida. Após implantação, a [recuperação conservadora](../sql/mapas_teatro_pdf_exportacoes_recuperacao.sql) suspende finalizações novas e conserva registros/arquivos; voltar o frontend à v1002 e suspender POST evita uploads órfãos. Não executa limpeza ou exclusão de documentos históricos.

Os caminhos incluem mapa, revisão, versão do gerador, setor e hash dos bytes. Uma nova geração com a mesma configuração pode ter bytes diferentes pela data de exportação; a unicidade do manifesto preserva a primeira exportação completa. Uploads concorrentes não associados ao manifesto podem ficar órfãos: não são anunciados ao ERP e não são apagados automaticamente.

## Validação e limites

- 95 regressões do cadastro, incluindo sucesso e falha de persistência do PDF após mapa confirmado, nome do conjunto por setor, compatibilidade com mapas antigos e desfazer.
- 8 verificações do cliente de armazenamento: sessão, consulta sem upload, repetição, falha, setor incorreto e revisão antiga.
- Chromium nas duas telas: PDFs reais, download, consulta, envio de mapas existentes, estado pronto/pendente e repetição sem regravar mapa; nome Mesa salvo e reaberto, quatro setores com Fila/Mesa/Camarote/Sala e uma página por setor, inclusive com 3.000 assentos ou legenda extensa.
- 16 testes Deno do serviço, sem rede: quatro setores, PDF real, upload parcial, repetição, mudança durante envio, revisão, autorização, hash, download, limites e mapa vazio.
- Sintaxe JavaScript, tipos Deno e whitespace revisados. Testes usam dados sintéticos e serviços simulados; não comprovam upload real por operador/ERP autenticado.

Limites do envio: 99 setores, 10 MB por arquivo, 30 MB para o formulário completo (cliente reserva margem e limita PDFs a 29 MB), 1.000 páginas por PDF. Não cria automaticamente contas do ERP, vínculo modelo–setor ou filtro de numeração no motor. A [referência para enviar ao ERP](integracao-erp-mapas-teatro-pdfs.md) documenta os campos e endpoints.

## Estado da entrega

Migração aplicada e verificada em 03/10/2026 no projeto identificado. Confirmados: bucket privado de PDFs, tabela com RLS, leitura anônima negada, gravação/finalização direta por usuários negada, RPC executável pelo backend e política restritiva dedicada no Storage. O cadastro manteve um mapa; havia zero exportações e zero arquivos no bucket ao concluir a implantação do banco. Não houve envio de dados sintéticos à produção.

A função `mapas-teatro-pdfs` foi implantada e conferida como ACTIVE, versão 1, UUID `a77ee396-28e7-4843-b31b-713d0586f0a6`, `verify_jwt=true`, hash de implantação `7899c58115d9ceba296251b32a0ba7dd4449de4fcf3339721de0b1c4a167f382`. O preflight da origem operacional respondeu 204 com CORS correto; chamadas sem sessão e com a chave pública responderam 401. Essas consultas não enviaram arquivos nem gravaram mapas.

O backend/SQL/documentação foi preparado no commit `fb3ff03f`, seguido pela integração frontend no commit `6ea5bc2d` e pelas correções de nome do conjunto e uma página por setor. A revisão automática inicialmente rejeitou o push e a integração em `origin/main`, por exigir autorização explícita para essa nova publicação Git. Em seguida, o usuário solicitou **publicar**, autorizando a integração desses commits e a atualização da tela em 03/10/2026. A entrega usa revisão separada do backend já implantado e simulação de publicação do frontend; não reaplica a migração. O resultado público e as identidades finais são registrados no artefato de comprovação `tmp_mapas-v1003-evidencia.json` no checkout principal, após a conferência dos dois domínios.

Após publicar a tela, o primeiro envio de um mapa existente deve ser feito pela interface com a conta do operador autorizada. Até a conferência do banco registrada acima, havia zero exportações; não declarar os PDFs desse mapa como já armazenados no servidor.

## Nome editável do conjunto de assentos

Solicitação adicional de 03/10/2026: o campo antes fixo “Fila” passa a ser editável em cada setor, nas duas telas, com sugestões Fila, Mesa, Camarote e Sala e texto livre. A propriedade `nomeConjunto` integra `config.setores[]` no cadastro existente; não requer migração ou alteração da função implantada. O botão acompanha o nome escolhido. Campos vazios voltam a Fila; mapas antigos sem a propriedade mantêm Fila sem alteração automática do cadastro.

O PDF usa o nome do conjunto nos títulos de contagem e entradas da prancha; a alteração não modifica prefixos, numeração, posições, geometria ou quantidades. O snapshot e a revisão incluem a propriedade, preservando o texto histórico. A documentação do ERP foi atualizada com o caminho JSON, exemplo e consulta de leitura. A mudança integra a entrega frontend autorizada para publicação.

## Uma página por setor

Correção solicitada pelo usuário: gerar somente a página com os lugares gravados, sem anexos de detalhe ou resumo. O gerador mantém a prancha A3, a logo, identificação, posições, corredores, etiquetas e tipos dos assentos. Todos os lugares são desenhados e numerados na mesma página; o tamanho dos rótulos acompanha a escala necessária. Listas e legenda permanecem na prancha com ajuste de tamanho. O PDF combinado reúne uma página de cada setor, sem acrescentar outras.

A validação cobre setor denso com 3.000 rótulos distintos em uma página, quatro setores com quatro páginas no combinado, legenda extensa e setor vazio. O comportamento anterior da v1002 permanece registrado historicamente; esta correção integra a entrega frontend autorizada para publicação. Os PDFs gerados no navegador são recriados pelo novo código após atualizar a aplicação.
