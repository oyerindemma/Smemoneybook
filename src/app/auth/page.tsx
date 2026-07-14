import type { Metadata } from "next";
import { AuthHomeNoSsr } from "@/components/auth/AuthHomeNoSsr";

export const metadata: Metadata = {
  title: "Start Free | SME MoneyBook",
  description: "Create your SME MoneyBook account or sign in to continue tracking your business money.",
};

export default function AuthPage() {
  return <AuthHomeNoSsr />;
}
