import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creative Intelligence OS",
  description: "Know what wins. Know why. Know what to make next.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
