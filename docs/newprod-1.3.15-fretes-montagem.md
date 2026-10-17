# NewProd 1.3.15 — Fretes ADM e controles da Montagem

Entrega autorizada em 17/10/2026 para web e novo instalador NewProd. Fonte do
agente baseada em `56475bb4`, continuação da versão pública 1.3.14. As duas
sessões originais e a pasta operacional foram preservadas.

## Conteúdo

- Fretes em ADM: consulta e edição de cidade/UF e das seis tarifas existentes,
  usando o cliente Supabase do Imposition. Campos alterados somente, conferência
  dos valores originais e retorno persistido. Cálculos e APIs do ERP permanecem
  inalterados. Nenhuma escrita real no banco durante desenvolvimento/testes.
- A restrição ADM é da interface; as políticas permissivas existentes da tabela
  não foram modificadas. Exige sessão de conta Vibe para consultar ou salvar.
- Montagem: prévia frente/verso independente, identificação compacta, saída no
  topo, PDFs separados e rotação de 180 graus da folha inteira de verso.
- Mantidos os filtros por setor, sugestão de uma folha, carregamento local,
  fontes e dependências locais e demais correções já publicadas na 1.3.14.

Os módulos de Fretes foram incorporados a script.js/style.css, já distribuídos.
Não houve alteração de motor, endpoints, autenticação ou permissões do banco.
O frontend web tem base própria: não foi copiado integralmente sobre o agente.

## Processo

Validar os três perfis em sequência para evitar disputa por PDFs temporários.
Build e auditoria do executável, preservador e MSI; conferência da versão do
instalador e dos arquivos do painel embutido. Publicar MSI com nome novo,
comparar tamanho e SHA-256 do download público antes de ativar os manifestos.
Conferir que os manifestos não mudaram por outra sessão antes da ativação.

Não executar instalação, reinício ou impressão física nas estações. A liberação
universal permite ao atualizador existente oferecer a atualização; não comprova
adoção por estação. Evidências de build, testes e publicação serão registradas
após a execução.

## Validação concluída antes do build

Produção, Piloto e oficial: 1.063 testes Python aprovados por perfil, dois
pulados e dois subtestes aprovados. Todos os harnesses previstos passaram
(63 etapas no total). Fretes e as 222 verificações da tela da Montagem passaram
na base do agente. O aviso Starlette/httpx vem das dependências existentes.
