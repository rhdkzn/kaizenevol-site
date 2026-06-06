import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import LoadingScreen from './components/LoadingScreen'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import BentoGrid from './components/BentoGrid'
import HowItWorks from './components/HowItWorks'
import SocialProof from './components/SocialProof'
import Pricing from './components/Pricing'
import FAQ from './components/FAQ'
import FinalCTA from './components/FinalCTA'
import Footer from './components/Footer'

export default function App() {
  const [loaded, setLoaded] = useState(false)

  return (
    <>
      <AnimatePresence>
        {!loaded && <LoadingScreen onComplete={() => setLoaded(true)} />}
      </AnimatePresence>

      {loaded && (
        <>
          <Navbar />
          <main>
            <Hero />
            <BentoGrid />
            <HowItWorks />
            <SocialProof />
            <Pricing />
            <FAQ />
            <FinalCTA />
          </main>
          <Footer />
        </>
      )}
    </>
  )
}
