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

// ── Reserva vertical do conteúdo do terminal (paddingBottom do iframe) ──
// A faixa de status do tmux vive DENTRO do iframe cross-origin — não pode
// ser reposicionada pelo pai. O equivalente estrutural é reservar espaço:
// com o paddingBottom abaixo, a borda inferior do iframe (última linha =
// status bar verde) fica sempre ACIMA da zona do Dock.
//   teclado minimizado: folga do Dock + altura do ícone (40px + respiro)
//   barra expandida:    folga do Dock + altura real da(s) linha(s) da barra
//                       → painel do opencode 100% visível acima da barra
export const KEYS_ICON_BAND_PX = 44;
export const KEYS_BAR_ROW_PX = 48;
// FIX alinhamento (23/08, pedido do usuário): faixa verde do tmux QUASE
// encostada na barra de teclas — buffer mínimo (4px) só contra clip de
// arredondamento entre dispositivos. Era 20px (vão visível).
export const KEYS_SAFETY_PX = 4;
export const keysReservePx = (expanded: boolean, extraGroup: boolean): number =>
  DOCK_CLEAR_PX +
  (expanded
    ? (extraGroup ? KEYS_BAR_ROW_PX * 2 : KEYS_BAR_ROW_PX) + KEYS_SAFETY_PX
    : KEYS_ICON_BAND_PX);

// FIX kbfocus v2: com o teclado do sistema aberto, o iframe ENCOLHE essa
// quantidade (não translada!) → xterm refaz o fit → TUI redistribui com o
// scrollback intacto no topo e a caixa de digitação pousando logo acima da
// barra. Derivado das constantes acima (zero número mágico no componente):
// o rodapé do iframe deve pousar em kbInset + barra + respiro mínimo.
const BAR_TOP_GAP_PX = 2;
export const keyboardShiftPx = (kbInset: number): number => {
  if (kbInset <= 0) return 0;
  const reserve = keysReservePx(true, false); // estado expandido é o caso do teclado
  const desiredBottomFromKeyboardTop = KEYS_BAR_ROW_PX + BAR_TOP_GAP_PX;
  return Math.max(0, kbInset + desiredBottomFromKeyboardTop - reserve);
};
