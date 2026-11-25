import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./theme.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Postmaster Manager",
  description: "Manage domains with Google Postmaster Tools.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
              try {
                var theme = localStorage.getItem('postmaster-manager-theme') === 'light' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-pm-theme', theme);
                document.documentElement.style.colorScheme = theme;
              } catch (_) {
                document.documentElement.setAttribute('data-pm-theme', 'dark');
                document.documentElement.style.colorScheme = 'dark';
              }
            })();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
