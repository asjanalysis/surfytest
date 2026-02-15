import * as THREE from "https://unpkg.com/three@0.162.0/build/three.module.js";

const canvas = document.querySelector("#scene");
const startBtn = document.querySelector("#startBtn");
const statusText = document.querySelector("#status");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x080013, 0.04);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 4.3, 9.6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.add(new THREE.AmbientLight(0x335577, 0.5));
const magentaLight = new THREE.PointLight(0xff38d5, 8, 30, 2);
magentaLight.position.set(0, 6, 5);
scene.add(magentaLight);

const cyanLight = new THREE.PointLight(0x1ae7ff, 10, 35, 2);
cyanLight.position.set(-8, 1, -4);
scene.add(cyanLight);

const waveGeometry = new THREE.PlaneGeometry(14, 14, 160, 160);
waveGeometry.rotateX(-Math.PI / 2.8);
const basePositions = waveGeometry.attributes.position.array.slice();

const colors = new Float32Array(waveGeometry.attributes.position.count * 3);
waveGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const waveMaterial = new THREE.MeshStandardMaterial({
  color: 0x4700b6,
  wireframe: true,
  emissive: 0x3f24ff,
  emissiveIntensity: 2,
  metalness: 0.15,
  roughness: 0.4,
  vertexColors: true,
  transparent: true,
  opacity: 0.9,
});

const wave = new THREE.Mesh(waveGeometry, waveMaterial);
wave.position.y = -1.1;
scene.add(wave);

const glowWave = new THREE.Mesh(
  waveGeometry.clone(),
  new THREE.MeshStandardMaterial({
    color: 0x20a4ff,
    emissive: 0x12daff,
    emissiveIntensity: 1.4,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
  }),
);
glowWave.position.copy(wave.position);
glowWave.scale.set(1.01, 1.01, 1.01);
scene.add(glowWave);

const starsGeometry = new THREE.BufferGeometry();
const starCount = 700;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i += 1) {
  starPositions[i * 3] = (Math.random() - 0.5) * 40;
  starPositions[i * 3 + 1] = Math.random() * 18 - 4;
  starPositions[i * 3 + 2] = (Math.random() - 0.5) * 45;
}
starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));

const stars = new THREE.Points(
  starsGeometry,
  new THREE.PointsMaterial({
    color: 0x84f4ff,
    size: 0.08,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
scene.add(stars);

let analyser;
let frequencyData;
let audioContext;

const getAudioStrength = () => {
  if (!analyser || !frequencyData) {
    return 0;
  }

  analyser.getByteFrequencyData(frequencyData);
  let sum = 0;
  for (let i = 0; i < frequencyData.length; i += 1) {
    sum += frequencyData[i];
  }

  return sum / frequencyData.length / 255;
};

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const pulse = getAudioStrength();

  const position = wave.geometry.attributes.position;
  const glowPosition = glowWave.geometry.attributes.position;
  const colorAttribute = wave.geometry.attributes.color;

  for (let i = 0; i < position.count; i += 1) {
    const i3 = i * 3;
    const x = basePositions[i3];
    const y = basePositions[i3 + 1];

    const radial = Math.sqrt(x * x + y * y);
    const freqBand = frequencyData ? frequencyData[i % frequencyData.length] / 255 : 0;
    const sine = Math.sin(x * 1.8 + t * 2.9) + Math.cos(y * 1.25 - t * 2.1);
    const bump = Math.sin(radial * 2.8 - t * 4.2) * (0.6 + pulse * 2.1);
    const z = sine * 0.28 + bump + freqBand * 2.2;

    position.array[i3 + 2] = basePositions[i3 + 2] + z;
    glowPosition.array[i3 + 2] = basePositions[i3 + 2] + z * 1.03;

    const hue = (0.58 + freqBand * 0.55 + Math.sin(t + radial) * 0.07) % 1;
    const col = new THREE.Color().setHSL(hue, 0.9, 0.55 + freqBand * 0.1);
    colorAttribute.array[i3] = col.r;
    colorAttribute.array[i3 + 1] = col.g;
    colorAttribute.array[i3 + 2] = col.b;
  }

  position.needsUpdate = true;
  glowPosition.needsUpdate = true;
  colorAttribute.needsUpdate = true;
  wave.geometry.computeVertexNormals();
  glowWave.geometry.computeVertexNormals();

  stars.rotation.y += 0.0007 + pulse * 0.004;
  stars.position.y = Math.sin(t * 0.45) * 0.3;

  magentaLight.intensity = 7 + pulse * 9;
  cyanLight.intensity = 8 + pulse * 8;
  camera.position.z = 9 + Math.sin(t * 0.8) * 0.5;
  camera.position.y = 4.2 + pulse * 1.2;

  renderer.render(scene, camera);
}

animate();

async function setupMicrophone() {
  startBtn.disabled = true;
  statusText.textContent = "Requesting microphone permission…";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.78;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);

    source.connect(analyser);

    statusText.textContent = "Microphone active. Make some noise!";
    startBtn.textContent = "Microphone Enabled";
  } catch (error) {
    statusText.textContent = "Microphone unavailable. Please allow access and refresh.";
    startBtn.textContent = "Retry Microphone";
    startBtn.disabled = false;
    console.error("Microphone setup failed", error);
  }
}

startBtn.addEventListener("click", () => {
  setupMicrophone();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
