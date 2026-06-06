import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface Tier {
  eyebrow: string
  name: string
  price: string
  desc: string
  features: string[]
  missing: string[]
  cta: string
  featured?: boolean
}

const tiers: Tier[] = [
  {
    eyebrow: 'STARTER',
    name: 'Express',
    price: '€297',
    desc: 'One template. Everything you need to ship fast.',
    features: [
      'One premium template',
      'Cursor prompt pack',
      'Figma source file',
      'Lifetime access',
      'Community support',
    ],
    missing: ['Multi-template bundle', 'Custom onboarding', 'Priority support'],
    cta: 'Get Express',
  },
  {
    eyebrow: 'MOST POPULAR',
    name: 'Standard',
    price: '€597',
    desc: 'All 8 templates. Every tool. One flat price.',
    features: [
      'All 8 premium templates',
      'Cursor + v0 + Lovable packs',
      'All Figma source files',
      'Component library',
      'Lifetime updates',
      'Priority email support',
    ],
    missing: ['Custom onboarding call'],
    cta: 'Get Standard',
    featured: true,
  },
  {
    eyebrow: 'AGENCY',
    name: 'Custom',
    price: '€1,499',
    desc: 'Custom template built for your niche. Done in 5 days.',
    features: [
      'Everything in Standard',
      'Bespoke template design',
      'Brand-matched components',
      '1:1 onboarding call',
      'Private Slack channel',
      'Unlimited revisions',
    ],
    missing: [],
    cta: 'Talk to us',
  },
]

const CHECK = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M3 7.5L6.5 11L12 4" stroke="#D4FF4F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CROSS = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M4 4L11 11M11 4L4 11" stroke="rgba(250,250,250,0.2)" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

function PricingCard({ tier }: { tier: Tier }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className="flex flex-col rounded-2xl p-8 relative overflow-hidden"
      style={{
        background: tier.featured ? 'rgba(212,255,79,0.04)' : 'rgba(255,255,255,0.03)',
        border: tier.featured ? '1px solid rgba(212,255,79,0.3)' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: tier.featured ? '0 0 60px rgba(212,255,79,0.08)' : undefined,
      }}
    >
      {tier.featured && (
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(212,255,79,0.6), transparent)' }}
          aria-hidden="true"
        />
      )}

      <div className="eyebrow mb-3" style={{ fontSize: 10, color: tier.featured ? '#D4FF4F' : 'rgba(250,250,250,0.4)' }}>
        {tier.eyebrow}
      </div>

      <h3 className="text-2xl font-bold mb-1" style={{ letterSpacing: '-0.025em' }}>
        {tier.name}
      </h3>

      <div
        className="font-bold mb-3"
        style={{
          fontSize: 'clamp(36px, 4vw, 48px)',
          letterSpacing: '-0.04em',
          color: tier.featured ? '#D4FF4F' : '#FAFAFA',
        }}
      >
        {tier.price}
      </div>

      <p className="text-sm mb-8" style={{ color: 'rgba(250,250,250,0.55)', lineHeight: 1.6 }}>
        {tier.desc}
      </p>

      <ul className="flex flex-col gap-3 mb-8 flex-1">
        {tier.features.map((f) => (
          <li key={f} className="flex items-center gap-3 text-sm" style={{ color: 'rgba(250,250,250,0.8)' }}>
            {CHECK}
            {f}
          </li>
        ))}
        {tier.missing.map((f) => (
          <li key={f} className="flex items-center gap-3 text-sm" style={{ color: 'rgba(250,250,250,0.25)' }}>
            {CROSS}
            {f}
          </li>
        ))}
      </ul>

      <motion.a
        href="#"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className="w-full text-center py-3.5 rounded-xl text-sm font-semibold transition-all"
        style={{
          backgroundColor: tier.featured ? '#D4FF4F' : 'transparent',
          color: tier.featured ? '#0A0A0A' : '#FAFAFA',
          border: tier.featured ? 'none' : '1px solid rgba(255,255,255,0.15)',
        }}
      >
        {tier.cta}
      </motion.a>
    </motion.div>
  )
}

export default function Pricing() {
  const sectionRef = useRef<HTMLElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        headRef.current,
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: headRef.current, start: 'top 85%' } }
      )
      gsap.fromTo(
        cardsRef.current?.children ? Array.from(cardsRef.current.children) : [],
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: cardsRef.current, start: 'top 82%' } }
      )
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="pricing"
      style={{ padding: 'clamp(80px, 10vw, 160px) 0' }}
    >
      <div className="max-w-[1280px] mx-auto px-6">
        <div ref={headRef} className="text-center mb-16">
          <div className="eyebrow mb-4">PRICING</div>
          <h2
            style={{
              fontSize: 'clamp(30px, 4vw, 48px)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            One-shot. No subscription.{' '}
            <span className="font-display" style={{ color: 'rgba(250,250,250,0.45)' }}>
              Ever.
            </span>
          </h2>
          <p className="mt-4 text-sm" style={{ color: 'rgba(250,250,250,0.5)' }}>
            All prices one-shot · no subscription · no renewals
          </p>
        </div>

        <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {tiers.map((t) => (
            <PricingCard key={t.name} tier={t} />
          ))}
        </div>

        <p className="text-center mt-8 text-xs" style={{ color: 'rgba(250,250,250,0.3)' }}>
          All prices in EUR · VAT may apply · Secure checkout via Stripe
        </p>
      </div>
    </section>
  )
}
