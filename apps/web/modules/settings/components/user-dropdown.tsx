"use client";

import { ChevronRightIcon, LogOutIcon, UserCircleIcon } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { TUser } from "@forms/types/user";
import { cn } from "@/lib/cn";
import { useSignOut } from "@/modules/auth/hooks/use-sign-out";
import { ProfileAvatar } from "@/modules/ui/components/avatars";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/modules/ui/components/dropdown-menu";

interface UserDropdownProps {
  user: TUser;
  organizationId: string;
  isCollapsed?: boolean;
  isTextVisible?: boolean;
  className?: string;
  // Whether the Forms-in-Forms in-app survey widget is configured (workspace id set). The
  // "What's New" and "Share feedback" items only trigger Forms surveys, so they are hidden when
  // the widget is not mounted — otherwise they would render but do nothing.
  isFormsSurveysConfigured?: boolean;
}

// The avatar/account trigger and menu (Account and Log out) shown at the
// bottom of the sidebar. Extracted so the standalone org/account settings shell renders the same
// user menu the workspace navigation does — otherwise those routes have no way to log out, which
// strands billing-role users who get redirected straight into settings.
export const UserDropdown = ({
  user,
  isCollapsed = false,
  isTextVisible = false,
  className,
}: Readonly<UserDropdownProps>) => {
  const { t } = useTranslation();
  const { signOut } = useSignOut();

  const dropdownNavigation = [
    {
      label: t("common.account"),
      href: "/account/settings/profile",
      icon: UserCircleIcon,
    },
  ];

  const triggerClasses = cn(
    "w-full border-t px-3 py-3 text-left transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-inset",
    isCollapsed ? "flex items-center justify-center" : "",
    className
  );
  const iconClasses =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild id="userDropdownTrigger" className={triggerClasses}>
        <button
          type="button"
          aria-label={isCollapsed ? t("common.account_settings") : undefined}
          className={cn("flex w-full items-center gap-3", isCollapsed && "justify-center")}>
          <span className={iconClasses}>
            <ProfileAvatar userId={user.id} />
          </span>
          {!isCollapsed && !isTextVisible && (
            <>
              <div className="grow overflow-hidden">
                <p
                  title={user?.email}
                  className="ph-no-capture -mb-0.5 truncate text-sm font-bold text-slate-700">
                  {user?.name ? <span>{user?.name}</span> : <span>{user?.email}</span>}
                </p>
                <p className="text-sm text-slate-500">{t("common.account")}</p>
              </div>
              <ChevronRightIcon className="size-4 shrink-0 text-slate-600" strokeWidth={1.5} />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        id="userDropdownInnerContentWrapper"
        side="right"
        sideOffset={10}
        alignOffset={5}
        align="end">
        {dropdownNavigation.map((link) => (
          <Link href={link.href} className="flex w-full items-center" key={link.label}>
            <DropdownMenuItem>
              <link.icon className="mr-2 size-4" strokeWidth={1.5} />
              {link.label}
            </DropdownMenuItem>
          </Link>
        ))}
        <DropdownMenuItem
          onClick={() => void signOut()}
          icon={<LogOutIcon className="mr-2 size-4" strokeWidth={1.5} />}>
          {t("common.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
