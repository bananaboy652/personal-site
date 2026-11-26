import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css";
import "./materials.css";
import Navbar from "./components/Navbar";
import World from "./world/World";

// Display and body faces (Clash Grotesk, Supreme) load from Fontshare in globals.css.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Will Donnelly",
  description: "Personal portfolio website of William Myles Donnelly, [Note to self: insert SEO here.]",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={mono.variable}>
        {/* Runs before anything is painted: tells the styles that the live
            world is on its way (so the still image is held back) and that
            this is a first arrival (so the page makes its entrance). */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.world='boot';document.documentElement.dataset.enter='first'" }} />
        <World />
        <Analytics/>
        <SpeedInsights/>
        <Navbar />
        {children}
        <div className="siteFrame" aria-hidden="true" />
      </body>
    </html>
  );
}
