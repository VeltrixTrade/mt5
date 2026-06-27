// --- STANDALONE MODE DETECTION ---
if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
    document.documentElement.classList.add('standalone-mode');
}

// --- STATE MANAGEMENT ---
const State = {
    // Canvas sizing
    width: 0,
    height: 0,
    devicePixelRatio: window.devicePixelRatio || 1,
    
    // Chart View State
    candles: [],         // All historical candles
    zoom: 8,             // Candle spacing + width in pixels (reduced to fit 4 time labels spaced closer on mobile)
    panOffset: 0,        // Horizontal scroll offset (in candles)
    panOffsetY: 0,       // Vertical scroll offset (in pixels)
    isAutoYScale: true,  // Automatically fit price scale to visible candles
    manualYMin: 0,       // Manual scale Y min
    manualYMax: 0,       // Manual scale Y max
    
    // Interactive tools
    isCrosshairActive: false,
    crosshairX: 0,
    crosshairY: 0,
    
    // Trading Account State
    balance: 10000.00,
    equity: 10000.00,
    marginFree: 10000.00,
    positions: [],
    history: [],
    currentLot: 1.00,
    contractSize: 100, // XAUUSD standard contract size (100 oz per lot)
    spread: 0.05,       // Spread in USD (5 pips for XAUUSD)
    
    // Live price simulation
    currentBid: 3982.01,
    currentAsk: 3982.06,
    lastTickTime: Date.now(),
    
    // Replay Mode (وضع الإعادة)
    replayMode: false,
    replayIndex: 50,    // Number of candles revealed so far in replay mode
    replayIntervalId: null,
    replaySpeed: 1,     // Speed multiplier (1x, 2x, 5x, 10x)
    replayPlaying: false,
    
    // Timeframe Configuration
    timeframeMinutes: 5
};

// --- DOM ELEMENTS ---
const canvas = document.getElementById('main-chart-canvas');
const ctx = canvas.getContext('2d');
const oneClickPanel = document.getElementById('one-click-panel');
const lotInput = document.getElementById('lot-input');
const sellPriceDisplay = document.getElementById('sell-price-display');
const buyPriceDisplay = document.getElementById('buy-price-display');

// Page navigation components
const pages = document.querySelectorAll('.page');

// Trade page elements
const balanceValEl = document.getElementById('balance-val');
const equityValEl = document.getElementById('equity-val');
const marginFreeValEl = document.getElementById('margin-free-val');
const positionsListContainer = document.getElementById('positions-list-container');
const historyListContainer = document.getElementById('history-list-container');

// Settings page elements
const initialBalanceInput = document.getElementById('initial-balance-input');
const resetBalanceBtn = document.getElementById('reset-balance-btn');
const csvFileInput = document.getElementById('csv-file-input');
const resetDataBtn = document.getElementById('reset-data-btn');

// Quotes page elements
const quoteSellValEl = document.getElementById('quote-sell-val');
const quoteBuyValEl = document.getElementById('quote-buy-val');

// Replay UI elements
const replayPanelToggle = document.getElementById('replay-panel-toggle');
const replayWidget = document.getElementById('replay-widget');
const replayPrevBtn = document.getElementById('replay-prev');
const replayPlayBtn = document.getElementById('replay-play');
const replayPauseBtn = document.getElementById('replay-pause');
const replayNextBtn = document.getElementById('replay-next');
const speedButtons = document.querySelectorAll('.speed-btn');
const replayCandleCountEl = document.getElementById('replay-candle-count');

// Crosshair coordinate overlays
const crosshairValX = document.getElementById('crosshair-val-x');
const crosshairValY = document.getElementById('crosshair-val-y');

// Layout boundaries
const MARGIN_RIGHT = 68;  // Space for price axis (exactly 68px as in original MT5)
const MARGIN_BOTTOM = 18; // Space for time axis (98px from bottom of screen: 18px margin + 80px nav)
const MARGIN_TOP = 1;     // Space at top (91px from top of screen)
const MARGIN_LEFT = 0;    // Starts at 0 to make chart width exactly 322px (390 - 68)

// Helvetica Neue font family stack
const FONT_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// --- TIME ROUNDING UTILITY ---
function getRoundedStartTime(timeframeMinutes) {
    const d = new Date();
    d.setSeconds(0, 0); // zero out seconds and milliseconds
    
    if (timeframeMinutes < 60) {
        // M1, M5, M15, M30: round minutes
        const mins = d.getMinutes();
        const roundedMins = Math.floor(mins / timeframeMinutes) * timeframeMinutes;
        d.setMinutes(roundedMins);
    } else if (timeframeMinutes === 60) {
        // H1: round to start of hour
        d.setMinutes(0);
    } else if (timeframeMinutes === 240) {
        // H4: round to start of hour, and round hour to multiple of 4
        d.setMinutes(0);
        const hrs = d.getHours();
        const roundedHrs = Math.floor(hrs / 4) * 4;
        d.setHours(roundedHrs);
    } else {
        // D1: round to start of day
        d.setHours(0, 0, 0, 0);
    }
    return d;
}

// --- MOCK DATA GENERATION ---
function generateMockData() {
    const candles = [];
    let price = 4050.00; // fits the range in the screenshot 4032.545 to 4067.410
    
    // Round current time to clean timeframe intervals in local time
    let startTime = getRoundedStartTime(State.timeframeMinutes);
    let time = new Date(startTime.getTime() - 500 * State.timeframeMinutes * 60 * 1000); // 500 candles ago
    
    for (let i = 0; i < 600; i++) {
        const timeStr = formatTimeLabel(time);
        
        // Random walk parameters
        const drift = -0.01; 
        const volatility = 2.2;
        const change = (Math.random() - 0.5) * volatility + drift;
        
        const open = price;
        const close = price + change;
        const high = Math.max(open, close) + Math.random() * 1.5;
        const low = Math.min(open, close) - Math.random() * 1.5;
        
        candles.push({
            time: new Date(time),
            timeLabel: timeStr,
            open,
            high,
            low,
            close
        });
        
        price = close;
        time.setMinutes(time.getMinutes() + State.timeframeMinutes);
    }
    
    // Normalize candle prices to fit the range [4036.5, 4063.0] beautifully on load
    const targetMin = 4036.5;
    const targetMax = 4063.0;
    
    let currentMin = Infinity;
    let currentMax = -Infinity;
    
    candles.forEach(c => {
        if (c.low < currentMin) currentMin = c.low;
        if (c.high > currentMax) currentMax = c.high;
    });
    
    const scale = (targetMax - targetMin) / (currentMax - currentMin);
    
    candles.forEach(c => {
        c.open = parseFloat((targetMin + (c.open - currentMin) * scale).toFixed(3));
        c.high = parseFloat((targetMin + (c.high - currentMin) * scale).toFixed(3));
        c.low = parseFloat((targetMin + (c.low - currentMin) * scale).toFixed(3));
        c.close = parseFloat((targetMin + (c.close - currentMin) * scale).toFixed(3));
    });
    
    State.candles = candles;
    State.replayIndex = Math.min(100, candles.length - 10);
    State.currentBid = candles[candles.length - 1].close;
    State.currentAsk = parseFloat((State.currentBid + State.spread).toFixed(3));
}

// --- UTILITY FUNCTIONS ---
function formatTimeLabel(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = date.getDate();
    const m = months[date.getMonth()];
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${d} ${m} ${h}:${min}`;
}

// Returns the active candles array based on replay mode
function getActiveCandles() {
    if (State.replayMode) {
        return State.candles.slice(0, State.replayIndex + 1);
    }
    return State.candles;
}

// --- CANVAS CHART ENGINE ---
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    State.width = rect.width;
    State.height = rect.height;
    
    // Scale canvas to match high DPI displays
    canvas.width = rect.width * State.devicePixelRatio;
    canvas.height = rect.height * State.devicePixelRatio;
    
    ctx.scale(State.devicePixelRatio, State.devicePixelRatio);
    drawChart();
}

function getPriceRange(visibleCandles) {
    if (visibleCandles.length === 0) return { min: 4032.545, max: 4067.410 };
    
    let min = Infinity;
    let max = -Infinity;
    
    visibleCandles.forEach(c => {
        if (c.low < min) min = c.low;
        if (c.high > max) max = c.high;
    });
    
    State.positions.forEach(pos => {
        if (pos.openPrice < min) min = pos.openPrice;
        if (pos.openPrice > max) max = pos.openPrice;
    });
    
    const diff = max - min;
    const padding = diff > 0 ? diff * 0.1 : 10;
    
    return {
        min: min - padding,
        max: max + padding
    };
}

function drawChart() {
    if (State.width === 0 || State.height === 0 || State.candles.length === 0) return;
    
    // Force LTR direction on canvas to prevent system-level RTL shuffling of numbers and timestamps
    ctx.direction = 'ltr';
    
    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, State.width, State.height);
    
    const activeCandles = getActiveCandles();
    const totalCount = activeCandles.length;
    
    // Calculate candle properties
    const candleSpacing = State.zoom;
    const candleWidth = Math.max(1, Math.floor(candleSpacing * 0.7));
    
    const chartWidth = State.width - MARGIN_RIGHT - MARGIN_LEFT;
    const chartHeight = State.height - MARGIN_BOTTOM - MARGIN_TOP;
    
    const maxVisible = Math.ceil(chartWidth / candleSpacing);
    
    let endIndex = totalCount - 1 - State.panOffset;
    if (endIndex < 0) endIndex = 0;
    
    let startIndex = endIndex - maxVisible;
    if (startIndex < 0) startIndex = 0;
    
    const visibleCandles = activeCandles.slice(startIndex, endIndex + 1);
    
    // Get Price boundaries
    let priceMin, priceMax;
    if (State.isAutoYScale) {
        const range = getPriceRange(visibleCandles);
        priceMin = range.min;
        priceMax = range.max;
        
        State.manualYMin = priceMin;
        State.manualYMax = priceMax;
    } else {
        priceMin = State.manualYMin + State.panOffsetY * ((State.manualYMax - State.manualYMin) / chartHeight);
        priceMax = State.manualYMax + State.panOffsetY * ((State.manualYMax - State.manualYMin) / chartHeight);
    }
    
    // Coordinate conversions
    function getX(candleIndex) {
        const offsetFromEnd = endIndex - candleIndex;
        return MARGIN_LEFT + chartWidth - (offsetFromEnd * candleSpacing) - (candleSpacing / 2);
    }
    
    function getY(price) {
        return MARGIN_TOP + chartHeight - ((price - priceMin) / (priceMax - priceMin)) * chartHeight;
    }
    
    function getPriceFromY(y) {
        return priceMin + ((MARGIN_TOP + chartHeight - y) / chartHeight) * (priceMax - priceMin);
    }
    
    // 1. Draw Dotted Grid Lines
    ctx.save();
    ctx.strokeStyle = '#e2e2e4';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([1, 2]); // dotted lines
    ctx.font = '11px ' + FONT_STACK;
    ctx.fillStyle = '#6e717a';
    
    // Price grid lines: 15 labels, spaced to fit exactly 99px top offset and 135px bottom offset.
    // Top-most price label is at screen Y = 104.5px center (canvas Y = 13.5px, top of text is screen Y = 99px).
    // Bottom-most price label is at screen Y = 703.5px center (canvas Y = 612.5px, bottom of text is screen Y = 709px).
    const priceCount = 15;
    const yStart = 13.5;
    const yStep = 42.785;
    
    for (let i = 0; i < priceCount; i++) {
        const y = yStart + i * yStep;
        const gridPrice = getPriceFromY(y);
        
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT, y);
        ctx.lineTo(MARGIN_LEFT + chartWidth, y);
        ctx.stroke();
        
        ctx.save();
        ctx.setLineDash([]); // solid text and ticks
        ctx.strokeStyle = '#cbcbcb';
        ctx.lineWidth = 1;
        
        // Draw axis tick pointing rightwards
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT + chartWidth, y);
        ctx.lineTo(MARGIN_LEFT + chartWidth + 3, y);
        ctx.stroke();
        
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '1.5px';
        ctx.fillText(gridPrice.toFixed(3), MARGIN_LEFT + chartWidth + 6, y, 55);
        ctx.restore();
    }
    
    // 2. Vertical time grid lines (exactly 4 labels spaced at specific pixel offsets: 30px from left, 96px between each)
    const targetXPositions = [
        MARGIN_LEFT + 30,
        MARGIN_LEFT + 30 + 96,
        MARGIN_LEFT + 30 + 96 * 2,
        MARGIN_LEFT + 30 + 96 * 3
    ];
    
    targetXPositions.forEach((targetX, index) => {
        // Find nearest candle index corresponding to targetX
        let idx = endIndex - Math.round((MARGIN_LEFT + chartWidth - targetX - candleSpacing / 2) / candleSpacing);
        idx = Math.max(startIndex, Math.min(idx, endIndex));
        
        const candle = activeCandles[idx];
        if (!candle) return;
        
        const x = getX(idx);
        
        ctx.beginPath();
        ctx.moveTo(x, MARGIN_TOP);
        ctx.lineTo(x, MARGIN_TOP + chartHeight);
        ctx.stroke();
        
        ctx.save();
        ctx.setLineDash([]); // solid text and ticks
        ctx.strokeStyle = '#cbcbcb';
        ctx.lineWidth = 1;
        
        // Draw axis tick pointing downwards (adding 4 to y)
        ctx.beginPath();
        ctx.moveTo(x, MARGIN_TOP + chartHeight);
        ctx.lineTo(x, MARGIN_TOP + chartHeight + 4);
        ctx.stroke();
        
        if (index < targetXPositions.length - 1) {
            ctx.textAlign = 'left';
            ctx.font = '11px ' + FONT_STACK;
            ctx.fillStyle = '#5A5A5F';
            ctx.fillText(candle.timeLabel, x + 3, MARGIN_TOP + chartHeight + 14, 73);
        }
        ctx.restore();
    });
    ctx.restore();
    
    // 2. Draw Candlesticks (TradingView Style: Green & Red)
    visibleCandles.forEach((candle, idx) => {
        const absIdx = startIndex + idx;
        const x = getX(absIdx);
        
        const yOpen = getY(candle.open);
        const yClose = getY(candle.close);
        const yHigh = getY(candle.high);
        const yLow = getY(candle.low);
        
        const isBullish = candle.close >= candle.open;
        const color = isBullish ? varColor('--tv-green', '#089981') : varColor('--tv-red', '#f23645');
        
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.0;
        
        // Draw wick
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();
        
        // Draw body
        const bodyHeight = Math.abs(yClose - yOpen);
        const bodyY = Math.min(yOpen, yClose);
        
        if (bodyHeight < 1) {
            ctx.beginPath();
            ctx.moveTo(x - candleWidth / 2, bodyY);
            ctx.lineTo(x + candleWidth / 2, bodyY);
            ctx.stroke();
        } else {
            ctx.fillRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight);
            ctx.strokeRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight);
        }
    });
    
    // 3. Draw Active Trade Lines
    State.positions.forEach(pos => {
        const y = getY(pos.openPrice);
        if (y >= MARGIN_TOP && y <= MARGIN_TOP + chartHeight) {
            const isBuy = pos.type === 'BUY';
            const color = isBuy ? varColor('--mt5-blue', '#0b5cd5') : varColor('--mt5-red', '#e53935');
            
            ctx.save();
            ctx.strokeStyle = color;
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            
            ctx.beginPath();
            ctx.moveTo(MARGIN_LEFT, y);
            ctx.lineTo(MARGIN_LEFT + chartWidth, y);
            ctx.stroke();
            ctx.restore();
            
            ctx.fillStyle = color;
            ctx.font = 'bold 9px ' + FONT_STACK;
            ctx.fillText(`${pos.type} ${pos.lot.toFixed(2)}`, MARGIN_LEFT + 5, y - 4);
        }
    });
    
    // 4. Draw Current Price Line and Box
    const currentPrice = State.currentBid;
    const curY = getY(currentPrice);
    
    if (curY >= MARGIN_TOP && curY <= MARGIN_TOP + chartHeight) {
        ctx.save();
        ctx.strokeStyle = '#00A86B';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT, curY);
        ctx.lineTo(MARGIN_LEFT + chartWidth, curY);
        ctx.stroke();
        ctx.restore();
        
        ctx.save();
        const boxWidth = 62;
        const boxHeight = 14;
        const boxX = MARGIN_LEFT + chartWidth + 2;
        const boxY = curY - boxHeight / 2;
        
        // Draw price box: solid green background
        ctx.fillStyle = '#00A86B';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        
        // Price text: same size (11px) as static price labels, color #ffffff for high contrast
        ctx.fillStyle = '#ffffff';
        ctx.font = '400 11px ' + FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '1.5px';
        ctx.fillText(currentPrice.toFixed(3), boxX + boxWidth / 2, curY, 55);
        ctx.restore();
    }
    
    // 5. Draw Axis Separators & Three Dots
    ctx.save();
    ctx.strokeStyle = '#cbcbcb';
    ctx.lineWidth = 1;
    ctx.setLineDash([]); // solid border separator lines
    
    // Vertical separator next to the price scale (starts at the very top y=0 to connect with the header toolbar)
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT + chartWidth, 0);
    ctx.lineTo(MARGIN_LEFT + chartWidth, MARGIN_TOP + chartHeight);
    ctx.stroke();
    
    // Horizontal separator at the top (stops at the vertical separator line, forming a sharp corner)
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(MARGIN_LEFT + chartWidth, 0.5);
    ctx.stroke();
    
    // Horizontal separator at the bottom
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, MARGIN_TOP + chartHeight);
    ctx.lineTo(MARGIN_LEFT + chartWidth, MARGIN_TOP + chartHeight);
    ctx.stroke();
    
    // Draw three circles grouping together to form '...' with exactly 18px width, 4px height, 113px from screen bottom, and first dot starting exactly 25px to the right of the vertical separator line (x=322px)
    const dotY = 640;
    const dotX = MARGIN_LEFT + chartWidth + 34; // 322 + 34 = 356px (left edge of first dot starts at 356 - 7 - 2 = 347px, exactly 25px from vertical line)
    ctx.fillStyle = '#40424b';
    
    // Draw Dot 1
    ctx.beginPath();
    ctx.arc(dotX - 7, dotY, 2, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw Dot 2
    ctx.beginPath();
    ctx.arc(dotX, dotY, 2, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw Dot 3
    ctx.beginPath();
    ctx.arc(dotX + 7, dotY, 2, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.restore();
    
    // 6. Draw Crosshair
    if (State.isCrosshairActive) {
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = 0.8;
        
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT, State.crosshairY);
        ctx.lineTo(MARGIN_LEFT + chartWidth, State.crosshairY);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(State.crosshairX, MARGIN_TOP);
        ctx.lineTo(State.crosshairX, MARGIN_TOP + chartHeight);
        ctx.stroke();
        
        const priceAtCross = getPriceFromY(State.crosshairY);
        
        // Snap crosshair to nearest candle
        let minDistance = Infinity;
        let snapIdx = -1;
        
        for (let i = startIndex; i <= endIndex; i++) {
            const cx = getX(i);
            const dist = Math.abs(State.crosshairX - cx);
            if (dist < minDistance) {
                minDistance = dist;
                snapIdx = i;
            }
        }
        
        if (snapIdx !== -1 && activeCandles[snapIdx]) {
            const candle = activeCandles[snapIdx];
            crosshairValX.textContent = candle.timeLabel;
            crosshairValX.classList.remove('hidden');
            
            const textWidth = crosshairValX.offsetWidth;
            crosshairValX.style.left = `${getX(snapIdx) - textWidth / 2}px`;
            crosshairValX.style.bottom = `${MARGIN_BOTTOM + 5}px`;
        }
        
        crosshairValY.textContent = priceAtCross.toFixed(3);
        crosshairValY.classList.remove('hidden');
        crosshairValY.style.right = '5px';
        crosshairValY.style.top = `${State.crosshairY - 10}px`;
    } else {
        crosshairValX.classList.add('hidden');
        crosshairValY.classList.add('hidden');
    }
}

// Helper to get computing color values
function varColor(variableName, fallback) {
    const val = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    return val || fallback;
}

function getSecondsToNextCandle() {
    const now = Date.now();
    const intervalMs = State.timeframeMinutes * 60 * 1000;
    const elapsed = now % intervalMs;
    const remainingMs = intervalMs - elapsed;
    return Math.floor(remainingMs / 1000);
}

// --- INTERACTIVE ACTIONS & PAN/ZOOM ---
let isDragging = false;
let isPriceScaling = false;
let dragStartX = 0;
let dragStartY = 0;
let initialPanOffset = 0;
let initialPanOffsetY = 0;
let initialZoom = 12;
let touchStartDist = 0;

function handlePointerDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    
    // Right axis pricing scale drag check
    const chartWidth = State.width - MARGIN_RIGHT - MARGIN_LEFT;
    if (x > MARGIN_LEFT + chartWidth) {
        isPriceScaling = true;
        State.isAutoYScale = false;
        dragStartY = y;
        initialPanOffsetY = State.panOffsetY;
        return;
    }
    
    // Pinch to zoom checks
    if (e.touches && e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        initialZoom = State.zoom;
        return;
    }
    
    isDragging = true;
    dragStartX = x;
    dragStartY = y;
    initialPanOffset = State.panOffset;
    initialPanOffsetY = State.panOffsetY;
}

function handlePointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    if (State.isCrosshairActive) {
        State.crosshairX = Math.max(MARGIN_LEFT, Math.min(x, State.width - MARGIN_RIGHT));
        State.crosshairY = Math.max(MARGIN_TOP, Math.min(y, State.height - MARGIN_BOTTOM));
        drawChart();
        return;
    }
    
    if (isPriceScaling) {
        const dy = y - dragStartY;
        State.panOffsetY = initialPanOffsetY + dy;
        drawChart();
        return;
    }
    
    if (e.touches && e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const factor = dist / touchStartDist;
        
        State.zoom = Math.max(3, Math.min(30, initialZoom * factor));
        drawChart();
        return;
    }
    
    if (isDragging) {
        const dx = x - dragStartX;
        const dy = y - dragStartY;
        
        const candlesDiff = Math.round(dx / State.zoom);
        State.panOffset = Math.max(0, initialPanOffset + candlesDiff);
        
        if (!State.isAutoYScale) {
            State.panOffsetY = initialPanOffsetY + dy;
        }
        
        drawChart();
    }
}

function handlePointerUp() {
    isDragging = false;
    isPriceScaling = false;
    touchStartDist = 0;
}

function handleDoubleClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const chartWidth = State.width - MARGIN_RIGHT - MARGIN_LEFT;
    
    if (x > MARGIN_LEFT + chartWidth) {
        State.isAutoYScale = true;
        State.panOffsetY = 0;
        drawChart();
    }
}

function handleWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    State.zoom = Math.max(3, Math.min(30, State.zoom * factor));
    drawChart();
}

// Bind Events
canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('mousemove', handlePointerMove);
window.addEventListener('mouseup', handlePointerUp);
canvas.addEventListener('dblclick', handleDoubleClick);
canvas.addEventListener('wheel', handleWheel, { passive: false });

canvas.addEventListener('touchstart', handlePointerDown, { passive: true });
canvas.addEventListener('touchmove', handlePointerMove, { passive: true });
window.addEventListener('touchend', handlePointerUp);

// --- TICK ENGINE & PRICE SIMULATION ---
function triggerPriceTick() {
    if (State.replayMode && State.replayPlaying) {
        return;
    }
    
    const spread = State.spread;
    const direction = Math.random() > 0.48 ? 1 : -1;
    const change = direction * (Math.random() * 0.15);
    
    const prevBid = State.currentBid;
    State.currentBid = parseFloat((State.currentBid + change).toFixed(3));
    State.currentAsk = parseFloat((State.currentBid + spread).toFixed(3));
    
    // Animate tick panels colors (flash blue if tick went up, red if down)
    const activeColor = State.currentBid >= prevBid ? '#0b5cd5' : '#e53935';
    
    const sellBtn = document.getElementById('quick-sell-btn');
    const buyBtn = document.getElementById('quick-buy-btn');
    
    sellBtn.style.backgroundColor = activeColor;
    buyBtn.style.backgroundColor = activeColor;
    
    setTimeout(() => {
        sellBtn.style.backgroundColor = varColor('--mt5-red', '#e53935');
        buyBtn.style.backgroundColor = varColor('--mt5-blue', '#0b5cd5');
    }, 150);
    
    updateTradingPanelUI();
    
    // Live update quotes page price text values
    if (quoteSellValEl && quoteBuyValEl) {
        quoteSellValEl.textContent = State.currentBid.toFixed(2);
        quoteBuyValEl.textContent = State.currentAsk.toFixed(2);
    }
    
    // Modify close price of live candle
    if (!State.replayMode && State.candles.length > 0) {
        const lastCandle = State.candles[State.candles.length - 1];
        lastCandle.close = State.currentBid;
        if (State.currentBid > lastCandle.high) lastCandle.high = State.currentBid;
        if (State.currentBid < lastCandle.low) lastCandle.low = State.currentBid;
        
        const now = Date.now();
        if (now - State.lastTickTime >= State.timeframeMinutes * 60 * 1000) {
            createNewLiveCandle();
        }
    }
    
    updatePositionsProfit();
    drawChart();
}

function createNewLiveCandle() {
    const last = State.candles[State.candles.length - 1];
    const newTime = new Date(last.time.getTime() + State.timeframeMinutes * 60 * 1000);
    const newCandle = {
        time: newTime,
        timeLabel: formatTimeLabel(newTime),
        open: last.close,
        high: last.close,
        low: last.close,
        close: last.close
    };
    State.candles.push(newCandle);
    State.lastTickTime = Date.now();
}

function updateTradingPanelUI() {
    function formatMT5PriceHTML(price) {
        const str = price.toFixed(3);
        const base = str.substring(0, str.indexOf('.') + 1);
        const large = str.substring(str.indexOf('.') + 1, str.indexOf('.') + 3);
        const superDigit = str.substring(str.indexOf('.') + 3);
        return `${base}<span class="large-price">${large}</span><sup class="super-price">${superDigit}</sup>`;
    }
    
    sellPriceDisplay.innerHTML = formatMT5PriceHTML(State.currentBid);
    buyPriceDisplay.innerHTML = formatMT5PriceHTML(State.currentAsk);
}

// Tick interval (1.5 seconds)
setInterval(triggerPriceTick, 1500);

// --- REPLAY ENGINE ---
function toggleReplayMode() {
    State.replayMode = !State.replayMode;
    if (State.replayMode) {
        replayWidget.classList.remove('hidden');
        State.replayIndex = Math.min(60, State.candles.length - 50);
        pauseReplay();
        syncReplayCandleData();
    } else {
        replayWidget.classList.add('hidden');
        pauseReplay();
    }
    drawChart();
}

function syncReplayCandleData() {
    const activeCandles = getActiveCandles();
    if (activeCandles.length === 0) return;
    const current = activeCandles[activeCandles.length - 1];
    State.currentBid = current.close;
    State.currentAsk = parseFloat((State.currentBid + State.spread).toFixed(3));
    updateTradingPanelUI();
    updatePositionsProfit();
    
    replayCandleCountEl.textContent = `الشموع: ${State.replayIndex + 1} / ${State.candles.length}`;
}

function playReplay() {
    if (State.replayPlaying) return;
    State.replayPlaying = true;
    replayPlayBtn.style.opacity = 0.5;
    replayPauseBtn.style.opacity = 1;
    
    const intervalDuration = 2000 / State.replaySpeed;
    State.replayIntervalId = setInterval(() => {
        if (State.replayIndex < State.candles.length - 1) {
            State.replayIndex++;
            syncReplayCandleData();
            State.panOffset = 0;
            drawChart();
        } else {
            pauseReplay();
        }
    }, intervalDuration);
}

function pauseReplay() {
    State.replayPlaying = false;
    replayPlayBtn.style.opacity = 1;
    replayPauseBtn.style.opacity = 0.5;
    if (State.replayIntervalId) {
        clearInterval(State.replayIntervalId);
        State.replayIntervalId = null;
    }
}

function adjustReplaySpeed(speed) {
    State.replaySpeed = speed;
    speedButtons.forEach(btn => {
        if (parseInt(btn.dataset.speed) === speed) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    if (State.replayPlaying) {
        pauseReplay();
        playReplay();
    }
}

function stepReplayForward() {
    pauseReplay();
    if (State.replayIndex < State.candles.length - 1) {
        State.replayIndex++;
        syncReplayCandleData();
        State.panOffset = 0;
        drawChart();
    }
}

function stepReplayBackward() {
    pauseReplay();
    if (State.replayIndex > 0) {
        State.replayIndex--;
        syncReplayCandleData();
        drawChart();
    }
}

// Replay UI trigger
replayPanelToggle.addEventListener('click', () => {
    replayWidget.classList.toggle('hidden');
    if (!replayWidget.classList.contains('hidden') && !State.replayMode) {
        toggleReplayMode();
    } else if (replayWidget.classList.contains('hidden') && State.replayMode) {
        toggleReplayMode();
    }
});

replayPlayBtn.addEventListener('click', playReplay);
replayPauseBtn.addEventListener('click', pauseReplay);
replayNextBtn.addEventListener('click', stepReplayForward);
replayPrevBtn.addEventListener('click', stepReplayBackward);

speedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        adjustReplaySpeed(parseInt(btn.dataset.speed));
    });
});

// --- TRADING OPERATIONS ---
function placeOrder(type) {
    const lotSize = parseFloat(lotInput.value);
    if (isNaN(lotSize) || lotSize <= 0) {
        alert('الرجاء إدخال حجم لوت صحيح.');
        return;
    }
    
    const price = type === 'BUY' ? State.currentAsk : State.currentBid;
    
    const newPos = {
        id: 'pos_' + Date.now(),
        type,
        openPrice: price,
        lot: lotSize,
        time: new Date(),
        profit: 0.00
    };
    
    State.positions.push(newPos);
    updatePositionsProfit();
    updateTradeTabUI();
    drawChart();
    
    switchPage('page-chart');
}

function updatePositionsProfit() {
    const currentPrice = State.currentBid;
    let totalProfit = 0;
    
    State.positions.forEach(pos => {
        if (pos.type === 'BUY') {
            pos.profit = (State.currentBid - pos.openPrice) * pos.lot * State.contractSize;
        } else {
            pos.profit = (pos.openPrice - State.currentAsk) * pos.lot * State.contractSize;
        }
        totalProfit += pos.profit;
    });
    
    State.equity = State.balance + totalProfit;
    State.marginFree = State.equity;
    
    balanceValEl.textContent = `$${State.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    equityValEl.textContent = `$${State.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    marginFreeValEl.textContent = `$${State.marginFree.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    if (totalProfit >= 0) {
        equityValEl.style.color = '#2e7d32';
    } else {
        equityValEl.style.color = varColor('--mt5-red', '#e53935');
    }
}

function closePosition(posId) {
    const idx = State.positions.findIndex(p => p.id === posId);
    if (idx === -1) return;
    
    const pos = State.positions[idx];
    const closePrice = pos.type === 'BUY' ? State.currentBid : State.currentAsk;
    let profit = 0;
    if (pos.type === 'BUY') {
        profit = (closePrice - pos.openPrice) * pos.lot * State.contractSize;
    } else {
        profit = (pos.openPrice - closePrice) * pos.lot * State.contractSize;
    }
    
    State.balance += profit;
    State.positions.splice(idx, 1);
    
    State.history.push({
        ...pos,
        closePrice,
        closeTime: new Date(),
        profit
    });
    
    updatePositionsProfit();
    updateTradeTabUI();
    updateHistoryTabUI();
    drawChart();
}

function updateTradeTabUI() {
    positionsListContainer.innerHTML = '';
    
    if (State.positions.length === 0) {
        positionsListContainer.innerHTML = '<div class="no-positions">لا توجد صفقات مفتوحة حالياً.</div>';
        return;
    }
    
    State.positions.forEach(pos => {
        const item = document.createElement('div');
        item.className = 'position-item';
        
        const isProfit = pos.profit >= 0;
        const profitClass = isProfit ? 'profit' : 'loss';
        const typeClass = pos.type.toLowerCase();
        
        item.innerHTML = `
            <div class="pos-header">
                <div>
                    <span class="pos-symbol">XAUUSD</span>
                    <span class="pos-type-lot ${typeClass}">${pos.type === 'BUY' ? 'شراء' : 'بيع'} ${pos.lot.toFixed(2)}</span>
                </div>
                <div class="pos-profit ${profitClass}">${pos.profit >= 0 ? '+' : ''}${pos.profit.toFixed(2)} USD</div>
            </div>
            <div class="pos-details">
                <span>سعر الدخول: ${pos.openPrice.toFixed(2)}</span>
                <span>السعر الحالي: ${State.currentBid.toFixed(2)}</span>
            </div>
            <button class="close-btn" onclick="closePosition('${pos.id}')">إغلاق الصفقة</button>
        `;
        positionsListContainer.appendChild(item);
    });
}

function updateHistoryTabUI() {
    historyListContainer.innerHTML = '';
    
    if (State.history.length === 0) {
        historyListContainer.innerHTML = '<div class="no-history">لا توجد صفقات مغلقة في السجل.</div>';
        return;
    }
    
    State.history.forEach(item => {
        const el = document.createElement('div');
        el.className = 'history-item';
        
        const isProfit = item.profit >= 0;
        const profitClass = isProfit ? 'profit' : 'loss';
        const typeClass = item.type.toLowerCase();
        
        el.innerHTML = `
            <div class="pos-header">
                <div>
                    <span class="pos-symbol">XAUUSD</span>
                    <span class="pos-type-lot ${typeClass}">${item.type === 'BUY' ? 'شراء' : 'بيع'} ${item.lot.toFixed(2)}</span>
                </div>
                <div class="pos-profit ${profitClass}">${item.profit >= 0 ? '+' : ''}${item.profit.toFixed(2)} USD</div>
            </div>
            <div class="pos-details">
                <span>دخول: ${item.openPrice.toFixed(2)}</span>
                <span>خروج: ${item.closePrice.toFixed(2)}</span>
            </div>
            <div class="pos-details" style="margin-top: 4px; font-size: 10px;">
                <span>الوقت: ${item.closeTime.toLocaleTimeString()}</span>
            </div>
        `;
        historyListContainer.appendChild(el);
    });
}

window.closePosition = closePosition;

// Quick Buy/Sell click event listeners
document.getElementById('quick-sell-btn').addEventListener('click', () => placeOrder('SELL'));
document.getElementById('quick-buy-btn').addEventListener('click', () => placeOrder('BUY'));

// Lot adjustments
document.getElementById('lot-up').addEventListener('click', () => {
    State.currentLot = parseFloat((State.currentLot + 0.05).toFixed(2));
    lotInput.value = State.currentLot.toFixed(2);
});

document.getElementById('lot-down').addEventListener('click', () => {
    State.currentLot = Math.max(0.01, parseFloat((State.currentLot - 0.05).toFixed(2)));
    lotInput.value = State.currentLot.toFixed(2);
});

lotInput.addEventListener('change', (e) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val) || val <= 0) val = 1.00;
    State.currentLot = val;
    e.target.value = val.toFixed(2);
});

// --- NAVIGATION SWITCHER & ROUTING ---
function switchPage(targetPageId) {
    pages.forEach(p => {
        if (p.id === targetPageId) {
            p.classList.remove('hidden');
        } else {
            p.classList.add('hidden');
        }
    });
    
    // Update bottom nav visual tab indicator overlays
    const maskChartGrey = document.getElementById('nav-mask-chart-grey');
    const tintActive = document.getElementById('nav-tint-active');
    
    if (maskChartGrey && tintActive) {
        if (targetPageId === 'page-chart') {
            // Chart page is active: no masks/tints needed (default image is correct)
            maskChartGrey.classList.remove('active');
            tintActive.classList.remove('active');
        } else {
            // Other page is active: make chart tab grey, and tint the active tab blue
            maskChartGrey.classList.add('active');
            tintActive.classList.add('active');
            
            // Position the blue tint over the active tab column
            // Columns from right to left: Quotes (0), Chart (1), Trade (2), History (3), Settings (4)
            let columnIdx = 1; // default to chart
            if (targetPageId === 'page-quotes') columnIdx = 0;
            else if (targetPageId === 'page-trade') columnIdx = 2;
            else if (targetPageId === 'page-history') columnIdx = 3;
            else if (targetPageId === 'page-settings') columnIdx = 4;
            
            tintActive.style.right = `${columnIdx * 20}%`;
        }
    }
    
    if (targetPageId === 'page-chart') {
        setTimeout(resizeCanvas, 50);
    }
}

// Image overlay click listeners mapping bottom tab buttons
document.getElementById('nav-quotes').addEventListener('click', () => switchPage('page-quotes'));
document.getElementById('nav-chart').addEventListener('click', () => switchPage('page-chart'));
document.getElementById('nav-trade').addEventListener('click', () => switchPage('page-trade'));
document.getElementById('nav-history').addEventListener('click', () => switchPage('page-history'));
document.getElementById('nav-settings').addEventListener('click', () => switchPage('page-settings'));

// Image overlay click listeners mapping top toolbar buttons
document.getElementById('quick-trade-toggle-btn').addEventListener('click', () => {
    oneClickPanel.classList.toggle('hidden');
    setTimeout(resizeCanvas, 150);
});

// Timeframe Dropdown selector logic
const tfClockBtn = document.getElementById('tf-clock-btn');
const tfDisplayBtn = document.getElementById('tf-display-btn');
const tfDropdown = document.getElementById('tf-dropdown');
const activeTfDisplay = document.getElementById('active-tf-display');

function toggleTimeframeDropdown() {
    tfDropdown.classList.toggle('hidden');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!tfDropdown.classList.contains('hidden') && 
        !tfDropdown.contains(e.target) && 
        e.target !== tfClockBtn && 
        (!tfDisplayBtn || e.target !== tfDisplayBtn)) {
        tfDropdown.classList.add('hidden');
    }
});

tfClockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTimeframeDropdown();
});

if (tfDisplayBtn) {
    tfDisplayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTimeframeDropdown();
    });
}

// Dropdown options click handler
document.querySelectorAll('.tf-option').forEach(option => {
    option.addEventListener('click', () => {
        // Remove active class from all options
        document.querySelectorAll('.tf-option').forEach(opt => opt.classList.remove('active'));
        // Add active class to clicked option
        option.classList.add('active');
        
        const tf = option.dataset.tf;
        activeTfDisplay.textContent = tf;
        tfDisplayBtn.textContent = tf; // update the top-right button label!
        
        // Update timeframe state minutes
        let mins = 5;
        if (tf === 'M1') mins = 1;
        else if (tf === 'M5') mins = 5;
        else if (tf === 'M15') mins = 15;
        else if (tf === 'M30') mins = 30;
        else if (tf === 'H1') mins = 60;
        else if (tf === 'H4') mins = 240;
        else if (tf === 'D1') mins = 1440;
        
        State.timeframeMinutes = mins;
        
        // Regenerate mock data for new timeframe
        generateMockData();
        drawChart();
        
        // Hide dropdown
        tfDropdown.classList.add('hidden');
    });
});

document.getElementById('elements-overlay-btn').addEventListener('click', () => {
    alert('وضع رسم العناصر والمستويات الفنية مفعل (الخطوط الأفقية والمستويات)');
});

document.getElementById('indicators-overlay-btn').addEventListener('click', () => {
    alert('قائمة المؤشرات الفنية (المتوسطات المتحركة، مؤشر القوة RSI)');
});

// Crosshair overlay toggle
document.getElementById('crosshair-overlay-btn').addEventListener('click', () => {
    State.isCrosshairActive = !State.isCrosshairActive;
    if (State.isCrosshairActive) {
        State.crosshairX = State.width / 2;
        State.crosshairY = State.height / 2;
    }
    drawChart();
});

// Click chart info to toggle timeframe dropdown
document.getElementById('chart-title-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTimeframeDropdown();
});

// --- SETTINGS CONTROLS ---
resetBalanceBtn.addEventListener('click', () => {
    const val = parseFloat(initialBalanceInput.value);
    if (!isNaN(val) && val > 0) {
        State.balance = val;
        State.equity = val;
        State.marginFree = val;
        State.positions = [];
        State.history = [];
        updatePositionsProfit();
        updateTradeTabUI();
        updateHistoryTabUI();
        alert('تمت إعادة تهيئة رصيد الحساب التجريبي بنجاح!');
        switchPage('page-trade');
    }
});

resetDataBtn.addEventListener('click', () => {
    generateMockData();
    drawChart();
    alert('تم استعادة البيانات التاريخية الافتراضية.');
});

// CSV file upload handler
csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const text = event.target.result;
            const lines = text.split('\n');
            const newCandles = [];
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const cols = line.split(',');
                if (cols.length < 5) continue;
                
                let timeVal, open, high, low, close;
                
                if (cols.length >= 6) {
                    const dateTimeStr = cols[0] + ' ' + cols[1];
                    timeVal = new Date(dateTimeStr);
                    open = parseFloat(cols[2]);
                    high = parseFloat(cols[3]);
                    low = parseFloat(cols[4]);
                    close = parseFloat(cols[5]);
                } else {
                    timeVal = new Date(cols[0]);
                    open = parseFloat(cols[1]);
                    high = parseFloat(cols[2]);
                    low = parseFloat(cols[3]);
                    close = parseFloat(cols[4]);
                }
                
                if (isNaN(timeVal.getTime()) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
                    continue; 
                }
                
                newCandles.push({
                    time: timeVal,
                    timeLabel: formatTimeLabel(timeVal),
                    open,
                    high,
                    low,
                    close
                });
            }
            
            if (newCandles.length > 0) {
                newCandles.sort((a, b) => a.time.getTime() - b.time.getTime());
                State.candles = newCandles;
                State.replayIndex = Math.min(50, newCandles.length - 1);
                
                const latest = newCandles[newCandles.length - 1];
                State.currentBid = latest.close;
                State.currentAsk = latest.close + State.spread;
                updateTradingPanelUI();
                
                drawChart();
                alert(`تم استيراد ${newCandles.length} شمعة بنجاح!`);
                switchPage('page-chart');
            } else {
                alert('فشل في العثور على شموع صالحة بالملف. يرجى التحقق من صياغة البيانات.');
            }
        } catch (err) {
            alert('حدث خطأ أثناء قراءة ملف CSV: ' + err.message);
        }
    };
    reader.readAsText(file);
});

// --- INITIALIZATION ---
window.addEventListener('load', () => {
    generateMockData();
    resizeCanvas();
    updateTradingPanelUI();
    updatePositionsProfit();
    
    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('PWA Service Worker Registered'))
            .catch(err => console.log('Service Worker Registration Failed:', err));
    }
});

window.addEventListener('resize', resizeCanvas);
