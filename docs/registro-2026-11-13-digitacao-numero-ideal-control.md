# Ideal Control: digitação do número impresso

## Resultado

O botão **Digitar o número** localiza a credencial pelo número apresentado no ingresso/pulseira (`ni`, ou `n` para credenciais sem numeração impressa distinta). Não calcula o hash do texto digitado como se fosse o conteúdo do QR. Por exemplo, `250` e `000250` identificam a pulseira impressa 250 mesmo quando seu ordinal é 150.

Considera somente os setores autorizados no celular para resolver a escolha:

- Um setor autorizado correspondente: valida diretamente.
- Vários setores autorizados correspondentes: pede a escolha entre eles.
- Mesmo número em setor não autorizado: não participa da escolha. Quando não há nenhum correspondente autorizado, mantém a recusa de outra porta.
- Várias credenciais distintas com o mesmo número no mesmo setor escolhido: recusa e orienta ler o QR ou chamar o responsável. Não escolhe a primeira nem desempata pelo estado de entrada.

A validação usa a mesma identidade de credencial, fila, bloqueios pelo ordinal, confirmação online e fluxo de entrada/saída. A câmera continua reconhecendo o hash do QR. Digitar é uma validação de acesso, não uma consulta sem efeito.

## Compatibilidade

A digitação exige download completo da publicação `numero-impresso-v1:` já fornecida pelo backend. Carga antiga pode não distinguir o ordinal do número impresso; nesse caso, a tela orienta conectar e concluir o download, preservando a fila. Não exige migração SQL nem mudança de backend.

## Verificação e entrega

Testes sintéticos de regra e navegador em `tests/test_portaria_numero_digitado.py`: número impresso versus ordinal/hash, zeros à esquerda, zero, entrada inválida, cache antigo, download incompleto, permissões de setores, ambiguidades, bloqueios, leitura QR depois de digitação e vice-versa, recusa online e reentrada offline/saída confirmada.

Resultados: 34 testes novos passaram (30 iniciais e quatro casos adicionais). Na regressão de validação, tela, fonte e PWA, 114 passaram e dois falharam também no código original `HEAD`, reproduzido isoladamente em `dist/baseline-digitacao/resultado.txt`:

- `test_a_recusa_nao_oferece_escape`: a guarda textual encontra a palavra `liberar` em um comentário preexistente, não em uma ação de passagem.
- `test_o_pre_cache_e_o_html_pedem_a_mesma_versao`: fonte original mistura versões `1049` e `20261127`. A publicação precisa normalizar os assets pelo fluxo de release existente.

Sintaxe dos JavaScripts alterados e `git diff --check`: aprovados. Os testes não foram alterados para esconder essas duas falhas.

Base: `origin/main` em `4c26345d96598835bf23c7624d891316e996c1ac`. Alteração isolada na branch `fix/control-digitacao-numero-20261113`, preservando o checkout operacional.

Publicação autorizada em 13/11/2026. Preparação v20261132: referências de cache de `controle.html`, `portaria.html` e `reiniciar.html` alinhadas para a mesma versão, incluindo o registro do service worker. A falha de consistência do cache foi resolvida nesta preparação; o alerta textual preexistente continua documentado.

`entrega-segura.ps1 verificar`: VALIDADA, com 52 testes de tela, 34 de digitação e 32 de PWA aprovados. Regressão dos dois canais: 912 testes aprovados em cada canal, dois ignorados conforme a suíte e todos os harnesses concluídos. Pacote local de painel Piloto preparado a partir de base compatível, sem build de executável ou instalação.

Integração por PR protegido; implantação e prova de hashes públicos registradas separadamente em `dist/publicacao-v20261132.json` após a propagação. Não houve leitura/escrita de dados reais, alteração de autorizações ou teste de entrada em evento real. Recuperação: reverter somente esta mudança a partir da base atual ou selecionar o deployment de produção anterior na Cloudflare, com autorização específica e nova comprovação pública.
