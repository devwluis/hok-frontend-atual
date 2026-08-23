# Adendo — Quedas de conexão do Terminal (WebSocket PTY) — 2026-08-20

Sessão: diagnóstico e correção das quedas aparentemente aleatórias da
conexão do Terminal no Hok OS (web app servido por nginx:3002, backend
hokma:8082). Relato do usuário: conexão cai ao trocar de aba (Chat/N8N/Config)
e volta ao Terminal, mostrando OFFLINE e exigindo reconexão manual; padrão
inconsistente (não 100% na troca, não 100% após tempo parado).

## 1. Diagnóstico — 3 causas raiz (todas corrigíveis) + 1 de plataforma

### 1a. BUG DE CORRIDA: onclose/onerror sem guard de identidade
`TerminalScreen.tsx` (antigo): `ws.onclose` fazia `setConn("offline")`
INCONDICIONALMENTE, mesmo quando o socket que fechou NÃO era mais o atual.
O `close()` do browser é assíncrono: ao trocar de aba, o unmount fechava o
socket velho; ao voltar rápido (<1s), um socket NOVO abria (LIVE) e então o
evento `onclose` do socket VELHO chegava e setava OFFLINE por cima. Mesmo
risco ao clicar "Reconectar" (connect() fechava o socket morto primeiro).
Explica o padrão "não é 100%, inconsistente" — depende do timing.

### 1b. A sessão morria por design ao trocar de aba
`AppShell.tsx` usa `AnimatePresence mode="wait"` + `key={screen}` → a tela do
Terminal é DESMONTADA (não escondida) a cada troca de aba → cleanup chamava
`ws.close()` → servidor matava o bash (`terminal_ws.go`). Ao voltar, um bash
NOVO spawnava: o "histórico persistido" (`hokma.terminal.state.v1`) era só
visual (localStorage); processos reais (tail -f, vi, apt) morriam a cada troca.

### 1c. Sem heartbeat nem auto-reconexão
Backend `terminal_ws.go`: read deadline 24h (não havia timeout de inatividade —
o servidor não derrubava conexões ociosas), mas NENHUM ping/pong — não detectava
cliente morto e acumulava shells órfãos. Cliente: queda real (rede/suspensão)
→ OFFLINE até toque manual no botão; sem backoff/reconnect.

### 1d. Plataforma (secundário, mitigado)
Hok OS é web app Vite simples, SEM PWA/service worker. Android/Chrome suspende
abas em background → mata WebSocket. Não há correção total no código; mitigado
com reconexão automática + restore imediato.

## 2. Correções implementadas

### Backend — `terminal_ws.go` (commit `dc63009`)
Heartbeat ativo: servidor envia PING a cada 25s (`WriteControl PingMessage`);
o browser responde PONG automaticamente e o handler renova o read deadline
(`SetPongHandler`, 90s). Sem pong em ~2 ciclos a conexão é encerrada,
liberando PTY/shell sem órfãos. Conexões saudáveis ociosas seguem vivas.

### Frontend — `use-terminal.tsx` novo + `TerminalScreen.tsx` + `App.tsx` (commit `e6a6bb5`)
1. **WebSocket movido para `TerminalProvider` global** (montado acima do
   AppShell em `App.tsx`): a tela desmonta ao trocar de aba, mas o socket e o
   shell real continuam vivos em background; ao voltar, a tela reutiliza a
   MESMA sessão (sem novo bash, sem perda de processo).
2. **Guard de identidade** em `onclose`/`onerror`: eventos de socket antigo
   NÃO afetam o estado do socket atual — corrige o OFFLINE aleatório.
3. **Auto-reconnect com backoff** (1s, 2s, 4s, 8s, máx 15s) quando a queda é
   inesperada, + reconexão IMEDIATA ao voltar a aba/janela para primeiro plano
   (`visibilitychange` — mitiga suspensão do Android).
4. **Buffer de replay**: output do shell que aconteceu com a tela desmontada
   é reescrito no xterm ao remontar (sessão contínua).
5. **Storage listener de settings movido para o provider** — funciona mesmo
   com a tela do Terminal desmontada.

## 3. Validação

- Backend: `go build` + `go vet` + `go test ./...` 100% verdes (~23s).
- Frontend: `npm run typecheck` OK; `npm run build` OK (bundle
  `index-fvFSyB7P.js`).
- **Smoke isolado (porta 18090)**: WS conectou, comando `echo HEARTBEAT_TEST_OK`
  executou, conexão permaneceu aberta após 70s (cobre 2 ciclos de ping 25s) —
  heartbeat não derruba conexões saudáveis.
- **Pós-deploy produção (8082)**: WS real `echo PROD_WS_OK` executado, conexão
  viva após 70s; read-only claude (claude_code_direct) e approved claude
  (rm executado) seguem OK.
- Deploy frontend: build → `/var/www/hok-os` com backup
  (`/var/www/hok-os.bak_wsfix_20260820_*`); nginx 200 + bundle novo servido.
- Deploy backend: `hokma.bak_wsfix_20260820_*` → stop → cp → start; health OK.

## 4. Deploy / commits

- Backend `devwluis/hok-backend-atual` @ main: `dc63009`
- Frontend `devwluis/hok-frontend-atual` @ main: `e6a6bb5`
- Backups: `terminal_ws.go.bak_20260820_114432`, `TerminalScreen.tsx.bak_wsfix_*`,
  `App.tsx.bak_wsfix_*`.

## 5. Testes manuais sugeridos ao usuário

- Abrir Terminal, rodar um comando, trocar para Chat/N8N/Config e voltar →
  conexão deve permanecer LIVE (sem OFFLINE, sem botão manual).
- Deixar o Terminal parado 2-3 min (sem digitar) → conexão se mantém.
- Celular: apagar a tela e voltar a acender → reconexão automática imediata
  (pode levar 1-2s; o histórico e a sessão são restaurados).
- Um processo longo (ex: `tail -f`) deve continuar rodando ao trocar de aba.