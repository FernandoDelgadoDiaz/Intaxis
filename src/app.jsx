import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen from '@/pages/SplashScreen'
import PassengerApp from '@/pages/PassengerApp'
import DriverApp    from '@/pages/DriverApp'

export default function App() {
  const [splashDone, setSplashDone] = useState(false)

  if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh' }}>
      <Routes>
        <Route path="/"       element={<PassengerApp />} />
        <Route path="/chofer" element={<DriverApp />} />
        <Route path="*"       element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
