import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CSC Command", template: "%s · CSC Command" },
  description: "California Sulphur Company — operations and intelligence platform",
  robots: { index: false, follow: false },
};

const themeScript = `(function(){try{var c=document.cookie.match(/(?:^|; )theme=(\\w+)/);var t=c?c[1]:'system';if(t==='system'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pref = (await cookies()).get("theme")?.value;
  const theme = pref === "dark" || pref === "light" ? pref : undefined;
  return (
    <html lang="en" data-theme={theme} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans text-[14px]">
        {children}
        <Toaster position="bottom-right" toastOptions={{ className: "!bg-surface !text-fg !border-line" }} />
      </body>
    </html>
  );
}
