"use client";
import { useCallback, useState } from "react";
import { Copy, ClipboardPaste, ClipboardCopy, X } from "lucide-react";

interface SelectionHandlesProps {
  active: boolean;
  onStart: () => Promise<void>;
  onCopy: () => Promise<void>;
  onPaste: (text: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onCopyScreen: () => Promise<void>;
  onCopyAll: () => Promise<void>;
  containerRef: React.RefObject<HTMLElement | null>;
  onScroll?: (direction: "up" | "down", lines: number) => void;
}

type HandlePosition = { x: number; y: number };

export function SelectionHandles({
  active,
  onStart,
  onCopy,
  onPaste,
  onCancel,
  onCopyScreen,
  onCopyAll,
  containerRef,
  onScroll,
}: SelectionHandlesProps) {
  const [showHandles, setShowHandles] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [startHandle, setStartHandle] = useState<HandlePosition>({ x: 0, y: 0 });
  const [endHandle, setEndHandle] = useState<HandlePosition>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const onHandlePointerDown = useCallback(
    (handle: "start" | "end") => (e: React.PointerEvent) => {
      try {
        e.preventDefault();
        e.stopPropagation();
        setDragging(handle);
        const target = e.target as HTMLElement;
        if (target.setPointerCapture) {
          target.setPointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    },
    [],
  );

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (dragging === "start") {
        setStartHandle({ x, y });
      } else {
        setEndHandle({ x, y });
      }
    },
    [dragging, containerRef],
  );

  const onHandlePointerUp = useCallback(
    (handle: "start" | "end") => (e: React.PointerEvent) => {
      try {
        e.preventDefault();
        setDragging(null);

        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const deltaY = handle === "start" ? y - startHandle.y : y - endHandle.y;

        const lines = Math.round(Math.abs(deltaY) / 20);
        if (lines > 0 && onScroll) {
          const direction = deltaY > 0 ? "down" : "up";
          onScroll(direction, lines);
        }
      } catch {
        // ignore
      }
    },
    [containerRef, startHandle, endHandle, onScroll],
  );

  const onHandleTap = useCallback(
    (handle: "start" | "end") => (e: React.PointerEvent) => {
      try {
        e.preventDefault();
        e.stopPropagation();

        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();

        const pos = handle === "start" ? startHandle : endHandle;
        setMenuPos({
          x: Math.min(pos.x, rect.width - 160),
          y: Math.min(pos.y - 80, rect.height - 200),
        });
        setShowMenu(true);
      } catch {
        // ignore
      }
    },
    [containerRef, startHandle, endHandle],
  );

  const closeHandles = useCallback(() => {
    setShowHandles(false);
    setShowMenu(false);
    void onCancel();
  }, [onCancel]);

  const handleCopy = useCallback(async () => {
    setShowMenu(false);
    await onCopy();
  }, [onCopy]);

  const handleCopyScreen = useCallback(async () => {
    setShowMenu(false);
    await onCopyScreen();
  }, [onCopyScreen]);

  const handleCopyAll = useCallback(async () => {
    setShowMenu(false);
    await onCopyAll();
  }, [onCopyAll]);

  const handlePaste = useCallback(async () => {
    setShowMenu(false);
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) await onPaste(text);
      }
    } catch {
      // Clipboard read failed - ignore
    }
  }, [onPaste]);

  if (!active && !showHandles) return null;

  return (
    <>
      {/* Selection handles overlay */}
      {showHandles && (
        <div
          className="absolute inset-0 z-[46]"
          style={{ pointerEvents: "auto" }}
          onPointerMove={onHandlePointerMove}
        >
          {/* Selection highlight line between handles */}
          <div
            className="absolute w-[2px] bg-blue-500/60"
            style={{
              left: startHandle.x,
              top: Math.min(startHandle.y, endHandle.y),
              height: Math.abs(endHandle.y - startHandle.y),
              pointerEvents: "none",
            }}
          />

          {/* Start handle */}
          <div
            className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-blue-500 shadow-lg touch-none"
            style={{
              left: startHandle.x,
              top: startHandle.y,
              pointerEvents: "auto",
              cursor: "grab",
            }}
            onPointerDown={onHandlePointerDown("start")}
            onPointerUp={onHandlePointerUp("start")}
            onPointerMove={onHandlePointerMove}
            onClick={onHandleTap("start")}
          >
            <div className="h-2 w-2 rounded-full bg-white" />
          </div>

          {/* End handle */}
          <div
            className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-blue-500 shadow-lg touch-none"
            style={{
              left: endHandle.x,
              top: endHandle.y,
              pointerEvents: "auto",
              cursor: "grab",
            }}
            onPointerDown={onHandlePointerDown("end")}
            onPointerUp={onHandlePointerUp("end")}
            onPointerMove={onHandlePointerMove}
            onClick={onHandleTap("end")}
          >
            <div className="h-2 w-2 rounded-full bg-white" />
          </div>

          {/* Close button */}
          <button
            className="absolute flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-red-500 shadow-lg"
            style={{
              left: (startHandle.x + endHandle.x) / 2,
              top: Math.min(startHandle.y, endHandle.y) - 32,
              pointerEvents: "auto",
            }}
            onClick={closeHandles}
          >
            <X size={14} className="text-white" />
          </button>
        </div>
      )}

      {/* Context menu */}
      {showMenu && (
        <div
          className="absolute z-[150] flex flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
          style={{
            left: menuPos.x,
            top: menuPos.y,
            pointerEvents: "auto",
          }}
        >
          <button
            className="flex items-center gap-2 px-4 py-2.5 text-left text-[12px] font-semibold text-white hover:bg-gray-800"
            onClick={handleCopy}
          >
            <Copy size={14} className="text-blue-400" />
            Copiar seleção
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2.5 text-left text-[12px] font-semibold text-white hover:bg-gray-800"
            onClick={handleCopyScreen}
          >
            <Copy size={14} className="text-green-400" />
            Copiar tela
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2.5 text-left text-[12px] font-semibold text-white hover:bg-gray-800"
            onClick={handleCopyAll}
          >
            <ClipboardCopy size={14} className="text-yellow-400" />
            Copiar tudo
          </button>
          <div className="h-px bg-gray-700" />
          <button
            className="flex items-center gap-2 px-4 py-2.5 text-left text-[12px] font-semibold text-white hover:bg-gray-800"
            onClick={handlePaste}
          >
            <ClipboardPaste size={14} className="text-purple-400" />
            Colar
          </button>
        </div>
      )}
    </>
  );
}