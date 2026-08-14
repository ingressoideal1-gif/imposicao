# Controle de acesso, parte 3a — a tela do dono do evento

Data: 14/08/2026

## O problema

Depois da parte 2 o evento existe. O cliente leu o QR do Pedido, entrou com a conta do
Vibe, e os setores nasceram com os nomes e as quantidades que o ERP tinha naquele momento.
E acaba aí: a última tela do `evento.html` promete "configurar lotação, liberar aparelhos"
e **não existe porta nenhuma** para isso.

Sem esta parte a portaria não pode funcionar, e não por falta de acabamento: **nenhum
aparelho existe**. Como cada aparelho valida apenas a lista de setores dele, um evento sem
aparelho cadastrado recusaria toda leitura com `setor_nao_autorizado`. A tela de
configuração não é o enfeite que vem depois do leitor — é o que torna o leitor possível.

Esta spec termina quando o dono do evento consegue, do celular dele: ajustar os dados do
evento, definir lotação e tipo de uso de cada setor, criar os aparelhos da portaria com a
lista de setores de cada um, e carregar os códigos próprios de staff e cortesia.

## O que já existe

**Parte 1**, publicada (v566, agente 1.2.65): o QR Ideal sai impresso no ingresso.

**Parte 2**, publicada: as sete tabelas `producao_acesso_*`, o QR do Pedido, a publicação
automática da faixa de códigos pelo agente, e o `evento.html` onde o cliente reivindica o
pedido.

**O `acesso_api.py`**, que é hoje o único caminho até aquelas tabelas. Ele guarda a
`service_role` e já tem `_usuario_logado()`, que confere o JWT do Supabase de verdade.

**O Ideal Control atual**, em `ideal-IdealControl/`, fora deste repositório. Banco próprio,
RLS desligado, `sw.js` que ainda lista SDKs do Firebase removidos em junho.

## Decisões do usuário nesta rodada

**A configuração vem antes da portaria.** Perguntado sobre o que construir primeiro, o
usuário escolheu a tela do dono. É também a ordem que funciona: sem aparelho cadastrado a
portaria não valida nada.

**O layout é novo.** Isto **reverte** a decisão de 13/08 de que o Ideal Control seria
"evoluído, não reescrito". Nas palavras do usuário: *"Vamos fazer novo layout, mais limpo,
direto e objetivo, não ficou bom a outra versão, precisamos melhorar"*. O `app.js` de 79 KB
e o `style.css` de 20 KB do app antigo **não são portados**. O que sobrevive da decisão
anterior é o resto dela: o controle de acesso passa a morar dentro deste repositório, e
ganha os freios do `publicar.ps1`, a tag de restauração e o `conferir.ps1`.

Continuam valendo, da parte 2:

- Cada aparelho tem a conta do cliente mais um código curto próprio, revogável um a um.
- Cada aparelho valida apenas uma lista de setores.
- Configurar o evento exige a senha do dono; sem ela é somente leitura.
- Ler ingresso e registrar entrada nunca pedem senha — é o trabalho do porteiro.

## Esta parte não precisa de SQL

As sete tabelas da parte 2 já têm todas as colunas que esta spec usa:
`setores.lotacao`, `setores.tipo_uso`, `dispositivos.codigo_hash`, `dispositivos.status`,
`dispositivo_setores`, `credenciais.origem` e `credenciais.codigo_visivel`.

**Nada a criar, nada a alterar.** Não há arquivo para colar no editor do Supabase nesta
entrega. Quem já rodou o `sql/schema_acesso.sql` está pronto.

## A arquitetura

```
Celular do dono                       Render                       Supabase
┌──────────────────┐        ┌──────────────────────┐        ┌──────────────┐
│  controle.html   │  JWT   │  acesso_config.py    │  svc   │ producao_    │
│  controle.js     │───────►│  acesso_elevacao.py  │───────►│ acesso_*     │
│  controle.css    │   +    │                      │  role  │ RLS ligado,  │
│  acesso-conta.js │elevação│  usa a porta única   │        │ 0 políticas  │
└──────────────────┘        │  acesso_api.supabase()        └──────────────┘
                            └──────────────────────┘
```

Nenhuma chave de banco chega ao celular, exatamente como na parte 2. O router novo mora em
`acesso_config.py`, mas **importa** a função `supabase()` do `acesso_api.py` em vez de
abrir a própria conexão. Assim a pergunta "quem tem a chave-mestra do banco na mão?"
continua tendo um arquivo só por resposta — que é a propriedade que o cabeçalho do
`acesso_api.py` promete e que uma cópia da função destruiria em silêncio.

## As duas chaves de entrada

| Chave | O que prova | Como se obtém | Vale |
|---|---|---|---|
| JWT do Supabase | *quem* você é | login com a conta do Vibe | enquanto a sessão durar |
| Token de elevação | que você digitou a senha **agora** | `POST /elevar` | 15 minutos |

Toda **leitura** exige o JWT e ser dono do evento. Toda **escrita** exige os dois. É a
decisão de 13/08: *"sem a senha é somente leitura = não altera as configurações do
evento"*.

### Por que elevação, e não sessão

O celular fica na mão do porteiro. Uma autorização que não expira transforma aquele
aparelho num painel de configuração permanente — e o porteiro tem a conta do cliente,
porque é assim que ele entra. A senha do dono é o que separa operar de configurar, e ela
precisa ser reapresentada.

### O formato do token

Mesma forma do `qr_pedido.py`, de propósito: quem já leu um entende o outro.

```
elevacao   = "<evento>.<conta>.<navegador>.<vencimento>.<assinatura>"
assinatura = HMAC-SHA256(ACESSO_ELEVACAO_SEGREDO, "<evento>.<conta>.<navegador>.<vencimento>")
             em base64url, 27 caracteres
```

A conferência segue a mesma ordem do `qr_pedido.conferir`: **assinatura antes de
validade**. Conferir a validade primeiro contaria a quem estivesse tentando que aquele
token existiu algum dia, e o vencimento é justamente o campo que um atacante controlaria no
palpite.

`navegador` é um UUID que o `controle.js` sorteia na primeira visita e guarda em
`localStorage` sob `acesso_navegador_id`. **Não é** o `producao_acesso_dispositivos.id`:
aquele é o aparelho cadastrado da portaria, este é apenas a instalação do navegador. São
coisas diferentes e a spec nunca as confunde — um dono configura do celular pessoal dele,
que não é aparelho de portaria nenhum.

### A variável nova

`ACESSO_ELEVACAO_SEGREDO`, no Render, ao lado das três que já existem. Sorteada com 32
bytes aleatórios.

Reaproveitar o `QR_PEDIDO_SEGREDO` funcionaria e pouparia uma colagem. Não vale: no dia em
que um segredo precisar ser trocado, trocar aquele invalidaria **todo QR do Pedido em
circulação**, inclusive os que já estão no WhatsApp dos clientes. Um segredo por trabalho é
o que torna a rotação possível sem dano colateral.

O `ferramentas/copiar_para_render.ps1` passa a conhecer a quarta variável, e o
`/api/acesso/saude` passa a cobrar as quatro — é lá que se descobre uma variável faltando
antes do cliente descobrir.

## O layout

Uma coluna, feito para o polegar, **sem abas**. A tela do evento rola de cima a baixo e
cada assunto é um cartão com título em texto. Fonte do sistema, sem CDN de fonte.

```
┌─────────────────────────────────────┐
│ ← Meus eventos                      │
│ Baile do Hawaii                     │
│ 12 000 ingressos · 3 setores        │
├─────────────────────────────────────┤
│ ⚠ Modo configuração · 14:32 restante│  ← só quando elevado
│                             [Sair]  │
├─────────────────────────────────────┤
│ DADOS DO EVENTO                     │
│ Nome    [ Baile do Hawaii         ] │
│ Data    [ 28/09/2026 ] [ 22:00 ]    │
│ Local   [ Clube Recreativo        ] │
├─────────────────────────────────────┤
│ SETORES                             │
│ ┌─────────────────────────────────┐ │
│ │ PISTA                           │ │
│ │ 5 000 encomendados · 5 000 no ar│ │
│ │ Lotação máxima  [ 4 800 ]       │ │
│ │ Uso do ingresso                 │ │
│ │   (•) Vale uma entrada só       │ │
│ │   ( ) Permite sair e voltar     │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ APARELHOS DA PORTARIA               │
│ ┌─────────────────────────────────┐ │
│ │ Portão A                  ativo │ │
│ │ Valida: PISTA, VIP              │ │
│ │ [Editar]  [Gerar outro código]  │ │
│ │ [Revogar este aparelho]         │ │
│ └─────────────────────────────────┘ │
│ [+ Novo aparelho]                   │
├─────────────────────────────────────┤
│ MEUS CÓDIGOS (staff, cortesia)      │
│ 42 códigos carregados               │
│ [Carregar códigos]                  │
└─────────────────────────────────────┘
```

Princípios que o layout tem de cumprir, e que os testes cobram:

- **Todo controle tem rótulo em texto.** Nada depende de ícone para ser entendido.
- **A quantidade impressa é somente leitura.** Quem manda nela é o ERP; deixá-la editável
  convidaria o cliente a "corrigir" um número que não é dele.
- **"5 000 encomendados · 5 000 no ar"** compara o que o ERP registrou com o que o agente
  publicou. Quando os dois divergem, o cartão diz em texto o que aquilo significa: ou a
  impressão ainda não terminou de publicar, ou alguém publicou o que não devia. É a
  conferência que a parte 2 prometeu para endereçar o risco residual do segredo do agente.
- **O que o sistema faz sozinho se anuncia.** Gravou, a tela diz que gravou.

## Os arquivos

| Arquivo | Responsabilidade | Estado |
|---|---|---|
| `frontend/controle.html` | estrutura da tela, sem lógica | novo |
| `frontend/controle.js` | estado, chamadas ao backend, elevação | novo |
| `frontend/controle.css` | o visual novo, celular primeiro | novo |
| `frontend/acesso-conta.js` | login, "esqueci a senha", `pedir()` | novo, compartilhado |
| `frontend/evento.js` | passa a usar o `acesso-conta.js` | alterado |
| `acesso_elevacao.py` | emitir e conferir o token de 15 min | novo, ~70 linhas |
| `acesso_config.py` | o router da configuração | novo |
| `acesso_api.py` | `/saude` passa a cobrar quatro variáveis | alterado |
| `app.py` | monta o router novo sob a mesma condição do outro | alterado |
| `security_config.py` | os quatro nomes novos em `PAINEL_ARQUIVOS` | alterado |
| `ferramentas/copiar_para_render.ps1` | conhece a variável nova | alterado |

`acesso_elevacao.py` é um módulo separado e sem dependência de HTTP nem de banco, pelo
mesmo motivo que o `qr_pedido.py` é: criptografia se testa sozinha, e um arquivo de 70
linhas se lê inteiro antes de confiar nele.

O `controle.html` carrega os scripts dele com o carimbo `?v=NNN`, como as outras páginas. O
`publicar.ps1` já bumpa **todo** `frontend/*.html`, então isso basta para o carimbo
acompanhar os demais sozinho — e sem ele o navegador do cliente serviria a versão anterior
do `controle.js` por tempo indefinido.

## Os endpoints

Todos sob `/api/acesso`, montados apenas quando `acesso_api.disponivel()`.

```
GET   /eventos/{id}               evento + setores + aparelhos + pedidos + contagens
POST  /eventos/{id}/elevar        {senha, navegador} → {token, expira_em}
PATCH /eventos/{id}               nome, data, local                        [elevado]
PATCH /setores/{id}               nome, lotação, tipo de uso               [elevado]
POST  /eventos/{id}/aparelhos     cria e devolve o código UMA vez          [elevado]
PATCH /aparelhos/{id}             nome, lista de setores, revogar          [elevado]
POST  /aparelhos/{id}/codigo      gera outro código e devolve              [elevado]
POST  /eventos/{id}/codigos       importa os códigos do cliente            [elevado]
```

`GET /meus-eventos` já existe na parte 2 e é reaproveitado.

### A guarda que não pode ser esquecida

Um auxiliar único, `_evento_do_dono(evento_id, usuario)`, responde "este evento é desta
conta?" e levanta 403 quando não é. Todo endpoint acima passa por ele — inclusive os que
recebem `setor_id` ou `aparelho_id` em vez de `evento_id`, subindo até o evento antes de
decidir, e inclusive o `/elevar`, que não pode emitir elevação para evento alheio nem
mesmo com a senha certa de outra conta. Espalhar essa checagem por oito funções é como ela
some de uma delas.

### A resposta do GET

```json
{
  "evento":   {"id": "...", "nome_evento": "...", "data_evento": null, "local_evento": ""},
  "setores":  [{"id": "...", "nome": "PISTA", "quantidade": 5000, "publicadas": 5000,
                "lotacao": null, "tipo_uso": "unico",
                "pedido_id_int": 18560, "modelo_id": 1000110}],
  "aparelhos":[{"id": "...", "nome": "Portao A", "status": "ativo",
                "ultimo_visto": null, "setores": ["<setor_id>", "..."]}],
  "pedidos":  [{"pedido_id_int": 18560, "publicado_em": "...", "total_credenciais": 5000}],
  "codigos_cliente": 42
}
```

`publicadas` é a contagem real de `producao_acesso_credenciais` daquele setor. É o número
que a tela compara com `quantidade`.

## O código do aparelho

Seis caracteres do alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ` — sem `0`, `O`, `1`, `I` e
`L`, que o porteiro erraria lendo do papel. São 31⁶ ≈ 8,9 × 10⁸ combinações.

Guardado como `pbkdf2(codigo, sal_do_evento)`, reaproveitando o `qr_ideal.hash_codigo` que
já existe e já é testado contra o gêmeo do navegador. O código é normalizado para
maiúsculas e sem espaços antes do hash, nos dois lados.

**Aparece uma vez.** Não há como mostrá-lo de novo, porque não está guardado. Se o dono
esquecer, gera outro — e a tela diz, em texto, que **gerar outro código não desconecta o
aparelho que já entrou**, porque quem mantém o aparelho conectado é o `token_hash` dele.
Sem essa frase o dono não gera com medo de derrubar a portaria no meio do evento.

Revogar o aparelho é outra ação, separada, e essa sim o desliga.

## Os códigos do cliente

O dono cola uma lista, um código por linha, e escolhe o setor. O backend hasheia cada um
com o **sal do evento** — não com o sal de um pedido, que é o que os códigos do QR Ideal
usam — e grava `origem='cliente'`, `codigo_visivel` preenchido, `evento_id` e `setor_id`.

`codigo_visivel` **só** existe quando `origem='cliente'`. O código é do cliente, e ele
precisa administrar a própria lista de staff. O nosso nunca aparece em claro, em hipótese
nenhuma — um teste cobra isso.

Limites: 5 000 códigos por envio, cada um de 1 a 64 caracteres. Repetidos dentro do mesmo
envio são reduzidos a um; repetidos com o que já existe são ignorados pela chave única
`uq_acesso_credencial_hash_simples`, o que torna reenviar a mesma lista inofensivo.

## Validação das escritas

| Campo | Regra |
|---|---|
| `nome_evento` | 1 a 120 caracteres depois de aparar |
| `data_evento` | ISO 8601 ou nulo |
| `local_evento` | até 200 caracteres |
| setor `nome` | 1 a 60 caracteres |
| `lotacao` | nulo, ou inteiro de 0 a 10 000 000 |
| `tipo_uso` | `unico` ou `reentrada`, nada mais |
| aparelho `nome` | 1 a 60 caracteres |
| setores do aparelho | todos têm de pertencer ao evento |

Recusar valor fora da regra com 422 e uma frase que diga o que fazer, não o que houve.

## Erros e casos de borda

**Rede fora.** A tela avisa e **mantém o que foi digitado**. Nada é limpo por causa de
falha de rede.

**Elevação vencida no meio de uma edição.** A gravação volta 401 com um código próprio
(`elevacao_expirada`). A tela pede a senha e **repete a mesma gravação** com o token novo,
sem perder o que estava na caixa de texto. Perder o texto digitado por causa de um relógio
é o tipo de coisa que faz o cliente abandonar a tela.

**Elevação de outro navegador.** Recusada. O `navegador` faz parte da assinatura.

**Senha errada.** Uma frase só, sem dizer se o problema foi o e-mail ou a senha.

**Evento de outra conta.** 403, com a mesma frase para "não existe" e "não é seu" — dizer a
diferença contaria a um estranho quais eventos existem.

**Dois donos editando ao mesmo tempo.** Fora de escopo: a conta é uma só, compartilhada. A
última gravação vence, como hoje.

## O que fica de fora, e por quê

| Fora desta spec | Vai para |
|---|---|
| Ler QR, validar sem rede, fila de leituras | 3b — a portaria |
| Painel ao vivo e relatórios | 3c |
| Cancelar credencial | 3c — sem o painel o dono não tem como saber qual cancelar |
| Desvincular pedido do evento | depois — destrói configuração de setor, e o conserto de hoje é o atendente gerar outro QR |
| Limpeza do `sw.js` e o offline de verdade | 3b, onde o offline passa a ser requisito |

## A janela de sincronismo do painel

Quatro nomes novos entram em `PAINEL_ARQUIVOS`, e a estação baixa o painel usando a lista
**embutida no agente instalado**. Um agente anterior a este release não conhece esses
nomes: ele sincroniza o `evento.html` novo, que passa a pedir o `acesso-conta.js`, e não
busca esse arquivo. Naquela janela, o `evento.html` **servido pela estação** quebra.

Risco aceito, e a razão é concreta: `evento.html` não está em nenhum caminho do operador.
Ele existe para o celular do cliente, que o abre pela Vercel. As três páginas que o
operador usa — `index.html`, `producao.html`, `cliente.html` — não carregam nenhum dos
arquivos novos. E o agente sai na mesma publicação que o site, como manda a regra do
projeto, então a janela é de uma sincronização.

Foi assim que o `arte-de-impressao.js` mordeu em 14/08, e a diferença que torna este caso
aceitável é exatamente essa: aquele era carregado pelo `index.html` e pelo `producao.html`,
no meio da imposição.

## Testes

**Elevação (`acesso_elevacao.py`), sem rede nem banco:**

- Token válido devolve evento, conta e navegador.
- Assinatura adulterada é recusada.
- Token vencido é recusado.
- Token de outro navegador é recusado.
- Trocar o evento dentro do token é recusado — a assinatura cobre todos os campos.
- Servidor sem `ACESSO_ELEVACAO_SEGREDO` recusa emitir, em vez de assinar com vazio.

**Configuração (`acesso_config.py`), contra um Supabase de mentira:**

- Conta que não é dona: 403 em toda leitura e escrita.
- Toda escrita sem elevação: 401.
- `tipo_uso` fora de `{unico, reentrada}`: 422.
- `lotacao` negativa: 422.
- Aparelho com setor de outro evento: 422.
- O código do aparelho não aparece em nenhuma leitura posterior.
- Importar a mesma lista duas vezes não duplica credencial.
- `codigo_visivel` nunca é gravado com `origem='qr_ideal'`.

**Navegador, no harness que já existe:**

- A tela não grava sem elevação.
- A faixa "Modo configuração" mostra o tempo e some ao sair.
- A lista de setores de um aparelho vai e volta inteira.
- Divergência entre encomendado e publicado aparece em texto no cartão do setor.

**Publicação:**

- Os quatro nomes novos estão em `PAINEL_ARQUIVOS` e existem em `frontend/`.
- O `copiar_para_render.ps1` conhece as quatro variáveis.
- `/api/acesso/saude` cobra as quatro.

## Riscos aceitos

**A conta é compartilhada.** Quem tiver o e-mail e a senha do Vibe do cliente é o dono do
evento. É a decisão da parte 2 e não se reabre aqui. A senha do dono na elevação protege
contra o porteiro que recebe o aparelho já logado, que é a exposição real.

**O token de elevação fica no `sessionStorage`.** Legível por script da própria página. Não
há script de terceiros nessas páginas, e a alternativa — pedir a senha a cada gravação —
tornaria a tela inutilizável.

**O código curto do aparelho tem 8,9 × 10⁸ combinações.** Não é senha de banco: ele vale
para um evento, um aparelho, e é revogável num toque. O PBKDF2 no servidor torna tentativa
em massa cara, e a parte 3b acrescenta o limite de tentativas quando o endpoint de entrada
do aparelho existir.
