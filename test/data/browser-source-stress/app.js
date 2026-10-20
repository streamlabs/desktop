(function () {
  'use strict';

  const scenario = document.body.dataset.scenario;
  const params = new URLSearchParams(location.search);
  const requestedLoad = params.get('load');
  const load = ['normal', 'heavy', 'extreme'].includes(requestedLoad) ? requestedLoad : 'normal';
  const mediaFormat = params.get('media') === 'mp4' ? 'mp4' : 'webm';
  const run = params.get('run');
  const reporting = run !== null && /^[A-Za-z0-9_-]{1,80}$/.test(run);
  const documentId = window.crypto && window.crypto.randomUUID
    ? window.crypto.randomUUID()
    : 'd' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  const cleanStatus = (value) => value.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 160);
  const presets = {
    normal: { chatBatch: 1, chatLimit: 80, alertMs: 7000, alertLimit: 2, goalMs: 800, particles: 90, fetchMs: 1200, webglIterations: 3, webglWidth: 640, webglHeight: 360 },
    heavy: { chatBatch: 4, chatLimit: 180, alertMs: 3000, alertLimit: 4, goalMs: 300, particles: 220, fetchMs: 500, webglIterations: 8, webglWidth: 960, webglHeight: 540 },
    extreme: { chatBatch: 10, chatLimit: 350, alertMs: 1200, alertLimit: 7, goalMs: 100, particles: 450, fetchMs: 200, webglIterations: 16, webglWidth: 1280, webglHeight: 720 },
  };
  const config = presets[load];
  const started = performance.now();
  const counts = { chat: 0, alerts: 0, goals: 0, frames: 0, webglFrames: 0, sse: 0, fetch: 0, reconnects: 0, videoEnds: 0 };
  let videoStatus = 'idle';
  let audioStatus = 'user action needed';
  let networkStatus = 'idle';
  let webglStatus = 'idle';
  let fps = 0;
  const stage = document.getElementById('stage');
  const metricText = document.getElementById('metrics');
  const heartbeat = document.getElementById('heartbeat');

  document.getElementById('scenario-name').textContent = scenario.toUpperCase() + ' / ' + load.toUpperCase();

  if (scenario === 'index') {
    stage.innerHTML = '<div class="card index-card"><h1>Browser Source Stress Fixtures</h1>' +
      '<p>Open a scenario URL in a browser source. Each page has a visible heartbeat and bounded load presets.</p>' +
      '<ul><li><a href="/chat?load=normal">Chat DOM churn</a></li>' +
      '<li><a href="/alerts?load=normal">Burst alerts, WebM video, generated visuals, user-triggered tone</a></li>' +
      '<li><a href="/alerts?load=normal&amp;media=mp4">Optional H.264 MP4 capability probe</a></li>' +
      '<li><a href="/goals?load=normal">CSS and SVG goals and ticker</a></li>' +
      '<li><a href="/canvas?load=normal">Canvas particles and game HUD</a></li>' +
      '<li><a href="/webgl?load=normal">WebGL1 animated GPU shader</a></li>' +
      '<li><a href="/network?load=normal">SSE updates, planned reconnects, fetch polling</a></li>' +
      '<li><a href="/combined?load=normal">Combined overlay</a></li></ul>' +
      '<p>Change <code>load=normal</code> to <code>load=heavy</code> or <code>load=extreme</code>. See <a href="/README.md">README.md</a> for setup and limits.</p></div>';
  } else {
    const combined = scenario === 'combined';
    if (combined) stage.classList.add('combined-grid');
    if (scenario === 'chat' || combined) createChat();
    if (scenario === 'alerts' || combined) createAlerts();
    if (scenario === 'goals' || combined) createGoals();
    if (scenario === 'canvas' || combined) createCanvas();
    if (scenario === 'webgl') createWebGL();
    if (scenario === 'network') createNetwork();
    if (combined) startNetwork(null);
  }

  let lastFrames = 0;
  setInterval(() => {
    const uptime = Math.floor((performance.now() - started) / 1000);
    fps = counts.frames - lastFrames;
    lastFrames = counts.frames;
    heartbeat.textContent = 'LIVE ' + new Date().toLocaleTimeString() + ' · uptime ' + uptime + 's';
    metricText.textContent = 'chat ' + counts.chat + ' · alerts ' + counts.alerts +
      ' · goal updates ' + counts.goals + ' · canvas frames ' + counts.frames + ' (' + fps + ' fps)' +
      ' · WebGL frames ' + counts.webglFrames + ' (' + webglStatus + ')' +
      ' · SSE ' + counts.sse + ' · fetch ' + counts.fetch + ' · reconnects ' + counts.reconnects +
      ' · video ends ' + counts.videoEnds + ' · video ' + videoStatus +
      ' · audio ' + audioStatus + ' · network ' + networkStatus;
    if (reporting) {
      const report = new URLSearchParams({
        run,
        documentId,
        scenario,
        uptime: String(uptime),
        chat: String(counts.chat),
        alerts: String(counts.alerts),
        goals: String(counts.goals),
        frames: String(counts.frames),
        webglFrames: String(counts.webglFrames),
        sse: String(counts.sse),
        fetch: String(counts.fetch),
        reconnects: String(counts.reconnects),
        videoEnds: String(counts.videoEnds),
        videoStatus: cleanStatus(videoStatus),
        webglStatus: cleanStatus(webglStatus),
        networkStatus: cleanStatus(networkStatus),
      });
      fetch('/api/report?' + report.toString(), { cache: 'no-store' }).catch(() => {});
    }
  }, 1000);

  function card(title, content) {
    const section = document.createElement('section');
    section.className = 'card';
    section.innerHTML = '<h2>' + title + '</h2>' + content;
    stage.appendChild(section);
    return section;
  }

  function createChat() {
    const section = card('Live chat · repeated DOM insertion/removal', '<div id="chat-feed"></div>');
    const feed = section.querySelector('#chat-feed');
    const names = ['PixelPilot', 'LunaLive', 'ModNova', 'SparkFox', 'CloudNine', 'GameGuide', 'ByteWave'];
    const messages = ['Great stream!', 'That combo was wild ✨', 'Goal is getting close!', 'Hello from chat 👋', 'Clip that!', 'Next round hype!', 'The overlay is still alive.'];
    let serial = 0;
    function tick() {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < config.chatBatch; i += 1) {
        const line = document.createElement('div');
        line.className = 'chat-line';
        const user = document.createElement('b');
        user.textContent = names[serial % names.length] + ':';
        const message = document.createTextNode(messages[(serial * 3) % messages.length] + ' #' + serial);
        line.append(user, message);
        fragment.appendChild(line);
        serial += 1;
        counts.chat += 1;
      }
      feed.appendChild(fragment);
      while (feed.childElementCount > config.chatLimit) feed.firstElementChild.remove();
    }
    tick();
    setInterval(tick, 200);
  }

  function createAlerts() {
    const section = card('Alerts · local ' + mediaFormat.toUpperCase() + ' + generated visuals',
      '<div class="alert-area"><div><video class="alert-video" muted playsinline preload="auto"></video>' +
      '<div class="small" id="media-status">Video: idle</div><button type="button" id="tone-button">Play test tone</button>' +
      '<div class="small" id="tone-status">Audio: user action needed</div></div><div class="alert-stack"></div></div>');
    const stack = section.querySelector('.alert-stack');
    const video = section.querySelector('video');
    const mediaText = section.querySelector('#media-status');
    const toneText = section.querySelector('#tone-status');
    const codec = mediaFormat === 'mp4' ? 'video/mp4; codecs="avc1.64001F"' : 'video/webm; codecs="vp8"';
    const codecSupport = video.canPlayType(codec) || 'none';
    video.src = '/media/alertbox.' + mediaFormat;
    video.addEventListener('playing', () => {
      videoStatus = 'playing';
      mediaText.textContent = 'Video: playing local ' + mediaFormat.toUpperCase();
    });
    let replayTimer;
    video.addEventListener('ended', () => {
      counts.videoEnds = Math.min(1000000, counts.videoEnds + 1);
      videoStatus = 'ended';
      mediaText.textContent = 'Video: ended; replay in 2.5s';
      replayTimer = setTimeout(playClip, 2500);
    });
    video.addEventListener('error', () => {
      const code = video.error ? video.error.code : 'unknown';
      videoStatus = 'error:media=' + code + ':' + mediaFormat + '=' + codecSupport;
      mediaText.textContent = 'Video: media error ' + code + ' (' + mediaFormat.toUpperCase() + ' support: ' + codecSupport + ')';
    });
    section.querySelector('#tone-button').addEventListener('click', async () => {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('Web Audio unavailable');
        const context = new AudioContextClass();
        await context.resume();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 660;
        gain.gain.setValueAtTime(0.05, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.2);
        oscillator.onended = () => context.close();
        audioStatus = 'played';
        toneText.textContent = 'Audio: generated tone played';
      } catch (error) {
        audioStatus = 'blocked';
        toneText.textContent = 'Audio: ' + error.message;
      }
    });
    const labels = ['New follower', 'Gifted subscription', 'Raid incoming', 'Goal milestone', 'New tip'];
    let serial = 0;
    function playbackFailed(error) {
      const reason = error && error.name ? error.name : 'UnknownError';
      const mediaError = video.error ? video.error.code : 'none';
      videoStatus = 'blocked:' + reason + ':' + mediaFormat + '=' + codecSupport + ':media=' + mediaError;
      mediaText.textContent = 'Video: ' + reason + ' (' + mediaFormat.toUpperCase() + ' support: ' + codecSupport + ')';
      replayTimer = setTimeout(playClip, 15000);
    }
    function playClip() {
      clearTimeout(replayTimer);
      if (video.error) return;
      try { video.currentTime = 0; } catch { /* first metadata load may still be pending */ }
      videoStatus = 'play requested';
      mediaText.textContent = 'Video: play requested';
      try {
        const playResult = video.play();
        if (playResult && playResult.catch) playResult.catch(playbackFailed);
      } catch (error) {
        playbackFailed(error);
      }
    }
    function burst() {
      const bubble = document.createElement('div');
      bubble.className = 'alert-bubble';
      const title = document.createElement('strong');
      title.textContent = '✦ ' + labels[serial % labels.length] + ' ✦';
      const detail = document.createElement('span');
      detail.textContent = 'Viewer ' + ((serial * 19) % 999 + 1) + ' · alert #' + (serial + 1);
      bubble.append(title, detail);
      stack.appendChild(bubble);
      while (stack.childElementCount > config.alertLimit) stack.firstElementChild.remove();
      setTimeout(() => bubble.remove(), Math.max(2600, config.alertMs * 1.4));
      serial += 1;
      counts.alerts += 1;
    }
    burst();
    setInterval(burst, config.alertMs);
    playClip();
  }

  function createGoals() {
    const section = card('Goals · CSS animation + SVG updates',
      '<div class="goal-wrap"><div>Community goal <b id="goal-value">0%</b></div>' +
      '<div class="goal-track"><div class="goal-fill"></div></div>' +
      '<svg class="goal-svg" viewBox="0 0 140 140" aria-label="Animated circular goal"><circle class="back" cx="70" cy="70" r="56"/>' +
      '<circle class="front" cx="70" cy="70" r="56"/></svg>' +
      '<div class="goal-icons"><span>★</span><span>✦</span><span>◆</span><span>✸</span><span>★</span></div>' +
      '<div class="ticker"><span>LIVE GOAL UPDATE · COMMUNITY CHALLENGE · NEXT MILESTONE · LIVE GOAL UPDATE · COMMUNITY CHALLENGE · NEXT MILESTONE · </span></div></div>');
    const fill = section.querySelector('.goal-fill');
    const ring = section.querySelector('.front');
    const value = section.querySelector('#goal-value');
    let step = 0;
    function update() {
      const percent = Math.round(50 + 45 * Math.sin(step / 17));
      value.textContent = percent + '%';
      fill.style.width = percent + '%';
      ring.style.strokeDashoffset = String(352 * (1 - percent / 100));
      step += 1;
      counts.goals += 1;
    }
    update();
    setInterval(update, config.goalMs);
  }

  function createCanvas() {
    const section = card('Canvas · particles + game HUD',
      '<div class="canvas-wrap"><canvas class="particle-canvas"></canvas>' +
      '<div class="hud">SCORE <span class="score">000000</span><br>FPS <span class="fps">0</span> · PARTICLES ' + config.particles + '</div></div>');
    const canvas = section.querySelector('canvas');
    const context = canvas.getContext('2d');
    const score = section.querySelector('.score');
    const fpsText = section.querySelector('.fps');
    if (!context) { score.textContent = 'CANVAS UNAVAILABLE'; return; }
    const particles = Array.from({ length: config.particles }, (_, i) => ({
      x: (i * 0.6180339887) % 1,
      y: (i * 0.4142135623) % 1,
      vx: ((i % 7) - 3) * 0.00012,
      vy: ((i % 5) - 2) * 0.00015,
      radius: 1 + (i % 3),
    }));
    let width = 1;
    let height = 1;
    function resize() {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    function frame() {
      context.clearRect(0, 0, width, height);
      const time = performance.now();
      for (const p of particles) {
        p.x = (p.x + p.vx + 1) % 1;
        p.y = (p.y + p.vy + 1) % 1;
        context.beginPath();
        context.fillStyle = 'hsla(' + (180 + (time / 30 + p.x * 110) % 120) + ', 95%, 70%, .85)';
        context.arc(p.x * width, p.y * height, p.radius, 0, Math.PI * 2);
        context.fill();
      }
      counts.frames += 1;
      if (counts.frames % 12 === 0) {
        score.textContent = String(counts.frames * 37).padStart(6, '0');
        fpsText.textContent = String(fps);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function createWebGL() {
    const section = card('WebGL1 · animated fragment shader',
      '<div class="webgl-wrap"><canvas class="webgl-canvas"></canvas>' +
      '<div class="webgl-info">Context: <span class="webgl-state">starting</span><br>' +
      'Frames: <span class="webgl-frames">0</span><br>' +
      'Renderer: <span class="webgl-renderer">detecting</span><br>' +
      'Work: ' + config.webglIterations + ' shader steps, up to ' + config.webglWidth + '×' + config.webglHeight + ' pixels</div></div>');
    const canvas = section.querySelector('canvas');
    const stateText = section.querySelector('.webgl-state');
    const frameText = section.querySelector('.webgl-frames');
    const rendererText = section.querySelector('.webgl-renderer');
    let gl;
    let animationFrame = 0;
    let program;
    let timeUniform;
    let resolutionUniform;
    function status(message) {
      webglStatus = message;
      stateText.textContent = message;
    }
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false });
    } catch (error) {
      status('unavailable: ' + error.message);
    }
    if (!gl) {
      if (webglStatus === 'idle') status('WebGL1 unavailable');
      rendererText.textContent = 'none';
      return;
    }
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      cancelAnimationFrame(animationFrame);
      status('context lost; waiting for restore');
    });
    canvas.addEventListener('webglcontextrestored', () => setup());
    window.addEventListener('resize', resize);

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.min(config.webglWidth, Math.max(1, Math.floor(bounds.width)));
      const height = Math.min(config.webglHeight, Math.max(1, Math.floor(bounds.height)));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    }
    function compile(type, source) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('shader allocation failed');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const detail = gl.getShaderInfoLog(shader) || 'unknown shader error';
        gl.deleteShader(shader);
        throw new Error(detail);
      }
      return shader;
    }
    function setup() {
      try {
        const vertex = compile(gl.VERTEX_SHADER,
          'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }');
        const fragment = compile(gl.FRAGMENT_SHADER,
          'precision mediump float; uniform vec2 u_resolution; uniform float u_time;' +
          'void main() { vec2 uv = gl_FragCoord.xy / u_resolution;' +
          'vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);' +
          'float glow = 0.0;' +
          'for (int i = 0; i < ' + config.webglIterations + '; i++) {' +
          'float n = float(i); vec2 orb = 0.35 * vec2(sin(u_time * (0.25 + n * 0.02) + n * 1.7),' +
          'cos(u_time * (0.31 + n * 0.02) + n * 2.1));' +
          'glow += 0.035 / (length(p - orb) + 0.07); }' +
          'float v = clamp(glow / float(' + config.webglIterations + '), 0.0, 1.0);' +
          'float band = 0.1 * sin(p.x * 12.0 + u_time * 2.0);' +
          'vec3 color = mix(vec3(0.03, 0.12, 0.31), vec3(0.25, 0.95, 0.83), v + band);' +
          'gl_FragColor = vec4(color, 0.86); }');
        program = gl.createProgram();
        if (!program) throw new Error('program allocation failed');
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
        }
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error('buffer allocation failed');
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.useProgram(program);
        const position = gl.getAttribLocation(program, 'a_position');
        if (position < 0) throw new Error('position attribute unavailable');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        timeUniform = gl.getUniformLocation(program, 'u_time');
        resolutionUniform = gl.getUniformLocation(program, 'u_resolution');
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        rendererText.textContent = String(renderer || 'unknown').slice(0, 120);
        resize();
        status('active');
        animationFrame = requestAnimationFrame(frame);
      } catch (error) {
        status('unavailable: ' + error.message);
        rendererText.textContent = 'shader/program failed';
      }
    }
    function frame(now) {
      if (gl.isContextLost()) {
        status('context lost; waiting for restore');
        return;
      }
      gl.useProgram(program);
      gl.uniform1f(timeUniform, now / 1000);
      gl.uniform2f(resolutionUniform, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      counts.webglFrames += 1;
      if (counts.webglFrames % 12 === 0) frameText.textContent = String(counts.webglFrames);
      animationFrame = requestAnimationFrame(frame);
    }
    setup();
  }

  function createNetwork() {
    const section = card('Network · SSE reconnect + fetch polling',
      '<div class="network-log"></div>');
    startNetwork(section.querySelector('.network-log'));
  }

  function startNetwork(log) {
    let openedBefore = false;
    function addLog(message) {
      if (!log) return;
      const line = document.createElement('div');
      line.className = 'network-line';
      line.textContent = new Date().toLocaleTimeString() + ' ' + message;
      log.prepend(line);
      while (log.childElementCount > 16) log.lastElementChild.remove();
    }
    if (window.EventSource) {
      const source = new EventSource('/api/events?drop=12');
      source.onopen = () => {
        if (openedBefore) counts.reconnects += 1;
        openedBefore = true;
        networkStatus = 'SSE connected';
        addLog('SSE connected');
      };
      source.addEventListener('update', (event) => {
        const data = JSON.parse(event.data);
        counts.sse += 1;
        addLog('SSE #' + data.id + ' value ' + data.value);
      });
      source.onerror = () => { networkStatus = 'SSE reconnecting'; addLog('SSE disconnected; browser reconnecting'); };
      window.addEventListener('beforeunload', () => source.close(), { once: true });
    } else {
      networkStatus = 'EventSource unavailable';
      addLog(networkStatus);
    }
    let polling = false;
    async function poll() {
      if (polling) return;
      polling = true;
      try {
        const response = await fetch('/api/pulse', { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        counts.fetch += 1;
        addLog('fetch #' + data.id + ' value ' + data.value);
      } catch (error) {
        networkStatus = 'fetch error: ' + error.message;
        addLog(networkStatus);
      } finally {
        polling = false;
      }
    }
    poll();
    setInterval(poll, config.fetchMs);
  }
})();
