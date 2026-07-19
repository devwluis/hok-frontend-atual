"use client";
import { motion } from "framer-motion";
import logo from "@/assets/hok-logo.png";

export function NuclearCore() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-10 select-none">

      {/* ── Central logo com anéis animados ── */}
      <div className="relative flex h-36 w-36 items-center justify-center">

        {/* Anel externo — respira devagar */}
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ border: "1px solid rgba(245,166,35,0.15)" }}
          animate={{ scale: [1, 1.06, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Anel médio — rotação suave */}
        <motion.span
          className="absolute inset-4 rounded-full"
          style={{ border: "1px dashed rgba(245,166,35,0.25)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        />

        {/* Anel interno — rotação inversa */}
        <motion.span
          className="absolute inset-8 rounded-full"
          style={{ border: "1.5px solid rgba(245,166,35,0.35)" }}
          animate={{ rotate: -360 }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        />

        {/* Ticks nos 4 cantos do anel médio */}
        {[0, 90, 180, 270].map((deg) => (
          <motion.span
            key={deg}
            className="absolute"
            style={{
              width: 6, height: 1.5,
              background: "rgba(245,166,35,0.5)",
              borderRadius: 2,
              top: "50%", left: "50%",
              transformOrigin: "-46px 0",
              transform: `rotate(${deg}deg) translateY(-50%)`,
            }}
            animate={{ opacity: [0.3, 0.9, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, delay: deg / 360 * 2 }}
          />
        ))}

        {/* Halo de glow por baixo do logo */}
        <motion.span
          className="absolute inset-10 rounded-full"
          animate={{
            boxShadow: [
              "0 0 16px 4px rgba(245,166,35,0.12)",
              "0 0 36px 12px rgba(245,166,35,0.28)",
              "0 0 16px 4px rgba(245,166,35,0.12)",
            ],
          }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Logo capacete — centro */}
        <motion.img
          src={logo}
          alt="H.O.K."
          className="relative z-10 h-16 w-16 rounded-2xl object-contain"
          style={{ filter: "drop-shadow(0 4px 16px rgba(245,166,35,0.45))" }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
          whileHover={{ scale: 1.08, transition: { duration: 0.3 } }}
        />
      </div>

      {/* ── Texto ── */}
      <motion.div
        className="text-center space-y-1.5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <p className="text-[15px] font-semibold tracking-tight text-foreground">
          Pronto para trabalhar
        </p>
        <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[color:var(--amber)]/70">
          HOK · Dev &amp; Automação N8N
        </p>
        <p className="text-[12px] text-muted-foreground">
          Como posso ajudar com seu projeto?
        </p>
      </motion.div>

    </div>
  );
}
