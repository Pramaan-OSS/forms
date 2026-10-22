import { getUser } from "@/lib/user/service";
import { getSession } from "@/modules/auth/lib/session";
import { ClientLogout } from "@/modules/ui/components/client-logout";
import { NoMobileOverlay } from "@/modules/ui/components/no-mobile-overlay";
import { ToasterClient } from "@/modules/ui/components/toaster-client";

const AppLayout = async ({ children }: Readonly<{ children: React.ReactNode }>) => {
  const session = await getSession();
  const user = session?.user?.id ? await getUser(session.user.id) : null;

  // If user account is deactivated, log them out instead of rendering the app
  if (user?.isActive === false) {
    return <ClientLogout />;
  }

  // Resolve the paying-customer label server-side so Plain applies it to threads
  // from init time. Only queried when a label is configured to avoid extra work.

  return (
    <>
      <NoMobileOverlay />
      <ToasterClient />
      {children}
    </>
  );
};

export default AppLayout;
