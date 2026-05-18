import { AlertTriangle } from "lucide-react";

export function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>{children}</span>
    </div>
  );
}