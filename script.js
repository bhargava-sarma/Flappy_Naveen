// 0. GLOBAL ERROR HANDLER (Debugging on Vercel)
window.onerror = function(message, source, lineno, colno, error) {
    console.error("Global Error:", message);
    // Only alert if we are in a "stuck" state to avoid annoying users, 
    // but for now we want to see why it fails.
    // user removed alert request, so we log heavily.
};

console.log("Script initializing v3.0");

// 1. GAME CONFIG & STATE
const GAME_CONFIG = {
    gravity: 0.15,
    jump: 3.2,
    speed: 3
};

let currentState = 'START';
let frames = 0;
let score = 0;
let highScore = parseInt(localStorage.getItem('highScore')) || 0;
let playerName = localStorage.getItem('playerName') || '';

// 2. DOM ELEMENTS (Resolved lazily or immediately if at bottom of body)
// We use a helper to get elements safely
const getEl = (id) => document.getElementById(id);

const ui = {
    canvas: getEl('gameCanvas'),
    startScreen: getEl('start-screen'),
    hud: getEl('hud'),
    gameOverScreen: getEl('game-over-screen'),
    score: getEl('score-display'),
    highScore: getEl('high-score-display'),
    finalScore: getEl('final-score'),
    bestScore: getEl('best-score'),
    nameInput: getEl('player-name'),
    startBtn: getEl('start-btn'),
    restartBtn: getEl('restart-btn'),
    bgMusic: getEl('bg-music')
};

// Check critical elements
if (!ui.canvas || !ui.startBtn) {
    console.error("Critical DOM elements missing!");
    alert("Error: Game UI not loaded correctly. Refresh the page.");
}

const ctx = ui.canvas.getContext('2d');

// 3. OBJECTS (Defined BEFORE usage)
const bird = {
    x: 100,
    y: 150,
    w: 80,
    h: 80,
    velocity: 0,
    rotation: 0,
    
    draw: function() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        if (assets.bird.loaded) {
            ctx.drawImage(assets.bird.img, -this.w/2, -this.h/2, this.w, this.h);
        } else {
            ctx.fillStyle = "yellow";
            ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
        }
        ctx.restore();
    },
    
    update: function() {
        this.velocity += GAME_CONFIG.gravity;
        this.y += this.velocity;
        this.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, this.velocity * 0.1));

        if (this.y + this.h/2 >= ui.canvas.height) { 
             this.y = ui.canvas.height - this.h/2;
             die();
        }
        if (this.y - this.h/2 <= 0) {
            this.y = this.h/2;
            this.velocity = 0;
        }
    },
    
    flap: function() {
        this.velocity = -GAME_CONFIG.jump;
    }
};

const pipes = {
    items: [],
    w: 52,
    dx: 1.6,
    nextSpawn: 0,
    
    draw: function() {
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            ctx.fillStyle = "#2ecc71";
            ctx.fillRect(p.x, 0, this.w, p.y);
            ctx.fillRect(p.x, p.y + p.gap, this.w, ui.canvas.height - (p.y + p.gap));
            
            // Border
            ctx.strokeStyle = "#27ae60";
            ctx.lineWidth = 3;
            ctx.strokeRect(p.x, 0, this.w, p.y);
            ctx.strokeRect(p.x, p.y + p.gap, this.w, ui.canvas.height - (p.y + p.gap));
        }
    },
    
    update: function() {
        if (frames >= this.nextSpawn) {
            // Random generation logic
             const minSpacing = 250;
            const maxSpacing = 300;
            this.nextSpawn = frames + Math.floor(Math.random() * (maxSpacing - minSpacing + 1)) + minSpacing;

            const minGap = 240;
            const maxGap = 400;
            const gapSize = Math.floor(Math.random() * (maxGap - minGap + 1)) + minGap;

            const minTop = 50;
            const maxTop = Math.max(minTop, ui.canvas.height - gapSize - 50);
            const topHeight = Math.floor(Math.random() * (maxTop - minTop + 1) + minTop);
            
            this.items.push({ x: ui.canvas.width, y: topHeight, gap: gapSize, passed: false });
        }
        
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= this.dx; 
            
            // Score Logic
            if (p.x + this.w < bird.x && !p.passed) {
                score++;
                ui.score.innerText = "Score: " + score;
                p.passed = true;
            }
            
            // Collision Logic
            if (bird.x + bird.w/2 > p.x && bird.x - bird.w/2 < p.x + this.w) {
                if (bird.y - bird.h/2 < p.y || bird.y + bird.h/2 > p.y + p.gap) {
                    die();
                }
            }
            
            // Cleanup
            if (p.x + this.w <= -55) {
                this.items.shift();
                i--;
            }
        }
    },
    reset: function() {
        this.items = [];
        this.nextSpawn = 0;
    }
};

const bg = {
    draw: function() {
        if (!assets.bg.loaded) {
            ctx.fillStyle = "#70c5ce";
            ctx.fillRect(0,0,ui.canvas.width, ui.canvas.height);
            return;
        }
        let ratio = ui.canvas.height / assets.bg.img.height;
        let scaledW = assets.bg.img.width * ratio;
        let tiles = Math.ceil(ui.canvas.width / scaledW) + 1;
        for(let i=0; i<tiles; i++) ctx.drawImage(assets.bg.img, i*scaledW, 0, scaledW, ui.canvas.height);
    }
};

// 4. ASSET MANAGEMENT
const assets = {
    bird: { img: new Image(), loaded: false },
    bg: { img: new Image(), loaded: false }
};

assets.bird.img.onload = () => {
    assets.bird.loaded = true;
    if (assets.bird.img.width > 0) {
        // Adjust aspect ratio if loaded
        bird.h = bird.w * (assets.bird.img.height / assets.bird.img.width);
    }
};
assets.bird.img.src = 'assets/main.png';

assets.bg.img.onload = () => { assets.bg.loaded = true; };
assets.bg.img.src = 'assets/bg.jpg';


// 5. LEADERBOARD (Fault Tolerant)
const Leaderboard = {
    client: null,
    
    init: function() {
        try {
            if (!window.supabase || (!window.SUPABASE_URL && !window.SUPABASE_KEY)) {
                // Determine if we are on Vercel and might have keys injected differently?
                // For now, assume failure if missing.
                console.log("Supabase not fully configured, leaderboard disabled.");
                return;
            }
            this.client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            this.fetch();
        } catch (e) {
            console.warn("Leaderboard init failed (Non-fatal):", e);
        }
    },

    fetch: async function() {
        // Only run if client exists
        if (!this.client) {
             const list = document.getElementById('leaderboard-list');
             if(list) list.innerHTML = '<li>Leaderboard (Offline)</li>';
             return;
        }
        
        try {
            const list = document.getElementById('leaderboard-list');
            if(!list) return;
            
            list.innerHTML = '<li>Loading...</li>';
            const { data, error } = await this.client
                .from('leaderboard')
                .select('name, score')
                .order('score', { ascending: false })
                .limit(5);

            if (error) throw error;
            
            if (!data || data.length === 0) list.innerHTML = '<li>No scores yet!</li>';
            else {
                list.innerHTML = data.map(e => `<li><span>${e.name.replace(/</g, "&lt;")}</span><span>${e.score}</span></li>`).join('');
            }
        } catch(e) { console.error("LB Fetch Error:", e); }
    },

    save: async function(name, score) {
        if (!this.client) return;
        try {
            await this.client.from('leaderboard').insert([{ name: name, score: score }]);
            setTimeout(() => this.fetch(), 500);
        } catch(e) { console.error("LB Save Error:", e); }
    }
};


// 6. CORE LOGIC
function resize() {
    const parent = document.getElementById('game-container');
    if (parent) {
        ui.canvas.width = parent.offsetWidth;
        ui.canvas.height = parent.offsetHeight;
        if (currentState === 'START') {
            bird.x = ui.canvas.width / 2;
            bird.y = ui.canvas.height / 2;
        }
    }
}

function startGame() {
    console.log("Start Button Clicked");
    
    const name = ui.nameInput.value.trim();
    if (!name) {
        alert("Please enter a name!");
        return;
    }
    
    // Save User
    playerName = name;
    localStorage.setItem('playerName', name);
    
    // UI Switch
    ui.startScreen.classList.add('hidden');
    ui.gameOverScreen.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    
    // Reset Game Objects
    bird.y = ui.canvas.height / 2;
    bird.velocity = 0;
    pipes.reset();
    frames = 0;
    score = 0;
    
    // Reset Displays
    ui.score.innerText = "Score: 0";
    ui.highScore.innerText = "Best: " + highScore;
    
    currentState = 'PLAYING';
    
    // Audio
    if(ui.bgMusic) {
        ui.bgMusic.currentTime = 0;
        ui.bgMusic.play().catch(e => console.log("Audio ignored:", e));
    }
    
    // Start Loop
    loop();
}

function die() {
    if (currentState === 'GAMEOVER') return;
    currentState = 'GAMEOVER';
    
    console.log("Game Over. Score:", score);
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', highScore);
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
        ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
        
        bg.draw();
        pipes.update();
        pipes.draw();
        bird.update();
        bird.draw();
        
        frames++;
        requestAnimationFrame(loop);
    }
}


// 7. INPUT HANDLING
window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && currentState === 'PLAYING') bird.flap();
});
ui.canvas.addEventListener('click', () => { if (currentState === 'PLAYING') bird.flap(); });
ui.canvas.addEventListener('touchstart', (e) => { 
    if (currentState === 'PLAYING') {
        e.preventDefault(); 
        bird.flap(); 
    }
}, {passive: false});


// 8. INITIALIZATION
window.onload = function() {
    console.log("Window loaded.");
    
    // 1. Resize first
    resize();
    window.addEventListener('resize', resize);
    
    // 2. Setup Buttons (explicitly)
    if(ui.startBtn) {
        ui.startBtn.onclick = startGame; 
        console.log("Start button bound.");
    } else {
        console.error("Start button not found in DOM");
    }
    
    if(ui.restartBtn) ui.restartBtn.onclick = startGame;
    
    // 3. Pre-fill name
    if (playerName && ui.nameInput) ui.nameInput.value = playerName;

    // 4. Init Leaderboard
    Leaderboard.init();
    
    // 5. Initial Draw
    setTimeout(() => {
        bg.draw();
        bird.x = ui.canvas.width / 2; // Ensure centered
        bird.draw();
    }, 100);
};
