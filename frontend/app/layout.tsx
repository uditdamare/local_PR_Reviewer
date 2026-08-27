import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI PR Reviewer",
  description: "Self-hosted AI-powered PR code reviewer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="mx-auto max-w-4xl px-6 py-10">{children}</div>
      </body>
    </html>
  );
}
