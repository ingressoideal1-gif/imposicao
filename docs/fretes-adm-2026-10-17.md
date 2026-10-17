# Consulta e edição de fretes no ADM

## Entrega local

`ADM → Fretes` consulta e edita o cadastro existente `transportadoras`, usando
o cliente Supabase já incluído no Imposition. Busca por cidade/UF, páginas de
50 registros e formulário para cidade, UF e seis tarifas. Sem inclusão ou
exclusão. Não houve publicação, escrita real, migração ou mudança de políticas
no banco durante o desenvolvimento.

Os cálculos e as APIs continuam sendo responsabilidade do ERP parceiro. Não
foram criadas rotas, funções ou regras de cálculo. O módulo não chama a RPC de
cálculo de frete. SM, UN e MB permanecem com as siglas existentes no cadastro.

## Consulta e gravação

- SELECT apenas de `id`, `cidade`, `uf`, `1kg_SM`, `extra_SM`, `1kg_UN`,
  `extra_UN`, `1kg_MB`, `extra_MB`, ordenado por cidade, UF e id. Busca literal
  com curingas escapados. Consulta 51 linhas para apresentar 50 e identificar
  a existência da próxima página.
- UPDATE somente ao clicar em Salvar alterações, apenas dos campos editados,
  filtrado por id e pelos oito valores originais. Comparação atômica evita
  sobrescrever uma edição concorrente; campos NULL usam `is.null`.
- Resposta com `return=representation` precisa conter exatamente uma linha
  com o id e os valores pretendidos. Resposta vazia ou erro não é sucesso; o
  formulário permanece aberto para o ADM revisar e consultar novamente.
- Campos intocados mantêm NULL, zero e precisão. Não há arredondamento novo.
- Ao mudar cidade/UF, consulta duplicata antes de salvar. Essa conferência
  não garante unicidade contra renomeações simultâneas: a tabela não possui
  restrição única para cidade/UF e nenhuma restrição foi criada.
- Exige conta Vibe com sessão ativa e papel ADM na interface. Código de
  operador local sozinho não autoriza as operações desta tela.

## Limite do controle de acesso

A aba e as ações são restritas ao papel `admin` no Imposition. As políticas
preexistentes da tabela continuam inalteradas. A política `geral` foi observada
como permissiva na inspeção autorizada de 17/10/2026; a restrição da interface
não impede acesso direto à tabela por outros clientes. Não se deve apresentar
esta entrega como uma restrição de acesso implementada no banco.

## Validação

`tests/fretes_adm_browser_harness.js` usa Chromium e o SDK Supabase distribuído
no frontend, com transporte simulado e rede bloqueada. Cobre acesso de outros
perfis, falta de sessão, consulta vazia, paginação, busca literal, texto tratado
como texto, edição sem arredondamento, negativos, decimal com vírgula, retorno
sem registro, erro, edição concorrente, duplicata e layout de 390 px. Confere
que o PATCH usa id e valores originais e não atinge outros registros.

O teste também confirma que as chamadas se limitam ao cadastro de fretes, sem
RPC de cálculo nem API nova. A consulta e a gravação reais não foram testadas.
