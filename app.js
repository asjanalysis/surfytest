import * as THREE from "https://unpkg.com/three@0.162.0/build/three.module.js";

const canvas = document.querySelector("#scene");
const microphoneBtn = document.querySelector("#microphoneBtn");
const deviceAudioBtn = document.querySelector("#deviceAudioBtn");
const statusText = document.querySelector("#status");
const titleText = document.querySelector("#title");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x13062a, 0.028);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 4.1, 9.4);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;

scene.add(new THREE.AmbientLight(0x5a4ea8, 0.58));

const keyLight = new THREE.PointLight(0xff3fcb, 12, 38, 2);
keyLight.position.set(4, 6, 6);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x16f8ff, 12, 45, 2);
fillLight.position.set(-8, 2, -5);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x8d50ff, 10, 35, 2);
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
    color: 0x5f00de,
    wireframe: true,
    emissive: 0x4a1eff,
    emissiveIntensity: 2.4,
    metalness: 0.2,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
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
    color: 0x08e8ff,
    emissive: 0x1af7ff,
    emissiveIntensity: 2.2,
    transparent: true,
    opacity: 0.19,
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
    color: 0xff2db8,
    emissive: 0xff37c7,
    emissiveIntensity: 1.1,
    transparent: true,
    opacity: 0.12,
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

  color.setHSL(0.48 + Math.random() * 0.45, 0.92, 0.68);
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
let activeAudioStream;
let activeSourceNode;
let activeInputType;
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

const requestDeviceAudioStream = async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Display capture is not supported in this browser.");
  }

  return navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
};

const stopActiveStream = () => {
  if (activeSourceNode) {
    activeSourceNode.disconnect();
    activeSourceNode = undefined;
  }

  if (activeAudioStream) {
    activeAudioStream.getTracks().forEach((track) => track.stop());
    activeAudioStream = undefined;
  }
};

const setControlBusyState = (isBusy) => {
  microphoneBtn.disabled = isBusy;
  deviceAudioBtn.disabled = isBusy;
};

const setActiveButtonText = () => {
  microphoneBtn.textContent = activeInputType === "microphone" ? "Microphone Enabled" : "Enable Microphone";
  deviceAudioBtn.textContent = activeInputType === "device" ? "Device Audio Active" : "Capture Device Audio";
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

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const pulse = getAudioStrength();

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

    const hueSwing = Math.sin(t * 0.9 + radial * 1.3) * 0.08;
    const hue = (0.83 + hueSwing + freqBand * 0.16 + radial * 0.006) % 1;
    tempColor.setHSL(hue, 0.95, 0.57 + freqBand * 0.11);
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

  keyLight.intensity = 9 + pulse * 11;
  fillLight.intensity = 9 + pulse * 9;
  rimLight.intensity = 7 + pulse * 10;

  keyLight.color.setHSL((0.9 + Math.sin(t * 0.35) * 0.04 + pulse * 0.05) % 1, 0.86, 0.58);
  fillLight.color.setHSL((0.5 + Math.sin(t * 0.45 + 1.2) * 0.05 + pulse * 0.06) % 1, 0.92, 0.6);
  rimLight.color.setHSL((0.76 + Math.cos(t * 0.38 + 0.8) * 0.04 + pulse * 0.06) % 1, 0.88, 0.56);

  const textHue = (318 + Math.sin(t * 0.9) * 16 + pulse * 42 + 360) % 360;
  const accentHue = (188 + Math.cos(t * 1.05 + 0.7) * 22 + pulse * 52 + 360) % 360;
  titleText.style.color = `hsl(${textHue.toFixed(1)} 100% 74%)`;
  titleText.style.textShadow = `0 0 ${14 + pulse * 18}px hsl(${textHue.toFixed(1)} 100% 62% / 75%)`;
  statusText.style.color = `hsl(${accentHue.toFixed(1)} 95% 76%)`;

  microphoneBtn.style.boxShadow = activeInputType === "microphone" ? `0 0 ${14 + pulse * 26}px hsl(${accentHue.toFixed(1)} 95% 58% / 60%)` : "";
  deviceAudioBtn.style.boxShadow = activeInputType === "device" ? `0 0 ${14 + pulse * 26}px hsl(${accentHue.toFixed(1)} 95% 58% / 60%)` : "";

  const orbit = t * 0.18;
  camera.position.x = Math.sin(orbit) * 1.6;
  camera.position.z = 9 + Math.cos(orbit * 1.1) * 0.55;
  camera.position.y = 4.1 + pulse * 1.3 + Math.sin(t * 0.55) * 0.25;
  camera.lookAt(0, 0.5, 0);

  renderer.render(scene, camera);
}

animate();

async function setupAudioSource(type) {
  const isMicrophone = type === "microphone";

  setControlBusyState(true);
  statusText.textContent = isMicrophone ? "Requesting microphone permission…" : "Select a screen/tab and enable audio sharing…";

  try {
    if (!window.isSecureContext) {
      throw new Error("Audio capture requires HTTPS (or localhost). Open this page from a secure origin.");
    }

    const stream = isMicrophone ? await requestMicrophoneStream() : await requestDeviceAudioStream();

    if (!AudioContextClass) {
      throw new Error("Web Audio API is unavailable in this browser.");
    }

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (!isMicrophone && !stream.getAudioTracks().length) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("No audio track was shared.");
    }

    stopActiveStream();

    activeAudioStream = stream;
    activeInputType = type;
    setActiveButtonText();

    activeSourceNode = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.78;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    activeSourceNode.connect(analyser);

    const activeLabel = isMicrophone ? "Microphone" : "Device audio";
    statusText.textContent = `${activeLabel} active. Sound now drives the aurora wave and text glow.`;

    stream.getTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (activeAudioStream === stream) {
          stopActiveStream();
          activeInputType = undefined;
          setActiveButtonText();
          statusText.textContent = `${activeLabel} capture ended. Choose an input to start again.`;
        }
      });
    });
  } catch (error) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const iosHint = isIOS ? " On iPhone, use Safari and verify audio permissions for this site." : "";
    const modeHint = isMicrophone
      ? "Please allow microphone access and try again."
      : "Share a tab/screen with audio enabled, then try again.";

    statusText.textContent = `${isMicrophone ? "Microphone" : "Device audio"} unavailable. ${modeHint}${iosHint}`;
    console.error(`${isMicrophone ? "Microphone" : "Device audio"} setup failed`, error);
  } finally {
    setControlBusyState(false);
    setActiveButtonText();
  }
}

microphoneBtn.addEventListener("click", () => {
  setupAudioSource("microphone");
});

deviceAudioBtn.addEventListener("click", () => {
  setupAudioSource("device");
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
