import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/AuthShell";

export default function SignInPage() {
  return (
    <AuthShell label="Sign in to Magica">
      <SignIn />
    </AuthShell>
  );
}
