/**
 * O evento acontecendo, na mão do dono.
 *
 * ## Por que esta tela existe
 *
 * O aplicativo sabia tudo antes do evento — setores, horários, portões — e
 * sabia tudo depois, num número solto na lista de finalizados. Nas quatro horas
 * em que a fila anda e os portões trabalham, ele não dizia nada ao dono. Era a
 * única parte do caminho em que a pessoa que pagou pelo controle de acesso não
 * tinha para onde olhar.
 *
 * A conta já estava sendo feita: o `/meus-eventos` conta as entradas de TODOS
 * os eventos a cada abertura da casa, e a tela usava o número só nos
 * finalizados. Esta tela é, antes de tudo, deixar de jogar isso fora.
 *
 * ## Uma tela, dois nomes
 *
 * Evento ativo, ela se chama **Ao vivo** e se atualiza sozinha. Evento
 * finalizado, ela se chama **Relatório** e fica parada. É a mesma tela porque
 * são os mesmos números: separá-las em duas faria a pergunta "quantos
 * entraram?" ter duas respostas possíveis conforme a hora em que se pergunta.
 *
 * ## O sétimo estado de topo
 *
 * `#ao-vivo` entra ao lado de `#lista` + `#bloco-novo-evento`, `#menu-geral`,
 * `#engrenagem`, `#meus-pedidos`, `#bloco-entrar` e `#trocar-senha`. Como eles,
 * nunca convive com os outros, e quem esconde e devolve a tela inicial é o
 * `conta.js`, por `conta.esconderTelaInicial()`. Este arquivo NÃO guarda uma
 * cópia da lista de blocos — essa cópia é o defeito que esta página já teve
 * duas vezes, e o resultado é sempre o mesmo: telas empilhadas.
 *
 * ## O relógio é o do SERVIDOR
 *
 * "Último sinal há 40 minutos" calculado com o relógio do celular mente sempre
 * que ele estiver errado, e um portão que parece mudo por causa do relógio do
 * dono é uma corrida até a porta à toa. A resposta traz `agora`, e as contas de
 * tempo saem dele.
 */
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };

    // De quanto em quanto tempo a tela se refaz sozinha, com o evento ativo.
    //
    // Trinta segundos, e não os cinco minutos do sincronismo do portão: aqui é
    // uma pessoa olhando a tela, esperando o número mexer. Cinco minutos
    // pareceriam tela travada, e ela recarregaria na mão — que custa o mesmo
    // ao servidor e mais a ela.
    var INTERVALO_MS = 30000;

    // Teto do arquivo que o dono baixa. Um evento de 12.000 leituras são 60
    // páginas; parar em algum lugar é obrigatório, e parar DIZENDO é o que
    // separa um arquivo incompleto de um arquivo que mente. Ver `baixarCsv`.
    var POR_PAGINA_CSV = 500;
    var MAXIMO_PAGINAS_CSV = 60;

    var estado = {
        evento_id: null,
        nome: '',
        dados: null,
        relogio: null,
        // A busca em andamento, para uma resposta atrasada não pintar por cima
        // de uma busca mais nova. Sem isto, digitar `12` e depois `123`
        // depressa pode terminar mostrando o resultado do `12`.
        buscaEmCurso: 0
    };

    function numero(n) { return Number(n || 0).toLocaleString('pt-BR'); }

    function texto(pai, tag, conteudo, classe) {
        var el = document.createElement(tag);
        el.textContent = conteudo;          // escrito por gente ou pelo ERP: TEXTO
        if (classe) { el.className = classe; }
        pai.appendChild(el);
        return el;
    }

    /** "2026-09-04T22:00" -> "22h". A hora vem cheia do servidor. */
    function soAHora(iso) {
        var m = /T(\d{2}):/.exec(String(iso || ''));
        return m ? m[1] + 'h' : String(iso || '');
    }

    /**
     * "há 4 min", "há 2 h", "agora" — contra o relógio do SERVIDOR.
     *
     * Devolve vazio quando nunca houve sinal: "há 56 anos" (o que a conta com
     * data nula produziria) seria pior que silêncio.
     */
    function haQuantoTempo(quando, agora) {
        if (!quando) { return ''; }
        var t = Date.parse(quando);
        var base = Date.parse(agora || '') || Date.now();
        if (isNaN(t)) { return ''; }
        var min = Math.floor((base - t) / 60000);
        if (min < 1) { return 'agora'; }
        if (min < 60) { return 'há ' + min + ' min'; }
        var h = Math.floor(min / 60);
        if (h < 24) { return 'há ' + h + ' h'; }
        return 'há ' + Math.floor(h / 24) + ' d';
    }

    /** Um número grande com o rótulo embaixo. */
    function placa(pai, valor, rotulo, classe) {
        var el = document.createElement('div');
        el.className = 'placa' + (classe ? ' ' + classe : '');
        texto(el, 'strong', valor, 'placa-valor');
        texto(el, 'span', rotulo, 'placa-rotulo');
        pai.appendChild(el);
        return el;
    }

    /**
     * Uma barra proporcional, com o número SEMPRE em texto ao lado.
     *
     * A barra é resumo; o número é o dado. Quem não distingue o comprimento de
     * duas barras parecidas — e quem usa leitor de tela — precisa do número, e
     * é a mesma regra que a luz da tela inicial já segue.
     */
    function barra(pai, rotulo, valor, maximo, sufixo, textoValor) {
        var linha = document.createElement('div');
        linha.className = 'barra-linha';
        texto(linha, 'span', rotulo, 'barra-rotulo');
        var trilho = document.createElement('span');
        trilho.className = 'barra-trilho';
        var cheio = document.createElement('span');
        cheio.className = 'barra-cheia';
        var pct = maximo > 0 ? Math.max(0, Math.min(100, (valor * 100) / maximo)) : 0;
        cheio.style.width = pct + '%';
        trilho.appendChild(cheio);
        linha.appendChild(trilho);
        texto(linha, 'span',
              typeof textoValor === 'string' ? textoValor : (numero(valor) + (sufixo || '')),
              'barra-valor');
        pai.appendChild(linha);
        return linha;
    }

    // ── O desenho ───────────────────────────────────────────────────────────

    function desenhar(d) {
        estado.dados = d;
        var ativo = !d.evento || d.evento.status === 'ativo';

        $('ao-vivo-titulo').textContent = ativo ? 'Ao vivo' : 'Relatório';
        $('ao-vivo-nome').textContent = (d.evento && d.evento.nome_evento) || estado.nome;
        var sub = [];
        if (d.evento && d.evento.local_evento) { sub.push(d.evento.local_evento); }
        if (!ativo) { sub.push(d.evento.status === 'finalizado' ? 'finalizado' : 'inativo'); }
        $('ao-vivo-sub').textContent = sub.join(' · ');
        // O aviso de que a tela se refaz sozinha é do usuário, não do
        // programa: o que o sistema faz por conta própria precisa se anunciar,
        // senão o dono fica recarregando na mão sem saber que não precisa.
        $('ao-vivo-atualizando').classList.toggle('sumindo', !ativo);

        desenharResumo(d);
        desenharSetores(d);
        desenharHoras(d);
        desenharRecusas(d);
        desenharAparelhos(d);

        $('ao-vivo-corpo').classList.remove('sumindo');
        $('ao-vivo-aviso').classList.add('sumindo');
    }

    function desenharResumo(d) {
        var p = d.publico || {};
        var caixa = $('ao-vivo-resumo');
        caixa.innerHTML = '';
        placa(caixa, numero(p.entraram), 'entraram', 'destaque');
        // "Presentes" só onde ele diz alguma coisa: em setor de entrada única
        // ninguém sai, e o número seria uma cópia de "entraram" ocupando espaço
        // e sugerindo que alguém saiu.
        if (p.sairam > 0) {
            placa(caixa, numero(p.presentes), 'dentro agora');
        }
        placa(caixa, numero(p.publicado), 'ingressos impressos');
        placa(caixa, p.comparecimento_pct === null || typeof p.comparecimento_pct === 'undefined'
            ? '—' : (String(p.comparecimento_pct).replace('.', ',') + '%'), 'compareceram');
        if (p.recusadas > 0) {
            placa(caixa, numero(p.recusadas), 'recusas', 'atencao');
        }
        if (p.cortesias > 0) {
            placa(caixa, numero(p.cortesias), 'códigos seus');
        }
        if (p.bloqueados > 0) {
            placa(caixa, numero(p.bloqueados), 'bloqueados');
        }
    }

    function desenharSetores(d) {
        var caixa = $('ao-vivo-setores');
        caixa.innerHTML = '';
        var setores = d.por_setor || [];
        if (!setores.length) {
            texto(caixa, 'p', 'Este evento ainda não tem setor nenhum.', 'config-ajuda');
            return;
        }
        setores.forEach(function (s) {
            var c = document.createElement('div');
            c.className = 'cartao cartao-setor-vivo';
            var topo = document.createElement('div');
            topo.className = 'setor-vivo-topo';
            texto(topo, 'strong', s.nome || 'Setor');
            texto(topo, 'span',
                  numero(s.entraram) + ' de ' + numero(s.contratado),
                  'setor-vivo-conta');
            c.appendChild(topo);
            // A barra mostra so a porcentagem: "402 de 500" ja esta escrito na
            // linha de cima, e repetir o 402 ao lado da barra gasta a unica
            // coluna que tinha algo novo a dizer.
            barra(c, '', s.entraram, s.contratado || 0, '',
                  s.ocupacao_pct === null || typeof s.ocupacao_pct === 'undefined'
                      ? '' : (String(s.ocupacao_pct).replace('.', ',') + '%'));
            caixa.appendChild(c);
        });
    }

    function desenharHoras(d) {
        var caixa = $('ao-vivo-horas');
        caixa.innerHTML = '';
        var horas = d.por_hora || [];
        if (!horas.length) {
            texto(caixa, 'p', 'Nenhuma leitura ainda.', 'config-ajuda');
            return;
        }
        var maximo = horas.reduce(function (m, h) { return Math.max(m, h.entradas); }, 0);
        horas.forEach(function (h) {
            var linha = barra(caixa, soAHora(h.hora), h.entradas, maximo, '');
            if (h.hora === d.pico) { linha.className += ' barra-pico'; }
        });
        if (d.grafico_truncado) {
            // Corte que não avisa se lê como o evento inteiro — e o número que
            // ele contradiz ("entraram") está logo acima na mesma tela.
            texto(caixa, 'p',
                  'Este gráfico mostra as primeiras ' + numero(d.leituras_lidas)
                  + ' leituras. Os totais acima são do evento inteiro.',
                  'config-ajuda');
        }
    }

    function desenharRecusas(d) {
        var caixa = $('ao-vivo-recusas');
        caixa.innerHTML = '';
        var recusas = d.recusas || [];
        $('ao-vivo-secao-recusas').classList.toggle('sumindo', !recusas.length);
        if (!recusas.length) { return; }
        var maximo = recusas.reduce(function (m, r) { return Math.max(m, r.quantas); }, 0);
        recusas.forEach(function (r) {
            barra(caixa, r.rotulo || r.motivo, r.quantas, maximo, '');
        });
    }

    function desenharAparelhos(d) {
        var caixa = $('ao-vivo-aparelhos');
        caixa.innerHTML = '';
        var lista = d.aparelhos || [];
        if (!lista.length) {
            texto(caixa, 'p',
                  'Nenhum portão ligado neste evento ainda.', 'config-ajuda');
            return;
        }
        lista.forEach(function (a) {
            var linha = document.createElement('div');
            linha.className = 'aparelho-vivo';
            texto(linha, 'span', a.nome || 'Aparelho', 'aparelho-vivo-nome');
            var quando = haQuantoTempo(a.ultimo_visto, d.agora);
            // A palavra vem antes do tempo: "pausado" é decisão do dono e
            // explica o silêncio sozinha. Sem ela, um portão pausado apareceria
            // como um portão que parou de responder, e ele iria até a porta.
            var situacao = a.status === 'ativo'
                ? (quando ? ('último sinal ' + quando) : 'ainda não leu nada')
                : (a.status === 'pausado' ? 'pausado' : 'desligado');
            texto(linha, 'span', situacao,
                  'aparelho-vivo-sinal' + (a.status === 'ativo' ? '' : ' parado'));
            caixa.appendChild(linha);
        });
    }

    // ── Procurar um ingresso ────────────────────────────────────────────────
    //
    // "Este ingresso aqui, que eu tenho na mão, já entrou?" é a pergunta que
    // aparece na porta, e até 04/09/2026 o dono não tinha onde respondê-la — só
    // a gráfica conseguia, e no meio da noite ela não está lá.
    //
    // A busca é no EVENTO INTEIRO, e não num setor: quem pergunta não sabe de
    // que setor o ingresso é. É justamente isso que ele veio descobrir.

    var FRASE = {
        entrou: 'já entrou',
        disponivel: 'ainda não entrou',
        bloqueado: 'está numa faixa bloqueada',
        cancelado: 'cancelado'
    };

    function desenharAchados(r) {
        var caixa = $('ao-vivo-achados');
        caixa.innerHTML = '';
        var lista = (r && r.ingressos) || [];
        if (!lista.length) {
            texto(caixa, 'p',
                  'Nenhum ingresso com esse número neste evento.', 'config-ajuda');
            return;
        }
        var nomes = {};
        ((estado.dados || {}).por_setor || []).forEach(function (s) {
            nomes[s.setor_id] = s.nome;
        });
        lista.forEach(function (i) {
            var c = document.createElement('div');
            c.className = 'cartao cartao-achado situacao-' + i.situacao;
            var topo = document.createElement('div');
            topo.className = 'achado-topo';
            texto(topo, 'strong', i.codigo || ('Nº ' + numero(i.numero)));
            texto(topo, 'span', nomes[i.setor_id] || 'sem setor', 'achado-setor');
            c.appendChild(topo);
            texto(c, 'div', FRASE[i.situacao] || i.situacao, 'achado-situacao');
            if (i.entrou_em) {
                var d = new Date(i.entrou_em);
                if (!isNaN(d.getTime())) {
                    texto(c, 'div', 'às ' + d.toLocaleTimeString('pt-BR', {
                        hour: '2-digit', minute: '2-digit'
                    }), 'achado-hora');
                }
            }
            if (i.motivo_bloqueio) {
                texto(c, 'div', i.motivo_bloqueio, 'achado-motivo');
            }
            caixa.appendChild(c);
        });
    }

    function procurar(sessao) {
        var termo = String($('ao-vivo-busca').value || '').trim();
        var caixa = $('ao-vivo-achados');
        if (!termo) {
            caixa.innerHTML = '';
            return Promise.resolve();
        }
        var meu = ++estado.buscaEmCurso;
        caixa.innerHTML = '';
        texto(caixa, 'p', 'Procurando…', 'config-ajuda');
        return window.AcessoConta.pedir(
            '/eventos/' + estado.evento_id + '/ingressos?busca='
            + encodeURIComponent(termo) + '&por_pagina=20',
            { headers: { Authorization: 'Bearer ' + sessao.access_token } }
        ).then(function (r) {
            // Resposta de uma busca mais velha não pinta por cima da nova.
            if (meu !== estado.buscaEmCurso) { return; }
            desenharAchados(r);
        }).catch(function () {
            if (meu !== estado.buscaEmCurso) { return; }
            caixa.innerHTML = '';
            texto(caixa, 'p',
                  'Não consegui procurar agora. Confira a internet e tente de novo.',
                  'config-ajuda');
        });
    }

    // ── O arquivo da noite ──────────────────────────────────────────────────

    function csvDe(leituras) {
        // `;` e não `,`: o Excel em português abre o ponto-e-vírgula em colunas
        // sem perguntar nada, e é nele que este arquivo vai ser aberto.
        var linhas = [[
            'Hora no aparelho', 'Hora no servidor', 'Setor', 'Portao',
            'Numero', 'Tipo', 'Resultado', 'Motivo'
        ].join(';')];
        leituras.forEach(function (l) {
            linhas.push([
                l.momento || '', l.recebido_em || '', l.setor || '',
                l.aparelho || '', l.numero === null || typeof l.numero === 'undefined'
                    ? '' : l.numero,
                l.tipo || '', l.resultado || '', l.rotulo_motivo || l.motivo || ''
            ].map(function (v) {
                // Ponto-e-vírgula e quebra de linha dentro de um campo partem a
                // planilha em colunas que ninguém pediu. Nome de setor é texto
                // digitado por gente: cabe qualquer coisa.
                return '"' + String(v).replace(/"/g, '""') + '"';
            }).join(';'));
        });
        return linhas.join('\r\n');
    }

    function baixarCsv(sessao, botao) {
        var todas = [];
        var pagina = 1;
        var cortado = false;

        function proxima() {
            return window.AcessoConta.pedir(
                '/eventos/' + estado.evento_id + '/leituras?pagina=' + pagina
                + '&por_pagina=' + POR_PAGINA_CSV,
                { headers: { Authorization: 'Bearer ' + sessao.access_token } }
            ).then(function (r) {
                todas = todas.concat((r && r.leituras) || []);
                if (r && r.ha_mais) {
                    if (pagina >= MAXIMO_PAGINAS_CSV) { cortado = true; return; }
                    pagina += 1;
                    return proxima();
                }
            });
        }

        return proxima().then(function () {
            var nome = 'ideal-control-'
                + String((estado.dados && estado.dados.evento
                          && estado.dados.evento.nome_evento) || estado.nome || 'evento')
                    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                + '.csv';
            // O BOM na frente: sem ele o Excel em Windows lê o arquivo como
            // ANSI e "Portão" vira "PortÃ£o" na primeira coluna que o dono olha.
            var blob = new Blob(['﻿' + csvDe(todas)],
                                { type: 'text/csv;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = nome;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Soltar depois do clique, e não na hora: revogar antes faz o
            // download nascer morto em alguns navegadores.
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);

            var aviso = $('ao-vivo-aviso-csv');
            aviso.textContent = cortado
                ? ('Baixei as primeiras ' + numero(todas.length)
                   + ' leituras. O evento tem mais do que isso — peça o restante à gráfica.')
                : (numero(todas.length) + ' leitura'
                   + (todas.length === 1 ? '' : 's') + ' no arquivo.');
            aviso.classList.remove('sumindo');
        }).catch(function () {
            var aviso = $('ao-vivo-aviso-csv');
            aviso.textContent = 'Não consegui montar o arquivo agora. '
                + 'Confira a internet e tente de novo.';
            aviso.classList.remove('sumindo');
        });
    }

    // ── Buscar, abrir e fechar ──────────────────────────────────────────────

    function pedirParaEntrar() {
        var id = estado.evento_id;
        var nome = estado.nome;
        return window.conta.mostrarEntrar({
            depois: function () { return abrir(id, nome); }
        });
    }

    function buscar(sessao) {
        return window.AcessoConta.pedir(
            '/eventos/' + estado.evento_id + '/ao-vivo',
            { headers: { Authorization: 'Bearer ' + sessao.access_token } }
        ).then(function (d) {
            desenhar(d);
        }).catch(function (e) {
            if (e && e.status === 401) { return pedirParaEntrar(); }
            var aviso = $('ao-vivo-aviso');
            aviso.textContent = (e && e.mensagem)
                || 'Não consegui buscar os números deste evento agora. '
                   + 'Confira a internet e tente de novo em instantes.';
            aviso.classList.remove('sumindo');
        });
    }

    /**
     * O relógio de 30 segundos, ligado só com o evento ativo e a tela aberta.
     *
     * `document.hidden` importa: o celular do dono fica no bolso a noite
     * inteira com esta tela aberta, e um pedido a cada trinta segundos por
     * horas seria bateria e dados gastos para desenhar o que ninguém olha.
     */
    function ligarRelogio(sessao) {
        pararRelogio();
        estado.relogio = setInterval(function () {
            if (document.hidden) { return; }
            if ($('ao-vivo').classList.contains('sumindo')) { return pararRelogio(); }
            var d = estado.dados;
            if (d && d.evento && d.evento.status !== 'ativo') { return pararRelogio(); }
            buscar(sessao);
        }, INTERVALO_MS);
    }

    function pararRelogio() {
        if (estado.relogio) { clearInterval(estado.relogio); estado.relogio = null; }
    }

    function fecharEngrenagemSeAberta() {
        return Promise.resolve().then(function () {
            var eng = $('engrenagem');
            if (!eng || eng.classList.contains('sumindo')) { return; }
            if (!window.Controle || !window.Controle.fecharEngrenagem) { return; }
            return window.Controle.fecharEngrenagem();
        });
    }

    function abrir(eventoId, nome) {
        estado.evento_id = eventoId;
        estado.nome = nome || '';
        estado.dados = null;
        // Mesma cautela do `meus-pedidos.js`: `AcessoConta.sessao()` LANÇA de
        // forma síncrona quando não há `supabaseClient`, e um throw solto sai
        // do ouvinte do toque como erro não tratado — o dono tocaria no botão e
        // nada aconteceria.
        return fecharEngrenagemSeAberta().then(function () {
            return window.AcessoConta.sessao();
        }).catch(function () { return null; }).then(function (s) {
            if (!s) { return pedirParaEntrar(); }
            window.conta.esconderTelaInicial(true);
            $('ao-vivo').classList.remove('sumindo');
            $('ao-vivo-corpo').classList.add('sumindo');
            $('ao-vivo-busca').value = '';
            $('ao-vivo-achados').innerHTML = '';
            $('ao-vivo-aviso-csv').classList.add('sumindo');
            $('ao-vivo-nome').textContent = estado.nome;
            $('ao-vivo-sub').textContent = '';
            var aviso = $('ao-vivo-aviso');
            aviso.textContent = 'Buscando os números deste evento…';
            aviso.classList.remove('sumindo');
            return buscar(s).then(function () { ligarRelogio(s); });
        });
    }

    function fechar() {
        pararRelogio();
        // `sumindo` em si mesmo ANTES de pedir a tela inicial de volta: é o que
        // o contrato do `conta.js` exige de quem fecha um estado de topo.
        $('ao-vivo').classList.add('sumindo');
        window.conta.esconderTelaInicial(false);
        return window.listaEventos.recarregar();
    }

    function ligar() {
        if (!$('ao-vivo')) { return; }
        $('btn-voltar-ao-vivo').addEventListener('click', function () { fechar(); });

        var atualizar = $('btn-atualizar-ao-vivo');
        atualizar.addEventListener('click', function () {
            window.botaoEspera.comecar(atualizar, 'Atualizando…');
            Promise.resolve().then(function () {
                return window.AcessoConta.sessao();
            }).catch(function () { return null; }).then(function (s) {
                return s ? buscar(s) : pedirParaEntrar();
            }).then(function () {
                window.botaoEspera.terminar(atualizar);
            }, function () {
                window.botaoEspera.terminar(atualizar);
            });
        });

        var busca = $('ao-vivo-busca');
        var comASessao = function (tarefa) {
            return Promise.resolve().then(function () {
                return window.AcessoConta.sessao();
            }).catch(function () { return null; }).then(function (s) {
                return s ? tarefa(s) : pedirParaEntrar();
            });
        };
        $('btn-ao-vivo-procurar').addEventListener('click', function () {
            comASessao(procurar);
        });
        // Enter no campo procura: é um número curto digitado com uma mão, na
        // porta. Obrigar o toque no botão depois de digitar seria um gesto a
        // mais no pior momento possível.
        busca.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); comASessao(procurar); }
        });

        var baixar = $('btn-ao-vivo-csv');
        baixar.addEventListener('click', function () {
            window.botaoEspera.comecar(baixar, 'Montando…');
            comASessao(function (s) { return baixarCsv(s, baixar); }).then(function () {
                window.botaoEspera.terminar(baixar);
            }, function () {
                window.botaoEspera.terminar(baixar);
            });
        });
    }

    window.aoVivo = {
        abrir: abrir,
        fechar: fechar,
        desenhar: desenhar,
        csvDe: csvDe,
        haQuantoTempo: haQuantoTempo
    };
    document.addEventListener('DOMContentLoaded', ligar);
})();
