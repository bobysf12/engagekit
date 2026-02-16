import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  RefreshCw,
  FileText,
  Clock,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/runs", label: "Runs", icon: RefreshCw },
  { to: "/posts", label: "Posts", icon: FileText },
  { to: "/cron", label: "Cron Jobs", icon: Clock },
  { to: "/policy", label: "Policy", icon: Settings },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container h-14 flex items-center gap-3 min-w-0">
          <span className="font-semibold text-base sm:text-lg shrink-0">Engagekit</span>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-hide">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex shrink-0 items-center px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )
                }
              >
                <item.icon className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="container py-6 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
