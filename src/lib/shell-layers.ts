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
  /** Header do redesign (PARTE 3): logo HOK OS + zoom + paleta + minimizar.
   *  In-flow no topo da coluna; registrado p/ contrato e eventuais overlays. */
  terminalHeader: 35,
  /** Faixa de abas das sessões (acima do conteúdo, abaixo do teclado) */
  terminalTabs: 40,
  /** Barra de rolagem do scrollback (overlay fino à direita) */
  terminalScrollbar: 45,
  /** Navegação flutuante Chat/Terminal/N8N/Config */
  dock: 100,
  /** Ícone minimizado do teclado — SEMPRE acima do Dock */
  keysBarMinimized: 110,
  /** Barra de teclas completa — cobre o conteúdo, nunca esconde o Dock
   *  (folga geométrica garante posição; zIndex é defesa extra) */
  keysBarExpanded: 120,
  /** Chip "reconectando…" e indicadores transitórios do terminal */
  terminalRecovery: 130,
  /** Modal de colagem manual (fallback do clipboard) — acima de tudo */
  terminalModal: 140,
} as const;

// ── Mapeamento do redesign (PARTE 1, 23/08) ─────────────────────────────
// O mockup (hok-terminal-redesign) usa escala solta 10–60:
//   terminalContent 10 · terminalTabs 20 · dock 30 · keysBarMinimized 40 ·
//   keysBarExpanded 50 · recoveryOverlay 60
// ESCALA DO MOCKUP REJEITADA. Correspondência adotada (produção):
//   mockup terminalContent 10 → terminalContent 30
//   mockup terminalTabs   20 → terminalTabs 40 (+ terminalHeader 35, novo)
//   mockup dock           30 → dock 100
//   mockup keysBarMinimized 40 → keysBarMinimized 110
//   mockup keysBarExpanded  50 → keysBarExpanded 120
//   mockup recoveryOverlay  60 → terminalRecovery 130
//   (sem análogo no mockup)    → terminalScrollbar 45
// Qualquer camada nova do redesign entra AQUI, na escala de produção.

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
export const KEYS_ICON_BAND_PX = 52; // ícone 48px (PARTE 7) + respiro
export const KEYS_BAR_ROW_PX = 48;   // estimativa por linha (fallback)
// FIX alinhamento (23/08): faixa verde QUASE encostada na barra — buffer
// mínimo (4px) só contra clip de arredondamento entre dispositivos.
export const KEYS_SAFETY_PX = 4;
// FIX medição (23/08): a altura REAL da barra é medida no componente
// (ResizeObserver) e entra aqui — a reserva acompanha qualquer layout de
// teclas (grupo extra aberto, teclas futuras) sem constantes manuais.
// barH = 0 → fallback nas estimativas.
export const keysReservePx = (expanded: boolean, extraGroup: boolean, barH = 0): number =>
  DOCK_CLEAR_PX +
  (expanded
    ? (barH || (extraGroup ? KEYS_BAR_ROW_PX * 2 : KEYS_BAR_ROW_PX)) + KEYS_SAFETY_PX
    : KEYS_ICON_BAND_PX);

// FIX kbfocus v2: com o teclado do sistema aberto, o iframe ENCOLHE essa
// quantidade (não translada!) → xterm refaz o fit → TUI redistribui com o
// scrollback intacto no topo e a caixa de digitação pousando logo acima da
// barra. Derivado das constantes acima (zero número mágico no componente):
// o rodapé do iframe deve pousar em kbInset + barra + respiro mínimo.
// FIX kbfocus v3 (23/08, retificação do usuário): com o teclado do sistema
// aberto NÃO há vão — tudo grudado: teclado → [barra de teclas, se expandida]
// → faixa verde → conteúdo. O iframe encolhe exatamente o necessário:
//   expandida:  rodapé do iframe = kbInset + barra(48) + respiro(2)
//   minimizada: rodapé do iframe = kbInset + buffer(4) — faixa COLADA no
//               teclado (o ícone compacto flutua acima da faixa, no componente)
const BAR_TOP_GAP_PX = 2;
const FAIXA_KEYBOARD_BUFFER_PX = 4;
export const keyboardShiftPx = (kbInset: number, expanded: boolean, barH = 0): number => {
  if (kbInset <= 0) return 0;
  const barPx = barH || KEYS_BAR_ROW_PX;
  const desiredBottom = expanded
    ? kbInset + barPx + BAR_TOP_GAP_PX
    : kbInset + FAIXA_KEYBOARD_BUFFER_PX;
  const reserve = keysReservePx(expanded, false, barPx);
  return Math.max(0, desiredBottom - reserve);
};
