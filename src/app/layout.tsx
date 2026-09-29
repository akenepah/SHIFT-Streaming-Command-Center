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

export const metadata: Metadata = {
  title: "SHIFT — Streaming Command Center",
  description: "Fantasy hockey weekly planner: maximize games played every week.",
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
