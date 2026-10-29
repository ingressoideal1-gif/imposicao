'use strict';
(() => {
  function mountDownload(container) {
    if (container.querySelector('[data-ponte-download]')) return;
    const row=document.createElement('div');row.dataset.ponteDownload='true';
    row.style.cssText='display:flex;justify-content:flex-end;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap';
    const link=document.createElement('a');link.textContent='Baixar Ponte Imposition';
    link.className='btn btn-sm btn-secondary';link.target='_blank';link.rel='noopener noreferrer';
    const status=document.createElement('span');status.setAttribute('role','status');
    status.textContent='Consultando instalador…';
    row.append(link,status);container.insertBefore(row,container.firstChild);
    fetch('ponte-download.json',{cache:'no-store',credentials:'omit'})
      .then(async response=>{if(!response.ok)throw Error();return response.json();})
      .then(release=>{
        if(!/^\d+\.\d+\.\d+$/.test(release.version)||! /^[A-Za-z0-9_-]{10,128}$/.test(release.file_id)||
            !/^[a-f0-9]{64}$/.test(release.sha256))throw Error();
        link.href='https://drive.google.com/file/d/'+release.file_id+'/view';
        link.title='Instalador Windows • SHA256 '+release.sha256;
        status.textContent='Versão '+release.version+' • Download pelo Google Drive';
      }).catch(()=>{link.hidden=true;status.textContent='Download da ponte indisponível. Tente reabrir o pedido.';});
  }
  function refresh() {
    if(window._currentPerms?.perm_lista_arte_edit!==true)return;
    const container=document.getElementById('amostras-itens-container');
    if(container && container.children.length)mountDownload(container);
  }
  new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
  refresh();
})();
