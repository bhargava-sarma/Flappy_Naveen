// 0. GLOBAL ERROR HANDLER
window.onerror = function(message, source, lineno, colno, error) {
    console.error("Global Error:", message);
};

console.log("Script initializing v3.1 - Leaderboard Update");

// 1. GAME CONFIG & STATE
const GAME_CONFIG = {
    gravity: 0.15,
    jump: 3.2,
    speed: 3
};

let currentState = 'START'; // START, PLAYING, GAMEOVER, LEADERBOARD
let lastState = 'START';     // To know where to go back to
let frames = 0;
let score = 0;
let highScore = parseInt(localStorage.getItem('highScore')) || 0;
let playerName = localStorage.getItem('playerName') || '';
let currentToken = null; // Store the game session token
let flapLog = []; // Anti-Cheat: Track timestamps

// 2. DOM ELEMENTS
const getEl = (id) => document.getElementById(id);

const ui = {
    canvas: getEl('gameCanvas'),
    startScreen: getEl('start-screen'),
    hud: getEl('hud'),
    gameOverScreen: getEl('game-over-screen'),
    leaderboardScreen: getEl('leaderboard-screen'), // New
    score: getEl('score-display'),
    highScore: getEl('high-score-display'),
    finalScore: getEl('final-score'),
    bestScore: getEl('best-score'),
    nameInput: getEl('player-name'),
    startBtn: getEl('start-btn'),
    restartBtn: getEl('restart-btn'),
    leaderboardBtn: getEl('leaderboard-btn'),       // New
    leaderboardBackBtn: getEl('back-btn'),          // New
    endLeaderboardBtn: getEl('end-leaderboard-btn'),// New
    lbList: getEl('leaderboard-list'),              // New
    bgMusic: getEl('bg-music')
};

if (!ui.canvas || !ui.startBtn) {
    console.error("Critical DOM elements missing!");
    alert("Error: Game UI not loaded. Refresh.");
}

const ctx = ui.canvas.getContext('2d');

// 3. OBJECTS
const bird = {
    x: 100, y: 150, w: 64, h: 64, velocity: 0, rotation: 0,
    draw: function() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        if (assets.bird.loaded) ctx.drawImage(assets.bird.img, -this.w/2, -this.h/2, this.w, this.h);
        else { ctx.fillStyle = "yellow"; ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h); }
        ctx.restore();
    },
    update: function() {
        this.velocity += GAME_CONFIG.gravity;
        this.y += this.velocity;
        this.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, this.velocity * 0.1));
        if (this.y + this.h/2 >= ui.canvas.height) { this.y = ui.canvas.height - this.h/2; die(); }
        if (this.y - this.h/2 <= 0) { this.y = this.h/2; this.velocity = 0; }
    },
    flap: function() { 
        this.velocity = -GAME_CONFIG.jump; 
        if (currentState === 'PLAYING') flapLog.push(Date.now()); 
    }
};

const pipes = {
    items: [], w: 42, dx: 1.6, nextSpawn: 0,
    draw: function() {
        // Optimization: Batch state changes outside the loop
        ctx.fillStyle = "#2ecc71";
        ctx.strokeStyle = "white"; 
        ctx.lineWidth = 2;

        for (let p of this.items) {
            ctx.fillRect(p.x, 0, this.w, p.y);
            ctx.fillRect(p.x, p.y + p.gap, this.w, ui.canvas.height - (p.y + p.gap));
            
            ctx.strokeRect(p.x, 0, this.w, p.y);
            ctx.strokeRect(p.x, p.y + p.gap, this.w, ui.canvas.height - (p.y + p.gap));
        }
    },
    update: function() {
        if (frames >= this.nextSpawn) {
            // Scaled down spacing and gaps by ~20%
            const minSpace = 200, maxSpace = 240;
            this.nextSpawn = frames + Math.floor(Math.random() * (maxSpace - minSpace + 1)) + minSpace;
            const minGap = 190, maxGap = 320;
            const gap = Math.floor(Math.random() * (maxGap - minGap + 1)) + minGap;
            const minTop = 50;
            const maxTop = Math.max(minTop, ui.canvas.height - gap - 50);
            const top = Math.floor(Math.random() * (maxTop - minTop + 1) + minTop);
            this.items.push({ x: ui.canvas.width, y: top, gap: gap, passed: false });
        }
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= this.dx;
            if (p.x + this.w < bird.x && !p.passed) { score++; ui.score.innerText = "Score: " + score; p.passed = true; }
            if (bird.x + bird.w/2 > p.x && bird.x - bird.w/2 < p.x + this.w) {
                if (bird.y - bird.h/2 < p.y || bird.y + bird.h/2 > p.y + p.gap) die();
            }
            if (p.x + this.w <= -55) { this.items.shift(); i--; }
        }
    },
    reset: function() { this.items = []; this.nextSpawn = 0; }
};

const bg = {
    // Optimization: Cache the background to avoid expenisve re-draws every frame
    cache: document.createElement('canvas'),
    ctx: null,
    needsUpdate: true,
    
    init: function() {
        this.ctx = this.cache.getContext('2d');
    },

    resize: function() {
        this.cache.width = ui.canvas.width;
        this.cache.height = ui.canvas.height;
        this.needsUpdate = true;
    },

    updateCache: function() {
        if (!assets.bg.loaded) return;
        
        // Draw matched tiles to the cache
        let ratio = this.cache.height / assets.bg.img.height;
        let scaledW = assets.bg.img.width * ratio;
        let tiles = Math.ceil(this.cache.width / scaledW) + 1;
        
        for(let i=0; i<tiles; i++) {
            this.ctx.drawImage(assets.bg.img, i*scaledW, 0, scaledW, this.cache.height);
        }
        
        // Bake the dark overlay into the cache
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        this.ctx.fillRect(0, 0, this.cache.width, this.cache.height);
        
        this.needsUpdate = false;
    },

    draw: function() {
        if (!assets.bg.loaded) { 
            ctx.fillStyle = "#2c3e50"; // Faster fallback
            ctx.fillRect(0,0,ui.canvas.width, ui.canvas.height); 
            return; 
        }
        
        if (this.needsUpdate) this.updateCache();
        
        // Single draw call per frame instead of multiple images + transparency
        ctx.drawImage(this.cache, 0, 0);
    }
};

// 4. ASSETS
const assets = { bird: { img: new Image(), loaded: false }, bg: { img: new Image(), loaded: false } };
assets.bird.img.onload = () => { assets.bird.loaded = true; if(assets.bird.img.width>0) bird.h = bird.w*(assets.bird.img.height/assets.bird.img.width); };
assets.bird.img.src = 'assets/main.png';
assets.bg.img.onload = () => { assets.bg.loaded = true; };
assets.bg.img.src = 'assets/bg.jpg';

// 5. LEADERBOARD
const Leaderboard = {
    client: null,
    init: function() {
        try {
            if (!window.supabase || (!window.SUPABASE_URL && !window.SUPABASE_KEY)) {
                console.log("Supabase not configured.");
                // Use a visual indicator for debugging
                const lbList = document.getElementById('leaderboard-list');
                if(lbList) lbList.innerHTML = '<li style="color:orange">Setup Missing: Check Keys</li>';
                return;
            }
            this.client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            console.log("Supabase Connected");
        } catch (e) { 
            console.warn("Leaderboard init failed:", e);
        }
    },
    fetch: async function() {
        if (!ui.lbList) return;
        
        // Check Client again
        if (!this.client) { 
            ui.lbList.innerHTML = '<li style="color:orange">Offline (Check Config)</li>'; 
            return; 
        }
        
        try {
            ui.lbList.innerHTML = '<li>Loading...</li>';
            const { data, error } = await this.client
                .from('leaderboard')
                .select('name, score')
                .order('score', { ascending: false })
                .limit(10);

            if (error) throw error;
            
            if (!data || data.length === 0) ui.lbList.innerHTML = '<li>No scores yet!</li>';
            else {
                ui.lbList.innerHTML = data.map((e, i) => 
                    `<li><span>#${i+1} ${e.name.replace(/</g, "&lt;")}</span><span>${e.score}</span></li>`
                ).join('');
            }
        } catch(e) { 
            console.error("LB Fetch Error:", e); 
            // Show the actual error on screen
            ui.lbList.innerHTML = `<li style="color:red; font-size:0.8rem">Error: ${e.message}</li>`; 
        }
    },
    getPersonalBest: async function(name) {
        if (!this.client || !name) return 0;
        try {
            const { data, error } = await this.client
                .from('leaderboard')
                .select('score')
                .eq('name', name)
                .order('score', { ascending: false })
                .limit(1);
            
            if (error) throw error;
            return (data && data.length > 0) ? data[0].score : 0;
        } catch(e) {
            console.error("Personal Best Fetch Error:", e);
            return 0;
        }
    },
    save: async function(name, score) {
        if (score <= 0) return; 
        
        try { 
            // VERCEL API METHOD (Hides secret from browser)
            // Now includes 'token' for time-based validation
            // AND 'log' for physics validation
            const response = await fetch('/api/submit-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: name, 
                    score: score,
                    token: currentToken,
                    log: flapLog 
                })
            });

            const result = await response.json();

            if (!response.ok) {
                console.error("Save failed:", result.error);
                // alert("Score rejected: " + result.error);
            } else {
                this.fetch();
            }
        } 
        catch(e) { 
            console.error("LB Save Exception:", e); 
        }
    }
};

// 6. UI LOGIC
function showLeaderboard() {
    lastState = currentState === 'GAMEOVER' ? 'GAMEOVER' : 'START';
    currentState = 'LEADERBOARD';
    
    ui.startScreen.classList.add('hidden');
    ui.gameOverScreen.classList.add('hidden');
    ui.leaderboardScreen.classList.remove('hidden');
    
    Leaderboard.fetch();
}

function hideLeaderboard() {
    ui.leaderboardScreen.classList.add('hidden');
    
    if (lastState === 'GAMEOVER') {
        currentState = 'GAMEOVER';
        ui.gameOverScreen.classList.remove('hidden');
    } else {
        currentState = 'START';
        ui.startScreen.classList.remove('hidden');
    }
}

function resize() {
    const parent = document.getElementById('game-container');
    if (parent) {
        // Debounce resize to prevent resize-loops and excessive drawing
        const dpr = window.devicePixelRatio || 1;
        // Limit max resolution for performance on 4k screens
        const maxW = 1080; 
        
        let targetW = parent.offsetWidth;
        let targetH = parent.offsetHeight;

        // If screen is huge, cap the internal buffer
        if (targetW > maxW) {
             const aspect = targetH / targetW;
             targetW = maxW;
             targetH = maxW * aspect;
        }

        ui.canvas.width = targetW;
        ui.canvas.height = targetH;
        
        // Scale context if needed (handled by browser scaling mostly, but good for crispness)
        // ctx.scale(dpr, dpr); 

        bg.resize(); // Check bg size
        if (currentState === 'START') { bird.x = ui.canvas.width/2; bird.y = ui.canvas.height/2; }
    }
}

function startGame() {
    const name = ui.nameInput.value.trim();
    if (!name) { alert("Please enter a name!"); return; }
    playerName = name;
    localStorage.setItem('playerName', name);
    
    // Reset Score Display immediately
    ui.score.innerText = "Score: 0";
    ui.highScore.innerText = "Best: Loading..."; // Feedback

    // Fetch Personal Best from DB
    Leaderboard.getPersonalBest(playerName).then(dbScore => {
         // Use the DB score as the source of truth for "Best"
         // Only fallback to local if it's the SAME player and local is higher (offline progress)
         // But since we can't easily track which player owns the local 'highScore', 
         // we should prioritize the DB score when switching names.
         
         // FIX: Trust DB score for the named player. 
         // If we want to support offline, we'd need to store scores by name in localStorage (e.g. 'score_Naveen')
         // For now, let's prioritize the DB fetch for the specific name entered.
         
         highScore = dbScore;
         
         // Optional: check if we have a locally stored better score for THIS specific name
         const localKey = 'highScore_' + playerName;
         const localSpecific = parseInt(localStorage.getItem(localKey)) || 0;
         if (localSpecific > highScore) highScore = localSpecific;

         // Update Global High Score logic to be per-player
         localStorage.setItem(localKey, highScore);
         
         ui.highScore.innerText = "Best: " + highScore;
    });

    ui.startScreen.classList.add('hidden');
    ui.gameOverScreen.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    
    bird.y = ui.canvas.height / 2; bird.velocity = 0;
    pipes.reset(); frames = 0; score = 0;
    ui.score.innerText = "Score: 0";
    ui.highScore.innerText = "Best: " + highScore;
    
    currentState = 'PLAYING';
    if(ui.bgMusic) { ui.bgMusic.currentTime = 0; ui.bgMusic.play().catch(e => console.log("Audio ignored:", e)); }
    
    // Secure Start: Get Token
    currentToken = null;
    flapLog = []; // Reset log
    fetch('/api/start-game')
        .then(r => r.json())
        .then(data => { currentToken = data.token; })
        .catch(e => console.error("Token fetch failed:", e));

    loop();
}

function die() {
    if (currentState === 'GAMEOVER') return;
    currentState = 'GAMEOVER';
    if (score > highScore) { 
        highScore = score; 
        // Save score specifically for this player
        localStorage.setItem('highScore_' + playerName, highScore); 
    }
    Leaderboard.save(playerName, score);
    
    ui.hud.classList.add('hidden');
    ui.finalScore.innerText = score;
    ui.bestScore.innerText = highScore;
    ui.gameOverScreen.classList.remove('hidden');
    if(ui.bgMusic) ui.bgMusic.pause();
}

function loop() {
    if (currentState === 'PLAYING') {
        // Optimization: Use separate layers? No, simple batching.
        // Clear only dirty regions? No, easier to clear all.
        ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
        
        // Draw Background (Cached)
        bg.draw();
        
        // Draw Pipes (Batched)
        pipes.update();
        pipes.draw();
        
        // Draw Bird
        bird.update();
        bird.draw();
        
        frames++;
        requestAnimationFrame(loop);
    }
}

// 7. INPUTS
window.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'ArrowUp') && currentState === 'PLAYING') bird.flap(); });
ui.canvas.addEventListener('click', () => { if (currentState === 'PLAYING') bird.flap(); });
ui.canvas.addEventListener('touchstart', (e) => { if (currentState === 'PLAYING') { e.preventDefault(); bird.flap(); } }, {passive: false});

// 8. INIT
window.onload = function() {
    bg.init(); // Init buffer
    resize();
    window.addEventListener('resize', resize);
    
    // Bind Buttons
    if(ui.startBtn) ui.startBtn.onclick = startGame;
    if(ui.restartBtn) ui.restartBtn.onclick = startGame;
    if(ui.leaderboardBtn) ui.leaderboardBtn.onclick = showLeaderboard;
    if(ui.leaderboardBackBtn) ui.leaderboardBackBtn.onclick = hideLeaderboard;
    if(ui.endLeaderboardBtn) ui.endLeaderboardBtn.onclick = showLeaderboard;
    
    if (playerName && ui.nameInput) ui.nameInput.value = playerName;
    Leaderboard.init();
    
    setTimeout(() => { bg.draw(); bird.x = ui.canvas.width/2; bird.draw(); }, 100);
};
