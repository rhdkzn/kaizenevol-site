import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const MARQUEE_TEXT = 'BUILT WITH AI · NOT BY AI · SHIPPED IN HOURS · '

export default function FinalCTA() {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        contentRef.current,
        { opacity: 0, y: 36 },
        {
          opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: contentRef.current, start: 'top 82%' },
        }
      )
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  const repeated = MARQUEE_TEXT.repeat(6)

  return (
    <section
      ref={sectionRef}
      id="cta"
      className="relative overflow-hidden"
      style={{ padding: 'clamp(100px, 12vw, 180px) 0 0' }}
    >
      {/* Radial lime glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-96 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(212,255,79,0.12) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Grid lines background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
        aria-hidden="true"
      />

      <div ref={contentRef} className="relative max-w-[1280px] mx-auto px-6 text-center">
        <div className="eyebrow mb-6">THE QUESTION</div>

        <h2
          style={{
            fontSize: 'clamp(36px, 6vw, 76px)',
            fontWeight: 700,
            letterSpacing: '-0.035em',
            lineHeight: 1.05,
            marginBottom: 12,
          }}
        >
          Ready to ship?
        </h2>
        <h2
          className="font-display"
          style={{
            fontSize: 'clamp(36px, 6vw, 76px)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            color: 'rgba(250,250,250,0.45)',
            marginBottom: 48,
          }}
        >
          Or still scrolling references?
        </h2>

        <motion.a
          href="#pricing"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center gap-2 px-8 py-4 font-semibold text-base rounded-2xl"
          style={{ backgroundColor: '#D4FF4F', color: '#0A0A0A' }}
        >
          Browse templates →
        </motion.a>

        <p className="mt-4 text-xs" style={{ color: 'rgba(250,250,250,0.3)' }}>
          One-shot pricing · No subscription · Instant access
        </p>
      </div>

      {/* Marquee strip */}
      <div
        className="relative mt-20 overflow-hidden border-t border-b py-4"
        style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        aria-label="Tagline marquee"
      >
        <div className="marquee-track" aria-hidden="true">
          <span
            className="text-sm font-medium whitespace-nowrap px-8"
            style={{
              fontFamily: '"JetBrains Mono","Courier New",monospace',
              fontSize: 12,
              letterSpacing: '0.15em',
              color: 'rgba(250,250,250,0.35)',
            }}
          >
            {repeated}
          </span>
          <span
            className="text-sm font-medium whitespace-nowrap px-8"
            style={{
              fontFamily: '"JetBrains Mono","Courier New",monospace',
              fontSize: 12,
              letterSpacing: '0.15em',
              color: 'rgba(250,250,250,0.35)',
            }}
            aria-hidden="true"
          >
            {repeated}
          </span>
        </div>
      </div>
    </section>
  )
}
