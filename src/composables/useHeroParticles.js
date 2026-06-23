// Hero 区域粒子背景 — 鼠标悬停汇聚成 { } 大括号
// 基于离屏 canvas 绘制加粗大括号轮廓，采样像素点作为粒子目标

const dpr = Math.min(window.devicePixelRatio || 1, 2)

class AntigravityParticle {
  constructor(tx, ty, canvasWidth, canvasHeight, isShape = false) {
    this.isShape = isShape
    this.tx = tx
    this.ty = ty
    this.scatteredX = Math.random() * canvasWidth
    this.scatteredY = Math.random() * canvasHeight
    this.x = this.scatteredX
    this.y = this.scatteredY
    this.vx = 0
    this.vy = 0
    this.repelX = 0
    this.repelY = 0
    this.repelFriction = 0.91
    this.phaseX = Math.random() * Math.PI * 2
    this.phaseY = Math.random() * Math.PI * 2
    this.floatSpeedX = 0.0012 + Math.random() * 0.0008
    this.floatSpeedY = 0.001 + Math.random() * 0.0006
    this.floatAmpX = 4 + Math.random() * 6
    this.floatAmpY = 5 + Math.random() * 8
    this.progress = 0
    this.transitionSpeed = 0.04 + Math.random() * 0.03
    this.size = isShape ? (Math.random() * 1.3 + 0.4) : (Math.random() * 0.5 + 0.25)

    const colorRand = Math.random()
    if (colorRand > 0.08) {
      this.tr = 20; this.tg = 80; this.tb = 240
    } else {
      this.tr = 220; this.tg = 20; this.tb = 20
    }
    this.tAlpha = 0.92

    // 散落状态根据主题动态设置
    this.scatterR = 0; this.scatterG = 0; this.scatterB = 0
    this.sAlpha = Math.random() * 0.18 + 0.06
  }

  updateTheme() {
    const isDark = document.documentElement.classList.contains('dark-mode')
    this.scatterR = isDark ? 255 : 20
    this.scatterG = isDark ? 255 : 20
    this.scatterB = isDark ? 255 : 22
  }

  update(hovered, mousePos, width, height, time) {
    if (hovered && this.isShape) {
      this.progress += (1 - this.progress) * this.transitionSpeed
    } else {
      this.progress += (0 - this.progress) * 0.04
    }

    const oscX = Math.sin(time * this.floatSpeedX + this.phaseX) * this.floatAmpX
    const oscY = Math.cos(time * this.floatSpeedY + this.phaseY) * this.floatAmpY

    this.scatteredX += Math.sin(time * 0.00035 + this.phaseX) * 0.12
    this.scatteredY += Math.cos(time * 0.00035 + this.phaseY) * 0.1
    if (this.scatteredX < 0) this.scatteredX = width
    if (this.scatteredX > width) this.scatteredX = 0
    if (this.scatteredY < 0) this.scatteredY = height
    if (this.scatteredY > height) this.scatteredY = 0

    let targetX, targetY
    if (this.isShape) {
      const shapeX = this.tx + oscX * 0.25
      const shapeY = this.ty + oscY * 0.25
      const freeX = this.scatteredX + oscX
      const freeY = this.scatteredY + oscY
      targetX = freeX + (shapeX - freeX) * this.progress
      targetY = freeY + (shapeY - freeY) * this.progress
    } else {
      targetX = this.scatteredX + oscX
      targetY = this.scatteredY + oscY
    }

    const springStrength = 0.07
    this.vx += (targetX - this.x) * springStrength
    this.vy += (targetY - this.y) * springStrength
    this.vx *= 0.72
    this.vy *= 0.72
    this.x += this.vx
    this.y += this.vy

    if (mousePos.x !== null) {
      const mDx = this.x - mousePos.x
      const mDy = this.y - mousePos.y
      const dist = Math.sqrt(mDx * mDx + mDy * mDy)
      const maxRepelDist = 120
      if (dist < maxRepelDist && dist > 0) {
        const force = (maxRepelDist - dist) / maxRepelDist
        this.repelX += (mDx / dist) * force * 1.6
        this.repelY += (mDy / dist) * force * 1.6
      }
    }
    this.repelX *= this.repelFriction
    this.repelY *= this.repelFriction
    this.x += this.repelX
    this.y += this.repelY
  }

  draw(ctx) {
    const r = Math.round(this.scatterR + (this.tr - this.scatterR) * this.progress)
    const g = Math.round(this.scatterG + (this.tg - this.scatterG) * this.progress)
    const b = Math.round(this.scatterB + (this.tb - this.scatterB) * this.progress)
    const alpha = this.sAlpha + (this.tAlpha - this.sAlpha) * this.progress
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

// 加粗大括号实心路径绘制
function drawContouredBoldBrackets(ctx, isLeft, xOffset, yOffset, scaleX, scaleY) {
  ctx.beginPath()
  const mapX = (vx) => xOffset + vx * scaleX
  const mapY = (vy) => yOffset + vy * scaleY

  if (isLeft) {
    ctx.moveTo(mapX(85), mapY(15))
    ctx.bezierCurveTo(mapX(45), mapY(15), mapX(30), mapY(35), mapX(30), mapY(65))
    ctx.lineTo(mapX(30), mapY(125))
    ctx.bezierCurveTo(mapX(30), mapY(140), mapX(20), mapY(147), mapX(0), mapY(150))
    ctx.bezierCurveTo(mapX(20), mapY(153), mapX(30), mapY(160), mapX(30), mapY(175))
    ctx.lineTo(mapX(30), mapY(235))
    ctx.bezierCurveTo(mapX(30), mapY(265), mapX(45), mapY(285), mapX(85), mapY(285))
    ctx.lineTo(mapX(85), mapY(270))
    ctx.bezierCurveTo(mapX(52), mapY(270), mapX(46), mapY(253), mapX(46), mapY(235))
    ctx.lineTo(mapX(46), mapY(172))
    ctx.bezierCurveTo(mapX(46), mapY(160), mapX(38), mapY(153), mapX(22), mapY(150))
    ctx.bezierCurveTo(mapX(38), mapY(147), mapX(46), mapY(140), mapX(46), mapY(128))
    ctx.lineTo(mapX(46), mapY(65))
    ctx.bezierCurveTo(mapX(46), mapY(47), mapX(52), mapY(30), mapX(85), mapY(30))
    ctx.closePath()
  } else {
    ctx.moveTo(mapX(15), mapY(15))
    ctx.bezierCurveTo(mapX(55), mapY(15), mapX(70), mapY(35), mapX(70), mapY(65))
    ctx.lineTo(mapX(70), mapY(125))
    ctx.bezierCurveTo(mapX(70), mapY(140), mapX(80), mapY(147), mapX(100), mapY(150))
    ctx.bezierCurveTo(mapX(80), mapY(153), mapX(70), mapY(160), mapX(70), mapY(175))
    ctx.lineTo(mapX(70), mapY(235))
    ctx.bezierCurveTo(mapX(70), mapY(265), mapX(55), mapY(285), mapX(15), mapY(285))
    ctx.lineTo(mapX(15), mapY(270))
    ctx.bezierCurveTo(mapX(48), mapY(270), mapX(54), mapY(253), mapX(54), mapY(235))
    ctx.lineTo(mapX(54), mapY(172))
    ctx.bezierCurveTo(mapX(54), mapY(160), mapX(62), mapY(153), mapX(78), mapY(150))
    ctx.bezierCurveTo(mapX(62), mapY(147), mapX(54), mapY(140), mapX(54), mapY(128))
    ctx.lineTo(mapX(54), mapY(65))
    ctx.bezierCurveTo(mapX(54), mapY(47), mapX(48), mapY(30), mapX(15), mapY(30))
    ctx.closePath()
  }
  ctx.fill()
}

export function useHeroParticles() {
  let canvas, ctx, container
  let particles = [], animId, running = false
  let isHovering = false
  let mouse = { x: null, y: null }
  let resizeObserver = null

  function initParticleSystem() {
    const rect = container.getBoundingClientRect()
    const width = Math.round(rect.width * dpr)
    const height = Math.round(rect.height * dpr)

    canvas.width = width
    canvas.height = height
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const offscreen = document.createElement('canvas')
    offscreen.width = width
    offscreen.height = height
    const oCtx = offscreen.getContext('2d')
    oCtx.fillStyle = '#ffffff'
    oCtx.clearRect(0, 0, width, height)

    const scaleY = (height * 0.73) / 300
    const scaleX = scaleY * 1.55
    const leftXOffset = width * 0.165 - 50 * scaleX
    const rightXOffset = width * 0.835 - 50 * scaleX
    const yOffset = (height / 2) - 150 * scaleY

    drawContouredBoldBrackets(oCtx, true, leftXOffset, yOffset, scaleX, scaleY)
    drawContouredBoldBrackets(oCtx, false, rightXOffset, yOffset, scaleX, scaleY)

    const imgData = oCtx.getImageData(0, 0, width, height)
    const data = imgData.data
    const tempParticles = []

    const step = 6.5
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (Math.floor(y) * width + Math.floor(x)) * 4
        if (data[idx + 3] > 120) {
          tempParticles.push(new AntigravityParticle(x, y, width, height, true))
        }
      }
    }

    const bgCount = 120
    for (let i = 0; i < bgCount; i++) {
      tempParticles.push(new AntigravityParticle(0, 0, width, height, false))
    }

    particles = tempParticles

    // 更新所有粒子的主题颜色
    const isDark = document.documentElement.classList.contains('dark-mode')
    for (const p of particles) {
      p.scatterR = isDark ? 255 : 20
      p.scatterG = isDark ? 255 : 20
      p.scatterB = isDark ? 255 : 22
    }
  }

  function animate() {
    if (!running) return
    const width = canvas.width
    const height = canvas.height
    const time = Date.now()
    ctx.clearRect(0, 0, width, height)

    for (let i = 0; i < particles.length; i++) {
      particles[i].update(isHovering, mouse, width, height, time)
      particles[i].draw(ctx)
    }
    animId = requestAnimationFrame(animate)
  }

  function onMouseEnter() { isHovering = true }
  function onMouseLeave() {
    isHovering = false
    mouse = { x: null, y: null }
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect()
    mouse = {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
    }
  }

  // 监听主题切换
  const themeObserver = new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains('dark-mode')
    for (const p of particles) {
      p.scatterR = isDark ? 255 : 20
      p.scatterG = isDark ? 255 : 20
      p.scatterB = isDark ? 255 : 22
    }
  })

  function mount(el) {
    container = el

    canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;'
    ctx = canvas.getContext('2d')
    el.insertBefore(canvas, el.firstChild)

    initParticleSystem()

    el.addEventListener('mouseenter', onMouseEnter)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('mousemove', onMouseMove, { passive: true })

    resizeObserver = new ResizeObserver(() => { initParticleSystem() })
    resizeObserver.observe(el)

    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    running = true
    animate()
  }

  function unmount() {
    running = false
    if (animId) cancelAnimationFrame(animId)
    if (resizeObserver) resizeObserver.disconnect()
    themeObserver.disconnect()
    if (container) {
      container.removeEventListener('mouseenter', onMouseEnter)
      container.removeEventListener('mouseleave', onMouseLeave)
      container.removeEventListener('mousemove', onMouseMove)
    }
    if (canvas?.parentNode) canvas.parentNode.removeChild(canvas)
    particles = []
  }

  return { mount, unmount }
}
