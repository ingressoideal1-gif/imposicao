# Guia de Deploy — Ideal Imposition Online

Este guia explica detalhadamente como colocar a aplicação **Ideal Imposition** no ar utilizando **Supabase** para o banco de dados e armazenamento, **Vercel** para o Frontend, e **Render** (ou outra plataforma como Railway / Google Cloud Run) para o Backend em Python.

---

## 📋 Pré-requisitos

1. Uma conta no [Supabase](https://supabase.com/).
2. Uma conta na [Vercel](https://vercel.com/).
3. Uma conta no [Render](https://render.com/) ou outra plataforma de Cloud Containers.
4. O código do projeto versionado em um repositório Git (GitHub/GitLab).
5. (Opcional) O Node.js instalado na sua máquina caso deseje fazer deploy via terminal usando a Vercel CLI.

---

## 🗄️ Passo 1: Configurar o Supabase (Banco de Dados e Storage)

1. Acesse o [Supabase](https://supabase.com/) e crie um novo projeto.
2. Aguarde a inicialização do banco de dados do projeto.
3. Obtenha as credenciais do projeto em **Project Settings > API**:
   - `Project URL`
   - `Project API Keys (anon public)`
4. Abra o arquivo `frontend/supabase-config.js` e insira suas credenciais:

```javascript
const SUPABASE_URL = "SUA_PROJECT_URL";
const SUPABASE_KEY = "SUA_ANON_KEY";
```

5. Inicialize as tabelas do banco de dados no painel do Supabase executando as consultas SQL localizadas no arquivo `schema.sql`.
6. Crie um Bucket no **Supabase Storage** (ex: `artes` ou `imposicoes`) e certifique-se de configurar as regras de política de segurança (RLS) permitindo leitura/escrita.

---

## 🚀 Passo 2: Deploy do Backend (FastAPI) no Render

Como o backend processa arquivos PDF grandes usando bibliotecas nativas como `PyMuPDF`, a melhor opção de hospedagem gratuita/barata é o **Render**.

1. Conecte sua conta do GitHub ao Render.
2. Clique em **New > Web Service**.
3. Selecione o repositório do seu projeto.
4. Ajuste as seguintes configurações:
   - **Name:** `ideal-imposition-api`
   - **Language:** `Python`
   - **Root Directory:** `ideal-imposition` (ou deixe raiz se for repositório individual)
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app:app --host 0.0.0.0 --port 10000`
5. Conclua a criação do serviço web.
6. Assim que a build terminar, o Render fornecerá uma URL pública (ex: `https://ideal-imposition-api.onrender.com`).

---

## 🌐 Passo 3: Deploy do Frontend na Vercel

O Frontend estático do projeto possui suporte nativo para a Vercel através do arquivo `vercel.json` localizado na pasta `frontend`.

### Opção A: Pelo Painel com Git (Recomendado)
1. Acesse a [Vercel](https://vercel.com/) e faça login com sua conta do GitHub.
2. Clique em **Add New... > Project**.
3. Importe o repositório do Git.
4. Em **Root Directory**, clique em Editar e selecione a pasta `frontend` dentro do projeto.
5. Em **Framework Preset**, deixe como `Other`.
6. Clique em **Deploy**. A Vercel lerá automaticamente o arquivo `vercel.json` e publicará o site.

> [!IMPORTANT]  
> **Atualizações Automáticas (CI/CD):** A Vercel ficará "escutando" a branch `main` do seu repositório GitHub. Toda vez que você executar um `git push origin main`, a Vercel detectará a alteração e construirá uma nova versão do Frontend automaticamente. Não confunda com a branch `master`, que pode estar configurada para o Render (Backend).

> [!WARNING]  
> Certifique-se de que no arquivo `frontend/supabase-config.js` a variável `API_BASE_URL` esteja apontando para a sua URL do Render gerada no Passo 2! Senão, o Frontend do Vercel não conseguirá se comunicar com o seu motor de imposição.

### Opção B: Pelo Terminal (Vercel CLI)
Caso queira subir o projeto direto do seu computador usando terminal (CMD):
1. Abra o terminal e navegue até a pasta do frontend: `cd frontend`
2. Execute o comando: `npx vercel --prod`
3. Siga o passo a passo de autenticação e configuração que aparecerá no terminal, confirmando a pasta e nome do projeto. Ao final, a URL de produção será gerada!

---

## 🔄 Passo 4: Uso do Agente de Impressão Local (Opcional)

Se você estiver rodando a aplicação online e precisar enviar trabalhos diretamente para as impressoras físicas conectadas ao seu computador Windows:

1. Execute o agente local em seu computador Windows:
   ```bash
   python local_print_agent.py
   ```
2. O agente iniciará na porta `9000` local (`http://127.0.0.1:9000`).
3. O painel online detectará automaticamente o agente rodando em localhost para listar e enviar as impressões físicas.
