/* eslint-disable react/no-unknown-property */
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, extend, useFrame } from '@react-three/fiber'
import { useGLTF, useTexture, Environment, Lightformer } from '@react-three/drei'
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier'
import { MeshLineGeometry, MeshLineMaterial } from 'meshline'
import * as THREE from 'three'
import './Lanyard.css'

import cardGLB from '../../assets/lanyard/card.glb'
import lanyard from '../../assets/lanyard/lanyard.png'

extend({ MeshLineGeometry, MeshLineMaterial })

const BLANK_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const FRONT_UV_RECT = { x: 0, y: 0, w: 0.5, h: 0.755 }
const BACK_UV_RECT = { x: 0.5, y: 0, w: 0.5, h: 0.757 }

export default function Lanyard({
  position = [0, 0, 20],
  gravity = [0, -40, 0],
  fov = 20,
  transparent = true,
  frontImage = null,
  backImage = null,
  imageFit = 'cover',
  lanyardImage = null,
  lanyardWidth = 1.2
}) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="lanyard-wrapper">
      <Canvas
        camera={{ position: position, fov: fov }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{ alpha: transparent }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), transparent ? 0 : 1)}
      >
        <ambientLight intensity={Math.PI} />
        <Physics gravity={gravity} timeStep={isMobile ? 1 / 30 : 1 / 60}>
          <Band
            isMobile={isMobile}
            frontImage={frontImage}
            backImage={backImage}
            imageFit={imageFit}
            lanyardImage={lanyardImage}
            lanyardWidth={lanyardWidth}
          />
        </Physics>
        <Environment blur={0.75}>
          <Lightformer
            intensity={2}
            color="white"
            position={[0, -1, 5]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[-1, -1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[1, 1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={10}
            color="white"
            position={[-10, 0, 14]}
            rotation={[0, Math.PI / 2, Math.PI / 3]}
            scale={[100, 10, 1]}
          />
        </Environment>
      </Canvas>
    </div>
  )
}

function Band({
  maxSpeed = 50,
  minSpeed = 0,
  isMobile = false,
  frontImage = null,
  backImage = null,
  imageFit = 'cover',
  lanyardImage = null,
  lanyardWidth = 1.2
}) {
  const band = useRef(),
    fixed = useRef(),
    j1 = useRef(),
    j2 = useRef(),
    j3 = useRef(),
    card = useRef()
  const vec = new THREE.Vector3(),
    ang = new THREE.Vector3(),
    rot = new THREE.Vector3(),
    dir = new THREE.Vector3()
  const segmentProps = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 4, linearDamping: 4 }
  const { nodes, materials } = useGLTF(cardGLB)
  const texture = useTexture(lanyardImage || lanyard)

  const frontTex = useTexture(frontImage || BLANK_PIXEL)
  const backTex = useTexture(backImage || BLANK_PIXEL)

  const cardMap = useMemo(() => {
    const baseMap = materials.base.map
    if (!frontImage && !backImage) return baseMap

    const baseImg = baseMap.image
    if (!baseImg) return baseMap
    const W = 2048
    const H = 2048
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return baseMap

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(baseImg, 0, 0, W, H)

    const drawFitted = (img, rect, isFront = false) => {
      const rx = rect.x * W
      const ry = rect.y * H
      const rw = rect.w * W
      const rh = rect.h * H

      if (isFront) {
        // Silver gray card background (#a4a4a4)
        ctx.fillStyle = '#d1d1d1ff'
        ctx.fillRect(rx, ry, rw, rh)

        // Subtle silver accent border around card perimeter
        ctx.save()
        ctx.strokeStyle = 'rgba(193, 193, 193, 0.18)'
        ctx.lineWidth = 8
        ctx.strokeRect(rx + 4, ry + 4, rw - 8, rh - 8)
        ctx.restore()

        // Clean white inner badge box for QR code readability
        const padX = rw * 0.08
        const padY = rh * 0.08
        const frw = rw - padX * 2
        const frh = rh - padY * 2

        ctx.save()
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
        ctx.shadowBlur = 24
        ctx.shadowOffsetY = 4
        ctx.fillRect(rx + padX, ry + padY, frw, frh)
        ctx.restore()

        const scale = Math.min(frw / img.width, frh / img.height)
        const dw = img.width * scale
        const dh = img.height * scale
        const dx = rx + padX + (frw - dw) / 2
        const dy = ry + padY + (frh - dh) / 2

        ctx.save()
        ctx.beginPath()
        ctx.rect(rx + padX, ry + padY, frw, frh)
        ctx.clip()
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.filter = 'contrast(1.15) saturate(1.1)'
        ctx.drawImage(img, dx, dy, dw, dh)
        ctx.restore()
      } else {
        const pick = imageFit === 'contain' ? Math.min : Math.max
        const scale = pick(rw / img.width, rh / img.height)
        const dw = img.width * scale
        const dh = img.height * scale
        const dx = rx + (rw - dw) / 2
        const dy = ry + (rh - dh) / 2
        ctx.save()
        ctx.beginPath()
        ctx.rect(rx, ry, rw, rh)
        ctx.clip()
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, dx, dy, dw, dh)
        ctx.restore()
      }
    }

    if (frontImage && frontTex.image) drawFitted(frontTex.image, FRONT_UV_RECT, true)
    if (backImage && backTex.image) drawFitted(backTex.image, BACK_UV_RECT, false)

    const composite = new THREE.CanvasTexture(canvas)
    composite.colorSpace = THREE.SRGBColorSpace
    composite.flipY = baseMap.flipY
    composite.anisotropy = 16
    composite.generateMipmaps = true
    composite.minFilter = THREE.LinearMipmapLinearFilter
    composite.magFilter = THREE.LinearFilter
    composite.needsUpdate = true
    return composite
  }, [frontImage, backImage, imageFit, frontTex, backTex, materials.base.map])

  const [curve] = useState(
    () =>
      new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()])
  )
  const [dragged, drag] = useState(false)
  const [hovered, hover] = useState(false)

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 0.9])
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 0.9])
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 0.9])
  useSphericalJoint(j3, card, [
    [0, 0, 0],
    [0, 1.5, 0]
  ])

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab'
      return () => void (document.body.style.cursor = 'auto')
    }
  }, [hovered, dragged])

  useFrame((state, delta) => {
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      dir.copy(vec).sub(state.camera.position).normalize()
      vec.add(dir.multiplyScalar(state.camera.position.length()))
        ;[card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp())
      card.current?.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z })
    }
    if (fixed.current) {
      ;[j1, j2].forEach(ref => {
        if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation())
        const clampedDistance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())))
        ref.current.lerped.lerp(
          ref.current.translation(),
          delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed))
        )
      })
      curve.points[0].copy(j3.current.translation())
      curve.points[1].copy(j2.current.lerped)
      curve.points[2].copy(j1.current.lerped)
      curve.points[3].copy(fixed.current.translation())
      band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32))
      ang.copy(card.current.angvel())
      rot.copy(card.current.rotation())
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z })
    }
  })

  curve.curveType = 'chordal'
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping

  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[2, 0, 0]} ref={card} {...segmentProps} type={dragged ? 'kinematicPosition' : 'dynamic'}>
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            scale={2.25}
            position={[0, -1.2, -0.05]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={e => (e.target.releasePointerCapture(e.pointerId), drag(false))}
            onPointerDown={e => (
              e.target.setPointerCapture(e.pointerId),
              drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())))
            )}
          >
            <mesh geometry={nodes.card.geometry}>
              <meshPhysicalMaterial
                map={cardMap}
                map-anisotropy={16}
                clearcoat={isMobile ? 0 : 1}
                clearcoatRoughness={0.15}
                roughness={0.25}
                metalness={0.2}
              />
            </mesh>
            <mesh geometry={nodes.clip.geometry} material={materials.metal} material-roughness={0.3} />
            <mesh geometry={nodes.clamp.geometry} material={materials.metal} />
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial
          color="white"
          depthTest={false}
          resolution={isMobile ? [1000, 2000] : [1000, 1000]}
          useMap
          map={texture}
          repeat={[-4, 1]}
          lineWidth={lanyardWidth}
        />
      </mesh>
    </>
  )
}
