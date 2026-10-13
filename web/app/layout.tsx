import type { Metadata, Viewport } from "next";
import SoundManager from "@/components/SoundManager";
import ToastProvider from "@/components/Toast";
import { getSession } from "@/lib/auth";
import { soundDefaultOn } from "@/lib/settings";
import "./globals.css";

export const metadata: Metadata = {
  title: "يومي — مصفوفة أيزنهاور",
  description: "خطّط يومك: مهامك في مصفوفة أيزنهاور، وأفكارك في مكانها.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#100e18" },
  ],
};

// set the theme class before first paint to avoid a flash
const themeScript = `
(function(){try{
  var t=localStorage.getItem('yawmi_theme');
  if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
  if(t==='dark')document.documentElement.classList.add('dark');
}catch(e){}})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const defaultOn = session ? await soundDefaultOn(session.uid) : false;
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="paper-grain min-h-screen antialiased">
        <ToastProvider>
          <SoundManager defaultOn={defaultOn}>{children}</SoundManager>
        </ToastProvider>
      </body>
    </html>
  );
}
