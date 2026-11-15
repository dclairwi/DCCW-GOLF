import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "DCCW Golf";

export const metadata: Metadata = {
  title: { default: siteName, template: `%s · ${siteName}` },
  description: "Private site for our annual golf trip.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#123d2e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
