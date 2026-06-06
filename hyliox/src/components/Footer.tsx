import { motion } from 'framer-motion'

const links = {
  Templates: ['Apex Studio', 'Meridian SaaS', 'Vanta Portfolio', 'Solara', 'Nexus CMS', 'Halo Events', 'Prism Brand', 'Flux AI'],
  Resources: ['How it works', 'Prompt packs', 'Figma source', 'Changelog', 'FAQ'],
  Company: ['About', 'Contact', 'Affiliate program', 'Terms', 'Privacy'],
}

export default function Footer() {
  return (
    <footer
      style={{
        padding: 'clamp(60px, 8vw, 100px) 0 40px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: '#0A0A0A',
      }}
    >
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand column */}
          <div className="md:col-span-1">
            <div
              className="text-2xl font-bold tracking-tight mb-3"
              style={{ color: '#D4FF4F', letterSpacing: '-0.02em' }}
            >
              HYLIOX
            </div>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(250,250,250,0.45)', maxWidth: 220 }}>
              Premium templates for builders who bill by the hour, not the month.
            </p>
            <motion.a
              href="#pricing"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl"
              style={{ backgroundColor: '#D4FF4F', color: '#0A0A0A' }}
            >
              Browse templates →
            </motion.a>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([col, items]) => (
            <div key={col}>
              <h4
                className="eyebrow mb-5"
                style={{ fontSize: 10, letterSpacing: '0.3em', color: 'rgba(250,250,250,0.3)' }}
              >
                {col}
              </h4>
              <ul className="flex flex-col gap-3">
                {items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-sm transition-colors duration-200"
                      style={{ color: 'rgba(250,250,250,0.5)' }}
                      onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#FAFAFA')}
                      onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'rgba(250,250,250,0.5)')}
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs" style={{ color: 'rgba(250,250,250,0.25)' }}>
            © 2026 HYLIOX. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: 'rgba(250,250,250,0.25)' }}>
            Built with AI · Not by AI
          </p>
          <div className="flex items-center gap-4">
            {['Twitter', 'GitHub', 'Email'].map((s) => (
              <a
                key={s}
                href="#"
                className="text-xs transition-colors duration-200"
                style={{ color: 'rgba(250,250,250,0.25)' }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#D4FF4F')}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'rgba(250,250,250,0.25)')}
                aria-label={s}
              >
                {s}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
