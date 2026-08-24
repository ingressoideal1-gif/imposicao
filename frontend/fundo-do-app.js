/**
 * O fundo da casa do Ideal Control: a foto de evento que o ADM publica.
 *
 * ## Por que isto é um script, e não um `background-image` no CSS
 *
 * Duas regras desta aplicação se cruzam aqui, e a segunda é a que manda:
 *
 *   1. As telas do aplicativo NÃO carregam arquivo de fora. Há teste que
 *      quebra se aparecer um `<img>` ou um `<link>` de outra origem no
 *      `controle.html` — e o motivo é sério: resposta de outra origem é opaca,
 *      o cache não a salva, e a tela abriria quebrada sem rede.
 *
 *   2. O PWA precisa ABRIR SEM REDE. É a razão de ele existir instalado.
 *
 * Um endereço do Supabase escrito no CSS violaria as duas. Então a foto entra
 * por aqui: o script busca os BYTES uma vez, guarda no Cache Storage do próprio
 * aparelho, e aplica a partir da cópia guardada. Da segunda abertura em diante
 * o fundo aparece sem tocar na rede — e a conferência de versão nova acontece
 * depois, em segundo plano, sem atrasar a tela.
 *
 * ## A ordem, que é o ponto
 *
 *   1. aplicar o que está guardado          (síncrono, sem rede, sem piscar)
 *   2. perguntar ao banco qual é o atual    (só se houver rede)
 *   3. se mudou, baixar, guardar e aplicar
 *
 * Invertida, a tela abriria sem fundo e ele entraria depois — um salto visual
 * a cada abertura, no celular de quem só quer ver os eventos dele.
 *
 * ## O que este arquivo NÃO faz
 *
 * Não toca na PORTARIA. Lá a câmera e o leitor de QR trabalham a cada quadro,
 * e a tela inteira já é significado: verde passou, vermelho não entra, laranja
 * é outra porta. Foto de fundo ali disputaria com a decisão que o porteiro
 * precisa ler de longe. O `portaria.html` não carrega este script, e é de
 * propósito.
 *
 * Não derruba nada se falhar. Sem rede, sem tabela, sem foto publicada ou com
 * o Cache Storage indisponível (navegador em modo privado), a casa abre como
 * abria antes — luz ambiente e grão. O fundo é acabamento, e acabamento não
 * pode impedir o cliente de achar o evento dele.
 */
(function () {
    'use strict';

    // O nome do cache é próprio e versionado à parte do service worker: quem
    // apaga o cache do painel (o "Atualizar o aplicativo" do rodapé) não pode
    // levar a foto junto e obrigar um download novo no meio do evento.
    var CACHE = 'ideal-fundo-v1';
    var CHAVE_META = 'ideal_fundo_meta';
    var BUCKET = 'app-imagens';

    /** A meta guardada: `{ arquivo, veu, versao }`, ou null. */
    function metaGuardada() {
        try {
            var cru = localStorage.getItem(CHAVE_META);
            return cru ? JSON.parse(cru) : null;
        } catch (e) {
            return null;   // modo privado, cota estourada: segue sem fundo
        }
    }

    function guardarMeta(meta) {
        try { localStorage.setItem(CHAVE_META, JSON.stringify(meta)); }
        catch (e) { /* o fundo continua valendo nesta sessão */ }
    }

    /**
     * Põe a imagem na tela.
     *
     * Duas propriedades de CSS e uma classe no `<html>` — o desenho todo mora
     * no `controle.css`, e este arquivo só diz QUAL imagem e QUANTO véu. Assim
     * a aparência se ajusta sem mexer em JavaScript.
     */
    function aplicar(url, veu) {
        var raiz = document.documentElement;
        raiz.style.setProperty('--fundo-imagem', 'url("' + url + '")');
        raiz.style.setProperty('--fundo-veu', String(veu));
        raiz.classList.add('com-fundo');
    }

    /** O Cache Storage é opcional: navegador sem ele simplesmente não guarda. */
    function abrirCache() {
        if (!('caches' in window)) { return Promise.resolve(null); }
        return caches.open(CACHE).catch(function () { return null; });
    }

    /**
     * A cópia guardada, como URL utilizável.
     *
     * `createObjectURL` e não a URL do cache direto: a entrada do Cache Storage
     * não tem endereço que o CSS saiba pedir, e o `blob:` que sai daqui é local
     * ao aparelho — não passa pela rede nem pela CSP.
     */
    function daCopia(endereco) {
        return abrirCache().then(function (cache) {
            if (!cache) { return null; }
            return cache.match(endereco).then(function (resposta) {
                if (!resposta) { return null; }
                return resposta.blob().then(function (bytes) {
                    return URL.createObjectURL(bytes);
                });
            });
        }).catch(function () { return null; });
    }

    /** Baixa, guarda e devolve a URL local. */
    function baixarEGuardar(endereco) {
        return fetch(endereco, { cache: 'reload' }).then(function (r) {
            if (!r.ok) { throw new Error('HTTP ' + r.status); }
            return abrirCache().then(function (cache) {
                // O `clone` é obrigatório: um Response só se lê uma vez, e
                // precisamos dos bytes duas — para guardar e para exibir.
                if (cache) { cache.put(endereco, r.clone()); }
                return r.blob().then(function (bytes) {
                    return URL.createObjectURL(bytes);
                });
            });
        });
    }

    /** Joga fora as cópias que não são mais a atual. */
    function limpar(atual) {
        abrirCache().then(function (cache) {
            if (!cache) { return; }
            cache.keys().then(function (chaves) {
                chaves.forEach(function (req) {
                    if (req.url !== atual) { cache.delete(req); }
                });
            });
        }).catch(function () { /* limpeza é higiene, não requisito */ });
    }

    function enderecoDe(arquivo) {
        var cliente = window.supabaseClient || window.supabase;
        if (!cliente || !cliente.storage) { return null; }
        try {
            var r = cliente.storage.from(BUCKET).getPublicUrl(arquivo);
            return (r && r.data && r.data.publicUrl) || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * O que está publicado agora. Devolve null sem rede ou sem tabela.
     *
     * A checagem de `typeof from` não é paranoia: em harness de teste e em
     * telas que carregam um cliente reduzido, `supabaseClient` existe sem o
     * PostgREST junto — e um `TypeError` aqui derrubaria a abertura da casa
     * por causa de um acabamento. Este arquivo não pode custar a tela.
     */
    function oQueEstaNoAr() {
        var cliente = window.supabaseClient;
        if (!cliente || typeof cliente.from !== 'function') { return Promise.resolve(null); }
        if (!navigator.onLine) { return Promise.resolve(null); }
        return cliente
            .from('imposition_fundo_pwa')
            .select('arquivo, veu, versao')
            .eq('ativo', true)
            .order('publicado_em', { ascending: false })
            .limit(1)
            .then(function (r) {
                if (r.error || !r.data || !r.data.length) { return null; }
                return r.data[0];
            })
            .catch(function () { return null; });
    }

    function arrancar() {
        try { montar(); }
        catch (e) {
            // Nada aqui vale uma tela quebrada: sem fundo, a casa abre como
            // abria antes -- luz ambiente e grão.
        }
    }

    function montar() {
        // ── 1. o que já está no aparelho, agora ────────────────────────────
        var meta = metaGuardada();
        var jaAplicado = null;
        if (meta && meta.arquivo) {
            var endereco = enderecoDe(meta.arquivo);
            if (endereco) {
                jaAplicado = endereco;
                daCopia(endereco).then(function (url) {
                    if (url) { aplicar(url, meta.veu); }
                });
            }
        }

        // ── 2. e o que o ADM publicou desde então ──────────────────────────
        oQueEstaNoAr().then(function (noAr) {
            if (!noAr) { return; }

            var endereco = enderecoDe(noAr.arquivo);
            if (!endereco) { return; }

            var mudouAImagem = !meta || meta.versao !== noAr.versao;
            var mudouSoOVeu = meta && meta.versao === noAr.versao
                              && Number(meta.veu) !== Number(noAr.veu);

            // O véu é um número: trocá-lo não custa download nenhum.
            if (mudouSoOVeu) {
                guardarMeta(noAr);
                document.documentElement.style.setProperty('--fundo-veu', String(noAr.veu));
                return;
            }
            if (!mudouAImagem && jaAplicado === endereco) { return; }

            baixarEGuardar(endereco).then(function (url) {
                aplicar(url, noAr.veu);
                guardarMeta(noAr);
                limpar(endereco);
            }).catch(function () {
                // Falhou o download: fica a cópia anterior, que já está na
                // tela. Fundo velho é melhor que tela piscando.
            });
        });
    }

    // Depois do `supabase-config.js`, que é quem cria o `supabaseClient`. Se a
    // tela ainda estiver montando, espera o DOM — `documentElement` já existe,
    // mas o `localStorage` de um iframe recém-criado nem sempre.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', arrancar);
    } else {
        arrancar();
    }

    // Exposto para o ADM conseguir mostrar a prévia com a mesma conta de véu
    // que o aplicativo usa — uma fórmula só, num lugar só.
    window.fundoDoApp = { aplicar: aplicar, CACHE: CACHE };
})();
