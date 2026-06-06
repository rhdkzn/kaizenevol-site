import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import gsap from 'gsap'

interface Props {
  onComplete: () => void
}

export default function LoadingScreen({ onComplete }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tl = gsap.timeline({
      onComplete: () => {
        setTimeout(onComplete, 400)
      },
    })

    tl.fromTo(
      barRef.current,
      { scaleX: 0 },
      { scaleX: 1, duration: 2.2, ease: 'power2.inOut', transformOrigin: 'left' }
    )
    tl.to(logoRef.current, { opacity: 0.3, duration: 0.15 }, '-=0.2')
    tl.to(logoRef.current, { opacity: 1, duration: 0.15 })
  }, [onComplete])

  return (
    <AnimatePresence>
      <motion.div
        key="loader"
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
        style={{ backgroundColor: '#0A0A0A' }}
        exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeOut' } }}
      >
        {/* Monogram */}
        <div ref={logoRef} className="mb-12 select-none">
          <div className="shimmer-text" style={{ fontSize: 'clamp(64px, 12vw, 120px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>
            H
          </div>
          <div className="eyebrow mt-4 text-center" style={{ letterSpacing: '0.5em', opacity: 0.6 }}>
            YLIOX
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-48 h-px bg-white/10 relative overflow-hidden rounded-full">
          <div
            ref={barRef}
            className="absolute inset-y-0 left-0 w-full rounded-full"
            style={{ backgroundColor: '#D4FF4F', transformOrigin: 'left', transform: 'scaleX(0)' }}
          />
        </div>

        <p className="mt-6 eyebrow" style={{ letterSpacing: '0.3em', opacity: 0.4, fontSize: 10 }}>
          LOADING
        </p>
      </motion.div>
    </AnimatePresence>
  )
}
