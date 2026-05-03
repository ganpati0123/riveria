import { Canvas, useThree } from '@react-three/fiber'
import { useGLTF, PerspectiveCamera, Environment, Stars } from '@react-three/drei'
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

function Moon() {
  return (
    <mesh position={[50, 30, -20]}>
      <sphereGeometry args={[3, 32, 32]} />
      <meshBasicMaterial color="#f5f5dc" />
    </mesh>
  )
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
    <div style={{ 
      width: '100vw', 
      height: '100vh',
      background: 'linear-gradient(to bottom, #0a0a1a 0%, #1a1a3a 50%, #0d0d2b 100%)'
    }}>
      <Canvas gl={{ antialias: true }}>
        {/* Arabian Night Sky */}
        <fog attach="fog" args={['#0a0a1a', 10, 100]} />
        
        <Suspense fallback={null}>
          <PerspectiveCamera 
            makeDefault 
            position={[0, 2, 10]} 
            fov={50}
          />
          
          {/* Moon glow */}
          <pointLight position={[50, 30, -20]} intensity={0.5} color="#f5f5dc" distance={100} />
          
          {/* City ambient glow - warm yellow/orange lights */}
          <ambientLight intensity={0.15} color="#1a1a4a" />
          
          {/* Main moon light */}
          <directionalLight position={[20, 30, 10]} intensity={0.3} color="#c4b5fd" />
          
          {/* Add some colored point lights for city night feel */}
          <pointLight position={[0, 5, 0]} intensity={0.5} color="#ff6b35" distance={30} />
          <pointLight position={[-10, 3, -5]} intensity={0.3} color="#ffd700" distance={20} />
          <pointLight position={[10, 4, 5]} intensity={0.3} color="#ff4500" distance={20} />
          
          {/* Stars */}
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          
          {/* Moon */}
          <Moon />
          
          {/* GLB Model */}
          <Model 
            glbPath="/futuristic_low-poly_city.glb" 
            onLoad={handleModelLoad}
          />
          
          {/* Camera Controller for scroll movement */}
          <CameraController scrollY={scrollY} />
          
          {/* Night environment */}
          <Environment preset="night" />
        </Suspense>
      </Canvas>
      
      {/* Loading indicator */}
      {!modelLoaded && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#c4b5fd',
          fontSize: '1.5rem',
          fontFamily: 'serif',
          letterSpacing: '0.2em'
        }}>
          ✨ Loading Arabian Night... ✨
        </div>
      )}
      
      {/* Scroll container to enable scrolling */}
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '200vh',
        pointerEvents: 'none'
      }} />
      
      {/* Title overlay */}
      <div style={{
        position: 'fixed',
        bottom: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#c4b5fd',
        fontSize: '1rem',
        fontFamily: 'Georgia, serif',
        letterSpacing: '0.3em',
        textShadow: '0 0 10px #c4b5fd, 0 0 20px #7c3aed',
        opacity: 0.8
      }}>
        ⬇ SCROLL TO EXPLORE ⬇
      </div>
    </div>
  )
}