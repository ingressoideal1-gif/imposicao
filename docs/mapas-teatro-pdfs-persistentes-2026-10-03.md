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

- 91 regressões do cadastro, incluindo sucesso e falha de persistência do PDF após mapa confirmado.
- 8 verificações do cliente de armazenamento: sessão, consulta sem upload, repetição, falha, setor incorreto e revisão antiga.
- Chromium nas duas telas: PDFs reais, download, consulta, envio de mapas existentes, estado pronto/pendente e repetição sem regravar mapa.
- 16 testes Deno do serviço, sem rede: quatro setores, PDF real, upload parcial, repetição, mudança durante envio, revisão, autorização, hash, download, limites e mapa vazio.
- Sintaxe JavaScript, tipos Deno e whitespace revisados. Testes usam dados sintéticos e serviços simulados; não comprovam upload real por operador/ERP autenticado.

Limites do envio: 99 setores, 10 MB por arquivo, 30 MB para o formulário completo (cliente reserva margem e limita PDFs a 29 MB), 1.000 páginas por PDF. Não cria automaticamente contas do ERP, vínculo modelo–setor ou filtro de numeração no motor. A [referência para enviar ao ERP](integracao-erp-mapas-teatro-pdfs.md) documenta os campos e endpoints.

## Estado da entrega

Migração aplicada e verificada em 03/10/2026 no projeto identificado. Confirmados: bucket privado de PDFs, tabela com RLS, leitura anônima negada, gravação/finalização direta por usuários negada, RPC executável pelo backend e política restritiva dedicada no Storage. O cadastro manteve um mapa; havia zero exportações e zero arquivos no bucket ao concluir a implantação do banco. Não houve envio de dados sintéticos à produção.

Implantação da função e publicação frontend aguardam registro de execução. O primeiro envio de um mapa existente deve ser feito pela interface com a conta do operador autorizada.
