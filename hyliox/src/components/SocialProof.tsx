import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const testimonials = [
  {
    quote: 'Shipped a SaaS landing page in 90 minutes. Client thought I spent two weeks on it.',
    name: 'Marcus W.',
    role: 'Freelance Developer',
    avatar: 'M',
    color: '#a78bfa',
  },
  {
    quote: 'The prompt pack alone is worth the price. Cursor gave me exactly what was in the design. First try.',
    name: 'Sofía R.',
    role: 'Indie Maker',
    avatar: 'S',
    color: '#34d399',
  },
  {
    quote: 'Bought Apex Studio on Friday. Invoiced the client on Monday. £2,400 project, 4 hours of actual work.',
    name: 'James T.',
    role: 'Digital Agency Owner',
    avatar: 'J',
    color: '#D4FF4F',
  },
  {
    quote: 'Finally, templates that don\'t look like templates. My clients are actually impressed for once.',
    name: 'Priya K.',
    role: 'UX Consultant',
    avatar: 'P',
    color: '#60a5fa',
  },
  {
    quote: 'The Figma source files are immaculate. Handed them straight to the client for future edits.',
    name: 'Tom H.',
    role: 'Product Designer',
    avatar: 'T',
    color: '#f87171',
  },
  {
    quote: 'v0 + Solara template = insane combo. Had a product page live before lunch.',
    name: 'Anika M.',
    role: 'Startup Founder',
    avatar: 'A',
    color: '#fbbf24',
  },
]

const stats = [
  { value: '8', label: 'Premium templates' },
  { value: '<1h', label: 'Average deploy time' },
  { value: '3', label: 'AI tools supported' },
  { value: '∞', label: 'Client projects' },
]

function TestimonialCard({ t }: { t: typeof testimonials[0] }) {
  return (
    <div
      className="glass rounded-2xl p-6 flex flex-col gap-4 h-full"
      style={{ minHeight: 180 }}
    >
      <p className="text-sm leading-relaxed flex-1" style={{ color: 'rgba(250,250,250,0.75)' }}>
        "{t.quote}"
      </p>
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ backgroundColor: `${t.color}22`, color: t.color, border: `1px solid ${t.color}44` }}
        >
          {t.avatar}
        </div>
        <div>
          <div className="text-xs font-semibold" style={{ color: '#FAFAFA' }}>{t.name}</div>
          <div className="text-xs" style={{ color: 'rgba(250,250,250,0.4)' }}>{t.role}</div>
        </div>
      </div>
    </div>
  )
}

export default function SocialProof() {
  const sectionRef = useRef<HTMLElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const wallRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        statsRef.current?.children ? Array.from(statsRef.current.children) : [],
        { opacity: 0, y: 24 },
        {
          opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out',
          scrollTrigger: { trigger: statsRef.current, start: 'top 85%' },
        }
      )
      gsap.fromTo(
        wallRef.current?.children ? Array.from(wallRef.current.children) : [],
        { opacity: 0, y: 32 },
        {
          opacity: 1, y: 0, duration: 0.7, stagger: 0.07, ease: 'power3.out',
          scrollTrigger: { trigger: wallRef.current, start: 'top 82%' },
        }
      )
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="social-proof"
      style={{ padding: 'clamp(80px, 10vw, 160px) 0' }}
    >
      <div className="max-w-[1280px] mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="eyebrow mb-4">WHAT BUILDERS SAY</div>
          <h2
            style={{
              fontSize: 'clamp(28px, 3.5vw, 44px)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            Real work.{' '}
            <span className="font-display" style={{ color: 'rgba(250,250,250,0.5)' }}>
              Real invoices.
            </span>
          </h2>
        </div>

        {/* Stats row */}
        <div
          ref={statsRef}
          className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-16"
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="glass rounded-2xl p-6 text-center"
            >
              <div
                className="font-bold mb-1"
                style={{ fontSize: 'clamp(28px, 4vw, 40px)', color: '#D4FF4F', letterSpacing: '-0.03em' }}
              >
                {s.value}
              </div>
              <div className="text-xs" style={{ color: 'rgba(250,250,250,0.5)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Testimonial wall */}
        <div
          ref={wallRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {testimonials.map((t, i) => (
            <TestimonialCard key={i} t={t} />
          ))}
        </div>
      </div>
    </section>
  )
}
