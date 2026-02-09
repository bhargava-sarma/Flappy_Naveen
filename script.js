console.log("Script loaded - v.Reboot");

// 1. SETUP CANVAS & VARS
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const uiLayer = document.getElementById('ui-layer');
const startScreen = document.getElementById('start-screen');
const hud = document.getElementById('hud');
const gameOverScreen = document.getElementById('game-over-screen');
const scoreDisplay = document.getElementById('score-display');
const highScoreDisplay = document.getElementById('high-score-display');
const finalScoreSpan = document.getElementById('final-score');
const bestScoreSpan = document.getElementById('best-score');
const nameInput = document.getElementById('player-name');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const bgMusic = document.getElementById('bg-music');

// Assets
const birdImg = new Image();
birdImg.onload = () => {
    if (birdImg.width > 0) {
        bird.h = bird.w * (birdImg.height / birdImg.width);
    }
};
birdImg.src = 'assets/main.png';

const bgImg = new Image();
bgImg.src = 'assets/bg.jpg';

// Game State
let currentState = 'START';
let frames = 0;
let score = 0;
let highScore = parseInt(localStorage.getItem('highScore')) || 0;
let playerName = localStorage.getItem('playerName') || '';
let gameSpeed = 3;

// Set stored name
if (playerName && nameInput) nameInput.value = playerName;


// 2. SUPABASE INTEGRATION (ISOLATED)
// We wrap this in a safe object so if it fails, the game doesn't crash
const Leaderboard = {
    client: null,
    
    init: function() {
        try {
            // 1. Check if Supabase JS library loaded
            if (!window.supabase) {
                console.warn("Supabase library not loaded.");
                return;
            }

            // 2. Resolve Keys (Window object from config.js OR Vercel Env Vars if injected manually)
            let url = window.SUPABASE_URL; // From config.js
            let key = window.SUPABASE_KEY; // From config.js
            
            // If missing, check if they were globally defined another way or just missing
            if (!url || !key) {
                console.warn("Supabase keys missing. Check config.js or Vercel Settings.");
                return;
            }

            // 3. Create Client
            this.client = window.supabase.createClient(url, key);
            console.log("Supabase Client initialized successfully.");
            
            // Load initial leaderboard
            this.fetch();
            
        } catch (e) {
            console.error("Supabase init error:", e);
        }
    },

    fetch: async function() {
        const list = document.getElementById('leaderboard-list');
        if (!list) return;
        
        if (!this.client) {
            list.innerHTML = '<li>Leaderboard Offline</li>';
            return;
        }

        try {
            list.innerHTML = '<li>Loading...</li>';
            const { data, error } = await this.client
                .from('leaderboard')
                .select('name, score')
                .order('score', { ascending: false })
                .limit(5);

            if (error) throw error;
            
            if (!data || data.length === 0) {
                list.innerHTML = '<li>No scores yet!</li>';
            } else {
                list.innerHTML = data.map(entry => `
                    <li>
                        <span>${this.escape(entry.name)}</span>
                        <span>${entry.score}</span>
                    </li>
                `).join('');
            }
        } catch(e) {
            console.error("Fetch error:", e);
            list.innerHTML = '<li>Error loading scores</li>';
        }
    },

    save: async function(name, score) {
        if (!this.client) return;
        try {
            await this.client.from('leaderboard').insert([{ name: name, score: score }]);
            // Refresh after saving
            setTimeout(() => this.fetch(), 1000);
        } catch(e) {
            console.error("Save error:", e);
        }
    },
    
    escape: function(str) {
        // Simple XSS prevention
        return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
};


// 3. GAME ENGINE
function resize() {
    const container = document.getElementById('game-container');
    if (container) {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
        // Re-center bird if waiting
        if (currentState === 'START') {
            bird.x = canvas.width / 2;
        }
    }
}
window.addEventListener('resize', resize);

const bird = {
    x: 100, // Placeholder
    y: 150,
    w: 80,
    h: 80,
    velocity: 0,
    gravity: 0.15,
    jump: 3.2,
    rotation: 0,
    
    draw: function() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        if (birdImg.complete && birdImg.naturalWidth > 0) {
            ctx.drawImage(birdImg, -this.w/2, -this.h/2, this.w, this.h);
        } else {
            ctx.fillStyle = "yellow";
            ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
        }
        ctx.restore();
    },
    
    update: function() {
        this.velocity += this.gravity;
        this.y += this.velocity;
        this.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, this.velocity * 0.1));

        if (this.y + this.h/2 >= canvas.height) { 
             this.y = canvas.height - this.h/2;
             die();
        }
        if (this.y - this.h/2 <= 0) {
            this.y = this.h/2;
            this.velocity = 0;
        }
    },
    
    flap: function() {
        this.velocity = -this.jump;
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
            ctx.fillRect(p.x, p.y + p.gap, this.w, canvas.height - (p.y + p.gap));
            ctx.strokeStyle = "#27ae60";
            ctx.lineWidth = 3;
            ctx.strokeRect(p.x, 0, this.w, p.y);
            ctx.strokeRect(p.x, p.y + p.gap, this.w, canvas.height - (p.y + p.gap));
        }
    },
    
    update: function() {
        if (frames >= this.nextSpawn) {
            const minSpacing = 250;
            const maxSpacing = 300;
            this.nextSpawn = frames + Math.floor(Math.random() * (maxSpacing - minSpacing + 1)) + minSpacing;

            const minGap = 240;
            const maxGap = 400;
            const gapSize = Math.floor(Math.random() * (maxGap - minGap + 1)) + minGap;

            const minTop = 50;
            const maxTop = Math.max(minTop, canvas.height - gapSize - 50);
            const topHeight = Math.floor(Math.random() * (maxTop - minTop + 1) + minTop);
            
            this.items.push({ x: canvas.width, y: topHeight, gap: gapSize, passed: false });
        }
        
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= this.dx; 
            
            if (p.x + this.w < bird.x && !p.passed) {
                score++;
                scoreDisplay.innerText = "Score: " + score;
                p.passed = true;
            }
            
            if (bird.x + bird.w/2 > p.x && bird.x - bird.w/2 < p.x + this.w) {
                if (bird.y - bird.h/2 < p.y || bird.y + bird.h/2 > p.y + p.gap) {
                    die();
                }
            }
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
    x: 0,
    draw: function() {
        if (!bgImg.complete) {
            ctx.fillStyle = "#70c5ce";
            ctx.fillRect(0,0,canvas.width, canvas.height);
            return;
        }
        let ratio = canvas.height / bgImg.height;
        let scaledW = bgImg.width * ratio;
        // Static background as requested
        let tiles = Math.ceil(canvas.width / scaledW) + 1;
        for(let i=0; i<tiles; i++) ctx.drawImage(bgImg, i*scaledW, 0, scaledW, canvas.height);
    },
    update: function() {} 
};

// 4. CONTROL FUNCTIONS
function startGame() {
    console.log("Starting game...");
    const name = nameInput.value.trim();
    if (!name) {
        alert("Please enter a name!");
        return;
    }
    playerName = name;
    localStorage.setItem('playerName', name);
    
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    
    bird.y = canvas.height / 2;
    bird.x = canvas.width / 2;
    bird.velocity = 0;
    
    pipes.reset();
    frames = 0;
    score = 0;
    scoreDisplay.innerText = "Score: 0";
    highScoreDisplay.innerText = "Best: " + highScore;
    
    currentState = 'PLAYING';
    
    bgMusic.currentTime = 0;
    bgMusic.play().catch(e => console.log("Audio autplay blocked:", e));
    
    loop();
}

function die() {
    if (currentState === 'GAMEOVER') return;
    currentState = 'GAMEOVER';
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', highScore);
    }
    
    if (score > 0) Leaderboard.save(playerName, score);
    
    hud.classList.add('hidden');
    finalScoreSpan.innerText = score;
    bestScoreSpan.innerText = highScore;
    gameOverScreen.classList.remove('hidden');
    
    bgMusic.pause();
}

function loop() {
    if (currentState === 'PLAYING') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        bg.draw();
        pipes.update();
        pipes.draw();
        bird.update();
        bird.draw();
        frames++;
        requestAnimationFrame(loop);
    }
}

// 5. INPUTS
window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && currentState === 'PLAYING') bird.flap();
});
canvas.addEventListener('click', () => { if (currentState === 'PLAYING') bird.flap(); });
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); if (currentState === 'PLAYING') bird.flap(); }, {passive: false});

startBtn.onclick = startGame; // Direct assignment is often more robust than addEventListener in mixed loading
restartBtn.onclick = startGame;

// 6. BOOTSTRAP
window.onload = function() {
    console.log("Window loaded. Initializing...");
    resize();
    Leaderboard.init();
    
    // Initial paint
    setTimeout(() => {
        bg.draw(); 
        // Initial bird pos
        bird.x = canvas.width / 2;
        bird.y = canvas.height / 2;
    }, 100);
};
