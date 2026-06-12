import { PasswordResetForm } from "@/components/auth/PasswordResetForm";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center bg-background p-4 text-textPrimary">
      <PasswordResetForm token={params.token ?? ""} />
    </main>
  );
}
