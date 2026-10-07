import { Fredoka, Geist_Mono, Inter, Outfit, Playfair_Display, Space_Grotesk } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/ThemeProvider"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

// Slide theme fonts; not preloaded since most pages only need the open deck's theme font.
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
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
