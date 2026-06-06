import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const faqs = [
  {
    q: 'What AI tools do the templates work with?',
    a: 'Each template ships with prompt packs optimised for Cursor, v0 (Vercel), and Lovable. The packs are tailored to each tool\'s conventions — so you\'re not copy-pasting a generic prompt and hoping for the best.',
  },
  {
    q: 'Do I need to know how to code?',
    a: 'No. The prompt packs are written to guide the AI through implementation step by step. That said, knowing a little React or HTML means you can tweak things faster. Think of it as "coding optional, reading optional."',
  },
  {
    q: 'What\'s included with every template?',
    a: 'Every template includes the full Figma source file, a Cursor/v0/Lovable prompt pack, a component library reference, and lifetime access. The Standard plan also includes all 8 templates plus priority support.',
  },
  {
    q: 'Can I use these for client projects?',
    a: 'Yes. You own the output. Use it for as many client projects as you want. No royalties, no project limits, no "personal use only" nonsense. The point is for you to bill clients faster.',
  },
  {
    q: 'How quickly can I realistically ship?',
    a: 'Most builders report going from template purchase to live site in under two hours for a standard project. Experienced devs using Cursor have shipped in under 45 minutes.',
  },
  {
    q: 'What if the AI doesn\'t generate what I expect?',
    a: 'The prompt packs include fallback prompts and common fix instructions for each tool. And if something truly doesn\'t work — email us. We\'ve seen every failure mode.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'Yes. If you\'ve made a genuine attempt to use the template and prompt pack within 7 days of purchase and can\'t get it to work, we\'ll refund you. No games.',
  },
  {
    q: 'Will templates be updated for new AI tools?',
    a: 'Yes. All purchases include lifetime updates. When a significant new tool drops (or existing tools change their prompt behaviour), we update the packs. Standard and Custom buyers get notified first.',
  },
]

function FAQItem({ item, index }: { item: typeof faqs[0]; index: number }) {
  const [open, setOpen] = useState(false)
  const answerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className="border-b transition-colors"
      style={{ borderColor: open ? 'rgba(212,255,79,0.15)' : 'rgba(255,255,255,0.06)' }}
    >
      <button
        className="w-full text-left py-5 flex items-center justify-between gap-4 group"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        id={`faq-btn-${index}`}
        aria-controls={`faq-ans-${index}`}
      >
        <span
          className="font-medium text-base leading-snug transition-colors"
          style={{ color: open ? '#FAFAFA' : 'rgba(250,250,250,0.8)' }}
        >
          {item.q}
        </span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
          style={{
            backgroundColor: open ? 'rgba(212,255,79,0.15)' : 'rgba(255,255,255,0.05)',
            color: open ? '#D4FF4F' : 'rgba(250,250,250,0.4)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`faq-ans-${index}`}
            role="region"
            aria-labelledby={`faq-btn-${index}`}
            ref={answerRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="pb-5 text-sm leading-relaxed"
              style={{
                color: 'rgba(250,250,250,0.6)',
                borderLeft: '2px solid #D4FF4F',
                paddingLeft: 16,
                marginBottom: 4,
              }}
            >
              {item.a}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function FAQ() {
  const sectionRef = useRef<HTMLElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        headRef.current,
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: headRef.current, start: 'top 85%' } }
      )
      gsap.fromTo(
        listRef.current,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: listRef.current, start: 'top 85%' } }
      )
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="faq"
      style={{ padding: 'clamp(80px, 10vw, 160px) 0' }}
    >
      <div className="max-w-[860px] mx-auto px-6">
        <div ref={headRef} className="text-center mb-16">
          <div className="eyebrow mb-4">FAQ</div>
          <h2
            style={{
              fontSize: 'clamp(28px, 3.5vw, 44px)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            Questions we actually get.{' '}
            <span className="font-display" style={{ color: 'rgba(250,250,250,0.45)' }}>
              Answered properly.
            </span>
          </h2>
        </div>

        <div ref={listRef}>
          {faqs.map((item, i) => (
            <FAQItem key={i} item={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
