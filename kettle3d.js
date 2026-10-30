/* Kettle in 3D for the Teneo site.
   Proportions and colors are matched to the RealityKit renders (front render measured at 512 px, 100 px = 1 unit).
   Behaviour: breathes, blinks and glances on random timing; body and eyes follow the pointer with critically damped springs;
   a tap makes him crouch, hop with happy eyes and arms up. Pauses when off screen. Reduce Motion renders one still frame. */
(function () {
  const host = document.getElementById('kettle3d');
  if (!host || !window.THREE) return;
  const THREE = window.THREE;
  const stage = document.getElementById('stage');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;  // treat hex colors as sRGB
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(0, 0.85, 13);
  camera.lookAt(0, 0.85, 0);

  // Light: soft sky fill, a warm key from the upper left (where the renders' highlights sit), a cool rim.
  scene.add(new THREE.HemisphereLight(0xf4f6fa, 0x3a3f48, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.25); key.position.set(-4, 6, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd2ff, 0.55); rim.position.set(5, 2, -4); scene.add(rim);
  const fill = new THREE.PointLight(0xffffff, 0.35, 30); fill.position.set(3, -2, 6); scene.add(fill);

  // Environment for glossy reflections, built in code (no files).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envGeo = new THREE.SphereGeometry(10, 32, 16);
  const envMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float t = clamp(vP.y*0.5+0.5,0.0,1.0); vec3 c = mix(vec3(0.05,0.055,0.07), vec3(0.95,0.96,0.98), smoothstep(0.35,1.0,t)); float spot = pow(max(dot(vP, normalize(vec3(-0.5,0.7,0.6))),0.0), 40.0); c += vec3(2.2)*spot; gl_FragColor = vec4(c,1.0); }'
  });
  envScene.add(new THREE.Mesh(envGeo, envMat));
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;

  const mat = (color, opts) => new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.32, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.18, envMapIntensity: 0.32 }, opts || {}));
  const cream = mat(0xd9d0c1);
  const handleBlue = mat(0x3b72b3, { roughness: 0.3 });
  const footBlue = mat(0x5f98d4, { roughness: 0.28 });
  const ink = mat(0x020203, { roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.45 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const blush = new THREE.MeshBasicMaterial({ color: 0xe8a2a2, transparent: true, opacity: 0.42, depthWrite: false });

  // Body: a slightly wide ellipsoid.
  const A = 1.6, B = 1.4, C = 1.45;
  const root = new THREE.Group(); scene.add(root);          // position and hop
  const squash = new THREE.Group(); root.add(squash);      // squash and stretch, from the feet
  const body = new THREE.Group(); squash.add(body);        // lean toward the pointer
  body.position.y = 1.5; squash.position.y = -1.5;         // pivot near the feet

  const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), cream);
  bodyMesh.scale.set(A, B, C); body.add(bodyMesh);

  // Surface helper: a point on the body's front, nudged out by `lift`.
  const onSurface = (x, y, lift) => {
    const t = 1 - (x / A) ** 2 - (y / B) ** 2;
    const z = C * Math.sqrt(Math.max(t, 0.0001));
    const n = new THREE.Vector3(x / (A * A), y / (B * B), z / (C * C)).normalize();
    return { p: new THREE.Vector3(x, y, z).addScaledVector(n, lift || 0), n };
  };
  const orient = (obj, n) => obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);

  // Handle: a rounded arch tube whose legs sink into the body.
  const hw = 0.74, top = 1.92, r = 0.4, legBottom = 0.85, tubeR = 0.2;
  const pts = [];
  const push = (x, y) => pts.push(new THREE.Vector3(x, y, -0.05));
  for (let y = legBottom; y < top - r; y += 0.12) push(-hw, y);
  for (let a = Math.PI; a >= Math.PI / 2; a -= Math.PI / 16) push(-hw + r + Math.cos(a) * r, top - r + Math.sin(a) * r);
  for (let x = -hw + r; x <= hw - r; x += 0.12) push(x, top);
  for (let a = Math.PI / 2; a >= 0; a -= Math.PI / 16) push(hw - r + Math.cos(a) * r, top - r + Math.sin(a) * r);
  for (let y = top - r; y >= legBottom; y -= 0.12) push(hw, y);
  const handle = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 160, tubeR, 24, false), handleBlue);
  handle.scale.z = 1.25;
  body.add(handle);

  // Arms: soft ellipsoids at the sides, pivoting at the shoulder.
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 1.46, -0.12, 0.05); body.add(pivot);
    const arm = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), cream);
    arm.scale.set(0.3, 0.45, 0.3); arm.position.set(s * 0.24, -0.24, 0); arm.rotation.z = s * 0.3;
    pivot.add(arm); pivot.userData.side = s; return pivot;
  });

  // Feet: flattened blue ellipsoids, attached to the squash group so they stay planted.
  [-1, 1].forEach((s) => {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), footBlue);
    f.scale.set(0.5, 0.22, 0.38); f.position.set(s * 0.66, 1.5 - 1.3, 0.34); squash.add(f);
  });

  // Face.
  const face = new THREE.Group(); body.add(face);
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group();
    const at = onSurface(s * 0.56, 0.08, 0.0);
    g.position.copy(at.p); orient(g, at.n); face.add(g);
    const lid = new THREE.Group(); g.add(lid);                          // scaled on Y to blink
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 30), ink);
    ball.scale.set(0.32, 0.42, 0.14); lid.add(ball);
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), white); c1.position.set(-0.09, 0.14, 0.13); lid.add(c1);
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), white); c2.position.set(0.12, -0.15, 0.12); lid.add(c2);
    // Happy eye: an upturned arc, shown while celebrating.
    const arcPts = [];
    for (let i = 0; i <= 16; i++) { const a = Math.PI * (i / 16); arcPts.push(new THREE.Vector3(Math.cos(a) * 0.26, Math.sin(a) * 0.2 - 0.06, 0.06)); }
    const happy = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts), 40, 0.05, 12, false), ink);
    happy.visible = false; g.add(happy);
    g.userData = { base: at.p.clone(), x: s * 0.56, lid, ball, happy };
    return g;
  });
  const surfaceCurve = (fn, lift, radius) => {
    const p = [];
    for (let i = 0; i <= 24; i++) { const [x, y] = fn(i / 24); p.push(onSurface(x, y, lift).p); }
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 64, radius, 12, false), ink);
  };
  const brows = [-1, 1].map((s) => {
    const m = surfaceCurve((t) => [s * 0.56 + (t - 0.5) * 0.36, 0.74 + Math.sin(t * Math.PI) * 0.05], 0.02, 0.045);
    face.add(m); return m;
  });
  const smile = surfaceCurve((t) => [(t - 0.5) * 0.5, -0.4 - Math.sin(t * Math.PI) * 0.11], 0.015, 0.042);
  face.add(smile);
  const grinPts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; const x = (t - 0.5) * 0.56, y = -0.36 - Math.sin(t * Math.PI) * 0.2; grinPts.push(onSurface(x, y, 0.012).p); }
  const grinShape = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(grinPts), 64, 0.05, 12, false), ink);
  grinShape.visible = false; face.add(grinShape);
  [-1, 1].forEach((s) => {
    const at = onSurface(s * 0.98, -0.2, 0.012);
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), blush);
    c.scale.set(1, 0.62, 1); c.position.copy(at.p); orient(c, at.n); face.add(c);
  });

  // Soft contact shadow on the ground, drawn in 3D so it always sits under his feet.
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sg = sc.getContext('2d'); const grad = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)'); grad.addColorStop(0.6, 'rgba(0,0,0,0.18)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grad; sg.fillRect(0, 0, 128, 128);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.56; ground.scale.set(3.6, 1.6, 1); scene.add(ground);

  // Springs.
  const spring = (stiffness, damping) => ({ x: 0, v: 0, t: 0, k: stiffness, d: damping,
    step(dt) { const a = this.k * (this.t - this.x) - this.d * this.v; this.v += a * dt; this.x += this.v * dt; return this.x; } });
  const yaw = spring(60, 13), pitch = spring(60, 13), gx = spring(240, 30), gy = spring(240, 30);
  const sqY = spring(320, 18), hopY = spring(140, 16), armUp = spring(180, 16);
  sqY.x = sqY.t = 1;

  // Pointer tracking across the whole page, relative to Kettle's position on screen.
  let pointerActive = false, lastPointer = 0;
  const aim = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.45;
    aim.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (innerWidth * 0.45)));
    aim.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (innerHeight * 0.55)));
    pointerActive = true; lastPointer = performance.now();
  }, { passive: true });

  // Idle life: random glances when the pointer is still, random blinks, random small fidgets.
  const rand = (a, b) => a + Math.random() * (b - a);
  let nextGlance = performance.now() + 1500, glance = { x: 0, y: 0 };
  let nextBlink = performance.now() + rand(1500, 3500), blinkT = -1, doubleBlink = false;
  let cheerT = -1, cheerStart = 0;

  const cheer = () => {
    if (cheerT >= 0 && cheerT < 0.9) return;
    cheerT = 0; cheerStart = performance.now();
    stage && stage.classList.remove('celebrating');
    void (stage && stage.offsetWidth);
    stage && stage.classList.add('celebrating');
    setTimeout(() => stage && stage.classList.remove('celebrating'), 1300);
  };
  const btn = document.getElementById('rig');
  btn && btn.addEventListener('click', cheer);

  // Size.
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host); else window.addEventListener('resize', resize);

  let running = false, last = performance.now(), t0 = last;
  const frame = (now) => {
    if (!running) return;
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;

    // Where to look.
    const idle = !pointerActive || now - lastPointer > 2500;
    if (idle && now > nextGlance) { glance = { x: rand(-0.7, 0.7), y: rand(-0.4, 0.35) }; nextGlance = now + rand(1200, 3200); }
    const lx = idle ? glance.x : aim.x, ly = idle ? glance.y : aim.y;
    yaw.t = lx * 0.36; pitch.t = ly * 0.22;
    gx.t = lx * 0.085; gy.t = -ly * 0.07;

    // Blink.
    if (now > nextBlink) {
      blinkT = now;
      doubleBlink = Math.random() < 0.2;
      nextBlink = now + rand(2200, 5600);
    }
    let lidY = 1;
    const blinkAt = (start) => {
      const k = (now - start) / 150;
      if (k < 0 || k > 1) return 1;
      return k < 0.45 ? 1 - (k / 0.45) * 0.92 : 0.08 + ((k - 0.45) / 0.55) * 0.92;
    };
    if (blinkT > 0) {
      lidY = blinkAt(blinkT);
      if (doubleBlink) lidY = Math.min(lidY, blinkAt(blinkT + 230));
    }

    // Cheer: crouch, launch, airborne with arms up, land with squash, settle.
    let happy = false;
    if (cheerT >= 0) {
      cheerT = (now - cheerStart) / 1000;
      const c = cheerT;
      if (c < 0.12) { sqY.t = 0.86; hopY.t = 0; armUp.t = 0.2; }
      else if (c < 0.42) { sqY.t = 1.08; hopY.t = 1.15; armUp.t = 1; happy = true; }
      else if (c < 0.62) { sqY.t = 1.0; hopY.t = 0; armUp.t = 1; happy = true; }
      else if (c < 0.74) { sqY.t = 0.88; hopY.t = 0; armUp.t = 0.6; happy = true; }
      else if (c < 1.3) { sqY.t = 1; armUp.t = 0; happy = true; }
      else { cheerT = -1; }
    } else { sqY.t = 1; hopY.t = 0; armUp.t = 0; }

    // Step springs and apply.
    const by = yaw.step(dt), bp = pitch.step(dt);
    body.rotation.y = by; body.rotation.x = bp; body.rotation.z = -by * 0.12 + Math.sin(t * 0.9) * 0.012;
    const sy = sqY.step(dt);
    const breath = 1 + Math.sin(t * 1.75) * 0.011;
    squash.scale.set(1 / Math.sqrt(sy) * (2 - breath), sy * breath, 1 / Math.sqrt(sy));
    root.position.y = hopY.step(dt) + Math.sin(t * 1.2) * 0.04;
    const au = armUp.step(dt);
    arms.forEach((p) => { const s = p.userData.side; p.rotation.z = s * (au * 1.9 + Math.sin(t * 1.75 + s) * 0.03); });
    const ex = gx.step(dt), ey = gy.step(dt);
    eyes.forEach((g) => {
      const d = g.userData; const at = onSurface(d.x + ex, 0.08 + ey, 0);
      g.position.copy(at.p); orient(g, at.n);
      d.lid.scale.y = Math.max(0.08, lidY); d.lid.visible = !happy; d.happy.visible = happy;
    });
    smile.visible = !happy; grinShape.visible = happy;
    brows.forEach((b) => { b.position.y = happy ? 0.06 : (lidY < 0.6 ? -0.02 : 0); });

    // Ground shadow follows the hop.
    { const h = Math.max(0, root.position.y); const k = 1 - h * 0.3; ground.scale.set(3.6 * k, 1.6 * k, 1); ground.material.opacity = 1 - h * 0.5; }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };

  const start = () => { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); };
  const stop = () => { running = false; };

  host.classList.add('ready');
  stage && stage.classList.add('is3d');
  if (reduce) { renderer.render(scene, camera); return; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => (e[0].isIntersecting ? start() : stop()), { threshold: 0.05 }).observe(host);
  } else start();
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  setTimeout(cheer, 1200);
})();
