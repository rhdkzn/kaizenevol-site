import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.nav
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut', delay: 3.2 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'glass border-b border-white/5' : ''
      }`}
    >
      <div className="max-w-[1280px] mx-auto px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2 group" aria-label="Hyliox home">
          <span
            className="text-xl font-bold tracking-tighter"
            style={{ color: '#D4FF4F' }}
          >
            HYLIOX
          </span>
        </a>

        {/* Nav links - desktop */}
        <div className="hidden md:flex items-center gap-8">
          {['Templates', 'How it works', 'Pricing', 'FAQ'].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
              className="text-sm transition-colors duration-200"
              style={{ color: 'rgba(250,250,250,0.64)' }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#FAFAFA')}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'rgba(250,250,250,0.64)')}
            >
              {item}
            </a>
          ))}
        </div>

        {/* CTA */}
        <motion.a
          href="#pricing"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity"
          style={{ backgroundColor: '#D4FF4F', color: '#0A0A0A', borderRadius: 12 }}
        >
          Browse templates
        </motion.a>
      </div>
    </motion.nav>
  )
}
