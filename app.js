/**
 * MT5 Chart Simulator - XAUUSD M5
 * Core Application Logic (Hybrid Interactive Image & Canvas Mockup)
 */

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
    isReplaySelectMode: false,
    replaySelectIndex: -1,
    replayIndex: 50,    // Number of candles revealed so far in replay mode
    replayIntervalId: null,
    replaySpeed: 1,     // Speed multiplier (1x, 2x, 5x, 10x)
    replayPlaying: false,
    
    // Timeframe Configuration
    timeframeMinutes: 5,
    
    // Customizable Chart Colors
    colors: JSON.parse(localStorage.getItem('mt5_chart_colors')) || {
        foreground: '#6e717a',
        grid: '#e2e2e4',
        barUp: '#2962ff',
        barDown: '#ff1744',
        bull: '#2962ff',
        bear: '#ff1744',
        chartLine: '#00e676',
        volumes: '#00b0ff',
        bidLine: '#00A86B',
        askLine: '#ff9f0a',
        stopLevels: '#d50000'
    }
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

// Color customization inputs
const colorInputs = {
    foreground: document.getElementById('color-foreground'),
    grid: document.getElementById('color-grid'),
    barUp: document.getElementById('color-bar-up'),
    barDown: document.getElementById('color-bar-down'),
    bull: document.getElementById('color-bull'),
    bear: document.getElementById('color-bear'),
    chartLine: document.getElementById('color-chart-line'),
    volumes: document.getElementById('color-volumes'),
    bidLine: document.getElementById('color-bid-line'),
    askLine: document.getElementById('color-ask-line'),
    stopLevels: document.getElementById('color-stop-levels')
};

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

let isRedrawPending = false;
function drawChart() {
    if (isRedrawPending) return;
    isRedrawPending = true;
    requestAnimationFrame(() => {
        isRedrawPending = false;
        drawChartFrame();
    });
}

function drawChartFrame() {
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
        priceMin = State.manualYMin;
        priceMax = State.manualYMax;
    }
    
    const RIGHT_PADDING = 25; // 25px gap between latest candle and price axis line
    
    // Coordinate conversions
    function getX(candleIndex) {
        const offsetFromEnd = endIndex - candleIndex;
        return MARGIN_LEFT + chartWidth - RIGHT_PADDING - (offsetFromEnd * candleSpacing) - (candleSpacing / 2);
    }
    
    function getY(price) {
        return MARGIN_TOP + chartHeight - ((price - priceMin) / (priceMax - priceMin)) * chartHeight;
    }
    
    function getPriceFromY(y) {
        return priceMin + ((MARGIN_TOP + chartHeight - y) / chartHeight) * (priceMax - priceMin);
    }
    
    // 1. Draw Dotted Grid Lines
    ctx.save();
    ctx.strokeStyle = State.colors.grid;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([1, 2]); // dotted lines
    ctx.font = '12px ' + FONT_STACK;
    ctx.fillStyle = State.colors.foreground;
    
    // Price grid lines: 15 labels, spaced to fit exactly 99px top offset and 135px bottom offset.
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
        ctx.strokeStyle = State.colors.grid;
        ctx.lineWidth = 1;
        
        // Draw axis tick pointing rightwards
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT + chartWidth, y);
        ctx.lineTo(MARGIN_LEFT + chartWidth + 3, y);
        ctx.stroke();
        
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '1.7px';
        ctx.fillStyle = State.colors.foreground;
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
        ctx.strokeStyle = State.colors.grid;
        ctx.lineWidth = 1;
        
        // Draw axis tick pointing downwards (adding 4 to y)
        ctx.beginPath();
        ctx.moveTo(x, MARGIN_TOP + chartHeight);
        ctx.lineTo(x, MARGIN_TOP + chartHeight + 4);
        ctx.stroke();
        
        if (index < targetXPositions.length - 1) {
            ctx.textAlign = 'left';
            ctx.font = '11px ' + FONT_STACK;
            ctx.fillStyle = State.colors.foreground;
            ctx.fillText(candle.timeLabel, x + 3, MARGIN_TOP + chartHeight + 14, 73);
        }
        ctx.restore();
    });
    ctx.restore();
    
    // 2. Draw Candlesticks (Custom Colors: barUp, barDown, bull, bear)
    visibleCandles.forEach((candle, idx) => {
        const absIdx = startIndex + idx;
        const x = getX(absIdx);
        
        const yOpen = getY(candle.open);
        const yClose = getY(candle.close);
        const yHigh = getY(candle.high);
        const yLow = getY(candle.low);
        
        const isBullish = candle.close >= candle.open;
        const strokeColor = isBullish ? State.colors.barUp : State.colors.barDown;
        const fillColor = isBullish ? State.colors.bull : State.colors.bear;
        
        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = fillColor;
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
    
    // 3. Draw Active Trade Lines (BUY / SELL)
    State.positions.forEach(pos => {
        // Initialize animated variables if not already initialized
        if (pos.opacity === undefined) pos.opacity = 0;
        if (pos.animatedPrice === undefined) pos.animatedPrice = pos.openPrice;
        
        const y = getY(pos.animatedPrice);
        if (y < MARGIN_TOP || y > MARGIN_TOP + chartHeight) return;
        
        const isBuy = pos.type === 'BUY';
        
        // Colors & fonts matching MT5 on iPhone 100%
        const textColor = isBuy ? '#007aff' : '#e73d2b';
        const strokeColor = isBuy ? '#007aff' : '#e73d2b';
        const boxBgColor = '#FFFFFF';
        
        ctx.save();
        ctx.globalAlpha = 0.7 * pos.opacity; // Opacity 0.7 for dashed line
        ctx.strokeStyle = strokeColor;
        ctx.setLineDash([5, 5]); // Dash pattern: 5px 5px
        ctx.lineWidth = 1.0;      // Stroke width: 1px
        
        const boxX = MARGIN_LEFT + chartWidth + 1;
        
        // 1. Draw Dashed Line (extends from start of chart to start of price box)
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(boxX, y);
        ctx.stroke();
        ctx.restore();
        
        // 2. Draw Text (BUY [lotSize] or SELL [lotSize]) slightly above the dashed line
        ctx.save();
        ctx.globalAlpha = pos.opacity;
        ctx.fillStyle = textColor;
        ctx.font = '400 10px "Helvetica Neue", Helvetica, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.letterSpacing = 'normal'; // Standard spacing
        
        const lotText = pos.lot % 1 === 0 ? pos.lot.toFixed(0) : pos.lot.toString();
        const textContent = `${pos.type} ${lotText}`;
        ctx.fillText(textContent, 5, y - 2); // 5px left margin, 2px above line
        ctx.restore();
        
        // 3. Draw Price Box stuck to right axis
        ctx.save();
        ctx.globalAlpha = pos.opacity;
        
        ctx.font = '400 10px "Helvetica Neue", Helvetica, Arial, sans-serif';
        const priceText = pos.openPrice.toFixed(3);
        const textWidth = ctx.measureText(priceText).width;
        
        const boxWidth = textWidth + 12; // 6px left, 6px right padding
        const boxHeight = 22; // Height: 22px
        const boxY = y - boxHeight / 2; // Center vertically
        
        // Draw background
        ctx.fillStyle = boxBgColor;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        
        // Draw border: 1px Solid
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 1.0;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        
        // Draw price text
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(priceText, boxX + boxWidth / 2, y);
        ctx.restore();
    });
    
    // 4. Draw Current Price Lines (Bid and Ask) and Boxes
    
    // Draw Ask Line (Ask is higher than Bid)
    const askY = getY(State.currentAsk);
    if (askY >= MARGIN_TOP && askY <= MARGIN_TOP + chartHeight) {
        ctx.save();
        ctx.strokeStyle = State.colors.askLine;
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT, askY);
        ctx.lineTo(MARGIN_LEFT + chartWidth, askY);
        ctx.stroke();
        ctx.restore();
        
        ctx.save();
        const boxWidth = 62;
        const boxHeight = 14;
        const boxX = MARGIN_LEFT + chartWidth + 2;
        const boxY = askY - boxHeight / 2;
        
        // Draw ask price box: solid background
        ctx.fillStyle = State.colors.askLine;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        
        // Price text
        ctx.fillStyle = '#ffffff';
        ctx.font = '400 12px ' + FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '1.7px';
        ctx.fillText(State.currentAsk.toFixed(3), boxX + boxWidth / 2, askY, 55);
        ctx.restore();
    }

    // Draw Bid Line
    const bidY = getY(State.currentBid);
    if (bidY >= MARGIN_TOP && bidY <= MARGIN_TOP + chartHeight) {
        ctx.save();
        ctx.strokeStyle = State.colors.bidLine;
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT, bidY);
        ctx.lineTo(MARGIN_LEFT + chartWidth, bidY);
        ctx.stroke();
        ctx.restore();
        
        ctx.save();
        const boxWidth = 62;
        const boxHeight = 14;
        const boxX = MARGIN_LEFT + chartWidth + 2;
        const boxY = bidY - boxHeight / 2;
        
        // Draw bid price box: solid background
        ctx.fillStyle = State.colors.bidLine;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        
        // Price text
        ctx.fillStyle = '#ffffff';
        ctx.font = '400 12px ' + FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '1.7px';
        ctx.fillText(State.currentBid.toFixed(3), boxX + boxWidth / 2, bidY, 55);
        ctx.restore();
    }
    
    // 5. Draw Axis Separators & Three Dots
    ctx.save();
    ctx.strokeStyle = State.colors.grid;
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
    
    // Draw three circles grouping together to form '...'
    const dotY = 640;
    const dotX = MARGIN_LEFT + chartWidth + 34;
    ctx.fillStyle = State.colors.foreground;
    
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
    
    // 7. Draw Replay Cut Selection Line and Floating Banner
    if (State.isReplaySelectMode) {
        ctx.save();
        ctx.fillStyle = 'rgba(229, 57, 53, 0.9)'; // Red banner background
        
        const drawRoundedRect = (x, y, w, h, r) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
            ctx.fill();
        };
        
        const bannerW = 200;
        const bannerH = 26;
        const bannerX = (chartWidth - bannerW) / 2;
        const bannerY = 8;
        
        drawRoundedRect(bannerX, bannerY, bannerW, bannerH, 6);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px ' + FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✂ انقر على شمعة لبدء الإعادة', bannerX + bannerW / 2, bannerY + bannerH / 2);
        ctx.restore();
        
        if (State.replaySelectIndex !== -1) {
            const cutX = getX(State.replaySelectIndex);
            ctx.save();
            ctx.strokeStyle = '#e53935'; // red
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            
            ctx.beginPath();
            ctx.moveTo(cutX, 0);
            ctx.lineTo(cutX, MARGIN_TOP + chartHeight);
            ctx.stroke();
            
            ctx.fillStyle = '#e53935';
            ctx.font = 'bold 10px ' + FONT_STACK;
            ctx.textAlign = 'center';
            ctx.fillText('✂ بدء الإعادة', cutX, 42);
            ctx.restore();
        }
    }
    
    // 8. Update Active Trade Lines Animations (Fade-in and LERP slide)
    let needsMoreFrames = false;
    State.positions.forEach(pos => {
        // Opacity fade in (approx 150ms at 60fps)
        if (pos.opacity === undefined) pos.opacity = 0;
        if (pos.opacity < 1.0) {
            pos.opacity += 0.12; 
            if (pos.opacity > 1.0) pos.opacity = 1.0;
            needsMoreFrames = true;
        }
        
        // Price slide animation (approx 100-150ms at 60fps)
        if (pos.animatedPrice === undefined) pos.animatedPrice = pos.openPrice;
        const diff = pos.openPrice - pos.animatedPrice;
        if (Math.abs(diff) > 0.0001) {
            pos.animatedPrice += diff * 0.25;
            needsMoreFrames = true;
        } else {
            pos.animatedPrice = pos.openPrice;
        }
    });
    
    if (needsMoreFrames) {
        drawChart();
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
let initialZoom = 12;
let touchStartDist = 0;

let initialPriceMin = 0;
let initialPriceMax = 0;
let anchorPrice = 0;

function getCandleIndexFromX(x) {
    const activeCandles = getActiveCandles();
    const totalCount = activeCandles.length;
    if (totalCount === 0) return -1;
    
    const RIGHT_PADDING = 25;
    const candleSpacing = State.zoom;
    const chartWidth = State.width - MARGIN_RIGHT - MARGIN_LEFT;
    
    let endIndex = totalCount - 1 - State.panOffset;
    if (endIndex < 0) endIndex = 0;
    
    const offsetFromEnd = (MARGIN_LEFT + chartWidth - RIGHT_PADDING - (candleSpacing / 2) - x) / candleSpacing;
    const candleIndex = endIndex - Math.round(offsetFromEnd);
    
    const maxVisible = Math.ceil(chartWidth / candleSpacing);
    let startIndex = endIndex - maxVisible;
    if (startIndex < 0) startIndex = 0;
    
    return Math.max(startIndex, Math.min(endIndex, candleIndex));
}

function getPriceFromYGlobal(y) {
    const chartHeight = State.height - MARGIN_BOTTOM - MARGIN_TOP;
    return State.manualYMin + ((MARGIN_TOP + chartHeight - y) / chartHeight) * (State.manualYMax - State.manualYMin);
}

function handlePointerDown(e) {
    // Prevent default browser gestures (zoom/pan)
    if (e.cancelable) {
        e.preventDefault();
    }
    
    const rect = canvas.getBoundingClientRect();
    const isTouch = e.touches && e.touches.length > 0;
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Replay mode start candle selection click
    if (State.isReplaySelectMode) {
        const clickedIdx = getCandleIndexFromX(x);
        if (clickedIdx !== -1) {
            State.replayIndex = clickedIdx;
            State.isReplaySelectMode = false;
            State.replayMode = true;
            replayWidget.classList.remove('hidden');
            syncReplayCandleData();
            pauseReplay();
            drawChart();
        }
        return;
    }
    
    // Check if right axis is touched
    const chartWidth = State.width - MARGIN_RIGHT - MARGIN_LEFT;
    const isRightAxis = x > MARGIN_LEFT + chartWidth;
    
    // Pinch to zoom check (2 fingers)
    if (e.touches && e.touches.length === 2) {
        isDragging = false;
        isPriceScaling = false;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        initialZoom = State.zoom;
        return;
    }
    
    if (isRightAxis) {
        isPriceScaling = true;
        isDragging = false;
        State.isAutoYScale = false;
        dragStartY = y;
        initialPriceMin = State.manualYMin;
        initialPriceMax = State.manualYMax;
        
        // Save price anchor corresponding to start Y
        anchorPrice = getPriceFromYGlobal(y);
    } else {
        isDragging = true;
        isPriceScaling = false;
        dragStartX = x;
        dragStartY = y;
        initialPanOffset = State.panOffset;
        initialPriceMin = State.manualYMin;
        initialPriceMax = State.manualYMax;
    }
}

function handlePointerMove(e) {
    if (e.cancelable) {
        e.preventDefault();
    }
    
    const rect = canvas.getBoundingClientRect();
    const isTouch = e.touches && e.touches.length > 0;
    
    // Handle multi-touch pinch to zoom (2 fingers)
    if (e.touches && e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const factor = dist / touchStartDist;
        
        State.zoom = Math.max(3, Math.min(30, initialZoom * factor));
        drawChart();
        return;
    }
    
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Replay mode hover selection line
    if (State.isReplaySelectMode) {
        State.replaySelectIndex = getCandleIndexFromX(x);
        drawChart();
        return;
    }
    
    if (State.isCrosshairActive) {
        State.crosshairX = Math.max(MARGIN_LEFT, Math.min(x, State.width - MARGIN_RIGHT));
        State.crosshairY = Math.max(MARGIN_TOP, Math.min(y, State.height - MARGIN_BOTTOM));
        drawChart();
        return;
    }
    
    const chartHeight = State.height - MARGIN_BOTTOM - MARGIN_TOP;
    
    if (isPriceScaling) {
        const dy = y - dragStartY;
        // Exponential scale factor relative to the touch drag displacement
        const factor = Math.pow(1.005, dy);
        
        State.manualYMin = anchorPrice - (anchorPrice - initialPriceMin) * factor;
        State.manualYMax = anchorPrice + (initialPriceMax - anchorPrice) * factor;
        drawChart();
        return;
    }
    
    if (isDragging) {
        const dx = x - dragStartX;
        const dy = y - dragStartY;
        
        // Pan horizontally
        const candlesDiff = Math.round(dx / State.zoom);
        State.panOffset = Math.max(0, initialPanOffset + candlesDiff);
        
        // Pan vertically (switch to manual Y scale if dragged vertically)
        if (Math.abs(dy) > 5 && State.isAutoYScale) {
            State.isAutoYScale = false;
            initialPriceMin = State.manualYMin;
            initialPriceMax = State.manualYMax;
            dragStartY = y; // Reset start coordinates to avoid sudden jump
        }
        
        if (!State.isAutoYScale) {
            const priceRange = initialPriceMax - initialPriceMin;
            const pricePerPixel = priceRange / chartHeight;
            const priceShift = -dy * pricePerPixel;
            
            State.manualYMin = initialPriceMin + priceShift;
            State.manualYMax = initialPriceMax + priceShift;
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
    // Reset to Auto Y scaling on double click/tap anywhere on chart
    State.isAutoYScale = true;
    State.panOffsetY = 0;
    drawChart();
}

function handleWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    State.zoom = Math.max(3, Math.min(30, State.zoom * factor));
    drawChart();
}

// Bind Events with { passive: false } for touches to block default browser zooming/scrolling gestures on canvas
canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('mousemove', handlePointerMove);
window.addEventListener('mouseup', handlePointerUp);
canvas.addEventListener('dblclick', handleDoubleClick);
canvas.addEventListener('wheel', handleWheel, { passive: false });

canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
window.addEventListener('touchend', handlePointerUp, { passive: false });

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
    if (State.replayMode || State.isReplaySelectMode) {
        // Exit replay mode & select mode
        State.replayMode = false;
        State.isReplaySelectMode = false;
        State.replaySelectIndex = -1;
        replayWidget.classList.add('hidden');
        pauseReplay();
        
        // Reset prices to match the latest live data
        if (State.candles.length > 0) {
            const latest = State.candles[State.candles.length - 1];
            State.currentBid = latest.close;
            State.currentAsk = parseFloat((State.currentBid + State.spread).toFixed(3));
            updateTradingPanelUI();
            updatePositionsProfit();
        }
    } else {
        // Enter select mode (cutter mode)
        State.isReplaySelectMode = true;
        State.replaySelectIndex = -1;
        replayWidget.classList.add('hidden'); // Keep panel hidden during select mode
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

// Replay UI triggers
replayPanelToggle.addEventListener('click', () => {
    if (State.replayMode) {
        // Toggle visibility (minimize / restore) of the controls widget
        replayWidget.classList.toggle('hidden');
    } else {
        toggleReplayMode();
    }
});

const replayMinimizeBtn = document.getElementById('replay-minimize');
if (replayMinimizeBtn) {
    replayMinimizeBtn.addEventListener('click', () => {
        // Just hide the widget panel, keeping replay mode active!
        replayWidget.classList.add('hidden');
    });
}

const replayCloseBtn = document.getElementById('replay-close');
if (replayCloseBtn) {
    replayCloseBtn.addEventListener('click', () => {
        // Exit replay mode completely
        State.replayMode = false;
        State.isReplaySelectMode = false;
        State.replaySelectIndex = -1;
        replayWidget.classList.add('hidden');
        pauseReplay();
        
        // Reset prices to match the latest live data
        if (State.candles.length > 0) {
            const latest = State.candles[State.candles.length - 1];
            State.currentBid = latest.close;
            State.currentAsk = parseFloat((State.currentBid + State.spread).toFixed(3));
            updateTradingPanelUI();
            updatePositionsProfit();
        }
        drawChart();
    });
}

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
    localStorage.removeItem('mt5_imported_candles');
    localStorage.removeItem('mt5_imported_filename');
    localStorage.removeItem('mt5_chart_colors');
    
    // Restore default colors
    State.colors = {
        foreground: '#6e717a',
        grid: '#e2e2e4',
        barUp: '#2962ff',
        barDown: '#ff1744',
        bull: '#2962ff',
        bear: '#ff1744',
        chartLine: '#00e676',
        volumes: '#00b0ff',
        bidLine: '#00A86B',
        askLine: '#ff9f0a',
        stopLevels: '#d50000'
    };
    
    // Update color inputs
    Object.keys(colorInputs).forEach(key => {
        const input = colorInputs[key];
        if (input) input.value = State.colors[key];
    });
    
    generateMockData();
    drawChart();
    alert('تم استعادة البيانات التاريخية الافتراضية وحذف الملف المحفوظ والألوان المخصصة.');
});

// Bind Color inputs change events
Object.keys(colorInputs).forEach(key => {
    const input = colorInputs[key];
    if (input) {
        input.value = State.colors[key];
        input.addEventListener('input', (e) => {
            State.colors[key] = e.target.value;
            localStorage.setItem('mt5_chart_colors', JSON.stringify(State.colors));
            drawChart();
        });
    }
});

// Reusable CSV parsing function
function parseAndLoadCSVData(text) {
    const lines = text.split('\n');
    let newCandles = [];
    
    // Check if file is tab-separated (tick data) or comma-separated
    const firstLine = lines[0] || "";
    const isTabSeparated = firstLine.includes('\t');
    
    if (isTabSeparated && (firstLine.includes('BID') || firstLine.includes('ASK'))) {
        // High-performance tick data aggregator
        const map = new Map();
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            
            const cols = line.split('\t');
            if (cols.length < 3) continue;
            
            const dateStr = cols[0].trim(); // e.g. "2026.06.24"
            const timeStr = cols[1].trim(); // e.g. "00:00:00.070"
            const bidVal = parseFloat(cols[2]);
            if (isNaN(bidVal)) continue;
            
            // Extract hour and minute
            const hh = timeStr.substring(0, 2);
            const mm = timeStr.substring(3, 5);
            
            const m = parseInt(mm);
            if (isNaN(m)) continue;
            
            const roundedM = Math.floor(m / State.timeframeMinutes) * State.timeframeMinutes;
            const roundedMStr = String(roundedM).padStart(2, '0');
            
            const key = `${dateStr} ${hh}:${roundedMStr}:00`;
            
            let candle = map.get(key);
            if (!candle) {
                candle = {
                    open: bidVal,
                    high: bidVal,
                    low: bidVal,
                    close: bidVal,
                    dateStr: dateStr.replace(/\./g, '/'),
                    timeStr: `${hh}:${roundedMStr}:00`
                };
                map.set(key, candle);
            } else {
                if (bidVal > candle.high) candle.high = bidVal;
                if (bidVal < candle.low) candle.low = bidVal;
                candle.close = bidVal;
            }
        }
        
        newCandles = Array.from(map.values()).map(c => {
            const dt = new Date(`${c.dateStr} ${c.timeStr}`);
            return {
                time: dt,
                timeLabel: formatTimeLabel(dt),
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close
            };
        });
    } else {
        // Standard comma-separated Direct OHLC parser
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
    }
    
    if (newCandles.length > 0) {
        newCandles.sort((a, b) => a.time.getTime() - b.time.getTime());
        State.candles = newCandles;
        State.replayIndex = Math.min(50, newCandles.length - 1);
        
        const latest = newCandles[newCandles.length - 1];
        State.currentBid = latest.close;
        State.currentAsk = latest.close + State.spread;
        
        // Save to localStorage for persistence across page reloads
        try {
            const simplifiedCandles = newCandles.map(c => ({
                t: c.time.getTime(),
                o: c.open,
                h: c.high,
                l: c.low,
                c: c.close
            }));
            localStorage.setItem('mt5_imported_candles', JSON.stringify(simplifiedCandles));
        } catch (e) {
            console.error('Failed to save candles to localStorage:', e);
        }
        
        return true;
    }
    return false;
}

// CSV file upload handler
csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const text = event.target.result;
            const success = parseAndLoadCSVData(text);
            if (success) {
                updateTradingPanelUI();
                drawChart();
                alert(`تم استيراد ${State.candles.length} شمعة بنجاح!`);
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
    // 1. Try to load from localStorage first
    const saved = localStorage.getItem('mt5_imported_candles');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            const loadedCandles = parsed.map(item => {
                const dt = new Date(item.t);
                return {
                    time: dt,
                    timeLabel: formatTimeLabel(dt),
                    open: item.o,
                    high: item.h,
                    low: item.l,
                    close: item.c
                };
            });
            
            if (loadedCandles.length > 0) {
                console.log(`Loaded ${loadedCandles.length} candles from localStorage cache.`);
                State.candles = loadedCandles;
                State.replayIndex = Math.min(50, loadedCandles.length - 1);
                const latest = loadedCandles[loadedCandles.length - 1];
                State.currentBid = latest.close;
                State.currentAsk = latest.close + State.spread;
                finalizeInit();
                return;
            }
        } catch (e) {
            console.error('Failed to parse cached localStorage candles:', e);
        }
    }

    // 2. Fallback: Try to fetch XAUUSDr.csv on startup
    fetch('XAUUSDr.csv')
        .then(response => {
            if (!response.ok) throw new Error('File not found');
            return response.text();
        })
        .then(text => {
            console.log('Found XAUUSDr.csv, parsing and loading...');
            const success = parseAndLoadCSVData(text);
            if (success) {
                console.log('Successfully preloaded CSV data!');
            } else {
                console.warn('CSV parsing returned empty data, falling back to mock data...');
                generateMockData();
            }
            finalizeInit();
        })
        .catch(err => {
            console.log('Could not preload XAUUSDr.csv (likely CORS or file missing), generating mock data:', err.message);
            generateMockData();
            finalizeInit();
        });
});

function finalizeInit() {
    resizeCanvas();
    updateTradingPanelUI();
    updatePositionsProfit();
    
    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('PWA Service Worker Registered'))
            .catch(err => console.log('Service Worker Registration Failed:', err));
    }
}

window.addEventListener('resize', resizeCanvas);
