const paths = {
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0 0 4h14"/><path d="M8 7h8m-8 4h5"/>',
  chat: '<path d="M7 18l-4 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7Z"/><path d="M7 8h10M7 12h7"/>',
  compare: '<path d="M8 20V4M4 8l4-4 4 4m4-4v16m-4-4 4 4 4-4"/>',
  lab: '<path d="M9 3h6m-5 0v7l-6 9a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 15h10"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4 4"/>',
  file: '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Zm0 0v7h7M8 14h8m-8 3h5"/>',
  shield: '<path d="M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Z"/><path d="m9 12 2 2 4-4"/>',
  warning: '<path d="m10 4-8 14a1 1 0 0 0 1 2h18a1 1 0 0 0 1-2L14 4a2.3 2.3 0 0 0-4 0Zm2 5v4m0 3v.1"/>',
  upload: '<path d="M4 16v4h16v-4M12 16V4m-5 5 5-5 5 5"/>',
  download: '<path d="M4 16v4h16v-4M12 4v12m-5-5 5 5 5-5"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
};

export function icon(name, size = 18) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}
