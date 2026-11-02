import "@/app/globals.css";
import "@/app/tailwind.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KELD — Same Web. A Brighter Desktop.",
  description:
    "A desktop framework for developers who refuse to compromise. Rust host. Bun main. Native webviews.",
  icons: { icon: "/brand/keld-symbol-white.svg" },
  openGraph: {
    title: "KELD — Same Web. A Brighter Desktop.",
    description: "Engineered for the desktop. Designed for control.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
