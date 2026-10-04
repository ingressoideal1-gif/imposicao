# Compatibilidade dos elementos de numeração

Entrega autorizada: web v1015 e NewProd 1.2.355. Implementação isolada a partir de `origin/main`; o checkout operacional foi preservado.

## Regras do editor

- Texto sequencial, texto fixo, QR, QR Ideal, código de barras, PDF, SVG, Picote, Foto e Texto Banco não mudam o tipo. Seus contratos de dados e finalidade continuam os mesmos.
- O primeiro elemento de Camarote seleciona CAMAROTE; o primeiro de Teatro seleciona TEATRO. Essa regra também vale ao duplicar elementos especializados.
- Teatro e Camarote não podem ser adicionados à mesma numeração. Os botões continuam visíveis, desabilitados com motivo quando incompatíveis. A recusa ocorre antes de alterar elementos, contador e histórico.
- Enquanto houver elementos especializados, uma troca manual para outro tipo é recusada. Remover o último elemento mantém o tipo; o operador pode então escolher outro tipo ou adicionar a outra família.
- Desfazer/refazer restaura os elementos e o tipo associado ao histórico.
- Abrir uma numeração existente não converte seu tipo nem remove elementos. Uma combinação histórica de Teatro e Camarote recebe aviso e bloqueia novas adições especializadas até remover uma das famílias. Elementos comuns continuam disponíveis.
- Salvamento, formatos compatíveis, fundos, alinhamentos, agrupamentos, faces e tamanho de visualização continuam no fluxo existente. FICHAS e o funcionamento de TICKET não foram redesenhados nesta entrega.

## Condições do motor

| Elementos | SEQUENCIAL | CAMAROTE | TEATRO | Dados necessários |
|---|---|---|---|---|
| Texto, texto fixo, QR e código de barras | Sim | Sim | Sim | Conteúdo válido; origem Banco requer coluna/linhas válidas |
| QR Ideal | Sim | Sim | Sim | Pedido, modelo e pool da estação |
| PDF e SVG | Sim | Sim | Sim | Arquivo válido; finalidade Impressão ou Layout preservada |
| Picote | Sim | Sim | Sim | Referência existente de posicionamento; esta entrega não adiciona renderização de picote no PDF |
| Foto e Texto Banco | Sim | Sim | Sim | Banco configurado no pedido e recursos da coluna |
| Local, Pessoa e Pessoa/Total | Seleciona CAMAROTE ao adicionar | Sim | Adição bloqueada se há elementos de Teatro | Início, quantidade de locais e pessoas por local |
| Fila, Lugar e Fila/Lugar | Seleciona TEATRO ao adicionar | Adição bloqueada se há elementos de Camarote | Sim | Fila para Fila; Numero para Lugar; ambas para Fila/Lugar |

O contador comum mantém sua sequência própria; ele não passa a representar o número do local ou da pessoa. O cálculo de Camarote no verso passa a usar o mesmo índice e parâmetros da frente. A validação de Teatro confere todas as linhas antes da primeira folha e utiliza o banco de cada modelo em Multi-Artes. Sem os dados exigidos, a geração para com uma mensagem; exemplos A/22 do editor não são impressos como dados reais.

## Validação e limites

Harness de navegador com rede bloqueada nas duas páginas: seleção de tipo, adição incompatível sem mutação, elementos comuns, troca manual, remoção, histórico e restauração de registros antigos. Regressões existentes de faces, banco, zeros de Camarote e prévia de PDF mantidas.

Testes Python com dados sintéticos: combinações de elementos comuns com cada família em Frente, Frente/Verso e Verso Único; verificação de todas as páginas e de Pessoa/Total nas duas faces; Teatro sem banco e célula vazia na última linha; mapas, snapshots e múltiplos setores em Multi-Artes.

A publicação do MSI e do manifesto não comprova instalação nas estações nem impressão física. A correção do motor depende de NewProd 1.2.355 instalado. Para recuperação do motor, recompilar o código anterior com uma versão maior; não reutilizar nomes de MSI nem ativar manifesto antes de conferir o download público.
