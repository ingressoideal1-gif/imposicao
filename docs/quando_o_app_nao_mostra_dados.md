# Quando o app não mostra dados

Registro do episódio de 09/08/2026 e do roteiro para diagnosticar o próximo.

## O sintoma

Logo depois de publicar a v490, o app abriu **sem pedidos e sem numerações — zero
dados na tela**. A suspeita imediata, natural, foi regressão da versão recém-publicada.

Não era.

## O que as medições mostraram

**1. A versão não era a variável.** Rodando o mesmo diagnóstico duas vezes no mesmo
ambiente, trocando só o `frontend/` entre a v489 e a v490, o resultado foi idêntico:
mesmas contagens, nenhuma exceção. Um `git checkout <commit> -- frontend/`, rodar,
e `git checkout <commit-atual> -- frontend/` de volta é barato e resolve a pergunta
"é da minha mudança?" em dois minutos.

**2. Os dados estavam chegando.** O console do usuário mostrava
`[Vibecode] 22 OS carregadas, 991 itens totais`, `[Modelos] 45`,
`[loadAll] vibeProdutos carregados: 64`, `[Artes] 24 registros`. Nenhuma linha de
exceção de JavaScript.

**3. O que falhava era só o Storage.** Uma sequência de
`net::ERR_TIMED_OUT` em `vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/...`
— imagens de amostra e ícones. As **mesmas URLs**, buscadas da máquina de
desenvolvimento no mesmo momento, respondiam `HTTP 200` em 0,4 s.

Ou seja: o Storage estava no ar; o navegador daquela sessão é que não o alcançava.

**4. Passou sozinho.** Sem mudança nenhuma no código.

## Por que isso parece "zero dados"

Várias telas esperam as imagens antes de desenhar. Um `ERR_TIMED_OUT` não é rápido —
o navegador leva dezenas de segundos para desistir. Nesse intervalo a tela fica
vazia, com a cara exata de "não carregou nada", mesmo com os dados já em `state`.

É uma falha que se disfarça de outra: a causa é uma imagem, o sintoma é a tela toda.

## Roteiro para a próxima vez

Na ordem, porque cada passo elimina uma hipótese inteira:

1. **Ler o console até o fim.** Se há linhas de contagem (`[Vibecode] N OS`,
   `[loadAll] ... carregados`), os dados chegaram e o problema é de renderização ou
   de espera — não de acesso ao banco.
2. **Procurar exceção de JavaScript.** Sem nenhuma, é improvável que seja regressão
   de código recém-publicado; código quebrado costuma gritar.
3. **Separar PostgREST de Storage.** São dois serviços. `rest/v1/` respondendo e
   `storage/v1/` estourando timeout é um padrão de rede, não de aplicação.
4. **Buscar a URL que falhou, de fora do navegador.** `curl -o /dev/null -w "%{http_code} %{time_total}"`.
   Se responde 200 rápido, o serviço está no ar e o problema é o cliente.
5. **Só então suspeitar da versão** — e aí compare as duas de verdade, com o
   `git checkout -- frontend/` descrito acima, em vez de deduzir pelo diff.

## Blindagem que não foi feita

Um timeout curto nas imagens do Storage faria a tela desenhar sem elas em vez de
esperar o navegador desistir. Isso transformaria "sumiu tudo" em "faltam algumas
imagens" — que é um problema honesto, e muito mais fácil de reconhecer. Fica
registrado como opção, não como pendência.
