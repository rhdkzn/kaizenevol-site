import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface Template {
  id: number
  title: string
  subtitle: string
  tag: string
  gradient: string
  featured?: boolean
  colSpan: string
  rowSpan?: string
  accentColor?: string
}

const templates: Template[] = [
  {
    id: 1,
    title: 'Apex Studio',
    subtitle: 'Creative agency portfolio',
    tag: 'AGENCY',
    gradient: 'linear-gradient(135deg, #1a1033 0%, #2d1b5e 40%, #3d1f6e 100%)',
    featured: true,
    colSpan: 'md:col-span-7',
    accentColor: '#a78bfa',
  },
  {
    id: 2,
    title: 'Meridian SaaS',
    subtitle: 'B2B software launch page',
    tag: 'SAAS',
    gradient: 'linear-gradient(135deg, #0d1f1a 0%, #0f3028 50%, #1a4a35 100%)',
    colSpan: 'md:col-span-5',
    accentColor: '#34d399',
  },
  {
    id: 3,
    title: 'Vanta Portfolio',
    subtitle: 'Minimal developer folio',
    tag: 'PORTFOLIO',
    gradient: 'linear-gradient(135deg, #1a0d0d 0%, #3d1515 60%, #521c1c 100%)',
    colSpan: 'md:col-span-4',
    accentColor: '#f87171',
  },
  {
    id: 4,
    title: 'Solara',
    subtitle: 'Product landing page',
    tag: 'PRODUCT',
    gradient: 'linear-gradient(135deg, #1a1400 0%, #3d3000 50%, #5c4500 100%)',
    colSpan: 'md:col-span-4',
    accentColor: '#fbbf24',
  },
  {
    id: 5,
    title: 'Nexus CMS',
    subtitle: 'Blog & editorial template',
    tag: 'EDITORIAL',
    gradient: 'linear-gradient(135deg, #0d1a2d 0%, #0f2a4a 50%, #0d3360 100%)',
    colSpan: 'md:col-span-4',
    accentColor: '#60a5fa',
  },
  {
    id: 6,
    title: 'Halo Events',
    subtitle: 'Event & conference page',
    tag: 'EVENTS',
    gradient: 'linear-gradient(135deg, #0d1a1a 0%, #0a2e2e 50%, #0e3d3d 100%)',
    colSpan: 'md:col-span-3',
    accentColor: '#2dd4bf',
  },
  {
    id: 7,
    title: 'Prism Brand',
    subtitle: 'Brand identity showcase',
    tag: 'BRAND',
    gradient: 'linear-gradient(135deg, #1a0d26 0%, #2d1040 50%, #3d1555 100%)',
    colSpan: 'md:col-span-5',
    accentColor: '#c084fc',
  },
  {
    id: 8,
    title: 'Flux AI',
    subtitle: 'AI tool marketing page',
    tag: 'AI / TOOLS',
    gradient: 'linear-gradient(135deg, #0a1a0a 0%, #0f2e0f 50%, #153d15 100%)',
    colSpan: 'md:col-span-4',
    accentColor: '#D4FF4F',
  },
]

function TemplateCard({ template, index }: { template: Template; index: number }) {
  return (
    <motion.div
      className={`card-hover relative rounded-2xl overflow-hidden cursor-pointer group ${template.colSpan}`}
      style={{
        background: template.gradient,
        border: template.featured
          ? '1px solid rgba(212,255,79,0.25)'
          : '1px solid rgba(255,255,255,0.06)',
        minHeight: index < 2 ? 280 : 220,
        boxShadow: template.featured ? '0 0 40px rgba(212,255,79,0.08)' : undefined,
      }}
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* Thumbnail area */}
      <div className="relative h-40 overflow-hidden" style={{ minHeight: index < 2 ? 180 : 140 }}>
        {/* Simulated UI preview lines */}
        <div className="absolute inset-0 p-5 flex flex-col gap-2 opacity-40">
          <div className="h-1.5 rounded-full w-3/4" style={{ backgroundColor: template.accentColor }} />
          <div className="h-1 rounded-full w-full bg-white/20" />
          <div className="h-1 rounded-full w-5/6 bg-white/15" />
          <div className="h-1 rounded-full w-2/3 bg-white/10" />
          <div className="mt-3 flex gap-2">
            <div className="h-6 w-16 rounded-lg" style={{ backgroundColor: template.accentColor, opacity: 0.6 }} />
            <div className="h-6 w-12 rounded-lg bg-white/10" />
          </div>
          <div className="mt-auto flex gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-1 h-12 rounded-xl bg-white/5" />
            ))}
          </div>
        </div>

        {/* Overlay on hover */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <span
            className="text-xs font-semibold px-4 py-2 rounded-full"
            style={{ backgroundColor: template.featured ? '#D4FF4F' : template.accentColor, color: '#0A0A0A' }}
          >
            Preview →
          </span>
        </div>

        {/* Featured badge */}
        {template.featured && (
          <div
            className="absolute top-4 left-4 eyebrow px-2.5 py-1 rounded-full text-[10px]"
            style={{ backgroundColor: 'rgba(212,255,79,0.15)', color: '#D4FF4F', border: '1px solid rgba(212,255,79,0.3)' }}
          >
            FEATURED
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="p-5 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold mb-0.5" style={{ color: '#FAFAFA' }}>
              {template.title}
            </h3>
            <p className="text-xs" style={{ color: 'rgba(250,250,250,0.5)' }}>
              {template.subtitle}
            </p>
          </div>
          <span
            className="eyebrow shrink-0 text-[9px] px-2 py-1 rounded-full"
            style={{
              color: template.accentColor,
              backgroundColor: `${template.accentColor}18`,
              border: `1px solid ${template.accentColor}30`,
              letterSpacing: '0.2em',
            }}
          >
            {template.tag}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

export default function BentoGrid() {
  const sectionRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        headingRef.current,
        { opacity: 0, y: 32 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: headingRef.current, start: 'top 85%' },
        }
      )

      const cards = gridRef.current?.children
      if (cards) {
        gsap.fromTo(
          Array.from(cards),
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: 'power3.out',
            stagger: 0.08,
            scrollTrigger: { trigger: gridRef.current, start: 'top 80%' },
          }
        )
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="templates"
      style={{ padding: 'clamp(80px, 10vw, 160px) 0' }}
    >
      <div className="max-w-[1280px] mx-auto px-6">
        {/* Header */}
        <div ref={headingRef} className="mb-16 max-w-xl">
          <div className="eyebrow mb-4">THE COLLECTION</div>
          <h2
            style={{
              fontSize: 'clamp(32px, 4vw, 52px)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            8 templates.{' '}
            <span className="font-display" style={{ color: 'rgba(250,250,250,0.5)' }}>
              Zero compromise.
            </span>
          </h2>
          <p className="mt-4 text-base" style={{ color: 'rgba(250,250,250,0.5)', lineHeight: 1.6 }}>
            Each template ships with a Cursor prompt pack, component library, and Figma source file.
          </p>
        </div>

        {/* Grid */}
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Row 1 */}
          {templates.slice(0, 2).map((t, i) => (
            <TemplateCard key={t.id} template={t} index={i} />
          ))}
          {/* Row 2 */}
          {templates.slice(2, 5).map((t, i) => (
            <TemplateCard key={t.id} template={t} index={i + 2} />
          ))}
          {/* Row 3 */}
          {templates.slice(5, 8).map((t, i) => (
            <TemplateCard key={t.id} template={t} index={i + 5} />
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center mt-10 text-xs" style={{ color: 'rgba(250,250,250,0.3)', letterSpacing: '0.05em' }}>
          All templates include Figma source · Cursor prompt pack · component library
        </p>
      </div>
    </section>
  )
}
