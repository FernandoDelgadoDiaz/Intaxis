import { useState } from 'react'
import SplashScreen from './pages/SplashScreen.jsx'
import PassengerApp from './pages/PassengerApp.jsx'
import DriverApp from './pages/DriverApp.jsx'

export default function App() {
  const [screen, setScreen] = useState('splash')

  if (screen === 'splash') {
    return <SplashScreen onDone={() => setScreen('passenger')} />
  }

  if (screen === 'driver') {
    return <DriverApp />
  }

  return <PassengerApp />
}
