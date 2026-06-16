import { Check } from "lucide-react";

interface MenuItemProps {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  checked?: boolean;
  isCheckbox?: boolean;
}

export function MenuItem({ label, icon: Icon, onClick, disabled, destructive, checked, isCheckbox }: MenuItemProps) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors
        hover:bg-accent disabled:opacity-40 disabled:pointer-events-none
        ${destructive ? "text-destructive hover:text-destructive" : ""}`}
    >
      {isCheckbox ? (
        <span className="h-4 w-4 flex items-center justify-center">
          {checked && <Check className="h-3 w-3" />}
        </span>
      ) : (
        <Icon className="h-4 w-4 shrink-0" />
      )}
      {label}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 border-t border-border" />;
}