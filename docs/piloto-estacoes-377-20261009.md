# Piloto 1.2.377 — conferencia por revisao nas estacoes

Decisao de 09/10/2026: Piloto e o unico produto operacional. NewProd antigo
descontinuado; somente PC-JR-HOME permanece no canal local de testes.
O identificador tecnico NewProdPilotoOficial e o manifesto
newprod-piloto-oficial.json transportam o Piloto, nao um segundo produto.

Esta entrega incorpora a conferencia v2 ja implantada no banco/Edge e ensaiada
no Junior. A abertura envia o numero do pedido ao agente; a nuvem responde
com revisao compacta quando nada mudou. O snapshot local fornece modelos,
numeracoes, artes, bancos e mapas. Mudanca prepara somente recursos afetados,
com segunda conferencia antes de substituir a revisao local. A leitura pelo
motor conserva verificacao SHA-256 e nenhuma falha autoriza execucao offline.

Primeira abertura apos migrar o protocolo exige snapshot completo. Autenticacao,
catalogo geral e descoberta de novos pedidos em segundo plano continuam
existindo. Dependencias compartilhadas invalidam um sinal global conservador;
nao se promete ausencia de toda consulta ou invalidacao seletiva por arquivo.

O painel web sem PilotoSelecao preserva seu funcionamento anterior. Agentes
antigos mantem RPC v1 enquanto recebem o upgrade. Nenhuma migracao SQL foi
reexecutada nesta entrega. Consulta atual confirmou 628 sinais, 11 triggers,
RPC v1 presente e privilegios v2 restritos a service_role; Edge v5 ACTIVE.

O MSI usa a identidade/UpgradeCode existentes para substituir o produto antigo
preservando dados. A ponte latest.json permite a migracao de instalacoes legadas.
Alvos operacionais: LASER-01, LASER-02, LASER-04, TEX-01, FLEXO,
LAPTOP-9BSK81S0, GUSTAVO-PROD, ACABAMENTO e DESKTOP-PM6TG1B.
Cadastros historicos sem atividade recente e nomes duplicados com sufixo Piloto
nao sao novas estacoes a ativar. PC-JR-HOME nao esta autorizado no manifesto.

O experimento de impressao do Junior nao integra este MSI geral. O caminho
normal de impressao nao foi alterado. Nao forcar encerramento de trabalhos:
o atualizador verifica ociosidade e adia quando necessario. Consulta automatica
a cada seis horas ou manual pelo botao existente; instalacao remota depende
de cada estacao estar ligada, acessivel e apta a atualizar.

Evidencias de testes, build, publicacao e versoes ficam em dist deste worktree.
Liberar manifesto nao comprova instalacao ou impressao fisica. Confirmar cada
estacao pelo heartbeat apos a troca; estacoes antigas podem requerer MSI manual
se o atualizador legado nao concluir a migracao.
