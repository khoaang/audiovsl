import './globals.css';
import { Inter, Roboto_Mono, Playfair_Display, Bebas_Neue, Permanent_Marker } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });
const robotoMono = Roboto_Mono({ subsets: ['latin'] });
const playfair = Playfair_Display({ subsets: ['latin'] });
const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'] });
const permanentMarker = Permanent_Marker({ weight: '400', subsets: ['latin'] });

export const metadata = {
  title: 'AudioVSL',
  description: 'For Artists, By Artists',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body
        style={{
          '--font-inter': inter.style.fontFamily,
          '--font-roboto-mono': robotoMono.style.fontFamily,
          '--font-playfair': playfair.style.fontFamily,
          '--font-bebas-neue': bebasNeue.style.fontFamily,
          '--font-permanent-marker': permanentMarker.style.fontFamily,
        } as React.CSSProperties}
      >
        {children}
      </body>
    </html>
  );
} 