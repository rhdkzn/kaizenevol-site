import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion } from 'framer-motion'

gsap.registerPlugin(ScrollTrigger)

const steps = [
  {
    num: '01',
    title: 'Pick your template.',
    body: 'Browse 8 templates built for specific use cases — agency, SaaS, portfolio, product. Every pixel intentional. No filler sections, no generic copy.',
    visual: {
      gradient: 'linear-gradient(135deg, #0d1533 0%, #1a2a5e 100%)',
      accent: '#60a5fa',
      label: 'TEMPLATE PICKER',
    },
  },
  {
    num: '02',
    title: 'Drop it in your tool.',
    body: 'Cursor, v0, Lovable — each template ships with a tailored prompt pack. Paste. Run. Your site is live in under an hour. No wrangling AI for the right output.',
    visual: {
      gradient: 'linear-gradient(135deg, #0f1a0d 0%, #1a3d15 100%)',
      accent: '#D4FF4F',
      label: 'PROMPT PACK',
    },
  },
  {
    num: '03',
    title: 'Ship. Get paid.',
    body: 'You own the code. No subscriptions, no lock-in. Your client sees something that looks handcrafted. You invoiced in 3 days instead of 3 weeks.',
    visual: {
      gradient: 'linear-gradient(135deg, #1a0d00 0%, #3d2200 100%)',
      accent: '#fbbf24',
      label: 'DELIVERED',
    },
  },
]

function VisualBlock({ visual }: { visual: typeof steps[0]['visual'] }) {
  return (
    <div
      className="rounded-2xl overflow-hidden flex-1 min-h-[280px] relative"
      style={{
        background: visual.gradient,
        border: '1px solid rgba(255,255,255,0.06)',
        minHeight: 280,
      }}
    >
      <div className="absolute inset-0 p-8 flex flex-col justify-between">
        <div className="eyebrow text-[9px]" style={{ color: visual.accent, letterSpacing: '0.35em' }}>
          {visual.label}
        </div>

        {/* UI mockup lines */}
        <div className="flex flex-col gap-3 opacity-50">
          <div className="h-1.5 rounded-full w-2/3" style={{ backgroundColor: visual.accent }} />
          <div className="h-1 rounded-full w-full bg-white/20" />
          <div className="h-1 rounded-full w-5/6 bg-white/15" />
          <div className="h-1 rounded-full w-3/4 bg-white/10" />
        </div>

        <div className="flex gap-3">
          <div className="flex-1 h-16 rounded-xl bg-white/5 flex items-end p-3">
            <div className="h-1 rounded-full w-3/4 bg-white/20" />
          </div>
          <div className="flex-1 h-16 rounded-xl bg-white/5 flex items-end p-3">
            <div className="h-1 rounded-full w-1/2 bg-white/20" />
          </div>
          <div
            className="flex-none w-16 h-16 rounded-xl flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: visual.accent, color: '#0A0A0A', fontSize: 10 }}
          >
            GO
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      steps.forEach((_, i) => {
        gsap.fromTo(
          `.step-row-${i}`,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.85,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: `.step-row-${i}`,
              start: 'top 82%',
            },
          }
        )
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      style={{ padding: 'clamp(80px, 10vw, 160px) 0' }}
    >
      <div className="max-w-[1280px] mx-auto px-6">
        {/* Header */}
        <div className="mb-20 text-center">
          <div className="eyebrow mb-4">THE METHOD</div>
          <h2
            style={{
              fontSize: 'clamp(32px, 4vw, 52px)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            From template to invoice.{' '}
            <span className="font-display" style={{ color: 'rgba(250,250,250,0.5)' }}>
              One afternoon.
            </span>
          </h2>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-20">
          {steps.map((step, i) => {
            const isEven = i % 2 === 0
            return (
              <div
                key={i}
                className={`step-row-${i} flex flex-col md:flex-row gap-12 items-center ${
                  isEven ? '' : 'md:flex-row-reverse'
                }`}
              >
                {/* Text */}
                <div className="flex-1 max-w-lg">
                  <div
                    className="eyebrow mb-4 text-2xl font-bold"
                    style={{ fontSize: 48, letterSpacing: '-0.03em', color: '#D4FF4F', fontFamily: 'inherit' }}
                  >
                    {step.num}
                  </div>
                  <h3
                    style={{
                      fontSize: 'clamp(24px, 3vw, 36px)',
                      fontWeight: 700,
                      letterSpacing: '-0.025em',
                      lineHeight: 1.15,
                      marginBottom: 16,
                    }}
                  >
                    {step.title}
                  </h3>
                  <p style={{ color: 'rgba(250,250,250,0.6)', lineHeight: 1.7, fontSize: 16 }}>
                    {step.body}
                  </p>

                  {i === 2 && (
                    <motion.a
                      href="#pricing"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="inline-flex items-center gap-2 mt-8 px-6 py-3 text-sm font-semibold rounded-xl"
                      style={{ backgroundColor: '#D4FF4F', color: '#0A0A0A' }}
                    >
                      Browse templates →
                    </motion.a>
                  )}
                </div>

                {/* Visual */}
                <VisualBlock visual={step.visual} />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
