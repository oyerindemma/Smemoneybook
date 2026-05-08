export function ErrorMessage({
  title = "Something went wrong",
  message = "Check your internet and try again",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}
