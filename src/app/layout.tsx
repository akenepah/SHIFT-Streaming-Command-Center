import type { Metadata } from "next";
import { Barlow, Montserrat, Poppins } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { StoreProvider } from "@/state/store";
import "./globals.css";

// Locked type system: Montserrat (wordmark only), Barlow (headings), Poppins (UI/body).
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["800"], style: ["italic"] });
const barlow = Barlow({ variable: "--font-barlow", subsets: ["latin"], weight: ["500", "600", "700"] });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600"] });

const SITE_URL = "https://shift-streamer.farmtofame.com";
const TITLE = "SHIFT — Fantasy Hockey Streaming Planner";
const DESCRIPTION = "Find open lineup opportunities, plan smarter streams, and maximize usable games every week.";
// Approved social preview (public/og-image.png, 1200×630). Always resolved against the production domain.
const OG_IMAGE = { url: "/og-image.png", width: 1200, height: 630, alt: "SHIFT Fantasy Hockey Streaming Planner" };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "SHIFT",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${montserrat.variable} ${barlow.variable} ${poppins.variable} h-full antialiased`}>
      <body className="min-h-full font-body text-body">
        <StoreProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
