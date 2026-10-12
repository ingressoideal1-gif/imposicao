# Cache de artes — NewProd 1.2.389

Correção isolada no cliente de antecipação das artes. Nenhuma alteração de API,
Storage de artes, banco ou fila de impressão. Instalação e desligamento remotos
retirados do escopo pela orientação posterior: preparar para a atualização.

## Implementação

- `art_cache.py`: PDF em disco, transferência em blocos de 1 MiB, SHA-256 e tamanho,
  ETag persistido, If-None-Match, max-age/Age e substituição atômica.
- `antecipacao_local.py`: usa esse cache antes de montar o manifesto do conjunto.
  Uma falha no verso não descarta o PDF da frente já concluído.
- Revalidação explícita ignora a validade temporal do cache, detectando ETag novo.
  Sem ETag não se afirma que uma cópia antiga foi revalidada: a abertura aguarda.
- Espera crescente nas falhas de rede: 30, 60, 120 segundos, até uma hora. Se houve
  início de corpo, a próxima tentativa aguarda pelo menos uma hora. O início é
  persistido antes da leitura, inclusive para recuperação após reinício.
- Mesmo ETag em resposta 200 não permite reler o corpo dentro de uma hora.
  O parâmetro técnico piloto_revisao não cria outra identidade de arquivo.
- Travas por URL entre threads/processos; arquivos diferentes mantêm paralelismo.
- Log `cache-artes-http/tentativas.jsonl` na raiz local de pacotes: horário UTC,
  nome e hash de identificação do arquivo, status HTTP, resultado e próxima
  tentativa. Sem query strings/credenciais; rotação em 5 MiB e três backups.
- Não há limpeza automática dos PDFs persistidos; o espaço deve ser acompanhado.

## Prova com arquivo grande

Pedido 23195, modelo 1002142: PDF real de 157.955.806 bytes, SHA-256
`ee4ecaf7742907b79b69a77bfbc39bbf00910f8d2fb028410ee66758a2ff8724`.
Foi baixado uma única vez do Storage para o ensaio em loopback. Nesse pedido os
outros arquivos consultados têm aproximadamente 2 MiB; o segundo PDF de 156 MB
não foi identificado. A segunda carga do ensaio é explicitamente sintética,
com 163.577.856 bytes (156 MiB), interrompida aos 33.554.432 bytes.

| Etapa | Primeiro PDF | Segunda carga |
|---|---|---|
| Inicial | 200, 157.955.806 bytes | 200 interrompido aos 32 MiB |
| Três ciclos a cada 8 s | nenhuma requisição | nenhuma requisição |
| Relógio simulado avançado uma hora | 304, zero bytes | 200 completo |

Comando reproduzível: `python ferramentas/provar_cache_artes.py --primeiro CAMINHO_PDF --segundo OUTRO_PDF --saida PROVA.json`.
Sem `--segundo`, a ferramenta declara e usa a carga sintética de 156 MiB.
Evidência desta execução em `dist/prova-cache-grande.json`.

## Validação e canais

- 53 testes focados de cache, antecipação, seleção e revisão passaram.
- Oficial: 543 testes passaram, 2 skips; todos os harnesses de navegador do
  procedimento oficial passaram. As duas omissões pertencem à suíte existente.
- Executável oficial compilado; auditoria de arquivos privados passou.
- Versão oficial 1.2.389, superior ao oficial público 1.2.381 e às versões em campo.
- Variante 1.2.389-teste.1 baseada no código de teste 1.2.388, preservando suas
  funcionalidades. Não substitui esse canal pelo código do oficial.
- MSI, download público e manifestos têm validação separada da instalação.

Os limites de pacote existentes continuam iguais. Dois PDFs cuja soma exceda
256 MiB no mesmo conjunto permanecem recusados, mas o cache conserva os arquivos
já baixados. A evidência não comprova impressão física nem tráfego de estação
atualizada. Publicação não é prova de instalação; não há aviso automático de
ligamento agendado nesta entrega.

## Estações — última versão observada, não instalação desta entrega

Consulta somente leitura em 12/10/2026. Sinal antigo não comprova que a máquina
está ligada. Mantidos os canais e as permissões de atualização existentes.

| Estação | Última versão observada | Pacote preparado |
|---|---|---|
| TEX-01 | 1.2.381 | Oficial 1.2.389 |
| GUSTAVO-PROD | 1.2.381 | Oficial 1.2.389 |
| LAPTOP-9BSK81S0 | 1.2.374 | Oficial 1.2.389 |
| LASER-02 | 1.2.374 | Oficial 1.2.389 |
| LASER-04 | 1.2.374 | Oficial 1.2.389 |
| FLEXO | 1.2.371 | Oficial 1.2.389 |
| DESKTOP-PM6TG1B | 1.2.233 | Oficial 1.2.389 |
| ACABAMENTO | 1.2.363 | Oficial 1.2.389 |
| LASER-01 | 1.2.384-teste.1 | Teste 1.2.389-teste.1 |
| PC-JR-HOME | 1.2.387-teste.1 | Teste 1.2.389-teste.1 |

Há cadastros históricos/duplicados de Piloto, CESAR-CPD, PRD-ACABAMENTO e
Agente Ideal; eles não foram tratados como instalações atuais confirmadas.
Nenhuma dessas versões observadas é prova de instalação da correção.

Na variante de teste, 543 testes passaram e quatro falhas de perfil/publicador/
lista de sincronismo do painel foram reproduzidas também na base 1.2.388,
sem a correção. São limitações preexistentes daquele canal; não foram ocultadas
nem alteradas nesta tarefa. O cache e seus consumidores passaram nos 53 testes.
