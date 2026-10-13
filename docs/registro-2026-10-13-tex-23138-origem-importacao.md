# TEX-01: HTTP 422 no pedido 23138

Diagnostico D-b0fa095fada7, em 13/10/2026 17:49 (Sao Paulo), agente 1.2.400.
Reproducao no Junior usando ClienteAutonomo autorizado e ServicoPacotes em
pasta temporaria isolada, sem impressao ou alteracao do ERP.

Os modelos 1002053 e 1002054 falhavam com `Origem de recurso nao permitida`
em pacotes_download.validar_url, chamado por ServicoPacotes.antecipar. O
catalogo incluia banco.csv_url (pagina de edicao Google Sheets) como recurso
obrigatorio, embora banco.csv_data ja contivesse os 11 registros importados.

Correcao em fontesPiloto: excluir somente csv_url dos metadados de registros
com csv_data em array. Preservar snapshot, linhas, fotos e fontes. URLs dentro
das linhas continuam coletadas; sem csv_data, nao esconder a dependencia.
Nenhuma permissao de download foi ampliada.

17 testes direcionados passaram. Reproducao com a funcao TypeScript corrigida
montando as fontes, e o preparador Python real baixando e validando os arquivos,
retornou ambos os pacotes preparados, sem_arte vazio e os 11 registros intactos.
Isso comprova preparacao local; nao comprova PDF final nem impressao fisica.

Publicacao pendente: acesso de gerenciamento Supabase retornou HTTP 401 ao
consultar o corpo de piloto-local. Nao foi alterada a funcao publicada, nenhum
MSI foi publicado e a TEX ainda utiliza a resposta anterior. Restabelecer
autenticacao de deploy, baixar/revisar a fonte atualmente publicada, aplicar
esta alteracao pontual preservando os demais modulos, publicar piloto-local
e conferir nova abertura real do pedido antes de declarar resolvido.

Suite completa das Edge Functions: 349 aprovados, zero falhas; cache existente, sem instalar dependencias.
