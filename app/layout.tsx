import { Fredoka, Geist_Mono, Inter, Outfit, Playfair_Display, Space_Grotesk } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/ThemeProvider"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

// Slide theme fonts (lib/themes/Themes.ts). Not preloaded: most pages
// only need the theme the open deck uses.
const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
  preload: false,
})
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  preload: false,
})
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  preload: false,
})
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  preload: false,
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable,
        fredoka.variable,
        spaceGrotesk.variable,
        outfit.variable,
        playfairDisplay.variable
      )}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
