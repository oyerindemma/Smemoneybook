import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SME Moneybook",
  description: "A daily money operating system for Nigerian SMEs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
