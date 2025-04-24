import "@livekit/components-styles";
import { Public_Sans } from "next/font/google";
import "./globals.css";
import AuthProvider from "../components/auth/AuthProvider";
import OrderProcessor from "../components/auth/OrderProcessor";

const publicSans400 = Public_Sans({
  weight: "400",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${publicSans400.className}`}>
      <body className="h-full">
        <AuthProvider>
          {children}
          <OrderProcessor />
        </AuthProvider>
      </body>
    </html>
  );
}
