"use client";
import { motion, useAnimationFrame } from "framer-motion";
import { useRef, useState } from "react";

/* ── Spoke dot animado ── */
function SpokeDot({ angle, radius, delay }: { angle: number; radius: number; delay: number }) {
  const rad = (angle * Math.PI) / 180;
  const x = 24 + radius * Math.cos(rad);
  const y = 24 + radius * Math.sin(rad);
  return (
    <motion.circle
      cx={x} cy={y} r={2.2}
      fill="#F5A623"
      animate={{ opacity: [0.3, 1, 0.3], r: [1.8, 2.6, 1.8] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

/* ── Spoke line animada ── */
function Spoke({ angle, delay }: { angle: number; delay: number }) {
  const rad = (angle * Math.PI) / 180;
  const x2 = 24 + 14 * Math.cos(rad);
  const y2 = 24 + 14 * Math.sin(rad);
  return (
    <motion.line
      x1={24} y1={24} x2={x2} y2={y2}
      stroke="#F5A623"
      strokeWidth={1}
      strokeLinecap="round"
      animate={{ opacity: [0.15, 0.6, 0.15] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

/* ── Relâmpagos aleatórios curtos ── */
function MicroArcs() {
  const [arcs, setArcs] = useState<string[]>([]);
  const frame = useRef(0);

  useAnimationFrame(() => {
    frame.current++;
    if (frame.current % 4 !== 0) return;
    const count = 1 + Math.floor(Math.random() * 2);
    const next: string[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const len = 5 + Math.random() * 7;
      const mx = 24 + (Math.random() - 0.5) * 4;
      const my = 24 + (Math.random() - 0.5) * 4;
      const ex = mx + Math.cos(a) * len;
      const ey = my + Math.sin(a) * len;
      next.push(`M${mx.toFixed(1)},${my.toFixed(1)} L${((mx + ex) / 2 + (Math.random() - 0.5) * 4).toFixed(1)},${((my + ey) / 2 + (Math.random() - 0.5) * 4).toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`);
    }
    setArcs(next);
  });

  return (
    <>
      {arcs.map((d, i) => (
        <path
          key={i} d={d}
          stroke="#FFD166"
          strokeWidth={0.7}
          fill="none"
          opacity={0.5 + Math.random() * 0.4}
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

/* ── Ícone Núcleo (48×48 SVG) ── */
function NucleusIcon() {
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg width={48} height={48} viewBox="0 0 48 48" className="overflow-visible">
      {/* Fundo escuro arredondado */}
      <rect x={0} y={0} width={48} height={48} rx={12} fill="#1a1506" />
      <rect x={0} y={0} width={48} height={48} rx={12}
        fill="none" stroke="rgba(245,166,35,0.25)" strokeWidth={1} />

      {/* Spokes */}
      {spokes.map((a, i) => (
        <Spoke key={a} angle={a} delay={i * 0.17} />
      ))}

      {/* Dots nas pontas dos spokes */}
      {spokes.map((a, i) => (
        <SpokeDot key={a} angle={a} radius={14} delay={i * 0.17} />
      ))}

      {/* Micro arcs */}
      <MicroArcs />

      {/* Núcleo central — halo */}
      <motion.circle cx={24} cy={24} r={7}
        fill="rgba(245,166,35,0.12)"
        animate={{ r: [6, 8.5, 6] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Núcleo central — esfera */}
      <motion.circle cx={24} cy={24} r={5}
        fill="#F5A623"
        style={{ filter: "drop-shadow(0 0 6px rgba(245,166,35,0.9))" }}
        animate={{ r: [4.5, 5.8, 4.5] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Faísca interna branca */}
      <motion.circle cx={24} cy={24} r={2}
        fill="white"
        animate={{ opacity: [0.5, 1, 0.5], r: [1.5, 2.5, 1.5] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

/* ── Componente principal ── */
export function ElectricCore({
  label = "processando…",
  modelName,
}: {
  label?: string;
  modelName?: string;
}) {
  return (
    <motion.div
      className="flex items-center gap-3 py-3"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Ícone */}
      <div className="shrink-0">
        <NucleusIcon />
      </div>

      {/* Texto */}
      <div>
        <p className="text-[13px] font-semibold leading-tight text-[color:var(--amber)]">
          Núcleo{" "}
          <motion.em
            className="font-normal not-italic"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            {label}
          </motion.em>
        </p>
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          {modelName ?? "Sinapses Ativas"}
        </p>
      </div>
    </motion.div>
  );
}
