"use strict";
function icon(name){
  const paths={
    agenda:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18M7 15h2m4 0h2m-8 3h2"/>',
    clientes:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    dashboard:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    vendas:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 8h2m10 8h2M5 16h1M18 8h1"/>',
    estoque:'<path d="M7 3h10v4l2 3v6l-4 5H9l-4-5v-6l2-3Z"/><path d="M7 7h10M5 11h14M9 12v5m3-5v7m3-7v5M9 3V1m3 2V1m3 2V1"/>',
    compras:'<path d="M12 2v10m-4-4 4 4 4-4M4 10l-2 5v6h20v-6l-2-5M2 15h6l2 3h4l2-3h6"/>',
    'nova-venda':'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 8v8m-4-4h8"/>',
    equipe:'<circle cx="8" cy="7" r="3"/><path d="M2 20v-2a6 6 0 0 1 12 0v2m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 5 5v1"/>',
    signature:'<path d="m4 16 1-5L16 1l5 5-10 10-5 1M14 3l5 5M2 22h20"/>',
    loyalty:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    logout:'<path d="M9 4H4v16h5m5-4 4-4-4-4m-6 4h13"/>'
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.equipe}</svg>`;
}
function installIcons(){
  document.querySelectorAll('[data-page]').forEach(b=>{const span=b.querySelector('span');if(span)span.innerHTML=icon(b.dataset.page)});
  for(const id of ['logoutBtn','mobileLogout']){const b=document.getElementById(id);if(id==='logoutBtn')b.innerHTML=icon('logout')+'<span>Sair</span>';else b.innerHTML=icon('logout')}
}
