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
```

Y en `SplashScreen.jsx` también hay un problema — el componente se llama `IntaxisSplash` pero necesita llamarse `SplashScreen`. Entrá a `src/pages/SplashScreen.jsx` → lápiz → buscá la última línea que dice:
```
export default function IntaxisSplash
```

Cambiala a:
```
export default function SplashScreen