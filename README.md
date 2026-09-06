# Ideal Imposition

Sistema de produção gráfica para montagem, imposição e impressão de ingressos, pulseiras, credenciais e outros materiais com dados variáveis.

## Fonte de verdade

- Repositório principal: `ingressoideal1-gif/imposicao`
- Branch principal: `main`
- Domínio principal: [ideal-imposition.vercel.app](https://ideal-imposition.vercel.app)
- Arquitetura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- Publicação e reversão: [docs/PUBLICAR.md](docs/PUBLICAR.md)
- Agente da estação: [GUIA_AGENTE.md](GUIA_AGENTE.md)

A documentação descreve a arquitetura pretendida; o código implementa o comportamento, e a configuração dos ambientes confirma o que está efetivamente publicado. Divergências devem ser investigadas e corrigidas.

## Arquitetura em uma frase

O frontend roda na Vercel, usa Supabase para dados, autenticação, arquivos e funções de nuvem, enquanto o NewProd executa localmente na estação da gráfica a imposição de PDFs e a impressão.

## Componentes ativos

| Componente | Responsabilidade | Onde roda |
|---|---|---|
| Frontend | Interface web e fluxos operacionais | Vercel |
| Supabase Auth | Autenticação das sessões | Supabase |
| PostgreSQL e Storage | Dados e arquivos compartilhados | Supabase |
| Edge Functions | Operações de nuvem que exigem lógica ou privilégios protegidos | Supabase |
| NewProd | API local, motor de imposição, sincronização e impressão | Estação Windows |
| `app.py` | Aplicação FastAPI carregada pelo NewProd | `127.0.0.1:9000` no modo instalado |
| `engine.py` | Motor de montagem e imposição de PDFs | Estação Windows |
| `print_service.py` | Integração com impressoras | Estação Windows |
| `agent_worker.py` | Fila, sincronização, heartbeat e atualização do agente | Estação Windows |

## Login e operação local

A aplicação possui interface própria de login, com autenticação pelo Supabase Auth e autorização complementar da aplicação. Papéis, permissões e elevações internas não devem ser confundidos com a autenticação da sessão.

O modo local/offline é um fluxo separado. Ele não transforma o NewProd em backend público e não desloca a imposição para a nuvem.

## Limites desta documentação

- Não há backend Python em produção no Render.
- FastAPI faz parte do NewProd local; não é o backend de nuvem.
- Firebase é legado, exceto por compatibilidades de dados explicitamente documentadas.
- O estado de RLS deve ser confirmado no ambiente Supabase; não deve ser inferido apenas de scripts SQL históricos.
- A versão declarada no código, a versão instalada nas estações e a versão efetivamente publicada são estados diferentes.

## Desenvolvimento

Antes de alterar ou publicar:

```powershell
.\ferramentas\conferir.ps1
```

Consulte [docs/PUBLICAR.md](docs/PUBLICAR.md) para o fluxo oficial de publicação.
