import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/AuthShell";

export default function SignUpPage() {
  return (
    <AuthShell label="Create your Magica account">
      <SignUp />
    </AuthShell>
  );
}
