import { Canvas, useThree } from '@react-three/fiber'
import { useGLTF, PerspectiveCamera, Environment } from '@react-three/drei'
import { useRef, useEffect, useState, Suspense } from 'react'
import * as THREE from 'three'

function Model({ glbPath, onLoad }) {
  const { scene } = useGLTF(glbPath)
  
  useEffect(() => {
    if (onLoad) onLoad(scene)
  }, [scene, onLoad])
  
  return <primitive object={scene} />
}

function CameraController({ scrollY }) {
  const { camera } = useThree()
  
  useEffect(() => {
    // Camera ko road ke along move karne ke liye
    // Scroll karne par camera aage badhega
    const newZ = 10 - (scrollY * 0.01)
    camera.position.z = Math.max(-50, newZ)
  }, [scrollY, camera])
  
  return null
}

export default function App() {
  const [scrollY, setScrollY] = useState(0)
  const [modelLoaded, setModelLoaded] = useState(false)
  const canvasRef = useRef()
  
  const handleScroll = (e) => {
    setScrollY(window.scrollY)
  }
  
  useEffect(() => {
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  
  const handleModelLoad = (scene) => {
    console.log('Model loaded:', scene)
    setModelLoaded(true)
  }
  
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <PerspectiveCamera 
            makeDefault 
            position={[0, 2, 10]} 
            fov={50}
          />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          
          <Model 
            glbPath="/futuristic_low-poly_city.glb" 
            onLoad={handleModelLoad}
          />
          
          <CameraController scrollY={scrollY} />
          
          <Environment preset="city" />
        </Suspense>
      </Canvas>
      
      {/* Scroll container to enable scrolling */}
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '200vh',
        pointerEvents: 'none'
      }} />
    </div>
  )
}