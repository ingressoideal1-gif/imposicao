/* Executado antes de qualquer biblioteca. Inerte na navegação normal. */
(function () {
    'use strict';
    const id = new URL(location.href).searchParams.get('idgen');
    if (id === null) return;
    const valido = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id);
    const base = 'https://vwbtitjlpelrcnsytzqw.supabase.co';
    const endpoint = base + '/functions/v1/idgen-interno';
    const recusar = () => { throw new Error('Operação legada bloqueada: este pedido pertence ao IdGen.'); };
    function permitido(url, method) {
        const u = new URL(url, location.href), m = String(method || 'GET').toUpperCase();
        if (u.href === endpoint && m === 'POST') return true;
        if (u.origin === base && u.pathname === '/auth/v1/token' && m === 'POST'
            && u.searchParams.get('grant_type') === 'refresh_token') return true;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(m)) return false;
        // Nem leitura deve acionar o motor local, impressão ou integração ERP.
        if (/^\/api(?:\/|$)/.test(u.pathname) || u.pathname.startsWith('/functions/v1/')) return false;
        if (u.protocol === 'data:' || u.protocol === 'blob:') return true;
        return u.origin === location.origin || u.origin === base
            || ['https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(u.origin);
    }
    const originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        const url = input instanceof Request ? input.url : String(input);
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        if (!permitido(url, method)) return Promise.reject(new Error('Operação legada bloqueada: este pedido pertence ao IdGen.'));
        return originalFetch(input, init);
    };
    const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._idgenPermitido = permitido(String(url), method);
        if (!this._idgenPermitido) recusar();
        return open.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) { if (!this._idgenPermitido) recusar(); return send.apply(this, args); };
    navigator.sendBeacon = () => false;
    window.WebSocket = class { static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3; constructor() { recusar(); } };
    document.addEventListener('submit', e => e.preventDefault(), true);
    HTMLFormElement.prototype.submit = recusar;
    const prefix = 'idgen:' + id + ':';
    const auth = k => /^sb-[\w-]+-auth-token(?:\..*)?$/.test(String(k));
    const caches = new WeakMap();
    function cache(storage) { if (!caches.has(storage)) caches.set(storage, new Map()); return caches.get(storage); }
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
    // Só a sessão Auth continua no armazenamento existente. Caches do editor
    // vivem nesta página e desaparecem ao sair; o documento confirmado é a fonte.
    Storage.prototype.getItem = function (k) { return auth(k) ? get.call(this, k) : cache(this).get(String(k)) ?? null; };
    Storage.prototype.setItem = function (k, v) { if (auth(k)) set.call(this, k, v); else cache(this).set(String(k), String(v)); };
    Storage.prototype.removeItem = function (k) { if (auth(k)) remove.call(this, k); else cache(this).delete(String(k)); };
    Storage.prototype.clear = recusar;
    const dbOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name, ...args) => dbOpen(prefix + name, ...args);
    const dbDelete = indexedDB.deleteDatabase.bind(indexedDB);
    indexedDB.deleteDatabase = name => dbDelete(prefix + name);
    document.documentElement.classList.add('idgen-contexto');
    Object.defineProperty(window, 'IDGEN_CONTEXTO', { value: Object.freeze({ id, valido, endpoint, permitido }), writable: false });
}());
