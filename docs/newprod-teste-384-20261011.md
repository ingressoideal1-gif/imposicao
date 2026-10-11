# NewProd Teste 1.2.384 — 11/10/2026

Remove o modal de confirmação do envio anterior interrompido ao iniciar uma nova impressão. O registro local antigo é descartado nesse momento; não há retomada nem reenvio automático. Mantém as verificações de integridade, o cancelamento e os três modos de impressão, incluindo GDI por blocos e folha a folha.

Fontes: arte-de-impressao.js e referências de cache em index.html/producao.html. Teste de regressão cobre interrupção com 50 arquivos, ausência de modal, limpeza do registro e armazenamento indisponível. Harness de integridade: 63 verificações no navegador; harness dos três modos aprovado.

Publicação autorizada no canal de teste, conservando LASER-01 e PC-JR-HOME. Pacote novo NewProdPiloto_Teste_v1.2.384.msi; versão interna 1.2.384-teste.1. Manifestos estáveis não são alterados. A publicação é validada por download integral e SHA-256 antes da ativação; evidência em dist/teste384-publicacao.json e manifesto anterior em dist/teste384-manifesto-anterior.json.

O painel do Junior recebeu a alteração local com backup verificado em NewProd Recuperacao Experimental/20261011-095317-sem-modal-retomada. Isso não comprova instalação do MSI novo nas estações. A instalação remota depende da consulta automática ou do botão local de atualização; confirmação por versão da estação permanece separada da publicação.
