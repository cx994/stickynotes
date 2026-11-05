const ICONS: Record<string, string> = {
  x: '<path d="M3.2 3.2l7.6 7.6M10.8 3.2l-7.6 7.6"/>',
  plus: '<path d="M7 2.6v8.8M2.6 7h8.8"/>',
  ellipsis:
    '<circle cx="3" cy="7" r=".95" fill="currentColor" stroke="none"/><circle cx="7" cy="7" r=".95" fill="currentColor" stroke="none"/><circle cx="11" cy="7" r=".95" fill="currentColor" stroke="none"/>',
  pin: '<path d="M5 1.9h4M5.7 1.9v3L4.3 7.2v1.3h5.4V7.2L8.3 4.9v-3M7 8.5v3.6"/>',
  window:
    '<rect x="2" y="2.6" width="10" height="8.8" rx="1.4"/><path d="M2 5.1h10"/>',
  desktop:
    '<rect x="1.8" y="1.8" width="4.4" height="4.4" rx="1"/><rect x="7.8" y="1.8" width="4.4" height="4.4" rx="1"/><rect x="1.8" y="7.8" width="4.4" height="4.4" rx="1"/><rect x="7.8" y="7.8" width="4.4" height="4.4" rx="1"/>',
  highlighter:
    '<path d="M3.1 9.2l5.3-5.3 2.7 2.7-5.3 5.3H3.1V9.2z"/><path d="M8.4 3.9l1-1a1.2 1.2 0 011.7 0l.9.9a1.2 1.2 0 010 1.7l-1 1"/><path d="M3.1 12.2h7.8"/>',
  eye: '<path d="M1.5 7s2-3.5 5.5-3.5S12.5 7 12.5 7s-2 3.5-5.5 3.5S1.5 7 1.5 7z"/><circle cx="7" cy="7" r="1.55"/>',
  pencil:
    '<path d="M2 12l.7-2.8 6.5-6.5a1.4 1.4 0 012 0l1.1 1.1a1.4 1.4 0 010 2L5.8 11.3 2 12z"/><path d="M8.6 3.3l2.1 2.1"/>',
  collapse:
    '<rect x="2" y="1.8" width="10" height="10.4" rx="1.6"/><path d="M7 4.1v2M6 5.1l1 1 1-1M7 9.9v-2M6 8.9l1-1 1 1"/>',
  expand:
    '<rect x="2" y="1.8" width="10" height="10.4" rx="1.6"/><path d="M7 6.1v-2M6 5.1l1-1 1 1M7 7.9v2M6 8.9l1 1 1-1"/>',
  "check-square":
    '<rect x="1.8" y="1.8" width="10.4" height="10.4" rx="2.2" fill="currentColor" stroke="none"/><path d="M4.2 7.1l1.9 1.9 3.8-3.9" stroke="#fff" stroke-width="1.7"/>',
  square: '<rect x="1.8" y="1.8" width="10.4" height="10.4" rx="2.2"/>',
  trash:
    '<path d="M2.5 3.8h9M5.3 3.8V2.6h3.4v1.2M3.6 3.8l.5 7.1a1 1 0 001 .9h3.8a1 1 0 001-.9l.5-7.1M5.7 6.1v3.6M8.3 6.1v3.6"/>',
  undo: '<path d="M2.4 6.9a4.6 4.6 0 104.6-4.6c-1.5 0-2.8.7-3.7 1.9"/><path d="M2.1 2.2v3.4h3.4"/>',
  clock: '<circle cx="7" cy="7" r="5.2"/><path d="M7 4v3.2l2.2 1.3"/>',
  "plus-circle":
    '<circle cx="7" cy="7" r="5.2"/><path d="M7 4.4v5.2M4.4 7h5.2"/>',
  eraser:
    '<path d="M6.1 11.8l-3-3a1.2 1.2 0 010-1.7l4.6-4.6a1.2 1.2 0 011.7 0l2.3 2.3a1.2 1.2 0 010 1.7l-4.6 4.6H6.1z"/><path d="M4.5 6.9l3.1 3.1"/>',
  check: '<path d="M3 7.2l2.6 2.6L11 4.6"/>',
  bold: '<path d="M4.2 2.5h3.3a2.2 2.2 0 010 4.4H4.2zM4.2 6.9h3.8a2.3 2.3 0 010 4.6H4.2z"/>',
  link: '<path d="M5.8 8.2l2.4-2.4M6.2 4.2l1-1a2.6 2.6 0 013.6 3.6l-1 1M7.8 9.8l-1 1a2.6 2.6 0 01-3.6-3.6l1-1"/>',
};

export function icon(name: string, size = 12): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 14 14");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name] ?? "";
  return svg;
}
