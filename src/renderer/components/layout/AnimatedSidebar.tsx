import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  FolderPlus,
  Folders,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useSubscriptionStore } from "../../store/useSubscriptionStore";
import { useUiStore } from "../../store/useUiStore";
import { AccountIdentity } from "../common/AccountIdentity";
import { AppIcon } from "../common/AppIcon";
import { UpdateButton } from "../common/UpdateButton";
const navigationItems = [
  { label: "Home", to: "/", icon: Home },
  { label: "Import", to: "/import", icon: FolderPlus },
  { label: "Projects", to: "/projects", icon: Folders },
  { label: "Health", to: "/health", icon: Activity },
  { label: "Settings", to: "/settings", icon: Settings },
];
function BrandBlock({ collapsed }: { collapsed: boolean }): JSX.Element {
  return (
    <div
      className={`flex ${collapsed ? "flex-col items-center gap-3" : "min-w-0 items-center gap-3"} overflow-hidden`}
    >
      {" "}
      <motion.div
        className="app-icon-surface flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line"
        whileHover={{ scale: 1.04 }}
      >
        {" "}
        <AppIcon className="h-8 w-8 rounded-lg" />{" "}
      </motion.div>{" "}
      <AnimatePresence initial={false}>
        {" "}
        {!collapsed ? (
          <motion.div
            animate={{ x: 0 }}
            className="min-w-0"
            exit={{ x: -8 }}
            initial={{ x: -8 }}
            transition={{ duration: 0.18 }}
          >
            {" "}
            <div className="truncate text-[15px] font-semibold tracking-tight text-text">
              Projecto
            </div>{" "}
          </motion.div>
        ) : null}{" "}
      </AnimatePresence>{" "}
    </div>
  );
}
export function AnimatedSidebar(): JSX.Element {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const location = useLocation();
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setCommandPaletteOpen = useUiStore(
    (state) => state.setCommandPaletteOpen,
  );
  const subscription = useSubscriptionStore((state) => state.subscription);
  return (
    <motion.aside
      animate={{ width: collapsed ? 96 : 256 }}
      className="app-sidebar-surface flex h-full min-h-0 shrink-0 flex-col border-r border-line px-4 py-5 "
      initial={false}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {" "}
      <div className={`px-1 ${collapsed ? "space-y-4" : "space-y-0"}`}>
        {" "}
        <div
          className={`flex ${collapsed ? "justify-center" : "items-center justify-between"} gap-3`}
        >
          {" "}
          {!collapsed ? <BrandBlock collapsed={false} /> : null}{" "}
          <div className="flex items-center gap-2">
            <UpdateButton collapsed={collapsed} />{" "}
            <button
              className="rounded-xl border border-line bg-bg p-2 text-text transition hover:bg-shell"
              onClick={toggleSidebar}
              type="button"
            >
              {" "}
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}{" "}
            </button>{" "}
          </div>{" "}
        </div>{" "}
        {collapsed ? (
          <div className="flex justify-center">
            {" "}
            <BrandBlock collapsed />{" "}
          </div>
        ) : null}{" "}
      </div>{" "}
      <nav className="mt-8 space-y-1.5">
        {" "}
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname === item.to ||
                location.pathname.startsWith(`${item.to}/`);
          return (
            <NavLink
              className={`relative flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} overflow-hidden rounded-2xl py-3 text-sm font-medium transition duration-150 ease-premium ${isActive ? "text-text" : "text-muted hover:text-text"}`}
              end={item.to === "/"}
              key={item.to}
              to={item.to}
            >
              {" "}
              {isActive ? (
                <motion.span
                  className="absolute inset-0 rounded-2xl bg-bg ring-1 ring-inset ring-line"
                  layoutId="sidebar-active-indicator"
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 34,
                  }}
                />
              ) : null}{" "}
              <motion.span
                className="relative z-10 shrink-0"
                whileHover={{ scale: 1.06 }}
              >
                {" "}
                <Icon className="h-4 w-4" />{" "}
              </motion.span>{" "}
              <AnimatePresence initial={false}>
                {" "}
                {!collapsed ? (
                  <motion.span
                    animate={{ x: 0 }}
                    className="relative z-10 whitespace-nowrap"
                    exit={{ x: -6 }}
                    initial={{ x: -6 }}
                    transition={{ duration: 0.16 }}
                  >
                    {" "}
                    {item.label}{" "}
                  </motion.span>
                ) : null}{" "}
              </AnimatePresence>{" "}
            </NavLink>
          );
        })}{" "}
      </nav>{" "}
      <div className="mt-auto space-y-3">
        {" "}
        {subscription.email ? (
          <AccountIdentity compact={collapsed} subscription={subscription} />
        ) : null}{" "}
        <motion.button
          className={`flex w-full items-center rounded-2xl border border-line bg-bg py-3 text-left text-sm text-text transition hover:bg-shell ${collapsed ? "justify-center px-0" : "gap-3 px-3"}`}
          onClick={() => setCommandPaletteOpen(true)}
          type="button"
          whileHover={{ y: -1 }}
        >
          {" "}
          <Search className="h-4 w-4 shrink-0" />{" "}
          <AnimatePresence initial={false}>
            {" "}
            {!collapsed ? (
              <motion.span
                animate={{ x: 0 }}
                className="flex flex-1 items-center justify-between gap-3"
                exit={{ x: -6 }}
                initial={{ x: -6 }}
                transition={{ duration: 0.16 }}
              >
                {" "}
                <span>Command Palette</span>{" "}
                <span className="rounded-lg border border-line px-2 py-1 text-[11px] uppercase tracking-[0.14em]">
                  Ctrl/Cmd K
                </span>{" "}
              </motion.span>
            ) : null}{" "}
          </AnimatePresence>{" "}
        </motion.button>{" "}
      </div>{" "}
    </motion.aside>
  );
}
