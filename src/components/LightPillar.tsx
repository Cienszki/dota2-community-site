'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

export interface LightPillarProps {
  topColor?: string;
  bottomColor?: string;
  intensity?: number;
  rotationSpeed?: number;
  interactive?: boolean;
  className?: string;
  glowAmount?: number;
  pillarWidth?: number;
  pillarHeight?: number;
  noiseIntensity?: number;
  mixBlendMode?: React.CSSProperties['mixBlendMode'];
  pillarRotation?: number;
  quality?: 'low' | 'medium' | 'high';
}

const LightPillar = ({
  topColor = '#5227FF',
  bottomColor = '#FF9FFC',
  intensity = 1.0,
  rotationSpeed = 0.3,
  interactive = false,
  className = '',
  glowAmount = 0.005,
  pillarWidth = 3.0,
  pillarHeight = 0.4,
  noiseIntensity = 0.5,
  mixBlendMode = 'screen',
  pillarRotation = 0,
  quality = 'high'
}: LightPillarProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const geometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const mouseRef = useRef(new THREE.Vector2(0, 0));
  const timeRef = useRef(0);
  const rotationSpeedRef = useRef(rotationSpeed);
  const [webGLSupported, setWebGLSupported] = useState(true);

  const parseColor = useCallback((hex: string) => {
    const color = new THREE.Color(hex);
    return new THREE.Vector3(color.r, color.g, color.b);
  }, []);

  useEffect(() => {
    const checkWebGL = () => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebGLSupported(false);
      }
    };
    checkWebGL();
  }, []);

  // Uniform updates
  useEffect(() => {
    if (materialRef.current) {
      const color = parseColor(topColor);
      materialRef.current.uniforms.uTopColor.value.copy(color);
    }
  }, [topColor, parseColor]);

  useEffect(() => {
    if (materialRef.current) {
      const color = parseColor(bottomColor);
      materialRef.current.uniforms.uBottomColor.value.copy(color);
    }
  }, [bottomColor, parseColor]);

  useEffect(() => {
    if (materialRef.current) materialRef.current.uniforms.uIntensity.value = intensity;
  }, [intensity]);

  useEffect(() => {
    if (materialRef.current) materialRef.current.uniforms.uInteractive.value = interactive;
  }, [interactive]);

  useEffect(() => {
    if (materialRef.current) materialRef.current.uniforms.uGlowAmount.value = glowAmount;
  }, [glowAmount]);

  useEffect(() => {
    if (materialRef.current) materialRef.current.uniforms.uPillarWidth.value = pillarWidth;
  }, [pillarWidth]);

  useEffect(() => {
    if (materialRef.current) materialRef.current.uniforms.uPillarHeight.value = pillarHeight;
  }, [pillarHeight]);

  useEffect(() => {
    if (materialRef.current) materialRef.current.uniforms.uNoiseIntensity.value = noiseIntensity;
  }, [noiseIntensity]);

  useEffect(() => {
    if (materialRef.current) {
      const pillarRotRad = (pillarRotation * Math.PI) / 180;
      materialRef.current.uniforms.uPillarRotCos.value = Math.cos(pillarRotRad);
      materialRef.current.uniforms.uPillarRotSin.value = Math.sin(pillarRotRad);
    }
  }, [pillarRotation]);

  useEffect(() => {
    rotationSpeedRef.current = rotationSpeed;
  }, [rotationSpeed]);

  // Mouse interaction
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !interactive || !webGLSupported) return;

    let mouseMoveTimeout: number | null = null;
    const handleMouseMove = (event: MouseEvent) => {
      if (mouseMoveTimeout) return;
      mouseMoveTimeout = window.setTimeout(() => {
        mouseMoveTimeout = null;
      }, 16);
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      mouseRef.current.set(x, y);
    };

    container.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      if (mouseMoveTimeout) clearTimeout(mouseMoveTimeout);
    };
  }, [interactive, webGLSupported]);

  // Core initialization
  useEffect(() => {
    if (!containerRef.current || !webGLSupported) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cameraRef.current = camera;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // CPU core count used to be the only downgrade signal, and it is the wrong
    // question twice over: it says nothing about the GPU, and a six-year-old
    // MacBook Pro reports 12 logical cores, so it took the `high` path and
    // melted. Quality now starts where asked and is *measured* down below —
    // frame time is the only signal that reflects the machine actually running
    // the page. Mobile still starts low, where the answer is never in doubt.
    const effectiveQuality = isMobile ? 'low' : quality;

    const qualitySettings = {
      low: { iterations: 24, waveIterations: 1, precision: 'mediump' as const, stepMultiplier: 1.5 },
      medium: { iterations: 40, waveIterations: 2, precision: 'mediump' as const, stepMultiplier: 1.2 },
      high: { iterations: 80, waveIterations: 4, precision: 'highp' as const, stepMultiplier: 1.0 },
    };

    const settings = qualitySettings[effectiveQuality] || qualitySettings.medium;

    /**
     * Pixel *budget*, not pixel ratio.
     *
     * The container is `absolute inset-0` of a page-height element, so this
     * canvas is as tall as the whole document — on /inhouse that is ~4000 CSS
     * px, not the 900 of the viewport. At devicePixelRatio 2 that was a 23
     * megapixel drawing buffer, each pixel running an 80x4 raymarch. Capping
     * the ratio alone does not fix it, because the blowup comes from the
     * height; capping total pixels fixes both at once and keeps working
     * whatever the page grows into.
     *
     * The effect is a blurred glow behind a gradient at 60% opacity. There is
     * no detail in it to lose by rendering fewer pixels and letting the GPU
     * upscale — which is why this is the one lever with real impact and no
     * visible cost.
     */
    const PIXEL_BUDGET = 2_000_000;
    const budgetRatio = (w: number, h: number) =>
      Math.max(0.35, Math.min(1, Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h))));

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        // Never 'high-performance'. On a dual-GPU MacBook that asks macOS to
        // switch to the discrete card for an ambient background — which is
        // what spins the fans up, drains the battery, and makes the whole
        // system stutter, because the compositor then shares a saturated GPU.
        powerPreference: 'default',
        precision: settings.precision,
        stencil: false,
        depth: false
      });
    } catch {
      setTimeout(() => setWebGLSupported(false), 0);
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(budgetRatio(width, height));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision ${settings.precision} float;

      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec2 uMouse;
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      uniform float uIntensity;
      uniform bool uInteractive;
      uniform float uGlowAmount;
      uniform float uPillarWidth;
      uniform float uPillarHeight;
      uniform float uNoiseIntensity;
      uniform float uRotCos;
      uniform float uRotSin;
      uniform float uPillarRotCos;
      uniform float uPillarRotSin;
      uniform float uWaveSin;
      uniform float uWaveCos;
      varying vec2 vUv;

      const float STEP_MULT = ${settings.stepMultiplier.toFixed(1)};
      const int MAX_ITER = ${settings.iterations};
      const int WAVE_ITER = ${settings.waveIterations};

      void main() {
        vec2 uv = (vUv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
        uv = vec2(uPillarRotCos * uv.x - uPillarRotSin * uv.y, uPillarRotSin * uv.x + uPillarRotCos * uv.y);

        vec3 ro = vec3(0.0, 0.0, -10.0);
        vec3 rd = normalize(vec3(uv, 1.0));

        float rotC = uRotCos;
        float rotS = uRotSin;
        if(uInteractive && (uMouse.x != 0.0 || uMouse.y != 0.0)) {
          float a = uMouse.x * 6.283185;
          rotC = cos(a);
          rotS = sin(a);
        }

        vec3 col = vec3(0.0);
        float t = 0.1;
        
        for(int i = 0; i < MAX_ITER; i++) {
          vec3 p = ro + rd * t;
          p.xz = vec2(rotC * p.x - rotS * p.z, rotS * p.x + rotC * p.z);

          vec3 q = p;
          q.y = p.y * uPillarHeight + uTime;
          
          float freq = 1.0;
          float amp = 1.0;
          for(int j = 0; j < WAVE_ITER; j++) {
            q.xz = vec2(uWaveCos * q.x - uWaveSin * q.z, uWaveSin * q.x + uWaveCos * q.z);
            q += cos(q.zxy * freq - uTime * float(j) * 2.0) * amp;
            freq *= 2.0;
            amp *= 0.5;
          }
          
          float d = length(cos(q.xz)) - 0.2;
          float bound = length(p.xz) - uPillarWidth;
          float k = 4.0;
          float h = max(k - abs(d - bound), 0.0);
          d = max(d, bound) + h * h * 0.0625 / k;
          d = abs(d) * 0.15 + 0.01;

          float grad = clamp((15.0 - p.y) / 30.0, 0.0, 1.0);
          col += mix(uBottomColor, uTopColor, grad) / d;

          t += d * STEP_MULT;
          if(t > 50.0) break;
        }

        float widthNorm = uPillarWidth / 3.0;
        col = tanh(col * uGlowAmount / widthNorm);
        
        col -= fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) / 15.0 * uNoiseIntensity;
        
        gl_FragColor = vec4(col * uIntensity, 1.0);
      }
    `;

    const pillarRotRad = (pillarRotation * Math.PI) / 180;
    const waveSin = Math.sin(0.4);
    const waveCos = Math.cos(0.4);

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uMouse: { value: mouseRef.current },
        uTopColor: { value: parseColor(topColor) },
        uBottomColor: { value: parseColor(bottomColor) },
        uIntensity: { value: intensity },
        uInteractive: { value: interactive },
        uGlowAmount: { value: glowAmount },
        uPillarWidth: { value: pillarWidth },
        uPillarHeight: { value: pillarHeight },
        uNoiseIntensity: { value: noiseIntensity },
        uRotCos: { value: 1.0 },
        uRotSin: { value: 0.0 },
        uPillarRotCos: { value: Math.cos(pillarRotRad) },
        uPillarRotSin: { value: Math.sin(pillarRotRad) },
        uWaveSin: { value: waveSin },
        uWaveCos: { value: waveCos }
      },
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    materialRef.current = material;

    const geometry = new THREE.PlaneGeometry(2, 2);
    geometryRef.current = geometry;
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    let lastTime = performance.now();

    // 30fps, deliberately, at every quality. This is slow ambient light behind
    // a gradient — nobody is watching it for motion detail, and at 60fps it
    // costs exactly twice as much to look the same. It was previously 60
    // everywhere except `low`.
    const frameTime = 1000 / 30;

    // Render only when it can actually be seen. rAF already stops on a hidden
    // tab, but not for a window that is merely behind another one, and not for
    // a background scrolled past — both of which were still costing a full GPU
    // frame every 16ms.
    let visible = true;
    let onScreen = true;

    const onVisibility = () => {
      visible = document.visibilityState === 'visible';
      // Reset the clock, or the first frame back computes a huge delta.
      lastTime = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        lastTime = performance.now();
      },
      { rootMargin: '100px' },
    );
    observer.observe(container);

    // Adaptive downgrade. The only honest signal about a machine's GPU is how
    // long it actually takes to draw a frame, so quality steps down when the
    // renderer cannot hold the target — and never steps back up, because
    // oscillating between quality levels is more distracting than the lower
    // one. Recreating the shader mid-flight is not worth it; dropping
    // resolution gets most of the win and is invisible on a blur.
    let slowFrames = 0;
    let degraded = false;

    const animate = (currentTime: number) => {
      if (!materialRef.current || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;

      if (!visible || !onScreen) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const deltaTime = currentTime - lastTime;

      if (deltaTime >= frameTime) {
        const drawStart = performance.now();

        timeRef.current += 0.016 * rotationSpeedRef.current;
        const t = timeRef.current;
        materialRef.current.uniforms.uTime.value = t;
        materialRef.current.uniforms.uRotCos.value = Math.cos(t * 0.3);
        materialRef.current.uniforms.uRotSin.value = Math.sin(t * 0.3);
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        lastTime = currentTime - (deltaTime % frameTime);

        if (!degraded) {
          // >20ms of draw time means this machine cannot hold 30fps with the
          // rest of the page's work on top. Ten in a row rules out a one-off
          // hitch from a GC pause or another tab.
          if (performance.now() - drawStart > 20) slowFrames++;
          else slowFrames = Math.max(0, slowFrames - 1);

          if (slowFrames >= 10) {
            degraded = true;
            const current = rendererRef.current.getPixelRatio();
            rendererRef.current.setPixelRatio(Math.max(0.25, current * 0.6));
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    let resizeTimeout: number | null = null;
    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        if (!rendererRef.current || !materialRef.current || !containerRef.current) return;
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;
        rendererRef.current.setPixelRatio(budgetRatio(newWidth, newHeight));
        rendererRef.current.setSize(newWidth, newHeight);
        materialRef.current.uniforms.uResolution.value.set(newWidth, newHeight);
      }, 150);
    };

    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      if (resizeTimeout) clearTimeout(resizeTimeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss();
        if (container.contains(rendererRef.current.domElement)) {
          container.removeChild(rendererRef.current.domElement);
        }
      }
      if (materialRef.current) materialRef.current.dispose();
      if (geometryRef.current) geometryRef.current.dispose();

      rendererRef.current = null;
      materialRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      geometryRef.current = null;
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webGLSupported, quality, parseColor]);

  if (!webGLSupported) {
    return (
      <div
        className={`w-full h-full absolute top-0 left-0 flex items-center justify-center bg-black/10 text-[#888] text-[14px] ${className}`}
        style={{ mixBlendMode }}
      >
        WebGL not supported
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full absolute top-0 left-0 ${className}`}
      style={{ mixBlendMode }}
    />
  );
};

export default LightPillar;