import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const FILES = 'abcdefgh';
const SQUARE_SIZE = 1;
const PIECE_BASE_Y = 0.42;
const LIGHT_SQUARE = 0xece2d0;
const DARK_SQUARE = 0x101d2b;

function squareToWorld(square) {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return new THREE.Vector3((file - 3.5) * SQUARE_SIZE, 0, (3.5 - rank) * SQUARE_SIZE);
}

function buildMarbleTexture(base, veins) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, `#${base.toString(16).padStart(6, '0')}`);
  gradient.addColorStop(1, '#f7f0e4');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 150; i += 1) {
    ctx.strokeStyle = `rgba(${veins[0]}, ${veins[1]}, ${veins[2]}, ${0.05 + Math.random() * 0.18})`;
    ctx.lineWidth = 1 + Math.random() * 5;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 512, Math.random() * 512);
    for (let step = 0; step < 5; step += 1) {
      ctx.bezierCurveTo(
        Math.random() * 512,
        Math.random() * 512,
        Math.random() * 512,
        Math.random() * 512,
        Math.random() * 512,
        Math.random() * 512,
      );
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.4, 1.4);
  texture.anisotropy = 8;
  return texture;
}

function createPieceMaterials() {
  return {
    white: new THREE.MeshPhysicalMaterial({
      color: 0xe6ded1,
      map: buildMarbleTexture(0xd9c9ad, [108, 82, 63]),
      roughness: 0.48,
      metalness: 0.04,
      clearcoat: 0.46,
      clearcoatRoughness: 0.34,
    }),
    black: new THREE.MeshPhysicalMaterial({
      color: 0x132534,
      roughness: 0.12,
      metalness: 0.02,
      transparent: true,
      opacity: 0.98,
      transmission: 0.58,
      thickness: 0.92,
      ior: 1.3,
      attenuationDistance: 2.2,
      attenuationColor: new THREE.Color(0x66bfdc),
      emissive: new THREE.Color(0x0a1822),
      emissiveIntensity: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xbca070,
      roughness: 0.28,
      metalness: 0.9,
    }),
  };
}

function lathe(profile) {
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 32);
}

function pieceStem(material) {
  const mesh = new THREE.Mesh(
    lathe([
      [0.18, 0],
      [0.32, 0.08],
      [0.28, 0.26],
      [0.18, 0.46],
      [0.24, 0.76],
      [0.14, 1.02],
      [0.22, 1.2],
      [0.26, 1.3],
      [0.1, 1.45],
      [0.18, 1.54],
    ]),
    material.clone(),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createPiece(type, color, materials) {
  const group = new THREE.Group();
  const bodyMaterial = color === 'w' ? materials.white : materials.black;
  const stem = pieceStem(bodyMaterial);
  group.add(stem);

  const addMesh = (geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, material.clone ? material.clone() : material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  if (type === 'p') {
    addMesh(new THREE.SphereGeometry(0.22, 24, 24), bodyMaterial, [0, 1.72, 0]);
  }

  if (type === 'r') {
    addMesh(new THREE.CylinderGeometry(0.3, 0.34, 0.2, 32), bodyMaterial, [0, 1.74, 0]);
    for (let i = 0; i < 4; i += 1) {
      addMesh(
        new THREE.BoxGeometry(0.11, 0.14, 0.18),
        bodyMaterial,
        [Math.sin((Math.PI / 2) * i) * 0.24, 1.86, Math.cos((Math.PI / 2) * i) * 0.24],
      );
    }
  }

  if (type === 'n') {
    addMesh(new THREE.CapsuleGeometry(0.15, 0.56, 4, 14), bodyMaterial, [0, 1.62, -0.02], [1, 1, 0.75], [0.2, 0, 0.2]);
    addMesh(new THREE.BoxGeometry(0.25, 0.54, 0.18), bodyMaterial, [0.1, 1.98, -0.02], [1, 1, 1], [0.12, 0, -0.16]);
    addMesh(new THREE.ConeGeometry(0.08, 0.26, 5), materials.gold, [0.18, 2.26, -0.02], [1, 1, 1], [0.1, 0, -0.4]);
  }

  if (type === 'b') {
    addMesh(new THREE.SphereGeometry(0.2, 24, 24), bodyMaterial, [0, 1.64, 0]);
    addMesh(new THREE.ConeGeometry(0.14, 0.42, 20), bodyMaterial, [0, 1.98, 0]);
    addMesh(new THREE.TorusGeometry(0.1, 0.03, 14, 48), materials.gold, [0, 1.82, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  }

  if (type === 'q') {
    addMesh(new THREE.SphereGeometry(0.18, 24, 24), bodyMaterial, [0, 1.58, 0]);
    addMesh(new THREE.CylinderGeometry(0.08, 0.28, 0.55, 24), bodyMaterial, [0, 2.02, 0]);
    for (let i = 0; i < 5; i += 1) {
      addMesh(
        new THREE.SphereGeometry(0.07, 20, 20),
        materials.gold,
        [Math.sin((Math.PI * 2 * i) / 5) * 0.18, 2.34, Math.cos((Math.PI * 2 * i) / 5) * 0.18],
      );
    }
    addMesh(new THREE.SphereGeometry(0.09, 20, 20), materials.gold, [0, 2.42, 0]);
  }

  if (type === 'k') {
    addMesh(new THREE.CylinderGeometry(0.12, 0.28, 0.62, 24), bodyMaterial, [0, 2.06, 0]);
    addMesh(new THREE.BoxGeometry(0.09, 0.46, 0.09), materials.gold, [0, 2.48, 0]);
    addMesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), materials.gold, [0, 2.56, 0]);
  }

  group.position.y = PIECE_BASE_Y;
  return group;
}

export class BoardScene {
  constructor(canvas, { onSquareClick }) {
    this.canvas = canvas;
    this.onSquareClick = onSquareClick;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x071018);
    this.scene.fog = new THREE.FogExp2(0x071018, 0.05);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.66;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(canvas.clientWidth, canvas.clientHeight), 0.05, 0.22, 1.02));
    this.timer = new THREE.Timer();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.cameraAngle = 0;
    this.targetCameraAngle = 0;
    this.squareMeshes = new Map();
    this.pieceLayer = new THREE.Group();
    this.highlights = [];
    this.animations = [];
    this.pendingBoard = null;
    this.idleResolvers = [];
    this.materials = createPieceMaterials();
    this.buildEnvironment();
    this.bindEvents();
    this.renderLoop();
  }

  buildEnvironment() {
    const pedestalMaterial = new THREE.MeshStandardMaterial({
      color: 0x171e29,
      roughness: 0.4,
      metalness: 0.55,
    });
    const base = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.42, 9.8), pedestalMaterial);
    base.position.y = -0.2;
    base.receiveShadow = true;
    this.scene.add(base);

    const cloth = new THREE.Mesh(
      new THREE.CylinderGeometry(6.6, 7.3, 0.1, 72),
      new THREE.MeshStandardMaterial({ color: 0x111925, roughness: 0.9 }),
    );
    cloth.position.y = -0.38;
    cloth.receiveShadow = true;
    this.scene.add(cloth);

    const boardTop = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.22, 8.6),
      new THREE.MeshPhysicalMaterial({
        color: 0xf6efe3,
        map: buildMarbleTexture(0xc6b090, [123, 97, 69]),
        roughness: 0.4,
        clearcoat: 0.6,
      }),
    );
    boardTop.position.y = 0.12;
    boardTop.receiveShadow = true;
    this.scene.add(boardTop);

    const lightMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe1d5c0,
      map: buildMarbleTexture(0xdcccb2, [118, 95, 68]),
      roughness: 0.44,
      clearcoat: 0.42,
      clearcoatRoughness: 0.3,
    });
    const darkMaterial = new THREE.MeshPhysicalMaterial({
      color: DARK_SQUARE,
      roughness: 0.08,
      metalness: 0.02,
      transmission: 0.75,
      opacity: 0.92,
      transparent: true,
      thickness: 0.8,
      attenuationColor: new THREE.Color(0x3f86b3),
      attenuationDistance: 1.6,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    });

    for (let rank = 1; rank <= 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const square = `${FILES[file]}${rank}`;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.96, 0.08, 0.96),
          (file + rank) % 2 === 0 ? lightMaterial : darkMaterial,
        );
        mesh.position.copy(squareToWorld(square));
        mesh.position.y = 0.28;
        mesh.receiveShadow = true;
        mesh.userData.square = square;
        this.squareMeshes.set(square, mesh);
        this.scene.add(mesh);
      }
    }

    this.scene.add(this.pieceLayer);

    const keyLight = new THREE.SpotLight(0xfef4de, 138, 38, Math.PI / 4.8, 0.4, 1.05);
    keyLight.position.set(6.1, 10.4, 6.8);
    keyLight.castShadow = true;
    keyLight.shadow.blurSamples = 25;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.target.position.set(0, 0.9, 0);
    this.scene.add(keyLight);
    this.scene.add(keyLight.target);

    const counterKey = new THREE.SpotLight(0x9bd8ff, 96, 36, Math.PI / 4.8, 0.48, 1.05);
    counterKey.position.set(-6, 9.2, -6.6);
    counterKey.target.position.set(0, 0.85, 0);
    this.scene.add(counterKey);
    this.scene.add(counterKey.target);

    const fillLight = new THREE.PointLight(0x7ad9ff, 32, 24, 2);
    fillLight.position.set(-4.2, 4.8, 4.8);
    this.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xffc780, 22, 28, 2);
    rimLight.position.set(0, 4.2, 8.8);
    this.scene.add(rimLight);

    this.scene.add(new THREE.HemisphereLight(0xadcfe4, 0x061119, 0.62));
    this.scene.add(new THREE.AmbientLight(0x7da7be, 0.18));

    const mist = new THREE.Mesh(
      new THREE.SphereGeometry(18, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x0b1823, side: THREE.BackSide }),
    );
    this.scene.add(mist);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('pointerup', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects([...this.squareMeshes.values()])[0];
      if (hit) this.onSquareClick(hit.object.userData.square);
    });
  }

  resize() {
    const { clientWidth, clientHeight } = this.canvas;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.composer.setSize(clientWidth, clientHeight);
  }

  flipCamera() {
    this.targetCameraAngle += Math.PI;
  }

  setHighlights({ selectedSquare, legalTargets, lastMove }) {
    this.highlights.forEach((mesh) => this.scene.remove(mesh));
    this.highlights = [];
    const addHighlight = (square, color, height = 0.33, scale = 0.34) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(scale, scale, 0.03, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
      );
      mesh.position.copy(squareToWorld(square));
      mesh.position.y = height;
      this.highlights.push(mesh);
      this.scene.add(mesh);
    };

    if (lastMove) {
      addHighlight(lastMove.from, 0xffd27d, 0.31, 0.22);
      addHighlight(lastMove.to, 0xffd27d, 0.31, 0.22);
    }
    legalTargets.forEach((square) => addHighlight(square, 0x7be8ff));
    if (selectedSquare) addHighlight(selectedSquare, 0xf8fbff, 0.34, 0.42);
  }

  renderPieces(board) {
    this.pieceLayer.clear();
    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        const piece = board[row][col];
        if (!piece) continue;
        const square = `${FILES[col]}${8 - row}`;
        const pieceMesh = createPiece(piece.type, piece.color, this.materials);
        pieceMesh.position.add(squareToWorld(square));
        pieceMesh.userData.square = square;
        this.pieceLayer.add(pieceMesh);
      }
    }
  }

  syncBoard(board) {
    if (this.animations.length) {
      this.pendingBoard = board;
      return;
    }
    this.renderPieces(board);
    this.resolveIdle();
  }

  animateMove(move, nextBoard) {
    if (!move) return this.syncBoard(nextBoard);
    const findPiece = (square) => this.pieceLayer.children.find((mesh) => mesh.userData.square === square);
    const mover = findPiece(move.from);
    const captureSquare = move.flags.includes('e') ? `${move.to[0]}${move.from[1]}` : move.to;
    const captured = move.flags.includes('c') || move.flags.includes('e') ? findPiece(captureSquare) : null;

    if (captured) {
      this.animations.push({
        mesh: captured,
        type: 'capture',
        elapsed: 0,
        duration: 0.22,
        from: captured.position.clone(),
      });
    }

    if (mover) {
      this.animations.push({
        mesh: mover,
        type: 'move',
        elapsed: 0,
        duration: 0.38,
        from: mover.position.clone(),
        to: squareToWorld(move.to).add(new THREE.Vector3(0, PIECE_BASE_Y, 0)),
      });
      mover.userData.square = move.to;
    }

    if (move.flags.includes('k') || move.flags.includes('q')) {
      const rookFrom = move.flags.includes('k') ? `h${move.color === 'w' ? '1' : '8'}` : `a${move.color === 'w' ? '1' : '8'}`;
      const rookTo = move.flags.includes('k') ? `f${move.color === 'w' ? '1' : '8'}` : `d${move.color === 'w' ? '1' : '8'}`;
      const rook = findPiece(rookFrom);
      if (rook) {
        this.animations.push({
          mesh: rook,
          type: 'move',
          elapsed: 0,
          duration: 0.34,
          from: rook.position.clone(),
          to: squareToWorld(rookTo).add(new THREE.Vector3(0, PIECE_BASE_Y, 0)),
        });
        rook.userData.square = rookTo;
      }
    }

    this.pendingBoard = nextBoard;
  }

  getSquareScreenPoint(square) {
    const point = squareToWorld(square).add(new THREE.Vector3(0, 0.35, 0)).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((point.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - point.y) / 2) * rect.height,
    };
  }

  updateAnimations(delta) {
    this.animations = this.animations.filter((animation) => {
      animation.elapsed += delta;
      const progress = Math.min(animation.elapsed / animation.duration, 1);
      if (animation.type === 'move') {
        animation.mesh.position.lerpVectors(animation.from, animation.to, progress);
        animation.mesh.position.y += Math.sin(progress * Math.PI) * 0.34;
      }
      if (animation.type === 'capture') {
        animation.mesh.position.y = animation.from.y - progress * 0.7;
        animation.mesh.scale.setScalar(1 - progress * 0.82);
      }
      if (progress < 1) return true;
      if (animation.type === 'capture') animation.mesh.visible = false;
      return false;
    });

    if (!this.animations.length && this.pendingBoard) {
      this.renderPieces(this.pendingBoard);
      this.pendingBoard = null;
      this.resolveIdle();
    }

    if (!this.animations.length && !this.pendingBoard) {
      this.resolveIdle();
    }
  }

  waitForIdle() {
    if (!this.animations.length && !this.pendingBoard) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  resolveIdle() {
    if (this.animations.length || this.pendingBoard || !this.idleResolvers.length) return;
    const resolvers = this.idleResolvers.splice(0, this.idleResolvers.length);
    resolvers.forEach((resolve) => resolve());
  }

  positionCamera(delta) {
    this.cameraAngle += (this.targetCameraAngle - this.cameraAngle) * Math.min(1, delta * 4.2);
    this.camera.position.set(Math.sin(this.cameraAngle) * 7.9, 7.5, Math.cos(this.cameraAngle) * 9.1);
    this.camera.lookAt(0, 0.95, 0);
  }

  renderLoop() {
    const tick = () => {
      this.timer.update();
      const delta = this.timer.getDelta();
      this.resize();
      this.updateAnimations(delta);
      this.positionCamera(delta);
      this.composer.render();
      requestAnimationFrame(tick);
    };
    tick();
  }
}
