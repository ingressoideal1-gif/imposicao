# Entrega conjunta: Fretes ADM e controles da Montagem

## Escopo

Preparação isolada a partir de `origin/main` em `7523c517` (web v1071).
Fontes preservadas: `imposition-fretes-adm-20261017` e
`imposicao-montagem-faces-controles-20261017`. A pasta operacional não foi
sincronizada, limpa ou sobrescrita.

- Fretes: consulta e edição do cadastro existente, restritas à interface ADM;
  sem alterações de cálculos, APIs do ERP, políticas ou estrutura do banco.
  Detalhes em [fretes-adm-2026-10-17.md](fretes-adm-2026-10-17.md).
- Montagem: prévia frente/verso independente, controles compactos, saída no
  topo, PDF com faces separadas e rotação da folha inteira de verso. Preservados
  os filtros por setor e a sugestão de uma folha da base local NewProd 1.3.14.
  Detalhes em [registro-2026-10-17-montagem-faces-controles.md](registro-2026-10-17-montagem-faces-controles.md).

A integração web usa somente o módulo Montagem, sua seção no HTML, estilos
específicos e testes. Não copia as outras diferenças do painel do agente sobre
o site. O cache dos assets compartilhados é atualizado também nas páginas
cliente e produção. Versão web preparada: v1072.

Fretes foi incorporado a `script.js` e `style.css`, já distribuídos ao painel,
para manter a compatibilidade da lista de sincronização sem alterar Python.

## Validação e limites

Validação focada: navegador de Fretes com rede bloqueada e SDK real;
3.586 verificações do núcleo e 222 da tela de Montagem; 17 testes de PDF,
incluindo rotação/pixels; 96 verificações iniciais de sintaxe do frontend (95 após incorporar Fretes ao script existente). Diff e
checagem de escopo aprovados pelo `entrega-segura.ps1 verificar`.

A primeira bateria ampliada identificou os assets novos fora da lista de
sincronização do painel. A incorporação a script/style corrigiu a causa, e os
10 testes de painel passaram. Não houve dispensa nem alteração de teste.

A bateria completa de compatibilidade passou em produção e Piloto: 831 testes
Python, 2 pulados e 2 subtestes aprovados por canal, além de todos os harnesses
JavaScript previstos. O aviso de depreciação Starlette/httpx é da dependência
existente; nenhuma dependência foi alterada.

Publicação, CI e comprovação dos assets públicos devem ser registrados depois
da execução. Não foram gravados dados reais nem realizadas impressões.
Publicação web não atualiza o painel instalado nas estações NewProd.

## Recuperação

O ponto anterior da web é `7523c517` / v1071. Em caso de regressão, preparar
reversão dos commits desta entrega em branch separada, passar os checks e
publicar por PR. Não restaurar arquivos sobre a pasta operacional suja.
