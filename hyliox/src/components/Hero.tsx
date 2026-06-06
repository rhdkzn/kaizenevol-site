import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Hls from 'hls.js'

const VIDEO_SRC = '' // Set HLS stream URL here

interface Particle { x: number; y: number; size: number; speed: number; opacity: number; drift: number }

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    const particles: Particle[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 0.4 + 0.1,
        opacity: Math.random() * 0.4 + 0.05,
        drift: (Math.random() - 0.5) * 0.3,
      })
    }

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        p.y -= p.speed
        p.x += p.drift
        if (p.y < -10) {
          p.y = canvas.height + 10
          p.x = Math.random() * canvas.width
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(212,255,79,${p.opacity})`
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 2 }}
      aria-hidden="true"
    />
  )
}

function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !VIDEO_SRC) return

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true })
      hls.loadSource(VIDEO_SRC)
      hls.attachMedia(video)
      return () => hls.destroy()
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = VIDEO_SRC
    }
  }, [])

  return (
    <>
      {/* Gradient fallback / overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: VIDEO_SRC
            ? 'linear-gradient(to bottom, rgba(10,10,10,0.3) 0%, rgba(10,10,10,0.6) 100%)'
            : 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(30,30,30,1) 0%, rgba(10,10,10,1) 100%)',
          zIndex: 1,
        }}
        aria-hidden="true"
      />
      {VIDEO_SRC && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          style={{ zIndex: 0 }}
        />
      )}
    </>
  )
}

const headlineVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const wordVariant = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
}

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative flex items-center justify-center overflow-hidden"
      style={{ minHeight: '100svh' }}
    >
      <VideoBackground />
      <ParticleCanvas />

      <div className="relative text-center px-6 max-w-[900px] mx-auto" style={{ zIndex: 3 }}>
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 3.4 }}
          className="eyebrow mb-8"
        >
          TEMPLATES · 2026
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={headlineVariants}
          initial="hidden"
          animate="visible"
          style={{
            fontSize: 'clamp(40px, 7vw, 80px)',
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            transition: 'all 0.3s',
          }}
          className="mb-6"
        >
          {['Ship', 'a', 'site', 'that'].map((w, i) => (
            <motion.span key={i} variants={wordVariant} style={{ display: 'inline-block', marginRight: '0.3em' }}>
              {w}
            </motion.span>
          ))}
          <br />
          {["doesn't", 'feel', 'like'].map((w, i) => (
            <motion.span key={i} variants={wordVariant} style={{ display: 'inline-block', marginRight: '0.3em' }}>
              {w}
            </motion.span>
          ))}
          <motion.span
            variants={wordVariant}
            className="font-display"
            style={{
              display: 'inline-block',
              fontSize: 'clamp(44px, 7.5vw, 88px)',
              color: '#D4FF4F',
              marginLeft: '0.15em',
            }}
          >
            AI made it.
          </motion.span>
        </motion.h1>

        {/* Sub */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 4.0 }}
          className="mb-10 text-lg"
          style={{ color: 'rgba(250,250,250,0.64)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto 40px' }}
        >
          8 premium templates. Cursor / v0 / Lovable ready.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 4.2 }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <motion.a
            href="#templates"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-7 py-3.5 font-semibold text-sm transition-shadow"
            style={{ backgroundColor: '#D4FF4F', color: '#0A0A0A', borderRadius: 14 }}
          >
            Browse templates →
          </motion.a>
          <motion.a
            href="#how-it-works"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-7 py-3.5 text-sm font-medium transition-colors"
            style={{
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 14,
              color: 'rgba(250,250,250,0.8)',
              backgroundColor: 'transparent',
            }}
          >
            See the method
          </motion.a>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 5, duration: 0.8 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        style={{ zIndex: 3 }}
        aria-hidden="true"
      >
        <div className="eyebrow" style={{ fontSize: 9, letterSpacing: '0.3em', opacity: 0.4 }}>SCROLL</div>
        <div className="w-px h-10 bg-gradient-to-b from-white/20 to-transparent" />
      </motion.div>
    </section>
  )
}
