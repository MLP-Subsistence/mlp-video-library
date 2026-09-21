import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://marketplaceliteracyapp.org";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "MLP Video Library",
  title: {
    default: "MLP Video Library",
    template: "%s | MLP Video Library"
  },
  description: "Marketplace Literacy Project educator and facilitator resource library",
  openGraph: {
    title: "MLP Video Library",
    description: "Marketplace Literacy Project educator and facilitator resource library",
    url: siteUrl,
    siteName: "MLP Video Library",
    type: "website"
  },
  appleWebApp: {
    capable: true,
    title: "MLP Video Library",
    statusBarStyle: "default"
  },
  icons: {
    icon: "/icons/app-icon.svg",
    apple: "/icons/app-icon-192.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
