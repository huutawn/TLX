import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TLX Dashboard",
  description: "Web dashboard for the TLX CLI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
