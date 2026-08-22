import * as THREE from "https://unpkg.com/three@0.162.0/build/three.module.js";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#scene");
const microphoneBtn = $("#microphoneBtn");
const deviceAudioBtn = $("#deviceAudioBtn");
const status = $("#status");
const statusText = $("#statusText");
const energyLabel = $("#energyLabel");
const meter = $("#meter");

for (let index = 0; index < 24; index += 1) meter.append(document.createElement("i"));
const meterBars = [...meter.children];

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a4861, 11, 30);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 80);
camera.position.set(5.8, 3.5, 10.5);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

scene.add(new THREE.HemisphereLight(0xb5fff0, 0x06314d, 3.1));
const sun = new THREE.DirectionalLight(0xfff0b0, 3.8);
sun.position.set(-5, 8, 7);
scene.add(sun);

const waveGeometry = new THREE.PlaneGeometry(18, 15, 100, 70);
waveGeometry.rotateX(-Math.PI / 2);
const original = Float32Array.from(waveGeometry.attributes.position.array);
const wave = new THREE.Mesh(waveGeometry, new THREE.MeshPhysicalMaterial({
  color: 0x10a89f, roughness: 0.25, metalness: 0.05, transmission: 0.05,
  clearcoat: 0.75, clearcoatRoughness: 0.18, side: THREE.DoubleSide,
}));
wave.position.set(2.2, -2.1, -1.5);
scene.add(wave);

const wire = new THREE.Mesh(waveGeometry, new THREE.MeshBasicMaterial({ color: 0x9affde, wireframe: true, transparent: true, opacity: 0.09 }));
wire.position.copy(wave.position);
wire.scale.setScalar(1.002);
scene.add(wire);

const board = new THREE.Group();
const boardShape = new THREE.CapsuleGeometry(0.24, 1.35, 10, 20);
boardShape.rotateZ(Math.PI / 2);
const deck = new THREE.Mesh(boardShape, new THREE.MeshStandardMaterial({ color: 0xffd94f, roughness: 0.38 }));
deck.scale.set(1, 0.18, 1.9);
board.add(deck);
const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: 0xff6c4e }));
stripe.position.y = 0.27;
board.add(stripe);
// A simple, toy-like rider gives the visualization its playful character.
const rider = new THREE.Group();
const skin = new THREE.MeshStandardMaterial({ color: 0xef9b68, roughness: 0.8 });
const suit = new THREE.MeshStandardMaterial({ color: 0x123b63, roughness: 0.7 });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.52, 6, 12), suit);
body.position.y = 0.62;
rider.add(body);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
head.position.y = 1.17;
rider.add(head);
const hair = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x35221c }));
hair.position.y = 1.23;
rider.add(hair);
for (const [x, rotation] of [[-0.36, -0.58], [0.36, 0.58]]) {
  const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.57, 4, 8), skin);
  limb.position.set(x, 0.72, 0);
  limb.rotation.z = rotation;
  rider.add(limb);
}
board.add(rider);
board.position.set(3.1, 0.5, 0.4);
board.rotation.set(-0.05, -0.3, -0.15);
scene.add(board);

const foam = new THREE.Group();
for (let i = 0; i < 65; i += 1) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025 + Math.random() * 0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xd9fff1, transparent: true, opacity: 0.35 + Math.random() * 0.55 }));
  dot.position.set(2 + Math.random() * 6, -0.1 + Math.random() * 2.7, -2 + Math.random() * 1.1);
  foam.add(dot);
}
scene.add(foam);

let audioContext;
let analyser;
let frequencyData;
let activeStream;
let activeType;
let smoothEnergy = 0;

function setStatus(message, isError = false) {
  statusText.textContent = message;
  status.classList.toggle("error", isError);
}

function stopStream() {
  activeStream?.getTracks().forEach((track) => track.stop());
  activeStream = undefined;
  analyser?.disconnect();
  analyser = undefined;
  activeType = undefined;
}

async function connectAudio(type) {
  const isMic = type === "microphone";
  microphoneBtn.disabled = deviceAudioBtn.disabled = true;
  setStatus(isMic ? "Waiting for microphone permission…" : "Choose a tab or screen and make sure audio sharing is on…");
  try {
    if (!isSecureContext) throw new Error("Audio access needs HTTPS or localhost.");
    if (!navigator.mediaDevices) throw new Error("Audio capture isn't supported by this browser.");
    const stream = isMic
      ? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
      : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("No audio was shared. Select a tab and enable ‘share audio’.");
    }
    stopStream();
    audioContext ||= new AudioContext();
    await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    activeStream = stream;
    activeType = type;
    microphoneBtn.classList.toggle("active", isMic);
    deviceAudioBtn.classList.toggle("active", !isMic);
    setStatus(`${isMic ? "Microphone" : "Device audio"} connected — your sound is shaping the swell`);
    stream.getTracks().forEach((track) => track.addEventListener("ended", () => {
      if (activeStream === stream) {
        stopStream();
        microphoneBtn.classList.remove("active");
        deviceAudioBtn.classList.remove("active");
        setStatus("Audio ended. Pick a source to ride again.");
      }
    }));
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Audio access was not granted. Please try again.", true);
  } finally {
    microphoneBtn.disabled = deviceAudioBtn.disabled = false;
  }
}

microphoneBtn.addEventListener("click", () => connectAudio("microphone"));
deviceAudioBtn.addEventListener("click", () => connectAudio("device"));

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();
  if (analyser) {
    analyser.getByteFrequencyData(frequencyData);
    const average = frequencyData.reduce((total, value) => total + value, 0) / frequencyData.length / 255;
    smoothEnergy += (average - smoothEnergy) * 0.14;
  } else {
    smoothEnergy += (0.055 - smoothEnergy) * 0.025;
  }
  const position = waveGeometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const p = i * 3;
    const x = original[p];
    const z = original[p + 2];
    const band = analyser ? frequencyData[i % frequencyData.length] / 255 : 0;
    const rolling = Math.sin(z * 1.05 + time * 1.45) * (0.34 + smoothEnergy * 1.8);
    const crest = Math.exp(-Math.pow(z + 1.3, 2) * 0.42) * (1.45 + smoothEnergy * 3.5);
    const texture = Math.sin(x * 1.7 + z * 1.25 + time * 2.1) * (0.08 + band * 0.2);
    position.array[p + 1] = original[p + 1] + rolling + crest + texture;
  }
  position.needsUpdate = true;
  if (Math.floor(time * 12) % 2 === 0) waveGeometry.computeVertexNormals();
  board.position.y = 0.1 + Math.sin(time * 1.45 - 1.2) * (0.25 + smoothEnergy) + smoothEnergy * 1.25;
  board.rotation.z = -0.12 + Math.sin(time * 1.45) * 0.12;
  board.rotation.x = -0.04 + Math.cos(time * 1.45) * 0.08;
  rider.rotation.z = Math.sin(time * 1.45 + 0.5) * 0.08;
  foam.rotation.y = Math.sin(time * 0.2) * 0.08;
  foam.children.forEach((dot, index) => { dot.position.y += Math.sin(time * 2 + index) * 0.0008; });
  const visibleBars = Math.round(smoothEnergy * meterBars.length * 2.3);
  meterBars.forEach((bar, index) => {
    const active = index <= Math.max(1, visibleBars);
    bar.style.height = active ? `${30 + Math.sin(time * 6 + index * 0.8) * 18 + index * 2.2}%` : "12%";
    bar.style.opacity = active ? "1" : ".2";
    bar.style.background = index > 17 ? "#f8d858" : "#70dfc0";
  });
  energyLabel.textContent = smoothEnergy > 0.32 ? "WILD" : smoothEnergy > 0.16 ? "RISING" : activeType ? "CRUISING" : "CALM";
  camera.position.y = 3.5 + Math.sin(time * 0.18) * 0.15;
  camera.lookAt(1.8, 0.2, -1);
  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
