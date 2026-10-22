import { redirect } from "next/navigation";
import { Toaster } from "react-hot-toast";
import { getIsFreshInstance } from "@/lib/instance/service";
import { getSession } from "@/modules/auth/lib/session";

export const AuthLayout = async ({ children }: Readonly<{ children: React.ReactNode }>) => {
  const [session, isFreshInstance] = await Promise.all([getSession(), getIsFreshInstance()]);

  if (session) {
    redirect(`/`);
  }

  if (isFreshInstance) {
    redirect("/setup/intro");
  }

  // The backdrop and centring live in FormWrapper so the routes outside this layout
  // (/invite, /verify-email-change, /email-change-without-verification-success) get
  // the same shell instead of hand-copying one.
  return (
    <>
      <Toaster />
      {children}
    </>
  );
};
