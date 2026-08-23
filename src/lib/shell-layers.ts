// FONTE ÚNICA DE VERDADE das camadas visuais do shell HOK OS.
// REGRA: qualquer novo elemento flutuante DEVE registrar seu z-index aqui —
// nunca usar z-[...] arbitrário espalhado pelos componentes.
//
// Ladder (de baixo para cima):
//   terminalContent 30        < conteúdo do terminal (iframes, header)
//   dock 100                  < navegação flutuante Chat/Terminal/N8N/Config
//   keysBarMinimized 110      < ícone minimizado do teclado (SEMPRE acima do dock)
//   keysBarExpanded 120       < barra de teclas completa (cobre o dock quando aberta)
export const SHELL_Z = {
  terminalContent: 30,
  dock: 100,
  keysBarMinimized: 110,
  keysBarExpanded: 120,
} as const;

// Geometria do Dock (Dock.tsx consome os mesmos valores):
// bottom-4 = 16px; altura = botão 64px + py-3 (24px) + border 2px = 90px.
export const DOCK_BOTTOM_PX = 16;
export const DOCK_HEIGHT_PX = 90;

// Folga mínima para elementos pousarem ACIMA do Dock sem sobreposição.
// 16 (bottom) + 90 (altura) + 10 (respiro) = 116px.
export const DOCK_CLEAR_PX = DOCK_BOTTOM_PX + DOCK_HEIGHT_PX + 10;
