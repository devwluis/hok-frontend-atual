"use client";

import { cn } from "@/lib/utils";

export function ClaudeCodeIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <div className={cn("relative w-3 h-3", className)}>
      <div className="absolute inset-0 bg-[#f97316] rounded-[2px]" />
      <div className="absolute top-[2px] left-[2px] w-[2px] h-[2px] rounded-full bg-[#ff4444]" />
      <div className="absolute top-[2px] left-[5.5px] w-[2px] h-[2px] rounded-full bg-[#ffcc00]" />
      <div className="absolute top-[2px] left-[9px] w-[2px] h-[2px] rounded-full bg-[#00cc44]" />
      <div className="absolute left-[2px] top-[5px] text-white text-[5px] font-mono font-bold select-none">{'>_'}</div>
      <div className="absolute right-[1px] top-[1px] w-[4px] h-[4px] border-[1.2px] border-[#f97316] rounded-full" style={{clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'}} />
    </div>
  );
}

export function OpenCodeIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <div className={`relative w-3 h-3 ${className}`}>
      <div className="absolute inset-0 bg-[#34d399] rounded-[2px]" />
      <div className="absolute top-[2px] left-[2px] w-[2px] h-[2px] rounded-full bg-[#ff4444]" />
      <div className="absolute top-[2px] left-[5.5px] w-[2px] h-[2px] rounded-full bg-[#ffcc00]" />
      <div className="absolute top-[2px] left-[9px] w-[2px] h-[2px] rounded-full bg-[#00cc44]" />
      <div className="absolute left-[2px] top-[5px] text-white text-[5px] font-mono font-bold select-none">{'>_'}</div>
      <div className="absolute right-[1px] top-[5px] text-white text-[5px] font-mono font-bold select-none">{'O'}</div>
    </div>
  );
}

export function HermesIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <div className={`relative w-3 h-3 ${className}`}>
      <div className="absolute inset-0 bg-[#a78bfa] rounded-[2px]" />
      <div className="absolute inset-0 flex items-center justify-center text-white">
        <div className="relative w-[8px] h-[5px] bg-white rounded-[1px]">
          <div className="absolute -top-[1px] left-[2px] w-[6px] h-[2px] bg-white rounded-full" />
          <div className="absolute -top-[1px] right-[2px] w-[6px] h-[2px] bg-white rounded-full" />
          <div className="absolute bottom-[-1px] left-1/2 -translate-x-1/2 w-[1.5px] h-[2px] bg-white" />
          <div className="absolute bottom-[-1px] left-1/2 -translate-x-1/2 w-[1.5px] h-[1.5px] bg-white rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function AutomaticIcon({ className = "h-3 w-3" }: { className?: string }) {
  return <span className={`${className} text-[10px] font-mono`}>···</span>;
}