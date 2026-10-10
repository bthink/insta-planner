import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "InstaPlanner",
  description: "Spokojne miejsce na planowanie publikacji",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
