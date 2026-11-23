import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Bandarban Resort Hub — A little closer to nature",
  description: "Discover, compare and plan your next hillside escape in Bandarban. An interactive resort booking prototype.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-BD"><body>{children}</body></html>;
}
