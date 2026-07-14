import Image from "next/image";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={`rounded-xl object-cover ${className}`}
      height={144}
      priority
      src="/images/logo.png"
      width={144}
    />
  );
}
