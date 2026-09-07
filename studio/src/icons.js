const paths = {
  anatomy:'<path d="M7 21v-4.4C4.6 15.6 3 13.2 3 10.4a6.4 6.4 0 0 1 12.6-1.6L17 12l-2 .9V15a2 2 0 0 1-2 2h-2v4"/><circle cx="11.5" cy="8.5" r=".65" fill="currentColor" stroke="none"/><path d="M13 13.2h2M19 9c2 1.8 2 4.2 0 6M21 6c3.4 3.5 3.4 8.5 0 12"/>',
  settings:'<path d="m9 3-.6 2.1-1.8 1L4.4 5.6l-2 3.5L4 10.7v2.6l-1.6 1.6 2 3.5 2.2-.5 1.8 1L9 21h4l.6-2.1 1.8-1 2.2.5 2-3.5-1.6-1.6v-2.6l1.6-1.6-2-3.5-2.2.5-1.8-1L13 3Z"/><circle cx="11" cy="12" r="3"/>',
  magnifier:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.2 15.2 5.8 5.8"/>',
  magnifierOff:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.2 15.2 5.8 5.8M7.5 10.5h6"/>',
  sliders:'<path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  folder:'<path d="M3 7V5h7l2 2h9v13H3Z"/><path d="M3 10h18"/>',
  mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M9 22h6"/>',
  upload:'<path d="M12 16V3m-4 4 4-4 4 4M4 15v6h16v-6"/>',
  play:'<path d="m8 4 12 8-12 8Z"/>', pause:'<path d="M8 4v16M16 4v16"/>',stop:'<rect x="6" y="6" width="12" height="12" rx="1"/>',
  save:'<path d="M4 3h13l3 3v15H4ZM8 3v6h8V3M8 21v-7h8v7"/>',
  user:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0114 0v2"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 016 0c0 2-3 2-3 4M12 16h.01"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>', shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
  wave:'<path d="M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4"/>',chevron:'<path d="m6 9 6 6 6-6"/>',close:'<path d="m5 5 14 14M5 19 19 5"/>',download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>'
};
export function icon(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.wave}</svg>`;}
export function hydrateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));}
