/* Reinício local. A geração qr-nuvem-947 limpa uma vez os dados de desenvolvimento
   cuja perda foi autorizada. Esta geração NÃO acompanha as próximas versões. */
(function () {
    'use strict';
    var botao = document.getElementById('reiniciar');
    var MARCA = 'ideal_control_fluxo_local', FLUXO = 'qr-nuvem-947';
    if (!botao) {
        if (!/^\/ic(?:\/|$)/.test(location.pathname)) return;
        try { if (localStorage.getItem(MARCA) === FLUXO) return; } catch (_) {}
        // Navegar para uma página isolada evita que callbacks da conta antiga
        // regravem dados enquanto a limpeza acontece.
        document.documentElement.style.visibility = 'hidden';
        document.addEventListener('DOMContentLoaded', function (e) { e.stopImmediatePropagation(); }, true);
        location.replace('/ic/reiniciar.html?fluxo=' + FLUXO);
        return;
    }
    var automatico = new URLSearchParams(location.search).get('fluxo') === FLUXO;
    var confirmar = document.getElementById('confirmar');
    var resultado = document.getElementById('resultado');
    var instalado = navigator.standalone === true
        || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    var ocupado = false;
    if (!instalado && !automatico) {
        resultado.textContent = 'Abra o Ideal Control pelo ícone instalado. No rodapé, toque em “Atualizar o aplicativo” e depois em “Apagar eventos e cadastrar nova senha”. Um navegador pode ter dados separados do aplicativo.';
        confirmar.disabled = true;
    }
    confirmar.onchange = function () { botao.disabled = !instalado || !confirmar.checked || ocupado; };

    function limparBanco() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open('ideal-portaria');
            req.onerror = function () { reject(req.error); };
            req.onblocked = function () { reject(new Error('Feche as outras telas do Ideal Control e tente novamente.')); };
            req.onsuccess = function () {
                var db = req.result;
                var lojas = ['carga', 'fila', 'entradas', 'totais'].filter(function (n) { return db.objectStoreNames.contains(n); });
                if (!lojas.length) { db.close(); resolve(); return; }
                var t = db.transaction(lojas, 'readwrite');
                lojas.forEach(function (n) { t.objectStore(n).clear(); });
                t.oncomplete = function () { db.close(); resolve(); };
                t.onabort = t.onerror = function () { db.close(); reject(t.error || new Error('Não foi possível limpar os eventos.')); };
            };
        });
    }
    function chaveDoAplicativo(k) {
        return /^(ideal_control_|ideal_portaria_|ideal_qr_|ideal_fundo_)/.test(k)
            || k === 'acesso_navegador_id'
            || k === 'sb-vwbtitjlpelrcnsytzqw-auth-token'
            || k === 'sb-vwbtitjlpelrcnsytzqw-auth-token-code-verifier';
    }
    botao.onclick = async function () {
        if ((!instalado && !automatico) || (!confirmar.checked && !automatico) || ocupado) return;
        ocupado = true; botao.disabled = true; confirmar.disabled = true;
        resultado.textContent = 'Verificando a versão atual…';
        try {
            // Confirmar a rede antes de qualquer perda de dados; não depender de navigator.onLine.
            var alvo = 'controle.html?reiniciado=' + Date.now();
            var r = await fetch(alvo, { cache: 'no-store' });
            if (!r.ok || !(await r.text()).includes('id="btn-ler-qr-evento"')) {
                throw new Error('A versão com QR não está disponível neste endereço. Nenhum dado foi apagado.');
            }
            resultado.textContent = 'Apagando os dados locais autorizados…';
            await limparBanco();
            [localStorage, sessionStorage].forEach(function (armazenamento) {
                Object.keys(armazenamento).filter(chaveDoAplicativo).forEach(function (k) { armazenamento.removeItem(k); });
            });
            if ('serviceWorker' in navigator) {
                var registros = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registros.filter(function (reg) {
                    var u = new URL(reg.scope);
                    return u.origin === location.origin && u.pathname === '/ic/';
                }).map(function (reg) { return reg.unregister(); }));
            }
            if (window.caches) {
                var nomes = await caches.keys();
                await Promise.all(nomes.filter(function (n) {
                    return n.startsWith('ideal-control-') || n.startsWith('portaria-') || n === 'ideal-fundo-v1';
                }).map(function (n) { return caches.delete(n); }));
            }
            localStorage.setItem(MARCA, FLUXO);
            resultado.textContent = 'Dados locais apagados. Abrindo o cadastro da nova senha…';
            location.replace(alvo);
        } catch (e) {
            resultado.textContent = 'Não foi possível concluir: ' + (e.message || 'tente novamente com internet.')
                + '\nSe a limpeza já começou, os dados apagados não serão recuperados. Você pode tentar novamente.';
            ocupado = false; confirmar.disabled = false; botao.disabled = !confirmar.checked;
        }
    };
    if (automatico) {
        document.querySelector('h1').textContent = 'Preparando o novo Ideal Control';
        confirmar.checked = true;
        confirmar.closest('label').hidden = true;
        botao.textContent = 'Tentar novamente';
        botao.onclick();
    }
})();
