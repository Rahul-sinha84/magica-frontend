import type { Metadata } from "next";
import { Figtree, Geist_Mono, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AppProviders } from "@/providers/AppProviders";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  preload: false,
});
// code blocks in replies, as on magica
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  preload: false,
});

export const metadata: Metadata = {
  title: "Magica",
  description: "Your AI worker",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${figtree.variable} ${geistMono.variable} ${jetbrainsMono.variable} h-full`}
    >
      {/* browser extensions (Grammarly and others) add attributes to <body> before React loads; only this
          element's attributes are exempt from the hydration check */}
      <body className="min-h-full" suppressHydrationWarning>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          afterSignOutUrl="/sign-in"
          signInFallbackRedirectUrl="/chat"
          signUpFallbackRedirectUrl="/chat"
          appearance={{
            options: { logoImageUrl: "/brand/magica-mark.svg" },
            variables: {
              colorPrimary: "var(--clerk-primary)",
              colorPrimaryForeground: "var(--clerk-primary-foreground)",
              colorForeground: "var(--text-primary)",
              colorMutedForeground: "var(--text-secondary)",
              colorMuted: "var(--surface-primary)",
              colorBackground: "var(--surface-main-3)",
              colorInput: "var(--surface-main)",
              colorInputForeground: "var(--text-primary)",
              colorBorder: "var(--line-secondary)",
              colorNeutral: "var(--text-primary)",
              fontFamily: "var(--font-figtree)",
              borderRadius: "6px",
            },
            elements: { badge: { color: "var(--text-secondary)" } },
          }}
        >
          <AppProviders>{children}</AppProviders>
        </ClerkProvider>
      </body>
    </html>
  );
}
