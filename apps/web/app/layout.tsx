import type { Metadata } from "next";
import { AuthProvider } from "./context/auth";
import Navbar from "./components/Navbar";
import RouteGuard from "./components/RouteGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestion Immobiliere V1",
  description: "Plateforme web responsive de gestion immobiliere",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <Navbar />
          <RouteGuard>{children}</RouteGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
