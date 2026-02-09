// debug helper
window.onerror = function(msg, url, lineNo, columnNo, error) {
    alert('Error: ' + msg + '\nLine: ' + lineNo);
    return false;
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Assets - Define loading first
const birdImg = new Image();
birdImg.onload = function() {
    // Keep width 80, adjust height to aspect ratio
    if (birdImg.width > 0) {
        const aspect = birdImg.height / birdImg.width;
        bird.h = bird.w * aspect;
    }
};

const bgImg = new Image();
bgImg.onload = function() {
    // Only draw if not playing yet
    if (currentState === 'START') {
        let imgW = bgImg.width;
        let imgH = bgImg.height;
        if (imgH > 0) {
            let ratio = canvas.height / imgH;
            let scaledW = imgW * ratio;
            ctx.drawImage(bgImg, 0, 0, scaledW, canvas.height);
        }
    }
};

// Set sources AFTER onload to ensure they fire
birdImg.src = 'assets/main.png';
bgImg.src = 'assets/bg.jpg';

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


// --- SUPABASE CONFIGURATION ---
// Check window object for keys (populated by config.js)
let sbUrl = window.SUPABASE_URL || '';
let sbKey = window.SUPABASE_KEY || '';

// Try legacy check (if config.js uses const instead of window)
if (!sbUrl) {
    try {
        if (typeof SUPABASE_URL !== 'undefined') {
            sbUrl = SUPABASE_URL;
            sbKey = SUPABASE_KEY;
        }
    } catch(e) { /* ignore */ }
}

// Initialize Client
let supabase;
try {
    if (sbUrl && sbKey && window.supabase) {
        supabase = window.supabase.createClient(sbUrl, sbKey);
        console.log("Supabase initialized");
    } else {
        console.warn("Supabase keys missing or client not loaded. Leaderboard disabled.");
    }
} catch (e) {
    console.error("Supabase failed to init:", e);
}

// Global Leaderboard Functions
async function fetchLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    list.innerHTML = '<li>Loading...</li>';

    if (!supabase) {
        list.innerHTML = '<li>Offine Mode (Leaderboard Hidden)</li>';
        return;
    }

    if (sbUrl.includes('YOUR_SUPABASE_URL')) {
        list.innerHTML = '<li>Setup Supabase keys</li>';
        return;
    }

    try {
        const { data, error } = await supabase
            .from('leaderboard')
            .select('name, score')
            .order('score', { ascending: false })
            .limit(5);

        if (error) {
            console.error('Error fetching leaderboard:', error);
            list.innerHTML = '<li>Error loading scores</li>';
            return;
        }

        renderLeaderboard(data);
    } catch (err) {
        console.warn("Leaderboard fetch failed:", err);
        list.innerHTML = '<li>Connection Error</li>';
    }
}

async function saveToLeaderboard(name, newScore) {
    if (!supabase || sbUrl.includes('YOUR_SUPABASE_URL')) return;

    try {
        // Send to Supabase
        const { error } = await supabase
            .from('leaderboard')
            .insert([{ name: name, score: newScore }]);

        if (error) {
            console.error('Error saving score:', error);
        } else {
            // Refresh display
            fetchLeaderboard();
        }
    } catch (err) {
        console.warn("Leaderboard save failed:", err);
    }
}

function renderLeaderboard(data) {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    
    if (!data || data.length === 0) {
        list.innerHTML = '<li>No scores yet!</li>';
        return;
    }

    list.innerHTML = data.map(entry => `
        <li>
            <span>${entry.name}</span>
            <span>${entry.score}</span>
        </li>
    `).join('');
}

// Game State
let currentState = 'START'; // START, PLAYING, GAMEOVER
let frames = 0;
let score = 0;
// We still track personal high score if needed, but leaderboard covers it
let highScore = parseInt(localStorage.getItem('highScore')) || 0;
let playerName = localStorage.getItem('playerName') || '';
let gameSpeed = 3;

// Initial render of leaderboard
fetchLeaderboard();

// Set name input if exists
if (playerName) {
    nameInput.value = playerName;
}

// Resize canvas
function resize() {
    const container = document.getElementById('game-container');
    if (container) {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
    }
}
window.addEventListener('resize', resize);
// Initial resize
resize();

// Bird Object
const bird = {
    x: 100, // Will be overwriten by center logic
    y: 150,
    w: 80,
    h: 80,
    velocity: 0,
    gravity: 0.15,
    jump: 3.2, // Reduced slightly
    rotation: 0,
    
    draw: function() {
        ctx.save();
        ctx.translate(this.x, this.y);
        // Rotate bird based on velocity
        this.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, this.velocity * 0.1));
        ctx.rotate(this.rotation);
        
        if (birdImg.complete && birdImg.naturalWidth > 0) {
            ctx.drawImage(birdImg, -this.w/2, -this.h/2, this.w, this.h);
        } else {
            // Fallback
            ctx.fillStyle = "yellow";
            ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
        }
        
        ctx.restore();
    },
    
    update: function() {
        this.velocity += this.gravity;
        this.y += this.velocity;
        
        // Floor Collision
        if (this.y + this.h/2 >= canvas.height) { 
             this.y = canvas.height - this.h/2;
             die();
        }
        
        // Ceiling Collision 
        if (this.y - this.h/2 <= 0) {
            this.y = this.h/2;
            this.velocity = 0;
        }
    },
    
    flap: function() {
        this.velocity = -this.jump;
    }
};

// Pipes
const pipes = {
    items: [],
    w: 52, // Standard pipe width
    dx: 1.6,
    nextSpawn: 0,
    
    draw: function() {
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            
            ctx.fillStyle = "#2ecc71"; // Pipe Color
            
            // Top Pipe
            ctx.fillRect(p.x, 0, this.w, p.y);
            // Bottom Pipe
            ctx.fillRect(p.x, p.y + p.gap, this.w, canvas.height - (p.y + p.gap));
            
            // Border
            ctx.strokeStyle = "#27ae60";
            ctx.lineWidth = 3;
            ctx.strokeRect(p.x, 0, this.w, p.y);
            ctx.strokeRect(p.x, p.y + p.gap, this.w, canvas.height - (p.y + p.gap));
        }
    },
    
    update: function() {
        if (frames >= this.nextSpawn) {
            // Horizontal Spacing: Random between 5x and 6x bird width
            // Bird width is 80.
            // 5x = 400px. With dx=1.6, frames = 250.
            // 6x = 480px. With dx=1.6, frames = 300.
            const minSpacing = 250;
            const maxSpacing = 300;
            const spacing = Math.floor(Math.random() * (maxSpacing - minSpacing + 1)) + minSpacing;
            this.nextSpawn = frames + spacing;

            // Vertical Gap Size: 3x to 5x bird height (random)
            // Bird height is ~80. Range: 240 to 400.
            const minGap = 240;
            const maxGap = 400;
            const gapSize = Math.floor(Math.random() * (maxGap - minGap + 1)) + minGap;

            const minTop = 50;
            // Ensure gap fits on screen
            const maxTop = canvas.height - gapSize - 50;
            
            // Random Vertical Position
            // Protect against negative ranges if screen is small
            const safeMaxTop = Math.max(minTop, maxTop);
            const topHeight = Math.floor(Math.random() * (safeMaxTop - minTop + 1) + minTop);
            
            this.items.push({
                x: canvas.width,
                y: topHeight,
                gap: gapSize,
                passed: false
            });
        }
        
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= this.dx; 
            
            // Score
            if (p.x + this.w < bird.x && !p.passed) {
                score++;
                scoreDisplay.innerText = "Score: " + score;
                p.passed = true;
            }
            
            // Collision Logic
            // Horizontal overlap
            if (bird.x + bird.w/2 > p.x && bird.x - bird.w/2 < p.x + this.w) {
                // Vertical overlap (hit pipe)
                if (bird.y - bird.h/2 < p.y || bird.y + bird.h/2 > p.y + p.gap) {
                    die();
                }
            }
            
            // Remove off-screen
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

// Background
const bg = {
    x: 0,
    dx: 0, 
    draw: function() {
        let imgW = bgImg.width;
        let imgH = bgImg.height;

        if (!bgImg.complete || bgImg.naturalWidth === 0) {
            ctx.fillStyle = "#70c5ce"; // Flappy sky blue default
            ctx.fillRect(0,0,canvas.width, canvas.height);
            return;
        }
        
        // Scale to fit canvas height
        let ratio = canvas.height / imgH;
        let scaledW = imgW * ratio;
        
        // Calculate how many tiles we need
        let tilesNeeded = Math.ceil(canvas.width / scaledW) + 1;
        
        for (let i = 0; i < tilesNeeded; i++) {
            ctx.drawImage(bgImg, this.x + (i * scaledW), 0, scaledW, canvas.height);
        }
        
        // Loop
        if (this.x <= -scaledW) {
            this.x = 0;
        }
    },
    update: function() {
        this.x -= this.dx;
    }
};


// Game Loop
function loop() {
    if (currentState === 'PLAYING') {
        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        bg.update();
        bg.draw();
        
        pipes.update();
        pipes.draw();
        
        bird.update();
        bird.draw();
        
        frames++;
        requestAnimationFrame(loop);
    }
}

// Controls
function startGame() {
    console.log("Start Game Clicked");
    const name = nameInput.value.trim();
    if (!name) {
        alert("Please enter a name!");
        return;
    }
    
    playerName = name;
    localStorage.setItem('playerName', playerName);
    
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    
    resetGame();
    currentState = 'PLAYING';
    
    // Play Audio
    bgMusic.currentTime = 0;
    bgMusic.play().catch(e => console.log("Audio play failed, user interaction needed first?", e));
    
    loop();
}

function resetGame() {    
    bird.y = canvas.height / 2;
    bird.x = canvas.width / 2;
    bird.velocity = 0;
    bird.rotation = 0;
    
    pipes.reset();
    frames = 0;
    score = 0;
    scoreDisplay.innerText = "Score: " + score;
    
    updateHighScoreDisplay();
}

function die() {
    if (currentState === 'GAMEOVER') return; // Prevent double death triggers
    currentState = 'GAMEOVER';
    
    // Save Score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', highScore);
    }
    
    // Save to Leaderboard (Supabase)
    if (score > 0) {
        saveToLeaderboard(playerName, score);
    }
    
    hud.classList.add('hidden');
    finalScoreSpan.innerText = score;
    bestScoreSpan.innerText = highScore;
    
    gameOverScreen.classList.remove('hidden');
    
    // Stop Audio
    bgMusic.pause();
}

function updateHighScoreDisplay() {
    highScoreDisplay.innerText = `Best: ${highScore}`;
}

// Input Handling
window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && currentState === 'PLAYING') {
         bird.flap();
    }
});

canvas.addEventListener('click', () => {
    if (currentState === 'PLAYING') bird.flap();
});
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    if (currentState === 'PLAYING') bird.flap();
}, {passive: false});


// Event Listeners
if(startBtn) startBtn.addEventListener('click', startGame);
if(restartBtn) restartBtn.addEventListener('click', startGame);

// Clean up: Remove the old onload handlers at the bottom since we moved them up
// (This is just a comment now, the replace logic removed the old ones effectively by replacing the top block where they usually sat or I will check next)
