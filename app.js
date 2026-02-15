import * as THREE from "https://unpkg.com/three@0.162.0/build/three.module.js";

const canvas = document.querySelector("#scene");
const startBtn = document.querySelector("#startBtn");
const statusText = document.querySelector("#status");

const keyboardKeys = Array.from(document.querySelectorAll(".key"));
const keyboardState = keyboardKeys.map(() => ({ glow: 0.25 }));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04000f, 0.03);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 4.1, 9.4);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

scene.add(new THREE.AmbientLight(0x3b4f8a, 0.52));

const keyLight = new THREE.PointLight(0xff4de5, 10, 38, 2);
keyLight.position.set(4, 6, 6);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x23f2ff, 11, 45, 2);
fillLight.position.set(-8, 2, -5);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x8448ff, 9, 35, 2);
rimLight.position.set(0, -1, 8);
scene.add(rimLight);

const createWaveGeometry = () => {
  const geometry = new THREE.PlaneGeometry(14, 14, 180, 180);
  geometry.rotateX(-Math.PI / 2.9);
  return geometry;
};

const mainGeometry = createWaveGeometry();
const basePositions = Float32Array.from(mainGeometry.attributes.position.array);
const colors = new Float32Array(mainGeometry.attributes.position.count * 3);
mainGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const mainWave = new THREE.Mesh(
  mainGeometry,
  new THREE.MeshPhysicalMaterial({
    color: 0x4700b6,
    wireframe: true,
    emissive: 0x3117ff,
    emissiveIntensity: 2.3,
    metalness: 0.25,
    roughness: 0.27,
    clearcoat: 1,
    clearcoatRoughness: 0.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
  }),
);
mainWave.position.y = -1.1;
scene.add(mainWave);

const glowWave = new THREE.Mesh(
  createWaveGeometry(),
  new THREE.MeshStandardMaterial({
    color: 0x1fd8ff,
    emissive: 0x19e2ff,
    emissiveIntensity: 2,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }),
);
glowWave.position.copy(mainWave.position);
glowWave.scale.set(1.015, 1.015, 1.015);
scene.add(glowWave);

const veilWave = new THREE.Mesh(
  createWaveGeometry(),
  new THREE.MeshStandardMaterial({
    color: 0xff40cc,
    emissive: 0xff4ad8,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.11,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }),
);
veilWave.position.copy(mainWave.position);
veilWave.scale.set(0.99, 0.99, 0.99);
scene.add(veilWave);

const starsGeometry = new THREE.BufferGeometry();
const starCount = 1300;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
const color = new THREE.Color();

for (let i = 0; i < starCount; i += 1) {
  const i3 = i * 3;
  const spread = 48;
  const ySpread = 24;
  starPositions[i3] = (Math.random() - 0.5) * spread;
  starPositions[i3 + 1] = Math.random() * ySpread - 6;
  starPositions[i3 + 2] = (Math.random() - 0.5) * spread;

  color.setHSL(0.5 + Math.random() * 0.35, 0.9, 0.66);
  starColors[i3] = color.r;
  starColors[i3 + 1] = color.g;
  starColors[i3 + 2] = color.b;
}

starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
starsGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

const stars = new THREE.Points(
  starsGeometry,
  new THREE.PointsMaterial({
    size: 0.07,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  }),
);
scene.add(stars);

let analyser;
let frequencyData;
let audioContext;
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

const legacyGetUserMedia = (constraints) =>
  new Promise((resolve, reject) => {
    const getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

    if (!getUserMedia) {
      reject(new Error("getUserMedia is not supported in this browser."));
      return;
    }

    getUserMedia.call(navigator, constraints, resolve, reject);
  });

const requestMicrophoneStream = async () => {
  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  };

  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  return legacyGetUserMedia(constraints);
};

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
const tempColor = new THREE.Color();

function updateKeyboard(t, pulse) {
  if (!keyboardKeys.length) {
    return;
  }

  for (let i = 0; i < keyboardKeys.length; i += 1) {
    const freqBand = frequencyData ? frequencyData[(i * 7) % frequencyData.length] / 255 : 0;
    const shimmer = (Math.sin(t * 2.4 + i * 0.55) + 1) * 0.5;
    const intensity = Math.min(1, freqBand * 1.25 + pulse * 0.55 + shimmer * 0.35);

    const state = keyboardState[i];
    state.glow += (intensity - state.glow) * 0.24;

    const hue = (0.56 + t * 0.18 + i * 0.032 + state.glow * 0.2) % 1;
    const lightness = 42 + state.glow * 35;

    const key = keyboardKeys[i];
    key.style.setProperty("--key-h", hue.toFixed(3));
    key.style.setProperty("--key-l", `${lightness.toFixed(1)}%`);
    key.style.setProperty("--key-glow", state.glow.toFixed(3));
  }
}

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const pulse = getAudioStrength();
  updateKeyboard(t, pulse);

  const mainPosition = mainWave.geometry.attributes.position;
  const glowPosition = glowWave.geometry.attributes.position;
  const veilPosition = veilWave.geometry.attributes.position;
  const colorAttribute = mainWave.geometry.attributes.color;

  for (let i = 0; i < mainPosition.count; i += 1) {
    const i3 = i * 3;
    const x = basePositions[i3];
    const y = basePositions[i3 + 1];

    const radial = Math.sqrt(x * x + y * y);
    const freqBand = frequencyData ? frequencyData[i % frequencyData.length] / 255 : 0;

    const flowA = Math.sin(x * 1.55 + t * 2.8 + y * 0.4);
    const flowB = Math.cos(y * 1.65 - t * 2.2 - x * 0.32);
    const whirl = Math.sin(radial * 3.4 - t * 3.6 + Math.atan2(y, x) * 1.8);
    const undulation = (flowA * 0.36 + flowB * 0.28 + whirl * 0.42) * (1 + pulse * 1.9);
    const z = undulation + freqBand * 2.6;

    mainPosition.array[i3 + 2] = basePositions[i3 + 2] + z;
    glowPosition.array[i3 + 2] = basePositions[i3 + 2] + z * 1.08 + Math.sin(t * 4 + radial) * 0.06;
    veilPosition.array[i3 + 2] = basePositions[i3 + 2] + z * 0.85 - Math.cos(t * 3.2 + radial * 1.2) * 0.08;

    const hue = (0.56 + radial * 0.018 + freqBand * 0.38 + Math.sin(t * 0.9 + radial) * 0.12) % 1;
    tempColor.setHSL(hue, 0.95, 0.55 + freqBand * 0.12);
    colorAttribute.array[i3] = tempColor.r;
    colorAttribute.array[i3 + 1] = tempColor.g;
    colorAttribute.array[i3 + 2] = tempColor.b;
  }

  mainPosition.needsUpdate = true;
  glowPosition.needsUpdate = true;
  veilPosition.needsUpdate = true;
  colorAttribute.needsUpdate = true;
  mainWave.geometry.computeVertexNormals();
  glowWave.geometry.computeVertexNormals();
  veilWave.geometry.computeVertexNormals();

  stars.rotation.y += 0.0011 + pulse * 0.005;
  stars.rotation.x = Math.sin(t * 0.2) * 0.06;
  stars.position.y = Math.sin(t * 0.5) * 0.42;

  keyLight.intensity = 8 + pulse * 10;
  fillLight.intensity = 8.5 + pulse * 8;
  rimLight.intensity = 6 + pulse * 9;

  keyLight.color.setHSL((0.89 + t * 0.06) % 1, 0.85, 0.58);
  fillLight.color.setHSL((0.52 + t * 0.09) % 1, 0.9, 0.6);
  rimLight.color.setHSL((0.74 + t * 0.08) % 1, 0.85, 0.56);

  const orbit = t * 0.18;
  camera.position.x = Math.sin(orbit) * 1.6;
  camera.position.z = 9 + Math.cos(orbit * 1.1) * 0.55;
  camera.position.y = 4.1 + pulse * 1.3 + Math.sin(t * 0.55) * 0.25;
  camera.lookAt(0, 0.5, 0);

  renderer.render(scene, camera);
}

animate();

async function setupMicrophone() {
  startBtn.disabled = true;
  statusText.textContent = "Requesting microphone permission…";

  try {
    if (!window.isSecureContext) {
      throw new Error("Microphone access requires HTTPS (or localhost). Open this page from a secure origin.");
    }

    const stream = await requestMicrophoneStream();
    if (!AudioContextClass) {
      throw new Error("Web Audio API is unavailable in this browser.");
    }

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(stream);

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.78;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);

    source.connect(analyser);

    statusText.textContent = "Microphone active. Make some noise and watch the RGB keyboard react.";
    startBtn.textContent = "Microphone Enabled";
  } catch (error) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const iosHint = isIOS ? " On iPhone, use Safari and ensure microphone permission is enabled for this site." : "";

    statusText.textContent = `Microphone unavailable. Please allow access and reload.${iosHint}`;
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
