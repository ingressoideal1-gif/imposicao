/* Senha por instalação. Guarda apenas identidade opaca; nunca a senha no navegador. */
(function () {
    'use strict';
    var BASE = 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/portaria';
    var CHAVE = 'ideal_control_instalacao', PRONTO = 'ideal_control_pin_configurado';
    var bilhetes = {}, perguntando = null;
    function chave() {
        var v = localStorage.getItem(CHAVE);
        if (!v) {
            v = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
            localStorage.setItem(CHAVE, v);
        }
        return v;
    }
    async function rede(rota, dados, token) {
        var h = { 'Content-Type': 'application/json' };
        if (token) h.Authorization = 'Bearer ' + token;
        var r = await fetch(BASE + '/' + rota, { method: 'POST', headers: h, body: JSON.stringify(dados) });
        var corpo = await r.json();
        if (!r.ok) { var e = new Error(corpo.detail || 'Não foi possível conferir a senha.'); e.status = r.status; throw e; }
        return corpo;
    }
    function aparelho(eventoId) {
        var a = window.chaveiro && window.chaveiro.procurar(eventoId);
        return a && a.por_qr && a.token ? a : null;
    }
    function caixa(nova, executar) {
        if (perguntando) return perguntando;
        perguntando = new Promise(function (resolve, reject) {
            var d = document.createElement('dialog'); d.className = 'ic-qr-dialogo';
            d.innerHTML = '<h2></h2><p data-ajuda></p><div data-pin-campos><label>Senha de 6 números<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" required></label>'
                + (nova ? '<label>Repita a senha<input name="confirma" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required></label>' : '')
                + '<p role="status"></p><button type="button" data-pin-salvar>' + (nova ? 'Salvar senha deste celular' : 'Liberar edição') + '</button>'
                + '<button type="button" data-cancelar>Cancelar</button></div>';
            d.querySelector('h2').textContent = nova ? 'Configure este celular' : 'Senha de edição';
            d.querySelector('[data-ajuda]').textContent = nova
                ? 'Esta senha permite editar os eventos neste celular. A gráfica poderá consultá-la no painel para ajudar você.'
                : 'Use a senha de 6 números criada neste celular. Se esqueceu, peça à gráfica para consultá-la.';
            var form = d.querySelector('[data-pin-campos]'), aviso = d.querySelector('[role=status]'), ocupado = false;
            function limpar() { form.querySelectorAll('input').forEach(function (c) { c.value = ''; }); }
            function cancelar(e) {
                if (e) e.preventDefault();
                if (!ocupado) { limpar(); d.close(); d.remove(); reject(new Error('cancelado')); }
            }
            d.querySelector('[data-cancelar]').onclick = cancelar;
            d.addEventListener('cancel', cancelar);
            d.addEventListener('close', function () { limpar(); d.remove(); });
            form.querySelector('[data-pin-salvar]').onclick = async function (e) {
                e.preventDefault(); if (ocupado) return;
                var pin = form.querySelector('[name=pin]').value;
                if (!/^[0-9]{6}$/.test(pin)) { aviso.textContent = 'Digite exatamente 6 números.'; return; }
                if (nova && form.querySelector('[name=confirma]').value !== pin) { aviso.textContent = 'As duas senhas precisam ser iguais.'; return; }
                ocupado = true; form.querySelector('[data-pin-salvar]').disabled = true; aviso.textContent = 'Conferindo…';
                try { var r = await executar(pin); limpar(); d.close(); d.remove(); resolve(r); }
                catch (erro) { limpar(); aviso.textContent = erro.message || 'Confira a conexão e tente novamente.'; }
                finally { pin = ''; ocupado = false; form.querySelector('[data-pin-salvar]').disabled = false; }
            };
            form.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); form.querySelector('[data-pin-salvar]').click(); } });
            document.body.appendChild(d); d.showModal();
        }).finally(function () { perguntando = null; });
        return perguntando;
    }
    function preparar() {
        try { if (localStorage.getItem(PRONTO) && localStorage.getItem(CHAVE)) return Promise.resolve(); }
        catch (e) { return Promise.reject(new Error('Este celular precisa permitir o armazenamento do aplicativo.')); }
        return caixa(true, async function (pin) {
            var r = await rede('registrar-pin', { chave: chave(), pin: pin });
            if (!r.id) throw new Error('A gravação da senha não foi confirmada.');
            localStorage.setItem(PRONTO, r.id);
        });
    }
    async function autorizar(eventoId, forcar) {
        var a = aparelho(eventoId); if (!a) throw new Error('Evento não disponível neste celular.');
        var b = bilhetes[eventoId];
        if (!forcar && b && b.expira_em * 1000 > Date.now()) return b;
        await preparar();
        b = await caixa(false, function (pin) { return rede('elevar-pin', { chave: chave(), pin: pin }, a.token); });
        bilhetes[eventoId] = b; return b;
    }
    async function pedir(eventoId, caminho, opcoes) {
        var a = aparelho(eventoId); if (!a) throw new Error('Evento não disponível neste celular.');
        var b = await autorizar(eventoId), o = opcoes || {};
        var dados = { chave: chave(), elevacao: b.token, caminho: caminho, metodo: o.method || 'GET', corpo: o.body ? JSON.parse(o.body) : null };
        try { return await rede('editar-pin', dados, a.token); }
        catch (e) {
            if (e.status !== 401) throw e;
            delete bilhetes[eventoId]; b = await autorizar(eventoId, true); dados.elevacao = b.token;
            return rede('editar-pin', dados, a.token);
        }
    }
    window.pinInstalacao = { preparar: preparar, chave: chave, aparelho: aparelho, autorizar: autorizar, pedir: pedir,
        encerrar: function () { bilhetes = {}; } };
    document.addEventListener('DOMContentLoaded', function () {
        if ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone) {
            preparar().catch(function () { /* Cancelar mantém a casa; carregar pede novamente. */ });
        }
    });
})();
