# Guia de Deploy — Ideal Imposition Online

Este guia explica detalhadamente como colocar a aplicação **Ideal Imposition** no ar utilizando **Firebase** (Firestore + Hosting) para o Frontend e **Render** (ou outra plataforma como Railway / Google Cloud Run) para o Backend em Python.

---

## 📋 Pré-requisitos

1. Uma conta no [Firebase Console](https://console.firebase.google.com/).
2. O Node.js instalado na sua máquina (necessário para usar a ferramenta de CLI do Firebase).
3. Uma conta no [Render](https://render.com/) ou outra plataforma de Cloud Containers.
4. O código do projeto versionado em um repositório Git (GitHub/GitLab).

---

## 🛠️ Passo 1: Configurar o Firebase (Banco de Dados Firestore)

1. Acesse o [Firebase Console](https://console.firebase.google.com/) e clique em **Adicionar projeto**.
2. Dê um nome ao projeto (ex: `ideal-imposition`) e conclua a criação.
3. No menu lateral, acesse **Build > Firestore Database** e clique em **Criar banco de dados**.
4. Selecione a localização do servidor (por exemplo, `southamerica-east1` para o Brasil) e inicie no **Modo de teste** (para desenvolvimento inicial) ou **Modo de produção**.
   - *Nota:* Se iniciar em Modo de teste, as regras expiram em 30 dias. Para produção, configure as regras de segurança apropriadas.
5. No painel do Firestore, adicione três coleções vazias clicando em **Iniciar coleção**:
   - `formatos`
   - `numeracoes`
   - `saidas`

---

## 🌐 Passo 2: Configurar o Firebase no Frontend

1. No painel principal do seu projeto Firebase, adicione um **Aplicativo Web** (ícone `</>`).
2. Registre o app com um nome e ative a opção do **Firebase Hosting** para este aplicativo.
3. Copie as chaves do objeto de configuração gerado (semelhante ao código abaixo).
4. Abra o arquivo `frontend/firebase-config.js` no seu editor e atualize as credenciais no objeto `firebaseConfig`:

```javascript
const firebaseConfig = {
    apiKey: "SUA_API_KEY",
    authDomain: "SEU_AUTH_DOMAIN",
    projectId: "SEU_PROJECT_ID",
    storageBucket: "SEU_STORAGE_BUCKET",
    messagingSenderId: "SEU_MESSAGING_SENDER_ID",
    appId: "SUA_APP_ID"
};
```

---

## 🚀 Passo 3: Deploy do Backend (FastAPI) no Render

Como o backend processa arquivos PDF grandes usando bibliotecas nativas como `PyMuPDF`, a melhor opção de hospedagem gratuita/barata é o **Render**.

1. Conecte sua conta do GitHub ao Render.
2. Clique em **New > Web Service**.
3. Selecione o repositório do seu projeto.
4. Ajuste as seguintes configurações:
   - **Name:** `ideal-imposition-api`
   - **Language:** `Python`
   - **Root Directory:** `imposicao` (ou deixe raiz se for repositório individual)
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app:app --host 0.0.0.0 --port 10000`
5. Conclua a criação do serviço web.
6. Assim que a build terminar, o Render fornecerá uma URL pública (ex: `https://ideal-imposition-api.onrender.com`).
7. Copie essa URL e insira no arquivo `frontend/firebase-config.js` na variável `API_BASE_URL`:

```javascript
// URL base do backend de imposição
const API_BASE_URL = "https://ideal-imposition-api.onrender.com";
```

---

## 📤 Passo 4: Deploy do Frontend no Firebase Hosting

Com a configuração do Firestore e da URL do backend salvas em `frontend/firebase-config.js`, você está pronto para publicar o frontend.

1. No terminal do seu computador (dentro da pasta `imposicao`), execute o comando para fazer login no Firebase:
   ```bash
   npx firebase-tools login
   ```
2. Inicialize o Firebase no projeto:
   ```bash
   npx firebase-tools init
   ```
3. Escolha as seguintes opções durante o assistente:
   - Selecione **Hosting: Configure files for Firebase Hosting and (optionally) set up GitHub Action deploys**.
   - Escolha **Use an existing project** e selecione o projeto que você criou no Passo 1.
   - Quando perguntar *What do you want to use as your public directory?*, digite: **`frontend`**.
   - Quando perguntar *Configure as a single-page app (rewrite all urls to /index.html)?*, digite **`No`** (ou `N`).
   - Quando perguntar *Set up automatic builds and deploys with GitHub?*, digite **`No`**.
4. Faça o deploy final dos arquivos do frontend:
   ```bash
   npx firebase-tools deploy
   ```
5. O Firebase gerará a URL final da sua aplicação (ex: `https://seu-projeto.web.app` ou `https://seu-projeto.firebaseapp.com`).

---

## 🔄 Passo 5: Uso do Agente de Impressão Local (Opcional)

Se você estiver rodando a aplicação online e precisar enviar trabalhos diretamente para as impressoras físicas conectadas ao seu computador Windows:

1. Execute o agente local em seu computador Windows:
   ```bash
   python local_print_agent.py
   ```
2. O agente iniciará na porta `9000` local (`http://127.0.0.1:9000`).
3. O painel online detectará automaticamente o agente rodando em localhost para listar e enviar as impressões físicas.
