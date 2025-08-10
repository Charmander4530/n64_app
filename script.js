// script.js - simple glue for N64 WASM
(() => {
  const romSelector = document.getElementById('romSelect');
  const loadBtn    = document.getElementById('loadBtn');
  const mobileBtn  = document.getElementById('mobileBtn');
  const saveBtn    = document.getElementById('saveBtn');
  const loadStateBtn = document.getElementById('loadStateBtn');
  const statusEl   = document.getElementById('status');
  const canvas     = document.getElementById('screen');

  // Path to ROM; update if you named differently
  const defaultRomPath = romSelector.value || 'roms/mario64.z64';

  // helper
  function setStatus(s){
    statusEl.textContent = s;
    console.log('[N64]', s);
  }

  // Wait for Module from the wasm wrapper to be ready.
  // Many Emscripten builds call a global "Module" and set onRuntimeInitialized.
  function whenModuleReady(cb){
    if (window.Module && window.Module.onRuntimeInitialized) {
      // if already set, call immediately after.
      const prev = Module.onRuntimeInitialized;
      Module.onRuntimeInitialized = function(){
        try { prev(); } catch(e){}
        cb();
      };
    } else if (window.Module && Module._main) {
      // module probably ready
      setTimeout(cb, 50);
    } else {
      // poll
      const t = setInterval(()=> {
        if (window.Module && (Module.onRuntimeInitialized || Module._main)) {
          clearInterval(t);
          setTimeout(cb, 10);
        }
      }, 50);
    }
  }

  // Put a binary ROM into the Emscripten FS so module can see it by filename
  async function mountRomToFS(url, filename){
    setStatus('Fetching ROM: ' + url);
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ab = await res.arrayBuffer();
    const u8 = new Uint8Array(ab);

    // create FS file - wrapped to avoid exceptions when Module not present
    if (!window.Module || !Module.FS_createDataFile) {
      throw new Error('Emscripten FS not available (Module.FS_createDataFile missing)');
    }
    try {
      // Remove existing file if present
      try { Module.FS_unlink('/' + filename); } catch(e){}
      Module.FS_createDataFile('/', filename, u8, true, true);
      setStatus('ROM mounted: ' + filename);
      return filename;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  // Start emulator. Two common ways:
  // 1) Module.callMain([filename]) for Emscripten compiled main()
  // 2) A wrapper function provided by author, e.g. startEmu(filename)
  function startEmulator(filename) {
    setStatus('Starting emulator: ' + filename);
    try {
      // Option A: if project exposes startEmulator function - call it
      if (typeof window.startEmulator === 'function') {
        window.startEmulator('/' + filename);
        return;
      }
      // Option B: call main (common Emscripten pattern)
      if (typeof Module.callMain === 'function') {
        Module.callMain([ '/' + filename ]);
        return;
      }
      // Option C: some wrappers export "run" or similar - try a few guesses
      if (typeof window.run === 'function') {
        window.run('/' + filename);
        return;
      }
      console.warn('No obvious start function found — you may need to adapt startEmulator() in script.js');
      setStatus('Emulator start function not found');
    } catch (err) {
      console.error('Failed to start emulator:', err);
      setStatus('Start failed: ' + (err.message || err));
    }
  }

  async function loadAndStartRom(url) {
    const filename = url.split('/').pop();
    try {
      await whenModuleReady(async () => {
        const mounted = await mountRomToFS(url, filename);
        startEmulator(mounted);
      });
    } catch (err) {
      console.error(err);
      setStatus('Error loading ROM: ' + (err.message || err));
    }
  }

  // Save / Load State (best-effort: depends on your WASM exposing save/load functions)
  function saveState(){
    setStatus('Attempting to save state...');
    try {
      if (typeof Module._save_state === 'function') {
        Module._save_state(); // C-exported function
        setStatus('Saved state via _save_state()');
      } else if (typeof window.save_state === 'function') {
        window.save_state();
        setStatus('Saved state via save_state()');
      } else {
        setStatus('No save-state API found in WASM');
        console.warn('No save function found (module exports):', Module);
      }
    } catch (e) {
      console.error(e);
      setStatus('Save failed: ' + e.message);
    }
  }

  function loadState(){
    setStatus('Attempting to load state...');
    try {
      if (typeof Module._load_state === 'function') {
        Module._load_state();
        setStatus('Loaded state via _load_state()');
      } else if (typeof window.load_state === 'function') {
        window.load_state();
        setStatus('Loaded state via load_state()');
      } else {
        setStatus('No load-state API found in WASM');
        console.warn('No load function found (module exports):', Module);
      }
    } catch (e) {
      console.error(e);
      setStatus('Load state failed: ' + e.message);
    }
  }

  // Event wiring
  loadBtn.addEventListener('click', () => {
    const url = romSelector.value || defaultRomPath;
    loadAndStartRom(url);
  });

  mobileBtn.addEventListener('click', () => {
    document.body.classList.toggle('mobile-mode');
  });

  saveBtn.addEventListener('click', saveState);
  loadStateBtn.addEventListener('click', loadState);

  // Auto-load default ROM on page load
  window.addEventListener('load', () => {
    // small delay to let Module come in
    setTimeout(()=> {
      loadAndStartRom(defaultRomPath);
    }, 150);
  });

})();
