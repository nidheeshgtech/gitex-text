import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import Hls from 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/+esm';
import createGlobe from 'https://esm.sh/cobe@0.6.4/es2022/cobe.bundle.mjs';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GITEX_HLS = 'https://stream.mux.com/tLkHO1qZoaaQOUeVWo8hEBeGQfySP02EPS02BmnNFyXys.m3u8';

function setupGitexHeroVideo(){
  const video = document.getElementById('gitex-hero-video');
  if (!video) return;

  let hls = null;
  if (Hls.isSupported()) {
    hls = new Hls({ autoStartLoad:true });
    hls.loadSource(GITEX_HLS);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = GITEX_HLS;
    video.addEventListener('loadedmetadata', () => {
      video.play().catch(() => {});
    }, { once:true });
  }

  addEventListener('pagehide', () => {
    if (hls) hls.destroy();
  }, { once:true });
}

function setupGitexCountdown(){
  const daysEl = document.getElementById('count-days');
  const hoursEl = document.getElementById('count-hours');
  const minutesEl = document.getElementById('count-minutes');
  const secondsEl = document.getElementById('count-seconds');
  if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

  const eventStart = new Date('2026-12-08T00:00:00+04:00').getTime();
  const pad = value => String(value).padStart(2, '0');

  const updateCountdown = () => {
    const diff = Math.max(0, eventStart - Date.now());
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    daysEl.textContent = String(days).padStart(3, '0');
    hoursEl.textContent = pad(hours);
    minutesEl.textContent = pad(minutes);
    secondsEl.textContent = pad(seconds);
  };

  updateCountdown();
  setInterval(updateCountdown, 1000);
}

/* ---------------- fetched dotted globe asset ---------------- */
let cobeGlobe = null;
let cobePhi = 0;
let cobeScrollPhi = 0;
let cobeCanvasSize = 0;

function setupCobeGlobe(){
  const canvas = document.getElementById('cobe-globe');
  if (!canvas) return;

  const wrapper = canvas.parentElement;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  const resizeCobe = () => {
    const rect = wrapper.getBoundingClientRect();
    cobeCanvasSize = Math.max(320, Math.floor(rect.width));
    canvas.width = Math.floor(cobeCanvasSize * pixelRatio);
    canvas.height = Math.floor(cobeCanvasSize * pixelRatio);
  };

  resizeCobe();

  cobeGlobe = createGlobe(canvas, {
    devicePixelRatio: pixelRatio,
    width: canvas.width,
    height: canvas.height,
    phi: 0,
    theta: 0.26,
    dark: 1,
    diffuse: 1.85,
    mapSamples: 18000,
    mapBrightness: 6,
    baseColor: [1, 1, 1],
    markerColor: [1, 1, 1],
    glowColor: [1.8, 1.8, 1.8],
    opacity: 1,
    scale: 1,
    offset: [0, 0],
    markers: [],
    onRender: state => {
      cobePhi += reduceMotion ? 0 : 0.0035;
      state.phi = cobePhi + cobeScrollPhi;
      state.theta = 0.26 + (reduceMotion ? 0 : Math.sin(performance.now() * 0.00028) * 0.035);
      state.width = canvas.width;
      state.height = canvas.height;
    }
  });

  addEventListener('resize', resizeCobe, { passive:true });
}

/* ---------------- renderer / scene / camera ---------------- */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05030f, 0.008);

const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.01, 200);
camera.position.set(0, 0, 14);

/* ---------------- impacts (ported from prisoner849 pen) ---------------- */
const GLOBE_R = 5;
const MAX_IMPACTS = 8;
const UAE_LAT = 25.2048, UAE_LON = 55.2708;

const impacts = [];
for (let i=0;i<MAX_IMPACTS;i++){
  impacts.push({ impactPosition:new THREE.Vector3(), impactMaxRadius:0, impactRatio:0 });
}
const uniforms = { impacts:{ value:impacts } };

const activeTweens = [];
function tween(durMs, onUpdate, onComplete){
  const start = performance.now();
  activeTweens.push(t => {
    const k = Math.min(1, (t-start)/durMs);
    onUpdate(k);
    if (k>=1){ onComplete && onComplete(); return true; }
    return false;
  });
}
function tickTweens(){
  const t=performance.now();
  for (let i=activeTweens.length-1;i>=0;i--){ if (activeTweens[i](t)) activeTweens.splice(i,1); }
}

const rand = (a,b)=>a+Math.random()*(b-a);
const randInt = (a,b)=>Math.floor(rand(a,b+1));
function latLonToSphere(lat, lon, r=GLOBE_R){
  const v = new THREE.Vector3();
  v.setFromSphericalCoords(r, THREE.MathUtils.degToRad(90-lat), THREE.MathUtils.degToRad(lon));
  return v;
}

function greatCirclePoint(a, b, t){
  const omega = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  if (omega < 0.0001) return a.clone().lerp(b, t).normalize();
  const sinOmega = Math.sin(omega);
  return a.clone().multiplyScalar(Math.sin((1 - t) * omega) / sinOmega)
    .add(b.clone().multiplyScalar(Math.sin(t * omega) / sinOmega))
    .normalize();
}

const UAE_IMPACT = 0;
function runImpact(i){
  const dur = randInt(2500,5000);
  tween(dur,
    k => { uniforms.impacts.value[i].impactRatio = k; },
    () => {
      uniforms.impacts.value[i].impactPosition.setFromSphericalCoords(GLOBE_R, Math.PI*Math.random(), Math.PI*2*Math.random());
      uniforms.impacts.value[i].impactMaxRadius = GLOBE_R * rand(0.5,0.75);
      runImpact(i);
    });
}
function runUaeImpact(){
  const dur = randInt(1800,2800);
  tween(dur,
    k => { uniforms.impacts.value[UAE_IMPACT].impactRatio = k; },
    () => {
      uniforms.impacts.value[UAE_IMPACT].impactPosition.copy(latLonToSphere(UAE_LAT, UAE_LON));
      uniforms.impacts.value[UAE_IMPACT].impactMaxRadius = GLOBE_R * 0.65;
      runUaeImpact();
    });
}
for (let i=0;i<MAX_IMPACTS;i++){
  uniforms.impacts.value[i].impactPosition.setFromSphericalCoords(GLOBE_R, Math.PI*Math.random(), Math.PI*2*Math.random());
  uniforms.impacts.value[i].impactMaxRadius = GLOBE_R*rand(0.5,0.75);
}
uniforms.impacts.value[UAE_IMPACT].impactPosition.copy(latLonToSphere(UAE_LAT, UAE_LON));
runUaeImpact();
for (let i=1;i<MAX_IMPACTS;i++) runImpact(i);

/* ---------------- SVG source ---------------- */
async function loadSvgSource(){
  const response = await fetch('assets/svg/world-dots.svg');
  if (!response.ok) throw new Error(`Could not load world SVG: ${response.status}`);

  const svgText = await response.text();
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) throw new Error('World SVG did not contain an <svg> root.');
  return svg;
}

let svgGlobeVisual = null;
function mountSvgGlobe(svgSource){
  const rotor = document.getElementById('svg-globe-rotor');
  if (!rotor) return;
  const clone = svgSource.cloneNode(true);
  clone.removeAttribute('hidden');
  clone.removeAttribute('aria-hidden');
  clone.removeAttribute('focusable');
  clone.id = 'svg-globe-display';
  clone.setAttribute('role', 'presentation');
  clone.querySelectorAll('circle').forEach(circle => {
    circle.removeAttribute('fill');
    circle.removeAttribute('stroke');
  });
  rotor.replaceChildren(clone);
  svgGlobeVisual = rotor;
}

/* ---------------- the dotted globe ---------------- */
const globe = new THREE.Group();
scene.add(globe);

let pointsMesh = null;
let globePointMaterial = null;
function buildGlobeOfPoints(svgSource){
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(1, 0, 0);
  const circles = [...svgSource.querySelectorAll('circle')];
  const vb = svgSource.viewBox.baseVal;

  const minSize=0.04, maxSize=0.085;
  const pointCount = circles.length;
  const vertexCount = pointCount * 4;
  const indexCount = pointCount * 6;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const centers = new Float32Array(vertexCount * 3);
  const scales = new Float32Array(vertexCount);
  const seeds = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);
  const corners = [
    [-0.5, -0.5, 0, 0],
    [ 0.5, -0.5, 1, 0],
    [ 0.5,  0.5, 1, 1],
    [-0.5,  0.5, 0, 1]
  ];

  for (let pointIndex=0; pointIndex<pointCount; pointIndex++){
    const circle = circles[pointIndex];
    const sx = Number(circle.getAttribute('cx'));
    const sy = Number(circle.getAttribute('cy'));
    const sr = Number(circle.getAttribute('r')) || 3.61;
    const mapX = (sx - vb.x) / vb.width;
    const mapY = (sy - vb.y) / vb.height;
    const lon = mapX * 360 - 180;
    const lat = 90 - mapY * 180;
    const radiusLift = 0.04 * Math.sin(mapX * Math.PI * 6.0) * Math.sin(mapY * Math.PI * 4.0);
    p.setFromSphericalCoords(GLOBE_R + radiusLift, THREE.MathUtils.degToRad(90 - lat), THREE.MathUtils.degToRad(lon));
    n.copy(p).normalize();
    u.crossVectors(Math.abs(n.dot(up)) > 0.96 ? side : up, n).normalize();
    v.crossVectors(n, u).normalize();
    const polarFade = Math.sin(mapY * Math.PI);
    const gSize = THREE.MathUtils.lerp(minSize, maxSize, 0.35 + polarFade * 0.65) * (sr / 3.61);
    const s = 1.0 + polarFade * 1.6;
    const seed = (Math.sin(pointIndex * 12.9898 + sx * 0.073 + sy * 0.041) * 43758.5453) % 1;
    const vertexBase = pointIndex * 4;
    const indexBase = pointIndex * 6;

    for (let i=0;i<4;i++){
      const vertex = vertexBase + i;
      const posOffset = vertex * 3;
      const uvOffset = vertex * 2;
      const [cx, cy, uvx, uvy] = corners[i];
      positions[posOffset] = p.x + (u.x * cx + v.x * cy) * gSize;
      positions[posOffset + 1] = p.y + (u.y * cx + v.y * cy) * gSize;
      positions[posOffset + 2] = p.z + (u.z * cx + v.z * cy) * gSize;
      normals[posOffset] = n.x;
      normals[posOffset + 1] = n.y;
      normals[posOffset + 2] = n.z;
      centers[posOffset] = p.x;
      centers[posOffset + 1] = p.y;
      centers[posOffset + 2] = p.z;
      uvs[uvOffset] = uvx;
      uvs[uvOffset + 1] = uvy;
      scales[vertex] = s;
      seeds[vertex] = Math.abs(seed);
    }

    indices[indexBase] = vertexBase;
    indices[indexBase + 1] = vertexBase + 1;
    indices[indexBase + 2] = vertexBase + 2;
    indices[indexBase + 3] = vertexBase;
    indices[indexBase + 4] = vertexBase + 2;
    indices[indexBase + 5] = vertexBase + 3;
  }
  const merged = new THREE.BufferGeometry();
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute('center', new THREE.BufferAttribute(centers, 3));
  merged.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
  merged.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  merged.computeBoundingSphere();

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    onBeforeCompile: shader => {
      shader.uniforms.impacts = uniforms.impacts;
      shader.uniforms.uTime = { value: 0 };
      mat.userData.shader = shader;
      shader.vertexShader = `
        struct impact { vec3 impactPosition; float impactMaxRadius; float impactRatio; };
        uniform impact impacts[${MAX_IMPACTS}];
        uniform float uTime;
        attribute vec3 center;
        attribute float scale;
        attribute float seed;
        varying float vFinalStep;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        varying float vSeed;
        varying vec2 vDotUv;
        ${shader.vertexShader}
      `.replace(`#include <begin_vertex>`,
        `#include <begin_vertex>
        float finalStep = 0.0;
        for (int i=0;i<${MAX_IMPACTS};i++){
          float dist = distance(center, impacts[i].impactPosition);
          float curRadius = impacts[i].impactMaxRadius * impacts[i].impactRatio;
          float sstep = smoothstep(0., curRadius, dist) - smoothstep(curRadius - (0.25*impacts[i].impactRatio), curRadius, dist);
          sstep *= 1.0 - impacts[i].impactRatio;
          finalStep += sstep;
        }
        finalStep = clamp(finalStep, 0., 1.);
        vFinalStep = finalStep;
        vSeed = seed;
        vDotUv = uv;
        float breathe = 0.84 + 0.16 * sin(uTime * 1.35 + seed * 6.28318);
        transformed = (position - center) * mix(breathe, scale * 1.35, finalStep) + center;
        transformed += normal * (finalStep * 0.18 + 0.025 * sin(uTime * 0.9 + seed * 18.0));

        // per-point world-space normal & view dir for depth shading
        vec3 objN = normalize(center);
        vWorldNormal = normalize(mat3(modelMatrix) * objN);
        vec3 worldPos = (modelMatrix * vec4(center, 1.0)).xyz;
        vViewDir = normalize(cameraPosition - worldPos);
        `);
      shader.fragmentShader = `
        uniform float uTime;
        varying float vFinalStep;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        varying float vSeed;
        varying vec2 vDotUv;
        ${shader.fragmentShader}
      `.replace(`vec4 diffuseColor = vec4( diffuse, opacity );`,
        `
        if (length(vDotUv - 0.5) > 0.5) discard;

        // Hemisphere cull — only render dots facing the camera, with a soft silhouette fade
        float ndv = dot(vWorldNormal, vViewDir);
        if (ndv < -0.10) discard;
        float frontFade = smoothstep(-0.08, 0.10, ndv);

        // White-only globe dots, with a soft edge glow so it sits with the page atmosphere.
        float rim = pow(1.0 - max(0.0, ndv), 2.6);
        vec3 col = vec3(1.65);
        float gaussian = exp(-dot(vDotUv - 0.5, vDotUv - 0.5) * 8.0);
        float twinkle = 0.92 + 0.08 * sin(uTime * 1.6 + vSeed * 32.0);
        float animatedAlpha = max(0.96 * twinkle, smoothstep(0.015, 0.22, vFinalStep));
        animatedAlpha = clamp(animatedAlpha + rim * 0.16 + vFinalStep * 0.22, 0.0, 1.0);

        vec4 diffuseColor = vec4(col, animatedAlpha * gaussian * 0.68);
        `);
    }
  });
  mat.defines = { USE_UV: '' };
  globePointMaterial = mat;

  pointsMesh = new THREE.Mesh(merged, mat);
  pointsMesh.visible = true;
  globe.add(pointsMesh);
}

/* ---------------- convergence fibers: world routes flowing into Dubai ---------------- */
const convergenceGroup = new THREE.Group();
globe.add(convergenceGroup);

const routeSources = [
  ['New York', 40.7128, -74.0060], ['San Francisco', 37.7749, -122.4194],
  ['Sao Paulo', -23.5505, -46.6333], ['Mexico City', 19.4326, -99.1332],
  ['London', 51.5072, -0.1276], ['Paris', 48.8566, 2.3522],
  ['Berlin', 52.5200, 13.4050], ['Stockholm', 59.3293, 18.0686],
  ['Lagos', 6.5244, 3.3792], ['Nairobi', -1.2921, 36.8219],
  ['Cape Town', -33.9249, 18.4241], ['Cairo', 30.0444, 31.2357],
  ['Riyadh', 24.7136, 46.6753], ['Istanbul', 41.0082, 28.9784],
  ['Mumbai', 19.0760, 72.8777], ['Bengaluru', 12.9716, 77.5946],
  ['Singapore', 1.3521, 103.8198], ['Jakarta', -6.2088, 106.8456],
  ['Hong Kong', 22.3193, 114.1694], ['Shanghai', 31.2304, 121.4737],
  ['Tokyo', 35.6762, 139.6503], ['Seoul', 37.5665, 126.9780],
  ['Sydney', -33.8688, 151.2093], ['Auckland', -36.8509, 174.7645],
  ['Toronto', 43.6532, -79.3832], ['Buenos Aires', -34.6037, -58.3816],
  ['Zurich', 47.3769, 8.5417], ['Helsinki', 60.1699, 24.9384]
];

const routeSegments = 36;
const routePositions = [];
const routeT = [];
const routeDelay = [];
const routeColor = [];
const routePalette = [
  new THREE.Color('#f22926'), new THREE.Color('#ff5100'), new THREE.Color('#4b0052'),
  new THREE.Color('#ae95da'), new THREE.Color('#211c6f'), new THREE.Color('#00d2c6')
];
const routeCurves = [];
const uaeDir = latLonToSphere(UAE_LAT, UAE_LON, 1);

routeSources.forEach(([, lat, lon], routeIndex) => {
  const srcDir = latLonToSphere(lat, lon, 1);
  const pts = [];
  const color = routePalette[routeIndex % routePalette.length];
  const delay = routeIndex / routeSources.length * 0.56;
  const arcHeight = 0.34 + (routeIndex % 5) * 0.055;

  for (let i=0;i<=routeSegments;i++){
    const t = i / routeSegments;
    const dir = greatCirclePoint(srcDir, uaeDir, t);
    const lift = Math.sin(t * Math.PI) * arcHeight;
    pts.push(dir.multiplyScalar(GLOBE_R + 0.16 + lift));
  }
  routeCurves.push({ points: pts, delay, color });

  for (let i=0;i<routeSegments;i++){
    const a = pts[i], b = pts[i + 1];
    routePositions.push(a.x,a.y,a.z, b.x,b.y,b.z);
    routeT.push(i / routeSegments, (i + 1) / routeSegments);
    routeDelay.push(delay, delay);
    routeColor.push(color.r,color.g,color.b, color.r,color.g,color.b);
  }
});

const routeGeo = new THREE.BufferGeometry();
routeGeo.setAttribute('position', new THREE.Float32BufferAttribute(routePositions, 3));
routeGeo.setAttribute('aRouteT', new THREE.Float32BufferAttribute(routeT, 1));
routeGeo.setAttribute('aRouteDelay', new THREE.Float32BufferAttribute(routeDelay, 1));
routeGeo.setAttribute('aRouteColor', new THREE.Float32BufferAttribute(routeColor, 3));

const routeTubeMats = [];
routeCurves.forEach((route, index) => {
  const tubeCurve = new THREE.CatmullRomCurve3(route.points);
  const tubeGeo = new THREE.TubeGeometry(tubeCurve, 72, 0.012, 6, false);
  const tubeMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  tube.renderOrder = 4 + index;
  routeTubeMats.push({ mat: tubeMat, delay: route.delay });
  convergenceGroup.add(tube);
});

const routeMat = new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending,
  uniforms:{ uProgress:{value:0}, uTime:{value:0}, uCopyDim:{value:0} },
  vertexShader:`
    uniform float uProgress;
    uniform float uTime;
    uniform float uCopyDim;
    attribute float aRouteT;
    attribute float aRouteDelay;
    attribute vec3 aRouteColor;
    varying float vAlpha;
    varying vec3 vColor;
    varying float vFacing;
    void main(){
      float draw = clamp((uProgress - aRouteDelay) / 0.42, 0.0, 1.0);
      float body = smoothstep(draw - 0.34, draw, aRouteT) * (1.0 - smoothstep(draw + 0.02, draw + 0.16, aRouteT));
      float destinationGlow = smoothstep(0.84, 1.0, aRouteT) * smoothstep(0.12, 1.0, uProgress);
      vAlpha = max(body, destinationGlow * 0.34) * smoothstep(0.02, 0.18, uProgress) * mix(1.0, 0.68, uCopyDim);
      vColor = mix(vec3(0.78, 0.92, 1.0), vec3(1.0), 0.82 + destinationGlow * 0.18);
      vec3 objN = normalize(position);
      vec3 worldN = normalize(mat3(modelMatrix) * objN);
      vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vFacing = smoothstep(-0.06, 0.16, dot(worldN, normalize(cameraPosition - worldPos)));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader:`
    varying float vAlpha;
    varying vec3 vColor;
    varying float vFacing;
    void main(){
      gl_FragColor = vec4(vColor * 2.8, vAlpha * vFacing * 1.0);
    }
  `
});
const routeLines = new THREE.LineSegments(routeGeo, routeMat);
routeLines.renderOrder = 3;
convergenceGroup.add(routeLines);

const pulseCount = routeCurves.length * 2;
const pulsePositions = new Float32Array(pulseCount * 3);
const pulseSeed = new Float32Array(pulseCount);
const pulseColor = new Float32Array(pulseCount * 3);
for (let i=0;i<pulseCount;i++){
  const route = routeCurves[i % routeCurves.length];
  pulseSeed[i] = i * 0.137 + route.delay;
  pulseColor[i*3] = route.color.r;
  pulseColor[i*3+1] = route.color.g;
  pulseColor[i*3+2] = route.color.b;
}
const pulseGeo = new THREE.BufferGeometry();
pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3));
pulseGeo.setAttribute('seed', new THREE.BufferAttribute(pulseSeed, 1));
pulseGeo.setAttribute('color', new THREE.BufferAttribute(pulseColor, 3));
const pulseMat = new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending,
  uniforms:{ uProgress:{value:0}, uPx:{value:renderer.getPixelRatio()}, uCopyDim:{value:0} },
  vertexShader:`attribute float seed; attribute vec3 color; varying float vSeed; varying vec3 vColor; varying float vFacing; uniform float uPx; uniform float uCopyDim;
    void main(){ vSeed=seed; vColor=vec3(1.0);
      vec3 objN=normalize(position);
      vec3 worldN=normalize(mat3(modelMatrix)*objN);
      vec3 worldPos=(modelMatrix*vec4(position,1.0)).xyz;
      vFacing=smoothstep(-0.06,0.16,dot(worldN,normalize(cameraPosition-worldPos)));
      vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=(4.0 + fract(seed*9.17)*5.0) * mix(1.0, 0.72, uCopyDim) * uPx * (95.0/-mv.z);
      gl_Position=projectionMatrix*mv; }`,
  fragmentShader:`varying float vSeed; varying vec3 vColor; varying float vFacing; uniform float uCopyDim;
    void main(){ vec2 uv=gl_PointCoord-0.5; float d=length(uv);
      float a=smoothstep(0.5,0.0,d);
      gl_FragColor=vec4(vec3(2.35), a * vFacing * mix(0.70, 0.42, uCopyDim)); }`
});
const pulsePoints = new THREE.Points(pulseGeo, pulseMat);
pulsePoints.renderOrder = 20;
convergenceGroup.add(pulsePoints);
convergenceGroup.visible = false;

function updateConvergence(progress, time, copyDim = 0){
  const flow = smooth(0.24, 0.64, progress);
  const hold = 1.0 - smooth(0.78, 0.92, progress) * 0.62;
  const amount = flow * hold;
  convergenceGroup.visible = amount > 0.01;
  routeMat.uniforms.uProgress.value = amount;
  routeMat.uniforms.uTime.value = time;
  routeMat.uniforms.uCopyDim.value = copyDim;
  pulseMat.uniforms.uProgress.value = amount;
  pulseMat.uniforms.uCopyDim.value = copyDim;

  const pos = pulseGeo.attributes.position.array;
  for (let i=0;i<pulseCount;i++){
    const route = routeCurves[i % routeCurves.length];
    const wave = (time * 0.11 + pulseSeed[i]) % 1;
    const t = THREE.MathUtils.clamp((amount * 1.14 - route.delay) / 0.58 - wave * 0.22, 0, 1);
    const idx = Math.min(route.points.length - 2, Math.floor(t * (route.points.length - 1)));
    const localT = t * (route.points.length - 1) - idx;
    const p = route.points[idx].clone().lerp(route.points[idx + 1], localT);
    pos[i*3] = p.x; pos[i*3+1] = p.y; pos[i*3+2] = p.z;
  }
  pulseGeo.attributes.position.needsUpdate = true;
  routeTubeMats.forEach(route => {
    const routeOn = THREE.MathUtils.clamp((amount - route.delay) / 0.34, 0, 1);
    route.mat.opacity = routeOn * 0.34 * (1 - copyDim * 0.35);
  });
  pulsePoints.visible = amount > 0.08;
}

/* ---------------- the AURA — smooth brand-color halo ----------------
   A soft additive canvas glow using the event palette:
   red #f22926, deep purple #4b0052, indigo #211c6f, orange #ff5100,
   lavender #ae95da, and cyan #00d2c6.
*/
function makeAuraTexture(){
  const S = 1024;
  const c = document.createElement('canvas'); c.width=S; c.height=S;
  const g = c.getContext('2d');

  g.fillStyle='#000'; g.fillRect(0,0,S,S);
  g.globalCompositeOperation='lighter';

  const blob = (cx, cy, r, stops) => {
    const grad = g.createRadialGradient(cx,cy,0, cx,cy,r);
    stops.forEach(([t,col]) => grad.addColorStop(t, col));
    g.fillStyle = grad; g.fillRect(0,0,S,S);
  };

  // broad foundation glow, kept soft so there is no visible ring edge
  blob(S*0.50, S*0.50, S*0.78, [
    [0,'rgba(75,0,82,0.55)'],
    [0.34,'rgba(33,28,111,0.42)'],
    [0.68,'rgba(0,210,198,0.18)'],
    [1,'rgba(0,0,0,0)']
  ]);

  // red heat on the upper-left
  blob(S*0.18, S*0.30, S*0.55, [
    [0,'rgba(242,41,38,1)'],
    [0.34,'rgba(242,41,38,0.58)'],
    [0.7,'rgba(75,0,82,0.20)'],
    [1,'rgba(0,0,0,0)']
  ]);

  // orange spill on the lower-left
  blob(S*0.22, S*0.76, S*0.52, [
    [0,'rgba(255,81,0,0.95)'],
    [0.42,'rgba(255,81,0,0.46)'],
    [0.76,'rgba(242,41,38,0.18)'],
    [1,'rgba(0,0,0,0)']
  ]);

  // deep purple core behind the top rim
  blob(S*0.50, S*0.22, S*0.56, [
    [0,'rgba(75,0,82,0.90)'],
    [0.42,'rgba(75,0,82,0.42)'],
    [0.78,'rgba(174,149,218,0.16)'],
    [1,'rgba(0,0,0,0)']
  ]);

  // indigo on the upper-right
  blob(S*0.80, S*0.30, S*0.54, [
    [0,'rgba(33,28,111,0.95)'],
    [0.48,'rgba(33,28,111,0.45)'],
    [0.78,'rgba(174,149,218,0.18)'],
    [1,'rgba(0,0,0,0)']
  ]);

  // cyan punch on the lower-right
  blob(S*0.82, S*0.70, S*0.54, [
    [0,'rgba(0,210,198,1)'],
    [0.42,'rgba(0,210,198,0.48)'],
    [0.76,'rgba(33,28,111,0.18)'],
    [1,'rgba(0,0,0,0)']
  ]);

  // lavender bridge to make the transitions creamy instead of banded
  blob(S*0.54, S*0.70, S*0.70, [
    [0,'rgba(174,149,218,0.52)'],
    [0.5,'rgba(174,149,218,0.24)'],
    [1,'rgba(0,0,0,0)']
  ]);

  // thin white atmospheric lift around the silhouette
  blob(S*0.50, S*0.50, S*0.58, [
    [0,'rgba(255,255,255,0)'],
    [0.52,'rgba(255,255,255,0.10)'],
    [0.78,'rgba(255,255,255,0.18)'],
    [1,'rgba(0,0,0,0)']
  ]);

  // Carve out the center so the globe stays dark and the aura blooms outside it.
  g.globalCompositeOperation='destination-out';
  const carve = g.createRadialGradient(S/2,S/2,S*0.10, S/2,S/2,S*0.39);
  carve.addColorStop(0,'rgba(0,0,0,1)');
  carve.addColorStop(0.64,'rgba(0,0,0,0.96)');
  carve.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=carve; g.fillRect(0,0,S,S);

  const outerFade = g.createRadialGradient(S/2,S/2,S*0.42, S/2,S/2,S*0.55);
  outerFade.addColorStop(0,'rgba(0,0,0,0)');
  outerFade.addColorStop(1,'rgba(0,0,0,1)');
  g.fillStyle=outerFade; g.fillRect(0,0,S,S);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
const auraTex = makeAuraTexture();

// place the aura as a large billboarded plane behind the globe
const auraMat = new THREE.MeshBasicMaterial({
  map: auraTex, transparent:true, depthWrite:false,
  blending: THREE.AdditiveBlending, opacity: 0
});
const auraMesh = new THREE.Mesh(new THREE.PlaneGeometry(GLOBE_R*3.75, GLOBE_R*3.75), auraMat);
auraMesh.position.z = -1.4;
auraMesh.visible = false;
scene.add(auraMesh);

/* ---------------- stars + dust (foreground bokeh) ---------------- */
const starGeo = new THREE.BufferGeometry();
const starN = 2600;
const sP = new Float32Array(starN*3); const sC = new Float32Array(starN*3);
for (let i=0;i<starN;i++){
  const r=60+Math.random()*240, t=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
  sP[i*3]=r*Math.sin(ph)*Math.cos(t); sP[i*3+1]=r*Math.sin(ph)*Math.sin(t); sP[i*3+2]=r*Math.cos(ph);
  const k=Math.random();
  const c = k<.55?[1,.92,.96]:k<.85?[.7,.85,1]:[1,.6,.9];
  sC[i*3]=c[0]; sC[i*3+1]=c[1]; sC[i*3+2]=c[2];
}
starGeo.setAttribute('position', new THREE.BufferAttribute(sP,3));
starGeo.setAttribute('color', new THREE.BufferAttribute(sC,3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size:.9, sizeAttenuation:true, vertexColors:true, transparent:true, opacity:.9, depthWrite:false })));

// foreground bokeh — small drifting points in front of globe (like reference)
const fgGeo = new THREE.BufferGeometry();
const fgN = 260;
const fP = new Float32Array(fgN*3); const fS = new Float32Array(fgN);
for (let i=0;i<fgN;i++){
  fP[i*3]   = (Math.random()-.5)*30;
  fP[i*3+1] = (Math.random()-.5)*22;
  fP[i*3+2] = 4 + Math.random()*5; // in front of globe
  fS[i] = Math.random();
}
fgGeo.setAttribute('position', new THREE.BufferAttribute(fP,3));
fgGeo.setAttribute('seed', new THREE.BufferAttribute(fS,1));
const fgMat = new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  uniforms:{ uTime:{value:0}, uPx:{value:renderer.getPixelRatio()}, uCopyDim:{value:0} },
  vertexShader:`attribute float seed; varying float vSeed;
    uniform float uTime; uniform float uPx;
    void main(){ vSeed=seed; vec3 p=position;
      p.x += sin(uTime*0.2 + seed*40.0)*0.4;
      p.y += cos(uTime*0.18 + seed*30.0)*0.3;
      vec4 mv=modelViewMatrix*vec4(p,1.);
      gl_PointSize = (1.2 + seed*2.6) * uPx * (160.0/-mv.z);
      gl_Position = projectionMatrix*mv; }`,
  fragmentShader:`varying float vSeed; uniform float uCopyDim;
    void main(){ vec2 uv=gl_PointCoord-0.5; float d=length(uv); float a=smoothstep(0.5,0.,d);
      vec3 col = mix(vec3(1.,.7,.95), vec3(.85,.9,1.), vSeed);
      gl_FragColor = vec4(col, a * mix(0.24, 0.14, uCopyDim)); }`
});
const fgPts = new THREE.Points(fgGeo, fgMat); scene.add(fgPts);

/* ---------------- post processing ---------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.78, 0.82);
composer.addPass(bloom);
const fxaa = new ShaderPass(FXAAShader);
fxaa.material.uniforms.resolution.value.set(1/innerWidth, 1/innerHeight);
composer.addPass(fxaa);
const chroma = new ShaderPass({
  uniforms:{ tDiffuse:{value:null}, uAmount:{value:0.0} },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
    void main(){ vec2 d=vUv-0.5;
      float r=texture2D(tDiffuse, vUv+d*uAmount).r;
      float g=texture2D(tDiffuse, vUv).g;
      float b=texture2D(tDiffuse, vUv-d*uAmount).b;
      gl_FragColor=vec4(r,g,b,1.); }`
});
composer.addPass(chroma);

/* ---------------- resize ---------------- */
function resize(){
  const w=innerWidth, h=innerHeight;
  renderer.setSize(w,h); composer.setSize(w,h);
  camera.aspect=w/h; camera.updateProjectionMatrix();
  fxaa.material.uniforms.resolution.value.set(1/w,1/h);
  bloom.setSize(w,h);
}
addEventListener('resize', resize);

/* ---------------- scroll-driven story ---------------- */
const driver = document.getElementById('scroll-driver');
const firstFold = document.getElementById('gitex-first-fold');
const stories = [...document.querySelectorAll('.story')];
const railEls = [...document.querySelectorAll('#rail i')];
const $lat = document.getElementById('lat'), $lon=document.getElementById('lon');
const $prog = document.getElementById('prog'), $fr = document.getElementById('fr');
const $entryWhiteout = document.getElementById('entry-whiteout');
const hudEls = [...document.querySelectorAll('.hud.bl')];

const NUM_BEATS = stories.length; // 4
const getProgress = () => {
  const max = driver.offsetHeight - innerHeight;
  return Math.min(1, Math.max(0, scrollY / max));
};
const lerp = (a,b,t)=>a+(b-a)*t;
const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
const smooth = (e,e1,t)=>THREE.MathUtils.smoothstep(t,e,e1);

// Each beat occupies a window in [0,1]; show panel within its window with a soft fade.
function beatWindows(n){
  // small gap at start and end so first/last panel breathe
  const pad = 0.04;
  const span = (1 - pad*2) / n;
  return Array.from({length:n}, (_, i) => [pad + i*span, pad + (i+1)*span]);
}
const windows = beatWindows(NUM_BEATS);

let frame = 0;
const clock = new THREE.Clock();
const uaeScreenPoint = latLonToSphere(UAE_LAT, UAE_LON, GLOBE_R + 0.22);
const projectionPoint = new THREE.Vector3();

function getCopyVisibility(progress){
  const copyExit = 1 - smooth(0.62, 0.72, progress);
  let visibility = 0;
  for (let i = 0; i < NUM_BEATS - 1; i++) {
    const [a, b] = windows[i];
    const center = (a + b) / 2;
    const halfWin = (b - a) / 2;
    const dist = Math.abs(progress - center) / halfWin;
    const vis = clamp(1 - Math.pow(clamp(dist, 0, 1.4), 2.2), 0, 1);
    visibility = Math.max(visibility, vis * copyExit);
  }
  return visibility;
}

function updateEntryWhiteout(progress){
  const entryP = smooth(0.68, 0.9, progress);
  projectionPoint.copy(uaeScreenPoint);
  globe.localToWorld(projectionPoint);
  projectionPoint.project(camera);

  const sx = (projectionPoint.x * 0.5 + 0.5) * 100;
  const sy = (-projectionPoint.y * 0.5 + 0.5) * 100;
  const radius = lerp(0, 180, Math.pow(entryP, 1.32));
  const whiteOpacity = smooth(0.02, 0.9, entryP);

  $entryWhiteout.style.setProperty('--entry-x', `${sx.toFixed(2)}%`);
  $entryWhiteout.style.setProperty('--entry-y', `${sy.toFixed(2)}%`);
  $entryWhiteout.style.setProperty('--entry-r', `${radius.toFixed(2)}vmax`);
  const introFade = 1;
  $entryWhiteout.style.setProperty('--entry-opacity', (whiteOpacity * introFade).toFixed(3));
  $entryWhiteout.style.setProperty('--entry-solid', (smooth(0.58, 0.86, entryP) * introFade).toFixed(3));
  document.body.classList.toggle('entry-mode', entryP > 0.58);

  const hudOpacity = 1 - smooth(0.28, 0.72, entryP);
  hudEls.forEach(el => { el.style.opacity = String(hudOpacity); });
  stage.style.opacity = String((1 - smooth(0.52, 0.82, entryP)) * introFade);
}

function updatePostIntro(){
  document.body.classList.toggle('post-intro', scrollY >= driver.offsetHeight - innerHeight * 0.02);
}

function update(){
  const t = clock.getElapsedTime();
  frame++;
  tickTweens();

  const p = getProgress();
  updatePostIntro();

  // continuous slow rotation through the whole scroll, plus a gentle camera dolly + subtle orbit.
  const baseSpin = (reduceMotion?0:1) * (t*0.08 + p*Math.PI*1.85);
  globe.rotation.y = baseSpin;
  globe.rotation.x = Math.sin(p*Math.PI)*0.12;
  cobeScrollPhi = reduceMotion ? 0 : p * Math.PI * 2.4;

  // camera: stays back; small dolly forward in middle beats then settles for the hero
  const camZ = lerp(14, 11.2, smooth(0,0.6,p)) + Math.sin(t*0.2)*0.05;
  const camX = Math.sin(p*Math.PI*0.6)*1.3;     // gentle horizontal arc
  const camY = Math.sin(p*Math.PI)*0.4;
  camera.position.set(camX, camY, camZ);
  camera.lookAt(0, 0, 0);

  // FOV breathe
  camera.fov = 50 + Math.sin(t*0.25)*0.6;
  camera.updateProjectionMatrix();

  // aura always faces camera
  auraMesh.lookAt(camera.position);

  // bloom rises at the hero
  const heroP = smooth(windows[NUM_BEATS-1][0]-0.05, 1.0, p);
  const copyDim = getCopyVisibility(p);
  bloom.strength = lerp(0.26, 0.46, heroP) * (1 - copyDim * 0.18);
  chroma.uniforms.uAmount.value = lerp(0.0, 0.006, heroP);
  updateEntryWhiteout(p);

  // global elements time uniforms
  if (globePointMaterial?.userData.shader) {
    globePointMaterial.userData.shader.uniforms.uTime.value = t;
  }
  updateConvergence(p, t, copyDim);
  fgMat.uniforms.uTime.value = t;
  fgMat.uniforms.uCopyDim.value = copyDim;

  // HUD
  $lat.textContent = lerp(0, UAE_LAT, smooth(windows[NUM_BEATS-1][0], 1.0, p)).toFixed(3);
  $lon.textContent = lerp(0, UAE_LON, smooth(windows[NUM_BEATS-1][0], 1.0, p)).toFixed(3);
  $prog.textContent = String(Math.round(p*100)).padStart(3,'0') + '%';
  $fr.textContent = String(frame).padStart(4,'0');

  // story panels — opacity & translate by their windows
  let activeBeat = 0;
  const copyExit = 1 - smooth(0.62, 0.72, p);
  const entryLogo = smooth(0.80, 0.92, p);
  let copyVisibility = 0;
  stories.forEach((s, i) => {
    const [a,b] = windows[i];
    const center = (a+b)/2;
    const halfWin = (b-a)/2;
    // distance from center → 0 at center, 1 at edges
    const dist = Math.abs(p - center) / halfWin;
    // soft visibility curve: 1 at center, ~0 outside ±1
    const vis = clamp(1 - Math.pow(clamp(dist,0,1.4), 2.2), 0, 1);
    const dir = (p < center) ? 1 : -1;        // slide direction
    const ty  = (1 - vis) * 28 * dir;
    const panel = s.firstElementChild;
    if (i === NUM_BEATS - 1) {
      panel.style.opacity = String(Math.max(vis, entryLogo));
      panel.style.transform = `translateY(${(1 - Math.max(vis, entryLogo)) * 18}px)`;
    } else {
      const panelOpacity = vis * copyExit;
      copyVisibility = Math.max(copyVisibility, panelOpacity);
      panel.style.opacity = String(panelOpacity);
      panel.style.transform = `translateY(${ty}px)`;
    }
    s.dataset.active = vis > 0.18 ? '1' : '0';
    if (vis > 0.5) activeBeat = i;
  });
  document.body.classList.toggle('copy-active', copyVisibility > 0.18);
  railEls.forEach((el,i) => el.classList.toggle('on', i===activeBeat));

  composer.render();
  requestAnimationFrame(update);
}

if (reduceMotion) driver.style.height='240vh';

const $loading = document.getElementById('loading');
const $introScreen = document.getElementById('intro-screen');

let introAnimDone = false;
let globeReady = false;

function tryDismissIntro() {
  if (!introAnimDone || !globeReady) return;
  $introScreen.classList.add('fade-out');
  $introScreen.addEventListener('transitionend', () => $introScreen.remove(), { once: true });
}

// 0.1s delay + 2s animation + 0.5s hold = 2.6s before dismissing
setTimeout(() => { introAnimDone = true; tryDismissIntro(); }, 2600);

requestAnimationFrame(() => {
  setupGitexHeroVideo();
  setupGitexCountdown();
  setupCobeGlobe();
  loadSvgSource()
    .then(svgSource => {
      buildGlobeOfPoints(svgSource);
      $loading.classList.add('done');
      resize();
      update();
      globeReady = true;
      tryDismissIntro();
    })
    .catch(error => {
      console.error(error);
      $loading.textContent = 'earth map failed to load';
      globeReady = true;
      tryDismissIntro();
    });
});
