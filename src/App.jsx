import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'
import { useRef, useEffect, useState, Suspense } from 'react'
import * as THREE from 'three'

function KeyboardController({ controlsRef, speed }) {
  const { camera } = useThree()
  const keys = useRef({})

  useEffect(() => {
    const dn = (e) => { keys.current[e.code] = true }
    const up = (e) => { keys.current[e.code] = false }
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup',   up)
    return () => {
      window.removeEventListener('keydown', dn)
      window.removeEventListener('keyup',   up)
    }
  }, [])

  useFrame((_, delta) => {
    if (!controlsRef.current) return
    const s = speed * delta
    const dx =
      (keys.current['ArrowLeft']  || keys.current['KeyA']) ? -s :
      (keys.current['ArrowRight'] || keys.current['KeyD']) ?  s : 0
    const dz =
      (keys.current['ArrowUp']   || keys.current['KeyW']) ? -s :
      (keys.current['ArrowDown'] || keys.current['KeyS']) ?  s : 0
    if (dx !== 0 || dz !== 0) {
      camera.position.x            += dx
      camera.position.z            += dz
      controlsRef.current.target.x += dx
      controlsRef.current.target.z += dz
      controlsRef.current.update()
    }
  })
  return null
}

function Scene({ onReady }) {
  const { camera }  = useThree()
  const controlsRef = useRef()
  const { scene }   = useGLTF('/futuristic_low-poly_city.glb')
  const [ready, setReady] = useState(false)
  const [speed, setSpeed] = useState(1000)

  useEffect(() => {
    scene.scale.set(5000, 5000, 5000)
    scene.rotation.y = Math.PI / 2
    scene.updateMatrixWorld(true)

    const box    = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    scene.position.x = -center.x
    scene.position.z = -center.z
    scene.position.y = -box.min.y
    scene.updateMatrixWorld(true)

    const newBox = new THREE.Box3().setFromObject(scene)
    const size   = newBox.getSize(new THREE.Vector3())
    const md     = Math.max(size.x, size.y, size.z)
    setSpeed(md * 1.2)

    const bridgePos = new THREE.Vector3()
    let   found     = false
    scene.traverse((child) => {
      if (!found && child.name === 'Bridge005_81') {
        child.getWorldPosition(bridgePos)
        found = true
      }
    })

    const eyeH = md * 0.012
    const dist  = md * 0.14

    if (found) {
      camera.position.set(bridgePos.x - dist, bridgePos.y + eyeH, bridgePos.z)
      if (controlsRef.current) {
        controlsRef.current.target.set(bridgePos.x + md * 0.04, bridgePos.y + eyeH * 0.5, bridgePos.z)
        controlsRef.current.update()
      }
    } else {
      camera.position.set(-(md * 0.15), md * 0.015, md * 0.01)
      if (controlsRef.current) {
        controlsRef.current.target.set(md * 0.05, md * 0.01, 0)
        controlsRef.current.update()
      }
    }

    camera.updateProjectionMatrix()
    setReady(true)
    onReady()
  }, [scene])

  return (
    <>
      <primitive object={scene} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        screenSpacePanning={false}
        mouseButtons={{
          LEFT:   THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT:  THREE.MOUSE.ROTATE,
        }}
      />
      {ready && <KeyboardController controlsRef={controlsRef} speed={speed} />}
    </>
  )
}

export default function App() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#87CEEB' }}>
      <Canvas
        camera={{ fov: 50, near: 0.1, far: 5000000 }}
        gl={{ antialias: true }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace }}
      >
        <color attach="background" args={['#87CEEB']} />
        <ambientLight intensity={1.0} />
        <directionalLight position={[100, 100, 100]} intensity={1.0} />
        <Suspense fallback={null}>
          <Scene onReady={() => setLoaded(true)} />
        </Suspense>
      </Canvas>

      {loaded && (
        <div style={{
          position: 'fixed', bottom: '14px', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.4)', color: '#fff',
          padding: '5px 14px', borderRadius: '20px',
          fontSize: '0.72rem', fontFamily: 'sans-serif',
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          Left drag = Pan · Right drag = Rotate · Scroll = Zoom · WASD / Arrows = Move
        </div>
      )}

      {!loaded && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10, background: '#87CEEB',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: '1.2rem', fontFamily: 'sans-serif', color: '#334' }}>
            Loading city…
          </div>
        </div>
      )}
    </div>
  )
}
