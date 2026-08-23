// ═══════════════════════════════════════════════════════════════════════
// REGISTRO ÚNICO DE CAMADAS VISUAIS DO HOK OS — FONTE DE VERDADE
// ═══════════════════════════════════════════ SHELL-LAYERS.TS ══════════
//
// CONTRATO (obrigatório para qualquer feature nova):
//   1. NUNCA usar z-[...] arbitrário ou z-index inline fora deste módulo.
//   2. Todo elemento flutuante/sobreposto registra sua camada AQUI.
//   3. Ordem visual garantida (de CIMA para BAIXO na tela):
//        conteúdo do terminal  <  abas  <  ícone/barra do teclado
//        <  navegação (Dock)   … aguarde: Dock fica EMBAIXO do teclado,
//        mas com zIndex MENOR (é ele que "perde" a pintura se encostarem).
//      Folga geométrica: elementos de teclado usam bottom >= DOCK_CLEAR_PX
//      para pousar ACIMA da área do Dock sem sobreposição real.
//   4. Modais/drawers ficam acima de tudo (camada overlay).
//
// LADDER (menor → maior zIndex):
export const SHELL_Z = {
  /** Conteúdo do terminal: header, faixa de abas, iframe ttyd */
  terminalContent: 30,
  /** Faixa de abas das sessões (acima do conteúdo, abaixo do teclado) */
  terminalTabs: 40,
  /** Navegação flutuante Chat/Terminal/N8N/Config */
  dock: 100,
  /** Ícone minimizado do teclado — SEMPRE acima do Dock */
  keysBarMinimized: 110,
  /** Barra de teclas completa — cobre o conteúdo, nunca esconde o Dock
   *  (folga geométrica garante posição; zIndex é defesa extra) */
  keysBarExpanded: 120,
  /** Chip "reconectando…" e indicadores transitórios do terminal */
  terminalRecovery: 130,
} as const;

// Geometria do Dock (Dock.tsx consome os mesmos valores):
// bottom-4 = 16px; altura = botão 64px + py-3 (24px) + border 2px = 90px.
export const DOCK_BOTTOM_PX = 16;
export const DOCK_HEIGHT_PX = 90;

// Folga mínima para elementos pousarem ACIMA do Dock sem sobreposição.
// 16 (bottom) + 90 (altura) + 10 (respiro) = 116px.
export const DOCK_CLEAR_PX = DOCK_BOTTOM_PX + DOCK_HEIGHT_PX + 10;

// Helper central: âncora vertical de elementos "ride-above-dock".
// kbInset = altura ocupada pelo teclado do sistema (visualViewport).
// Garante a pilha pedida em QUALQUER estado (zoom, tema, abas):
//   teclado fechado → pousa logo acima do Dock;
//   teclado aberto  → sobe junto, colado no topo do teclado.
export const aboveDock = (kbInset: number): number =>
  Math.max(kbInset, DOCK_CLEAR_PX);
