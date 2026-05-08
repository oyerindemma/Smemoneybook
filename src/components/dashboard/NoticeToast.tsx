import { Toast } from "@/components/ui/Toast";

export function NoticeToast({ message }: { message: string }) {
  return <Toast message={message} />;
}
