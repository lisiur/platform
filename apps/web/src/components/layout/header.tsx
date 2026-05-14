import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function Header({ className }: { className?: string }) {
  return (
    <header
      className={`${className} flex items-center border-b bg-background px-6`}
    >
      <span className="text-lg font-semibold">Next101</span>
      <div className="ml-auto flex items-center gap-2">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
