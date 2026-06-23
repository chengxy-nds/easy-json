<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const containerRef = ref(null)
const canvasRef = ref(null)
const isHovered = ref(false)

// 鼠标位置状态（支持流体阻尼排斥）
const mouse = ref({ x: null, y: null })

let animationFrameId = null
let particles = []
const dpr = window.devicePixelRatio || 1

// ─── Google Antigravity 物理粒子类 ───
class AntigravityParticle {
  constructor(tx, ty, canvasWidth, canvasHeight, isShape = false) {
    this.isShape = isShape
    
    // 大括号上的几何网格目标坐标
    this.tx = tx
    this.ty = ty

    // 初始状态下散落在背景中的随机锚点
    this.scatteredX = Math.random() * canvasWidth
    this.scatteredY = Math.random() * canvasHeight

    // 粒子当前的物理坐标
    this.x = this.scatteredX
    this.y = this.scatteredY

    // 惯性缓动速度项
    this.vx = 0
    this.vy = 0

    // 鼠标物理场排斥位移与空气阻尼
    this.repelX = 0
    this.repelY = 0
    this.repelFriction = 0.91 

    // 有机流体呼吸波：多重正弦波参数，使得括号在聚合后依然呈现“水母般”的生命颤动
    this.phaseX = Math.random() * Math.PI * 2
    this.phaseY = Math.random() * Math.PI * 2
    this.floatSpeedX = 0.0016 + Math.random() * 0.001
    this.floatSpeedY = 0.0013 + Math.random() * 0.0008
    this.floatAmpX = 6 + Math.random() * 8  
    this.floatAmpY = 8 + Math.random() * 12 

    // 变形聚合进度（0.0 背景噪点漂流 -> 1.0 聚合为数学大括号）
    this.progress = 0
    this.transitionSpeed = 0.045 + Math.random() * 0.035 // 微弱的时间差，更加灵动

    // 严格复刻图 1 粒子的颗粒级配：大括号粒子采用大小不规则比例，形成丰满立体点阵
    this.size = isShape ? (Math.random() * 1.5 + 0.6) : (Math.random() * 0.6 + 0.3)

    // 1. 散落状态下的颜色（图 1 中的极细深色背景噪点，几乎呈针尖大小的碳黑色）
    this.sr = 20; this.sg = 20; this.sb = 22;
    this.sAlpha = Math.random() * 0.3 + 0.12 

    // 2. 汇聚成大括号后的颜色（严格一比一复刻图 1：深海皇家蓝，杂糅少许深猩红色）
    const colorRand = Math.random()
    if (colorRand > 0.08) {
      this.tr = 20; this.tg = 80; this.tb = 240;      // 图 1 皇家深蓝
    } else {
      this.tr = 220; this.tg = 20; this.tb = 20;      // 图 1 猩红色散点
    }
    this.tAlpha = 0.92
  }

  update(hovered, mousePos, width, height, time) {
    // 1. 平滑过度插值进度
    if (hovered && this.isShape) {
      this.progress += (1 - this.progress) * this.transitionSpeed
    } else {
      this.progress += (0 - this.progress) * 0.042
    }

    // 2. 有机正弦波动计算
    const oscX = Math.sin(time * this.floatSpeedX + this.phaseX) * this.floatAmpX
    const oscY = Math.cos(time * this.floatSpeedY + this.phaseY) * this.floatAmpY

    // 3. 更新背景基础漂流状态
    this.scatteredX += Math.sin(time * 0.0004 + this.phaseX) * 0.15
    this.scatteredY += Math.cos(time * 0.0004 + this.phaseY) * 0.12

    // 越界复位
    if (this.scatteredX < 0) this.scatteredX = width
    if (this.scatteredX > width) this.scatteredX = 0
    if (this.scatteredY < 0) this.scatteredY = height
    if (this.scatteredY > height) this.scatteredY = 0

    // 4. 插值计算目标坐标点
    let targetX, targetY
    if (this.isShape) {
      // 聚合时坐标 = 大括号加粗骨架坐标 + 动态正弦呼吸偏移量
      const shapeTargetX = this.tx + oscX * 0.35
      const shapeTargetY = this.ty + oscY * 0.35
      const freeTargetX = this.scatteredX + oscX
      const freeTargetY = this.scatteredY + oscY

      targetX = freeTargetX + (shapeTargetX - freeTargetX) * this.progress
      targetY = freeTargetY + (shapeTargetY - freeTargetY) * this.progress
    } else {
      // 背景漂流粒子
      targetX = this.scatteredX + oscX
      targetY = this.scatteredY + oscY
    }

    // 5. 惯性弹性追踪算法
    const springStrength = 0.08
    const dx = targetX - this.x
    const dy = targetY - this.y
    this.vx += dx * springStrength
    this.vy += dy * springStrength
    this.vx *= 0.72 
    this.vy *= 0.72

    this.x += this.vx
    this.y += this.vy

    // 6. 流体力学阻尼避让
    if (mousePos.x !== null) {
      const mDx = this.x - mousePos.x
      const mDy = this.y - mousePos.y
      const dist = Math.sqrt(mDx * mDx + mDy * mDy)
      const maxRepelDist = 140

      if (dist < maxRepelDist) {
        const force = (maxRepelDist - dist) / maxRepelDist
        this.repelX += (mDx / dist) * force * 1.8
        this.repelY += (mDy / dist) * force * 1.8
      }
    }

    this.repelX *= this.repelFriction
    this.repelY *= this.repelFriction

    this.x += this.repelX
    this.y += this.repelY
  }

  draw(ctx) {
    const r = Math.round(this.sr + (this.tr - this.sr) * this.progress)
    const g = Math.round(this.sg + (this.tg - this.sg) * this.progress)
    const b = Math.round(this.sb + (this.tb - this.sb) * this.progress)
    const alpha = this.sAlpha + (this.tAlpha - this.sAlpha) * this.progress

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ─── 一比一复刻：大括号“加粗实心”闭合几何体路径 ───
// 通过内外双层曲线闭合填充（fill），让粒子在具有宽度的实体骨架内饱满、厚实地平铺展开 [1.1.2]
const drawContouredBoldBrackets = (ctx, isLeft, xOffset, yOffset, scaleX, scaleY) => {
  ctx.beginPath()
  
  const mapX = (vx) => xOffset + vx * scaleX
  const mapY = (vy) => yOffset + vy * scaleY

  if (isLeft) {
    // 左侧加粗大括号实心封闭轮廓
    ctx.moveTo(mapX(85), mapY(15))
    // 外边缘顺时针绘制（外圆角曲率）
    ctx.bezierCurveTo(mapX(45), mapY(15), mapX(30), mapY(35), mapX(30), mapY(65))
    ctx.lineTo(mapX(30), mapY(125))
    // 外侧中心向左突起尖角
    ctx.bezierCurveTo(mapX(30), mapY(140), mapX(20), mapY(147), mapX(0), mapY(150))
    ctx.bezierCurveTo(mapX(20), mapY(153), mapX(30), mapY(160), mapX(30), mapY(175))
    ctx.lineTo(mapX(30), mapY(235))
    ctx.bezierCurveTo(mapX(30), mapY(265), mapX(45), mapY(285), mapX(85), mapY(285))
    
    // 底端截面厚度切角
    ctx.lineTo(mapX(85), mapY(270))
    // 内边缘逆时针返回（创建出厚度分量十足的实体面）
    ctx.bezierCurveTo(mapX(52), mapY(270), mapX(46), mapY(253), mapX(46), mapY(235))
    ctx.lineTo(mapX(46), mapY(172))
    // 内侧中突角过渡
    ctx.bezierCurveTo(mapX(46), mapY(160), mapX(38), mapY(153), mapX(22), mapY(150))
    ctx.bezierCurveTo(mapX(38), mapY(147), mapX(46), mapY(140), mapX(46), mapY(128))
    ctx.lineTo(mapX(46), mapY(65))
    ctx.bezierCurveTo(mapX(46), mapY(47), mapX(52), mapY(30), mapX(85), mapY(30))
    ctx.closePath()
  } else {
    // 右侧加粗大括号实心封闭轮廓
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
  // 实心填充，确保扫描区域完整闭合 [1.1.2]
  ctx.fill()
}

// ─── 粒子系统初始化（核心骨架构建） ───
const initParticleSystem = () => {
  const canvas = canvasRef.value
  if (!canvas) return

  const rect = containerRef.value.getBoundingClientRect()
  // 强制取整，确保 getImageData 数据对齐
  const width = Math.round(rect.width * dpr)
  const height = Math.round(rect.height * dpr)

  canvas.width = width
  canvas.height = height
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`

  // 1. 建立离屏扫描画布
  const offscreen = document.createElement('canvas')
  offscreen.width = width
  offscreen.height = height
  const oCtx = offscreen.getContext('2d')

  oCtx.clearRect(0, 0, width, height)
  
  // 离屏层使用白色填充，确保 alpha 值为 255 [1.1.2]
  oCtx.fillStyle = '#ffffff'

  // 自适应曲线高度比例
  const scaleY = (height * 0.73) / 300
  // 【加粗加宽】比例完全遵循图 1 黄金长宽比
  const scaleX = scaleY * 1.55 

  // X轴偏移：大括号往外平移（left移到0.165，right移到0.835），在视觉上完全包夹核心文本区域
  const leftXOffset = width * 0.165 - 50 * scaleX
  const rightXOffset = width * 0.835 - 50 * scaleX
  const yOffset = (height / 2) - 150 * scaleY

  // 3. 在离屏画布上绘制实心大括号图形
  drawContouredBoldBrackets(oCtx, true, leftXOffset, yOffset, scaleX, scaleY)
  drawContouredBoldBrackets(oCtx, false, rightXOffset, yOffset, scaleX, scaleY)

  // 4. 提取骨架像素点并采样
  const imgData = oCtx.getImageData(0, 0, width, height)
  const data = imgData.data
  const tempParticles = []

  // 【通透呼吸感采样】步长由 3.0 调大到 6.5，大幅稀释粒子密度，呈现完美的呼吸点阵感 [1.1.2]
  const step = 6.5
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (Math.floor(y) * width + Math.floor(x)) * 4
      const alpha = data[index + 3]
      if (alpha > 120) {
        tempParticles.push(new AntigravityParticle(x, y, width, height, true))
      }
    }
  }

  // 5. 补充背景微米级尘埃噪点（bgCount 从 280 减少至 120，确保背景纯净剔透） [1.1.2]
  const bgCount = 120
  for (let i = 0; i < bgCount; i++) {
    tempParticles.push(new AntigravityParticle(0, 0, width, height, false))
  }

  particles = tempParticles
}

// ─── 统一高性能渲染帧循环 ───
const animate = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  const now = Date.now()

  ctx.clearRect(0, 0, width, height)

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    p.update(isHovered.value, mouse.value, width, height, now)
    p.draw(ctx)
  }

  animationFrameId = requestAnimationFrame(animate)
}

// ─── 事件处理 ───
const handleMouseMove = (e) => {
  const rect = canvasRef.value.getBoundingClientRect()
  mouse.value = {
    x: (e.clientX - rect.left) * dpr,
    y: (e.clientY - rect.top) * dpr
  }
}

const handleMouseLeave = () => {
  isHovered.value = false
  mouse.value = { x: null, y: null }
}

const handleMouseEnter = () => {
  isHovered.value = true
}

let resizeObserver = null

onMounted(() => {
  initParticleSystem()
  animate()

  resizeObserver = new ResizeObserver(() => {
    initParticleSystem()
  })
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
  <div 
    ref="containerRef" 
    class="premium-hero-card"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @mousemove="handleMouseMove"
  >
    <!-- Canvas 物理渲染引擎层 -->
    <canvas ref="canvasRef" class="particle-canvas" />

    <!-- 严格对齐 antigravity.google 视觉排版层 -->
    <div class="content-overlay">
      <!-- Badge: Available at no charge -->
      <div class="pill-badge">
        <span>Available at no charge</span>
      </div>
      
      <!-- Typography -->
      <h1 class="hero-title">
        <span class="main-text">For developers</span>
        <span class="sub-text">Achieve new heights</span>
      </h1>

      <!-- CTA Button: Download -->
      <button class="cta-button">
        Download
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ── antigravity.google 经典极简卡片（纯白高雅噪点质感） ── */
.premium-hero-card {
  position: relative;
  width: 100%;
  max-width: 720px;
  height: 640px;
  margin: 0 auto;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 24px;
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.01),
    0 12px 48px rgba(0, 0, 0, 0.025);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  user-select: none;
}

/* 兼容暗黑模式系统 */
.dark-mode .premium-hero-card {
  background: #09090b;
  border-color: rgba(255, 255, 255, 0.05);
  box-shadow: 
    0 12px 48px rgba(0, 0, 0, 0.25);
}

.particle-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.content-overlay {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0 24px;
}

/* Available at no charge 徽章 */
.pill-badge {
  display: inline-flex;
  align-items: center;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  padding: 4px 12px;
  border-radius: 6px; 
  font-size: 11px;
  font-weight: 500;
  color: #1a1a1a;
  letter-spacing: -0.01em;
  margin-bottom: 24px;
}
.dark-mode .pill-badge {
  background: #18181b;
  border-color: rgba(255, 255, 255, 0.12);
  color: #ededed;
}

/* 行间距极其优雅的双行大标题 */
.hero-title {
  font-size: 40px; 
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.03em;
  color: #111111;
  margin: 0 0 32px 0;
  display: flex;
  flex-direction: column;
}
.dark-mode .hero-title {
  color: #ffffff;
}

.main-text {
  font-weight: 600;
}

.sub-text {
  font-weight: 500;
  color: #52525b; 
}
.dark-mode .sub-text {
  color: #a1a1aa;
}

/* 纯黑药丸 Download 按钮 */
.cta-button {
  background: #000000;
  color: #ffffff;
  border: none;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 32px;
  border-radius: 99px; 
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.cta-button:hover {
  background: #18181b;
  transform: scale(1.02); 
}

.cta-button:active {
  transform: scale(0.98);
}

.dark-mode .cta-button {
  background: #ffffff;
  color: #000000;
}
.dark-mode .cta-button:hover {
  background: #f4f4f5;
}
</style>