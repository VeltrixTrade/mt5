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
    zoom: 5.5,           // Default zoom to show 55-60 candles on iPhone 13 Pro
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
    currentLot: 0.01,
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
    rawCSVCandles: [],   // Unaggregated base CSV candles
    
    // Technical drawing state
    isRectToolActive: false,
    isArrowToolActive: false,
    drawings: JSON.parse(localStorage.getItem('mt5_drawings')) || [],
    selectedDrawingIdx: -1,
    isDarkMode: JSON.parse(localStorage.getItem('mt5_dark_mode')) || false,
    
    // Customizable Chart Colors
    colors: JSON.parse(localStorage.getItem('mt5_chart_colors')) || {
        bg: '#ffffff',
        foreground: '#6e717a',
        grid: '#e2e2e4',
        barUp: '#375EEB',
        barDown: '#D03A20',
        bull: '#375EEB',
        bear: '#DD5E56',
        chartLine: '#00e676',
        volumes: '#00b0ff',
        bidLine: '#52A49A',
        askLine: '#DD5E56',
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
    bg: document.getElementById('color-bg'),
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

// Modern system font stack with San Francisco, SF Pro Display, and SFUI-Regular (Apple system fonts)
const FONT_STACK = "'San Francisco', 'SF Pro Display', '.SFUI-Regular', 'SFUI-Regular', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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
    const padding = diff > 0 ? diff * 0.11 : 10;
    
    return {
        min: min - padding,
        max: max + padding
    };
}

function fillTextWithSpacing(ctx, text, x, y, spacing, align = 'left', maxWidth = null) {
    ctx.save();
    
    // Set text direction to LTR to ensure numbers don't reverse
    ctx.direction = 'ltr';
    
    const chars = text.split('');
    const charWidths = chars.map(c => ctx.measureText(c).width);
    const naturalWidth = charWidths.reduce((a, b) => a + b, 0) + (chars.length - 1) * spacing;
    
    // Apply maxWidth scaling factor if text is too wide
    let scaleX = 1.0;
    if (maxWidth !== null && naturalWidth > maxWidth) {
        scaleX = maxWidth / naturalWidth;
    }
    
    let startX = x;
    if (align === 'center') {
        startX = x - (naturalWidth * scaleX) / 2;
    } else if (align === 'right') {
        startX = x - (naturalWidth * scaleX);
    }
    
    ctx.translate(startX, y);
    ctx.scale(scaleX, 1);
    
    let currentX = 0;
    chars.forEach((c, index) => {
        ctx.fillText(c, currentX, 0);
        currentX += charWidths[index] + spacing;
    });
    
    ctx.restore();
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
    ctx.fillStyle = State.colors.bg || '#ffffff';
    ctx.fillRect(0, 0, State.width, State.height);
    
    const activeCandles = getActiveCandles();
    const totalCount = activeCandles.length;
    
    // Calculate candle properties
    const candleSpacing = State.zoom;
    const candleWidth = Math.max(1, Math.floor(candleSpacing * 0.68));
    
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
    
    State.priceMin = priceMin;
    State.priceMax = priceMax;
    
    const RIGHT_PADDING = 0; // No gap between latest candle and price axis line
    
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
    ctx.font = '400 12px ' + FONT_STACK;
    ctx.fillStyle = State.colors.foreground;
    
    // Price grid lines: 15 labels, spaced to fit exactly 99px top offset and 135px bottom offset.
    const priceCount = 15;
    const yStart = 13.5;
    const yStep = 42.785;
    
    for (let i = 0; i < priceCount; i++) {
        const y = yStart + i * yStep;
        const gridPrice = getPriceFromY(y);
        
        // Horizontal grid line removed
        
        ctx.save();
        ctx.setLineDash([]); // solid text and ticks
        ctx.strokeStyle = State.colors.grid;
        ctx.lineWidth = 1;
        
        // Draw axis tick pointing rightwards
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT + chartWidth, y);
        ctx.lineTo(MARGIN_LEFT + chartWidth + 3, y);
        ctx.stroke();
        
        ctx.textBaseline = 'middle';
        ctx.fillStyle = State.colors.foreground;
        fillTextWithSpacing(ctx, gridPrice.toFixed(3), MARGIN_LEFT + chartWidth + 6, y, 2.0, 'left', 56);
        ctx.restore();
    }
    
    // 2. Vertical time grid lines (exactly 4 labels spaced at specific pixel offsets: 33px from left, 96px between each)
    const targetXPositions = [
        MARGIN_LEFT + 33,
        MARGIN_LEFT + 33 + 96,
        MARGIN_LEFT + 33 + 96 * 2,
        MARGIN_LEFT + 33 + 96 * 3
    ];
    
    targetXPositions.forEach((targetX, index) => {
        // Find nearest candle index corresponding to targetX without clamping, so we can extrapolate past/future dates smoothly
        let idx = endIndex - Math.round((MARGIN_LEFT + chartWidth - targetX - candleSpacing / 2) / candleSpacing);
        const timeInfo = getCandleTimeAndDate(idx);
        
        // Cap drawX to be inside the horizontal line (leaving 1px safety padding from the vertical boundary)
        const drawX = Math.min(targetX, MARGIN_LEFT + chartWidth - 1);
        
        // Draw tick mark and time label directly at drawX (fixed screen positions matching MT5 layout)
        ctx.save();
        ctx.setLineDash([]); // solid text and ticks
        ctx.strokeStyle = State.colors.grid;
        ctx.lineWidth = 1;
        
        // Draw axis tick pointing downwards directly at drawX
        ctx.beginPath();
        ctx.moveTo(drawX, MARGIN_TOP + chartHeight);
        ctx.lineTo(drawX, MARGIN_TOP + chartHeight + 4);
        ctx.stroke();
        
        if (index < targetXPositions.length - 1) {
            ctx.textAlign = 'left';
            ctx.font = '11px ' + FONT_STACK;
            ctx.fillStyle = State.colors.foreground;
            // Draw time label aligned to drawX
            ctx.fillText(timeInfo.timeLabel, drawX + 3, MARGIN_TOP + chartHeight + 14, 73);
        }
        ctx.restore();
    });
    ctx.restore();
    
    // 2. Draw Technical Drawings (Rectangles & Arrows)
    ctx.save();
    // Clip drawings to chart active area (0 to chartWidth)
    ctx.beginPath();
    ctx.rect(0, MARGIN_TOP, chartWidth, chartHeight);
    ctx.clip();
    
    // Draw saved drawings
    State.drawings.forEach((d, index) => {
        if (d.type === 'rectangle') {
            const xStart = getX(d.startIdx);
            const xEnd = getX(d.endIdx);
            const yStart = getY(d.startPrice);
            const yEnd = getY(d.endPrice);
            
            const rectX = Math.min(xStart, xEnd);
            const rectY = Math.min(yStart, yEnd);
            const rectW = Math.abs(xEnd - xStart);
            const rectH = Math.abs(yEnd - yStart);
            
            if (d.isFilled) {
                ctx.fillStyle = d.fillColor;
                ctx.globalAlpha = d.fillOpacity !== undefined ? d.fillOpacity : 0.3;
                ctx.fillRect(rectX, rectY, rectW, rectH);
            }
            
            if (d.drawBorder === undefined ? true : d.drawBorder) {
                ctx.strokeStyle = d.borderColor;
                ctx.lineWidth = d.thickness || 1.5;
                ctx.globalAlpha = 1.0;
                
                if (d.dashStyle === 'dashed') {
                    ctx.setLineDash([6, 4]);
                } else if (d.dashStyle === 'dotted') {
                    ctx.setLineDash([2, 2]);
                } else {
                    ctx.setLineDash([]);
                }
                
                ctx.strokeRect(rectX, rectY, rectW, rectH);
            }
            
            // Draw anchors if selected
            if (State.selectedDrawingIdx === index) {
                ctx.save();
                ctx.fillStyle = '#007aff';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([]);
                
                ctx.beginPath(); ctx.arc(xStart, yStart, 5, 0, 2*Math.PI); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(xEnd, yEnd, 5, 0, 2*Math.PI); ctx.fill(); ctx.stroke();
                ctx.restore();
            }
        } else if (d.type === 'arrow') {
            const xStart = getX(d.startIdx);
            const xEnd = getX(d.endIdx);
            const yStart = getY(d.startPrice);
            const yEnd = getY(d.endPrice);
            
            ctx.save();
            ctx.strokeStyle = d.borderColor || '#007aff';
            ctx.fillStyle = d.borderColor || '#007aff';
            ctx.lineWidth = d.thickness || 2;
            ctx.globalAlpha = 1.0;
            
            if (d.dashStyle === 'dashed') {
                ctx.setLineDash([6, 4]);
            } else if (d.dashStyle === 'dotted') {
                ctx.setLineDash([2, 2]);
            } else {
                ctx.setLineDash([]);
            }
            
            // Draw shaft
            ctx.beginPath();
            ctx.moveTo(xStart, yStart);
            ctx.lineTo(xEnd, yEnd);
            ctx.stroke();
            
            // Draw arrowhead at end
            ctx.setLineDash([]);
            const angle = Math.atan2(yEnd - yStart, xEnd - xStart);
            const headSize = (d.thickness || 2) * 5 + 6;
            ctx.beginPath();
            ctx.moveTo(xEnd, yEnd);
            ctx.lineTo(xEnd - headSize * Math.cos(angle - Math.PI / 6), yEnd - headSize * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(xEnd - headSize * Math.cos(angle + Math.PI / 6), yEnd - headSize * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
            
            // Draw anchors if selected
            if (State.selectedDrawingIdx === index) {
                ctx.save();
                ctx.fillStyle = '#007aff';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                
                ctx.beginPath(); ctx.arc(xStart, yStart, 5, 0, 2*Math.PI); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(xEnd, yEnd, 5, 0, 2*Math.PI); ctx.fill(); ctx.stroke();
                ctx.restore();
            }
        }
    });
    
    // Draw current active rectangle in progress
    if (isDrawingRect) {
        const xStart = getX(rectStartIdx);
        const xEnd = getX(rectCurrentIdx);
        const yStart = getY(rectStartPrice);
        const yEnd = getY(rectCurrentPrice);
        
        const rectX = Math.min(xStart, xEnd);
        const rectY = Math.min(yStart, yEnd);
        const rectW = Math.abs(xEnd - xStart);
        const rectH = Math.abs(yEnd - yStart);
        
        const isFilled = document.getElementById('prop-fill-checkbox').checked;
        const drawBorder = document.getElementById('prop-border-checkbox').checked;
        const borderColor = document.getElementById('prop-color-picker').value;
        const thickness = parseFloat(document.getElementById('prop-thickness-slider').value) || 2;
        const dashStyle = document.getElementById('prop-dash-select').value || 'solid';
        
        ctx.save();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = thickness;
        
        if (dashStyle === 'dashed') {
            ctx.setLineDash([6, 4]);
        } else if (dashStyle === 'dotted') {
            ctx.setLineDash([2, 2]);
        } else {
            ctx.setLineDash([]);
        }
        
        if (isFilled) {
            ctx.fillStyle = borderColor;
            ctx.globalAlpha = 0.3;
            ctx.fillRect(rectX, rectY, rectW, rectH);
            ctx.globalAlpha = 1.0;
        }
        
        if (drawBorder) {
            ctx.strokeRect(rectX, rectY, rectW, rectH);
        }
        ctx.restore();
    }
    
    // Draw current active arrow in progress
    if (isDrawingArrow) {
        const xStart = getX(arrowStartIdx);
        const xEnd = getX(arrowCurrentIdx);
        const yStart = getY(arrowStartPrice);
        const yEnd = getY(arrowCurrentPrice);
        
        const borderColor = document.getElementById('prop-color-picker').value;
        const thickness = parseFloat(document.getElementById('prop-thickness-slider').value) || 2;
        const dashStyle = document.getElementById('prop-dash-select').value || 'solid';
        
        ctx.save();
        ctx.strokeStyle = borderColor;
        ctx.fillStyle = borderColor;
        ctx.lineWidth = thickness;
        
        if (dashStyle === 'dashed') {
            ctx.setLineDash([6, 4]);
        } else if (dashStyle === 'dotted') {
            ctx.setLineDash([2, 2]);
        } else {
            ctx.setLineDash([]);
        }
        
        ctx.beginPath();
        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();
        
        ctx.setLineDash([]);
        const angle = Math.atan2(yEnd - yStart, xEnd - xStart);
        const headSize = thickness * 5 + 6;
        ctx.beginPath();
        ctx.moveTo(xEnd, yEnd);
        ctx.lineTo(xEnd - headSize * Math.cos(angle - Math.PI / 6), yEnd - headSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(xEnd - headSize * Math.cos(angle + Math.PI / 6), yEnd - headSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
    ctx.restore();

    // 3. Draw Candlesticks (Custom Colors: barUp, barDown, bull, bear)
    visibleCandles.forEach((candle, idx) => {
        const absIdx = startIndex + idx;
        const rawX = getX(absIdx);
        
        const yOpen = getY(candle.open);
        const yClose = getY(candle.close);
        const yHigh = getY(candle.high);
        const yLow = getY(candle.low);
        
        const isBullish = candle.close >= candle.open;
        const strokeColor = isBullish ? State.colors.barUp : State.colors.barDown;
        let fillColor = isBullish ? State.colors.bull : State.colors.bear;
        
        // If the candle is narrow (width < 3), draw it as solid using its body color (bull/bear),
        // unless the body color matches the background (like hollow bull candles), in which case we use the stroke color.
        if (candleWidth < 3) {
            const isHollow = fillColor === State.colors.bg || 
                             (State.colors.bg === '#ffffff' && (fillColor === '#ffffff' || fillColor === '#fff' || fillColor === 'transparent'));
            if (isHollow) {
                fillColor = strokeColor;
            }
        } else if (fillColor === State.colors.bg || (State.colors.bg === '#ffffff' && (fillColor === '#ffffff' || fillColor === '#fff'))) {
            // Keep visibility check for hollow candles on matching backgrounds when wide
            fillColor = strokeColor;
        }

        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = fillColor;
        
        // 1. Calculate mathematically aligned coordinates centered exactly on rawX
        const wickX = Math.floor(rawX) + 0.5;
        const xStart = wickX - candleWidth / 2;
        const xEnd = xStart + candleWidth;
        const bodyHeight = Math.max(1, Math.round(Math.abs(yClose - yOpen)));
        const bodyY = Math.round(Math.min(yOpen, yClose));
        
        const roundedYOpen = Math.round(yOpen);
        const roundedYClose = Math.round(yClose);
        const flatHeight = Math.abs(roundedYClose - roundedYOpen);

        // 2. Always draw the wick as an ultra-thin line (strictly 0.25px)
        ctx.lineWidth = 0.25;
        ctx.beginPath();
        ctx.moveTo(wickX, Math.round(yHigh));
        ctx.lineTo(wickX, Math.round(yLow));
        ctx.stroke();
        
        // 3. Draw the body on top
        if (flatHeight < 1) {
            // Doji / flat candle line
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(xStart, bodyY + 0.5);
            ctx.lineTo(xEnd, bodyY + 0.5);
            ctx.stroke();
        } else {
            // Draw filled body (always centered exactly on wickX)
            ctx.fillRect(xStart, bodyY, candleWidth, bodyHeight);
            
            // Draw body border if the candle is at least 3px wide
            if (candleWidth >= 3) {
                ctx.lineWidth = 0.25;
                ctx.strokeRect(xStart + 0.5, bodyY + 0.5, candleWidth - 1, bodyHeight - 1);
            }
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
        const textColor = isBuy ? '#3c99ff' : '#e73d2b';
        const strokeColor = isBuy ? '#3c99ff' : '#e73d2b';
        const boxBgColor = '#FFFFFF';
        
        ctx.save();
        ctx.globalAlpha = 0.7 * pos.opacity; // Opacity 0.7 for dashed line
        ctx.strokeStyle = strokeColor;
        ctx.setLineDash([4, 4]); // Dash pattern: 4px dash, 4px gap
        ctx.lineWidth = 0.5;      // Stroke width: 0.5px
        
        const boxX = MARGIN_LEFT + chartWidth + 2;
        
        // 1. Draw Dashed Line (extends from start of chart to vertical separator boundary)
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(MARGIN_LEFT + chartWidth, y);
        ctx.stroke();
        ctx.restore();
        
        // 2. Draw Text (BUY [lotSize] or SELL [lotSize]) slightly above the dashed line
        ctx.save();
        ctx.globalAlpha = pos.opacity;
        ctx.fillStyle = textColor;
        ctx.font = '400 12px "Helvetica Neue", Helvetica, Arial, sans-serif'; // Reverted back to Helvetica Neue 400 weight as requested
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.letterSpacing = 'normal'; // Standard spacing
        
        const lotText = pos.lot % 1 === 0 ? pos.lot.toFixed(2) : pos.lot.toString();
        const typeText = pos.type; // "BUY" or "SELL"
        
        // Exact pixel scaling requested by the user
        const typeWidth = typeText === 'BUY' ? 23 : 27; // BUY alone is 23px, SELL alone is 27px
        const lotWidth = typeText === 'BUY' ? 25 : 24;  // BUY lot width is 25px (23 + 5 gap + 25 = 53px total), SELL lot width is 24px (27 + 5 gap + 24 = 56px total)
        
        // Draw type text (BUY or SELL)
        const typeNaturalWidth = ctx.measureText(typeText).width;
        ctx.save();
        ctx.translate(5, y - 2); // 5px left margin, 2px above line
        ctx.scale(typeWidth / typeNaturalWidth, 1); // Scale horizontally to force exact pixel width for the word
        ctx.fillText(typeText, 0, 0);
        ctx.restore();
        
        // Draw lot size text (e.g., "0.08") next to it with exactly 5px gap
        const lotNaturalWidth = ctx.measureText(lotText).width;
        ctx.save();
        ctx.translate(5 + typeWidth + 5, y - 2); // Placed exactly after the word plus a 5px gap
        ctx.scale(lotWidth / lotNaturalWidth, 1); // Scale horizontally to force exact pixel width for the lot
        ctx.fillText(lotText, 0, 0);
        ctx.restore();
        
        ctx.restore();
        
        // 3. Draw Price Box stuck to right axis
        ctx.save();
        ctx.globalAlpha = pos.opacity;
        
        ctx.font = '400 12px ' + FONT_STACK;
        const priceText = pos.openPrice.toFixed(3);
        
        const boxWidth = 64; // Width: 64px (matching Bid/Ask price box width)
        const boxHeight = 14; // Height: 14px
        const boxY = y - boxHeight / 2; // Center vertically
        
        // Draw background
        ctx.fillStyle = boxBgColor;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        
        // Draw border: 1px Solid (lineWidth 0.5 for softer/thinner look)
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1);
        
        // Draw price text (limited to 56px width max)
        ctx.fillStyle = textColor;
        ctx.textBaseline = 'middle';
        fillTextWithSpacing(ctx, priceText, boxX + boxWidth / 2, y + 0.5, 2.0, 'center', 56);
        ctx.restore();
    });
    
    // 4. Draw Current Price Lines (Bid and Ask) and Boxes
    
    // Draw Ask Line (Ask is higher than Bid)
    const askY = getY(State.currentAsk);
    if (askY >= MARGIN_TOP && askY <= MARGIN_TOP + chartHeight) {
        ctx.save();
        ctx.strokeStyle = State.colors.askLine;
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT, askY);
        ctx.lineTo(MARGIN_LEFT + chartWidth, askY);
        ctx.stroke();
        ctx.restore();
        
        ctx.save();
        const boxWidth = 64;
        const boxHeight = 14;
        const boxX = MARGIN_LEFT + chartWidth + 2;
        const boxY = askY - boxHeight / 2;
        
        // Draw ask price box: solid background
        ctx.fillStyle = State.colors.askLine;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);        // Price text
        ctx.fillStyle = '#ffffff';
        ctx.font = '400 12px ' + FONT_STACK;
        ctx.textBaseline = 'middle';
        fillTextWithSpacing(ctx, State.currentAsk.toFixed(3), boxX + boxWidth / 2, askY, 2.0, 'center', 56);
        ctx.restore();
    }

    // Draw Bid Line
    const bidY = getY(State.currentBid);
    if (bidY >= MARGIN_TOP && bidY <= MARGIN_TOP + chartHeight) {
        ctx.save();
        ctx.strokeStyle = State.colors.bidLine;
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT, bidY);
        ctx.lineTo(MARGIN_LEFT + chartWidth, bidY);
        ctx.stroke();
        ctx.restore();
        
        ctx.save();
        const boxWidth = 64;
        const boxHeight = 14;
        const boxX = MARGIN_LEFT + chartWidth + 2;
        const boxY = bidY - boxHeight / 2;
        
        // Draw bid price box: solid background
        ctx.fillStyle = State.colors.bidLine;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        
        // Price text
        ctx.fillStyle = '#ffffff';
        ctx.font = '400 12px ' + FONT_STACK;
        ctx.textBaseline = 'middle';
        fillTextWithSpacing(ctx, State.currentBid.toFixed(3), boxX + boxWidth / 2, bidY, 2.0, 'center', 56);
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
        
        if (snapIdx !== -1) {
            const info = getCandleTimeAndDate(snapIdx);
            crosshairValX.textContent = `${info.dateLabel} ${info.timeLabel}`;
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
let isDrawingRect = false;
let rectStartIdx = 0;
let rectStartPrice = 0;
let rectCurrentIdx = 0;
let rectCurrentPrice = 0;

let isDrawingArrow = false;
let arrowStartIdx = 0;
let arrowStartPrice = 0;
let arrowCurrentIdx = 0;
let arrowCurrentPrice = 0;

let isResizingDrawing = false;
let draggedAnchorIndex = 0; // 1 for start, 2 for end
let isDraggingDrawing = false;
let dragDrawingStartIdx1 = 0;
let dragDrawingStartPrice1 = 0;
let dragDrawingStartIdx2 = 0;
let dragDrawingStartPrice2 = 0;
let dragDrawingMouseStartX = 0;
let dragDrawingMouseStartY = 0;

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
    
    const RIGHT_PADDING = 0;
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

function getXGlobal(candleIndex) {
    const activeCandles = getActiveCandles();
    const totalCount = activeCandles.length;
    
    const RIGHT_PADDING = 0;
    const candleSpacing = State.zoom;
    const chartWidth = State.width - MARGIN_RIGHT - MARGIN_LEFT;
    
    let endIndex = totalCount - 1 - State.panOffset;
    if (endIndex < 0) endIndex = 0;
    
    const offsetFromEnd = endIndex - candleIndex;
    return MARGIN_LEFT + chartWidth - RIGHT_PADDING - (offsetFromEnd * candleSpacing) - (candleSpacing / 2);
}

function getYGlobal(price) {
    const chartHeight = State.height - MARGIN_BOTTOM - MARGIN_TOP;
    const pMin = State.priceMin !== undefined ? State.priceMin : State.manualYMin;
    const pMax = State.priceMax !== undefined ? State.priceMax : State.manualYMax;
    return MARGIN_TOP + chartHeight - ((price - pMin) / (pMax - pMin)) * chartHeight;
}

function getCandleTimeAndDate(index) {
    const activeCandles = getActiveCandles();
    const totalCount = activeCandles.length;
    if (totalCount === 0) {
        return { timeLabel: '--:--', dateLabel: '----/--/--' };
    }
    
    let targetDate;
    
    if (index >= 0 && index < totalCount) {
        const c = activeCandles[index];
        targetDate = new Date(c.time);
    } else if (index >= totalCount) {
        const latest = activeCandles[totalCount - 1];
        const latestDate = new Date(latest.time);
        const diff = index - (totalCount - 1);
        targetDate = new Date(latestDate.getTime() + diff * State.timeframeMinutes * 60 * 1000);
    } else {
        const first = activeCandles[0];
        const firstDate = new Date(first.time);
        const diff = 0 - index;
        targetDate = new Date(firstDate.getTime() - diff * State.timeframeMinutes * 60 * 1000);
    }
    
    // Format with the exact same months/hours/minutes layout function as the rest of the chart
    const formattedLabel = formatTimeLabel(targetDate);
    
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    
    return {
        timeLabel: formattedLabel,
        dateLabel: `${yyyy}/${mm}/${dd}`
    };
}

let lastTapTime = 0;
let isReplayTapPossible = false;

function getPriceFromYGlobal(y) {
    const chartHeight = State.height - MARGIN_BOTTOM - MARGIN_TOP;
    return State.manualYMin + ((MARGIN_TOP + chartHeight - y) / chartHeight) * (State.manualYMax - State.manualYMin);
}

function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1)**2 + (y2 - y1)**2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
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
    
    // Custom double-tap detection for touch/mobile
    const now = Date.now();
    if (now - lastTapTime < 300) {
        lastTapTime = 0; // reset
        handleDoubleClick(e);
        return;
    }
    lastTapTime = now;
    
    if (State.isReplaySelectMode) {
        isReplayTapPossible = true;
    }
    
    // Technical drawing tool start check (Rectangle)
    if (State.isRectToolActive) {
        isDrawingRect = true;
        rectStartIdx = getCandleIndexFromX(x);
        rectStartPrice = getPriceFromYGlobal(y);
        rectCurrentIdx = rectStartIdx;
        rectCurrentPrice = rectStartPrice;
        return;
    }
    
    // Technical drawing tool start check (Arrow Line)
    if (State.isArrowToolActive) {
        isDrawingArrow = true;
        arrowStartIdx = getCandleIndexFromX(x);
        arrowStartPrice = getPriceFromYGlobal(y);
        arrowCurrentIdx = arrowStartIdx;
        arrowCurrentPrice = arrowStartPrice;
        return;
    }

    // Check if clicked near anchors of selected drawing to resize it
    if (State.selectedDrawingIdx !== -1) {
        const d = State.drawings[State.selectedDrawingIdx];
        if (d && !d.isLocked) {
            const x1 = getXGlobal(d.startIdx);
            const x2 = getXGlobal(d.endIdx);
            const y1 = getYGlobal(d.startPrice);
            const y2 = getYGlobal(d.endPrice);
            
            if (Math.hypot(x - x1, y - y1) < 15) {
                isResizingDrawing = true;
                draggedAnchorIndex = 1;
                return;
            }
            if (Math.hypot(x - x2, y - y2) < 15) {
                isResizingDrawing = true;
                draggedAnchorIndex = 2;
                return;
            }
        }
    }
    
    // Check if clicked on any drawing to select it
    let foundDrawingIdx = -1;
    for (let i = State.drawings.length - 1; i >= 0; i--) {
        const d = State.drawings[i];
        const x1 = getXGlobal(d.startIdx);
        const x2 = getXGlobal(d.endIdx);
        const y1 = getYGlobal(d.startPrice);
        const y2 = getYGlobal(d.endPrice);
        
        if (d.type === 'rectangle') {
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);
            
            if (d.isFilled) {
                if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                    foundDrawingIdx = i;
                    break;
                }
            } else {
                const onLeft = Math.abs(x - minX) < 10 && y >= minY && y <= maxY;
                const onRight = Math.abs(x - maxX) < 10 && y >= minY && y <= maxY;
                const onTop = Math.abs(y - minY) < 10 && x >= minX && x <= maxX;
                const onBottom = Math.abs(y - maxY) < 10 && x >= minX && x <= maxX;
                if (onLeft || onRight || onTop || onBottom) {
                    foundDrawingIdx = i;
                    break;
                }
            }
        } else if (d.type === 'arrow') {
            if (distToSegment(x, y, x1, y1, x2, y2) < 12) {
                foundDrawingIdx = i;
                break;
            }
        }
    }
    
    if (foundDrawingIdx !== -1) {
        State.selectedDrawingIdx = foundDrawingIdx;
        const d = State.drawings[foundDrawingIdx];
        if (!d.isLocked) {
            isDraggingDrawing = true;
            dragDrawingStartIdx1 = d.startIdx;
            dragDrawingStartPrice1 = d.startPrice;
            dragDrawingStartIdx2 = d.endIdx;
            dragDrawingStartPrice2 = d.endPrice;
            dragDrawingMouseStartX = x;
            dragDrawingMouseStartY = y;
        }
        drawChart();
        return;
    } else {
        if (State.selectedDrawingIdx !== -1) {
            State.selectedDrawingIdx = -1;
            drawChart();
        }
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
        
        if (touchStartDist <= 0) {
            touchStartDist = dist;
            initialZoom = State.zoom;
        }
        
        const factor = touchStartDist > 0 ? dist / touchStartDist : 1;
        State.zoom = Math.max(4, Math.min(20, initialZoom * factor));
        drawChart();
        return;
    }
    
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Technical drawing tool update check (Rectangle)
    if (isDrawingRect) {
        rectCurrentIdx = getCandleIndexFromX(x);
        rectCurrentPrice = getPriceFromYGlobal(y);
        drawChart();
        return;
    }
    
    // Technical drawing tool update check (Arrow Line)
    if (isDrawingArrow) {
        arrowCurrentIdx = getCandleIndexFromX(x);
        arrowCurrentPrice = getPriceFromYGlobal(y);
        drawChart();
        return;
    }
    
    // Anchor resizing check
    if (isResizingDrawing && State.selectedDrawingIdx !== -1) {
        const d = State.drawings[State.selectedDrawingIdx];
        if (d) {
            const currentIdx = getCandleIndexFromX(x);
            const currentPrice = getPriceFromYGlobal(y);
            
            if (draggedAnchorIndex === 1) {
                d.startIdx = currentIdx;
                d.startPrice = currentPrice;
            } else {
                d.endIdx = currentIdx;
                d.endPrice = currentPrice;
            }
            drawChart();
        }
        return;
    }
    
    // Shape moving/dragging check
    if (isDraggingDrawing && State.selectedDrawingIdx !== -1) {
        const d = State.drawings[State.selectedDrawingIdx];
        if (d) {
            const currentIdx = getCandleIndexFromX(x);
            const currentPrice = getPriceFromYGlobal(y);
            
            const startMouseIdx = getCandleIndexFromX(dragDrawingMouseStartX);
            const startMousePrice = getPriceFromYGlobal(dragDrawingMouseStartY);
            
            const idxDiff = currentIdx - startMouseIdx;
            const priceDiff = currentPrice - startMousePrice;
            
            d.startIdx = dragDrawingStartIdx1 + idxDiff;
            d.startPrice = dragDrawingStartPrice1 + priceDiff;
            d.endIdx = dragDrawingStartIdx2 + idxDiff;
            d.endPrice = dragDrawingStartPrice2 + priceDiff;
            drawChart();
        }
        return;
    }
    
    // Replay mode hover selection line
    if (State.isReplaySelectMode) {
        State.replaySelectIndex = getCandleIndexFromX(x);
        if (isDragging && (Math.abs(x - dragStartX) > 5 || Math.abs(y - dragStartY) > 5)) {
            isReplayTapPossible = false;
        }
        drawChart();
    }
    
    if (State.isCrosshairActive) {
        State.crosshairX = Math.max(MARGIN_LEFT, Math.min(x, State.width - MARGIN_RIGHT));
        State.crosshairY = Math.max(MARGIN_TOP, Math.min(y, State.height - MARGIN_BOTTOM));
        drawChart();
        return;
    }
    
    const chartHeight = State.height - MARGIN_BOTTOM - MARGIN_TOP;
    const chartWidth = State.width - MARGIN_RIGHT - MARGIN_LEFT;
    
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
        const activeCandles = getActiveCandles();
        const totalCount = activeCandles.length;
        const maxVisible = Math.ceil(chartWidth / State.zoom);
        State.panOffset = Math.max(-maxVisible, Math.min(totalCount + maxVisible, initialPanOffset + candlesDiff));
        
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
            const priceShift = dy * pricePerPixel;
            
            State.manualYMin = initialPriceMin + priceShift;
            State.manualYMax = initialPriceMax + priceShift;
        }
        
        drawChart();
    }
}

function handlePointerUp() {
    // Replay mode start candle selection click / tap
    if (State.isReplaySelectMode) {
        if (isReplayTapPossible) {
            const clickedIdx = getCandleIndexFromX(dragStartX);
            if (clickedIdx !== -1) {
                startReplayAt(clickedIdx);
            }
        }
        isReplayTapPossible = false;
        isDragging = false;
        drawChart();
        return;
    }

    if (isDrawingRect) {
        isDrawingRect = false;
        
        if (rectStartIdx !== rectCurrentIdx || Math.abs(rectStartPrice - rectCurrentPrice) > 0.01) {
            const borderColor = document.getElementById('prop-color-picker').value || '#007aff';
            const isFilled = document.getElementById('prop-fill-checkbox').checked;
            const drawBorder = document.getElementById('prop-border-checkbox').checked;
            const thickness = parseFloat(document.getElementById('prop-thickness-slider').value) || 2;
            const dashStyle = document.getElementById('prop-dash-select').value || 'solid';
            const isBg = document.getElementById('prop-bg-checkbox').checked;
            
            State.drawings.push({
                type: 'rectangle',
                startIdx: rectStartIdx,
                startPrice: rectStartPrice,
                endIdx: rectCurrentIdx,
                endPrice: rectCurrentPrice,
                borderColor: borderColor,
                fillColor: borderColor,
                isFilled: isFilled,
                drawBorder: drawBorder,
                fillOpacity: 0.3,
                thickness: thickness,
                dashStyle: dashStyle,
                isLocked: false,
                drawAsBackground: isBg,
                name: `مستطيل M5 ${Math.floor(Math.random() * 90000 + 10000)}`
            });
            
            localStorage.setItem('mt5_drawings', JSON.stringify(State.drawings));
        }
        
        State.isRectToolActive = false;
        const rectBtn = document.getElementById('tool-draw-rect-btn');
        if (rectBtn) rectBtn.classList.remove('active-tool');
    }

    if (isDrawingArrow) {
        isDrawingArrow = false;
        
        if (arrowStartIdx !== arrowCurrentIdx || Math.abs(arrowStartPrice - arrowCurrentPrice) > 0.01) {
            const borderColor = document.getElementById('prop-color-picker').value || '#007aff';
            const thickness = parseFloat(document.getElementById('prop-thickness-slider').value) || 2;
            const dashStyle = document.getElementById('prop-dash-select').value || 'solid';
            const isBg = document.getElementById('prop-bg-checkbox').checked;
            
            State.drawings.push({
                type: 'arrow',
                startIdx: arrowStartIdx,
                startPrice: arrowStartPrice,
                endIdx: arrowCurrentIdx,
                endPrice: arrowCurrentPrice,
                borderColor: borderColor,
                thickness: thickness,
                dashStyle: dashStyle,
                isLocked: false,
                drawAsBackground: isBg,
                name: `خط السهم M5 ${Math.floor(Math.random() * 90000 + 10000)}`
            });
            
            localStorage.setItem('mt5_drawings', JSON.stringify(State.drawings));
        }
        
        State.isArrowToolActive = false;
        const arrowBtn = document.getElementById('tool-draw-arrow-btn');
        if (arrowBtn) arrowBtn.classList.remove('active-tool');
    }

    if (isResizingDrawing || isDraggingDrawing) {
        isResizingDrawing = false;
        isDraggingDrawing = false;
        localStorage.setItem('mt5_drawings', JSON.stringify(State.drawings));
    }

    isDragging = false;
    isPriceScaling = false;
    touchStartDist = 0;
    drawChart();
}

function handleDoubleClick(e) {
    const rect = canvas.getBoundingClientRect();
    const isTouch = e.touches && e.touches.length > 0;
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Check if clicked on any drawing to edit it
    let foundDrawingIdx = -1;
    for (let i = State.drawings.length - 1; i >= 0; i--) {
        const d = State.drawings[i];
        const x1 = getXGlobal(d.startIdx);
        const x2 = getXGlobal(d.endIdx);
        const y1 = getYGlobal(d.startPrice);
        const y2 = getYGlobal(d.endPrice);
        
        if (d.type === 'rectangle') {
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);
            
            if (d.isFilled) {
                if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                    foundDrawingIdx = i;
                    break;
                }
            } else {
                const onLeft = Math.abs(x - minX) < 15 && y >= minY && y <= maxY;
                const onRight = Math.abs(x - maxX) < 15 && y >= minY && y <= maxY;
                const onTop = Math.abs(y - minY) < 15 && x >= minX && x <= maxX;
                const onBottom = Math.abs(y - maxY) < 15 && x >= minX && x <= maxX;
                if (onLeft || onRight || onTop || onBottom) {
                    foundDrawingIdx = i;
                    break;
                }
            }
        } else if (d.type === 'arrow') {
            if (distToSegment(x, y, x1, y1, x2, y2) < 15) {
                foundDrawingIdx = i;
                break;
            }
        }
    }
    
    if (foundDrawingIdx !== -1) {
        openPropertiesModal(foundDrawingIdx);
        return;
    }

    // Reset to Auto Y scaling on double click/tap anywhere on chart
    State.isAutoYScale = true;
    State.panOffsetY = 0;
    drawChart();
}

function handleWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    State.zoom = Math.max(4, Math.min(20, State.zoom * factor));
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

function startReplayAt(clickedIdx) {
    const prevTotal = State.candles.length;
    const newTotal = clickedIdx + 1;
    const diff = prevTotal - newTotal;
    
    State.replayIndex = clickedIdx;
    State.isReplaySelectMode = false;
    State.replayMode = true;
    
    // Adjust panOffset to keep candles in the same position on screen
    State.panOffset = State.panOffset - diff;
    
    const replayWidget = document.getElementById('replay-widget');
    if (replayWidget) replayWidget.classList.remove('hidden');
    
    syncReplayCandleData();
    pauseReplay();
    drawChart();
}

function keepReplayIndexVisible() {
    // Keep it free: do not automatically scroll the screen during replay.
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
            keepReplayIndexVisible();
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
        keepReplayIndexVisible();
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
        const prevTotal = State.replayIndex + 1;
        const newTotal = State.candles.length;
        const diff = prevTotal - newTotal;
        
        State.replayMode = false;
        State.isReplaySelectMode = false;
        State.replaySelectIndex = -1;
        
        // Adjust panOffset to keep candles in the same position on screen
        State.panOffset = State.panOffset - diff;
        
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
    
    const elementsBtn = document.getElementById('elements-overlay-btn');
    const drawingsPopup = document.getElementById('drawings-popup');
    if (drawingsPopup && !drawingsPopup.classList.contains('hidden') && 
        !drawingsPopup.contains(e.target) && 
        e.target !== elementsBtn) {
        drawingsPopup.classList.add('hidden');
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
        if (tfDisplayBtn) {
            tfDisplayBtn.textContent = tf; // update the top-right button label if it exists!
        }
        
        // Show/hide timeframe overlay image (M15.jpg) in the header
        const tfOverlay = document.getElementById('header-tf-overlay');
        if (tfOverlay) {
            if (tf === 'M15') {
                tfOverlay.classList.remove('hidden');
            } else {
                tfOverlay.classList.add('hidden');
            }
        }
        
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
        localStorage.setItem('mt5_active_tf', tf);
        
        // If we have imported raw CSV candles, aggregate them dynamically instead of generating mock data
        if (State.rawCSVCandles && State.rawCSVCandles.length > 0) {
            const baseTf = detectCSVTimeframe(State.rawCSVCandles);
            if (State.timeframeMinutes < baseTf) {
                let baseTfName = baseTf + " دقيقة";
                if (baseTf === 60) baseTfName = "ساعة واحدة (H1)";
                else if (baseTf === 240) baseTfName = "4 ساعات (H4)";
                else if (baseTf === 1440) baseTfName = "يومي (D1)";
                
                let selectedTfName = State.timeframeMinutes + " دقيقة";
                if (State.timeframeMinutes === 1) selectedTfName = "دقيقة واحدة (M1)";
                else if (State.timeframeMinutes === 5) selectedTfName = "5 دقائق (M5)";
                
                alert(`تنبيه:\nملف CSV المرفق يحتوي على بيانات بفريم ${baseTfName} كحد أدنى.\nلا يمكن عرض تفاصيل الفريم الأصغر المختار (${selectedTfName}) لأن البيانات الفرعية غير متوفرة بالملف. سيتم عرض الشموع بفريم ${baseTfName}.`);
            }
            
            State.candles = aggregateCandles(State.rawCSVCandles, State.timeframeMinutes);
            State.replayIndex = Math.min(50, State.candles.length - 1);
            
            const latest = State.candles[State.candles.length - 1];
            if (latest) {
                State.currentBid = latest.close;
                State.currentAsk = latest.close + State.spread;
            }
            
            // Cache the newly aggregated candles to localStorage for quick startup loads
            try {
                const simplifiedCandles = State.candles.map(c => ({
                    t: c.time.getTime(),
                    o: c.open,
                    h: c.high,
                    l: c.low,
                    c: c.close
                }));
                localStorage.setItem('mt5_imported_candles', JSON.stringify(simplifiedCandles));
            } catch (e) {
                console.error('Failed to cache aggregated candles:', e);
            }
        } else {
            // Regenerate mock data for new timeframe
            generateMockData();
        }
        
        drawChart();
        
        // Hide dropdown
        tfDropdown.classList.add('hidden');
    });
});

const drawingsPopup = document.getElementById('drawings-popup');
const toolDrawRectBtn = document.getElementById('tool-draw-rect-btn');
const toolDrawArrowBtn = document.getElementById('tool-draw-arrow-btn');
const toolDrawClearBtn = document.getElementById('tool-draw-clear-btn');

document.getElementById('elements-overlay-btn').addEventListener('click', () => {
    drawingsPopup.classList.toggle('hidden');
    tfDropdown.classList.add('hidden');
});

// Avoid closing drawings popup when clicked inside
drawingsPopup.addEventListener('click', (e) => {
    e.stopPropagation();
});

// Toggle Rectangle Draw Tool
toolDrawRectBtn.addEventListener('click', () => {
    State.isRectToolActive = !State.isRectToolActive;
    State.isArrowToolActive = false;
    toolDrawArrowBtn.classList.remove('active-tool');
    
    if (State.isRectToolActive) {
        toolDrawRectBtn.classList.add('active-tool');
        alert('أداة رسم المستطيل مفعلة. انقر واسحب إصبعك على الشارت لرسم المستطيل الفني.');
    } else {
        toolDrawRectBtn.classList.remove('active-tool');
    }
    drawingsPopup.classList.add('hidden');
});

// Toggle Arrow Draw Tool
toolDrawArrowBtn.addEventListener('click', () => {
    State.isArrowToolActive = !State.isArrowToolActive;
    State.isRectToolActive = false;
    toolDrawRectBtn.classList.remove('active-tool');
    
    if (State.isArrowToolActive) {
        toolDrawArrowBtn.classList.add('active-tool');
        alert('أداة رسم السهم مفعلة. انقر واسحب إصبعك على الشارت لرسم خط السهم الفني.');
    } else {
        toolDrawArrowBtn.classList.remove('active-tool');
    }
    drawingsPopup.classList.add('hidden');
});

// Clear Drawings
toolDrawClearBtn.addEventListener('click', () => {
    if (confirm('هل أنت متأكد من حذف جميع الرسومات الفنية من الشارت؟')) {
        State.drawings = [];
        State.selectedDrawingIdx = -1;
        localStorage.removeItem('mt5_drawings');
        drawChart();
    }
    drawingsPopup.classList.add('hidden');
});

// Properties Modal Elements
const propertiesModal = document.getElementById('properties-modal');
const propNameInput = document.getElementById('prop-name-input');
const propFillRow = document.getElementById('prop-fill-row');
const propFillCheckbox = document.getElementById('prop-fill-checkbox');
const propLockCheckbox = document.getElementById('prop-lock-checkbox');
const propPrice1Input = document.getElementById('prop-price1-input');
const propTime1Input = document.getElementById('prop-time1-input');
const propDate1Input = document.getElementById('prop-date1-input');
const propPrice2Input = document.getElementById('prop-price2-input');
const propTime2Input = document.getElementById('prop-time2-input');
const propDate2Input = document.getElementById('prop-date2-input');
const propColorPicker = document.getElementById('prop-color-picker');
const propThicknessSlider = document.getElementById('prop-thickness-slider');
const propDashRow = document.getElementById('prop-dash-row');
const propDashSelect = document.getElementById('prop-dash-select');
const propBgCheckbox = document.getElementById('prop-bg-checkbox');

let currentEditingDrawingIdx = -1;

const propBorderRow = document.getElementById('prop-border-row');
const propBorderCheckbox = document.getElementById('prop-border-checkbox');

function openPropertiesModal(idx) {
    const d = State.drawings[idx];
    if (!d) return;
    
    currentEditingDrawingIdx = idx;
    
    // Fill values
    propNameInput.value = d.name || (d.type === 'rectangle' ? 'مستطيل' : 'خط السهم');
    propLockCheckbox.checked = !!d.isLocked;
    
    if (d.type === 'rectangle') {
        propFillRow.style.display = 'flex';
        propFillCheckbox.checked = !!d.isFilled;
        if (propBorderRow) propBorderRow.style.display = 'flex';
        if (propBorderCheckbox) propBorderCheckbox.checked = d.drawBorder === undefined ? true : d.drawBorder;
    } else {
        propFillRow.style.display = 'none';
        if (propBorderRow) propBorderRow.style.display = 'none';
    }
    
    propPrice1Input.value = d.startPrice.toFixed(3);
    propPrice2Input.value = d.endPrice.toFixed(3);
    
    const candle1 = getCandleTimeAndDate(d.startIdx);
    const candle2 = getCandleTimeAndDate(d.endIdx);
    
    propTime1Input.value = candle1.timeLabel || '';
    propDate1Input.value = candle1.dateLabel || '';
    propTime2Input.value = candle2.timeLabel || '';
    propDate2Input.value = candle2.dateLabel || '';
    
    propColorPicker.value = d.borderColor || '#007aff';
    propThicknessSlider.value = d.thickness || 2;
    propDashSelect.value = d.dashStyle || 'solid';
    propBgCheckbox.checked = d.drawAsBackground !== undefined ? d.drawAsBackground : true;
    
    propertiesModal.classList.remove('hidden');
}

// Wire properties modal action buttons
document.getElementById('prop-cancel-btn').addEventListener('click', () => {
    propertiesModal.classList.add('hidden');
});

document.getElementById('prop-save-btn').addEventListener('click', () => {
    if (currentEditingDrawingIdx !== -1) {
        const d = State.drawings[currentEditingDrawingIdx];
        if (d) {
            d.name = propNameInput.value;
            d.isLocked = propLockCheckbox.checked;
            d.startPrice = parseFloat(propPrice1Input.value) || d.startPrice;
            d.endPrice = parseFloat(propPrice2Input.value) || d.endPrice;
            d.borderColor = propColorPicker.value;
            d.fillColor = propColorPicker.value;
            d.thickness = parseInt(propThicknessSlider.value) || 2;
            d.dashStyle = propDashSelect.value;
            d.drawAsBackground = propBgCheckbox.checked;
            
            if (d.type === 'rectangle') {
                d.isFilled = propFillCheckbox.checked;
                d.drawBorder = propBorderCheckbox.checked;
            }
            
            localStorage.setItem('mt5_drawings', JSON.stringify(State.drawings));
            drawChart();
        }
    }
    propertiesModal.classList.add('hidden');
});

document.getElementById('prop-delete-btn').addEventListener('click', () => {
    if (currentEditingDrawingIdx !== -1) {
        State.drawings.splice(currentEditingDrawingIdx, 1);
        State.selectedDrawingIdx = -1;
        localStorage.setItem('mt5_drawings', JSON.stringify(State.drawings));
        drawChart();
    }
    propertiesModal.classList.add('hidden');
});

// --- SETTINGS COLOR PRESETS & DARK THEME LOGIC ---
const presets = {
    default: {
        bg: '#ffffff',
        foreground: '#6e717a',
        grid: '#e2e2e4',
        barUp: '#375EEB',
        barDown: '#D03A20',
        bull: '#375EEB',
        bear: '#DD5E56',
        chartLine: '#00e676',
        volumes: '#00b0ff',
        bidLine: '#52A49A',
        askLine: '#DD5E56',
        stopLevels: '#d50000',
        navIcons: '#ffffff',
        navActive: '#2962ff'
    },
    greenBlack: {
        bg: '#000000',
        foreground: '#ffffff',
        grid: '#111111',
        barUp: '#00ff00',
        barDown: '#ff0000',
        bull: '#00ff00',
        bear: '#ff0000',
        chartLine: '#00ff00',
        volumes: '#00ff00',
        bidLine: '#00ff00',
        askLine: '#ff9f0a',
        stopLevels: '#ff0000',
        navIcons: '#ffffff',
        navActive: '#00ff00'
    },
    blackWhite: {
        bg: '#ffffff',
        foreground: '#000000',
        grid: '#e5e5ea',
        barUp: '#000000',
        barDown: '#000000',
        bull: '#ffffff',
        bear: '#000000',
        chartLine: '#000000',
        volumes: '#8e8e93',
        bidLine: '#000000',
        askLine: '#ff9f0a',
        stopLevels: '#000000',
        navIcons: '#000000',
        navActive: '#000000'
    },
    tv: {
        bg: '#ffffff',
        foreground: '#787b86',
        grid: '#f0f3fa',
        barUp: '#089981',
        barDown: '#f23645',
        bull: '#089981',
        bear: '#f23645',
        chartLine: '#2962ff',
        volumes: '#26a69a',
        bidLine: '#089981',
        askLine: '#ff9f0a',
        stopLevels: '#ff0000',
        navIcons: '#ffffff',
        navActive: '#2962ff'
    }
};

function applyPreset(presetKey) {
    const p = presets[presetKey];
    if (!p) return;
    
    // Copy colors
    State.colors = { ...p };
    
    // Auto-adjust default grid/bg colors if dark mode is active
    if (State.isDarkMode && presetKey === 'default') {
        State.colors.grid = '#2c2c2e';
        State.colors.foreground = '#a2a2aa';
        State.colors.bg = '#000000';
    }
    
    localStorage.setItem('mt5_chart_colors', JSON.stringify(State.colors));
    
    // Update settings screen color circles
    Object.keys(colorInputs).forEach(key => {
        const input = colorInputs[key];
        if (input) input.value = State.colors[key];
    });
    
    drawChart();
}

function updatePresetButtons(activeBtnId) {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(activeBtnId);
    if (activeBtn) activeBtn.classList.add('active');
}

// Bind preset button clicks
document.getElementById('preset-default').addEventListener('click', () => {
    applyPreset('default');
    updatePresetButtons('preset-default');
});
document.getElementById('preset-green-black').addEventListener('click', () => {
    applyPreset('greenBlack');
    updatePresetButtons('preset-green-black');
});
document.getElementById('preset-black-white').addEventListener('click', () => {
    applyPreset('blackWhite');
    updatePresetButtons('preset-black-white');
});
document.getElementById('preset-tv').addEventListener('click', () => {
    applyPreset('tv');
    updatePresetButtons('preset-tv');
});

// Dark Mode Toggle Logic
const darkModeToggle = document.getElementById('dark-mode-toggle');

function setDarkMode(enabled) {
    State.isDarkMode = enabled;
    localStorage.setItem('mt5_dark_mode', JSON.stringify(enabled));
    if (darkModeToggle) darkModeToggle.checked = enabled;
    
    if (enabled) {
        document.body.classList.add('dark-theme');
        if (State.colors.grid === '#e2e2e4' || State.colors.bg === '#ffffff') {
            State.colors.grid = '#2c2c2e';
            State.colors.foreground = '#a2a2aa';
            State.colors.bg = '#000000';
            localStorage.setItem('mt5_chart_colors', JSON.stringify(State.colors));
        }
    } else {
        document.body.classList.remove('dark-theme');
        if (State.colors.grid === '#2c2c2e' || State.colors.bg === '#000000') {
            State.colors.grid = '#e2e2e4';
            State.colors.foreground = '#6e717a';
            State.colors.bg = '#ffffff';
            localStorage.setItem('mt5_chart_colors', JSON.stringify(State.colors));
        }
    }
    
    // Update inputs
    Object.keys(colorInputs).forEach(key => {
        const input = colorInputs[key];
        if (input) input.value = State.colors[key];
    });
    
    drawChart();
}

if (darkModeToggle) {
    darkModeToggle.addEventListener('change', (e) => {
        setDarkMode(e.target.checked);
    });
}

// Initialize Dark Mode on startup
setTimeout(() => {
    setDarkMode(State.isDarkMode);
}, 50);

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
    localStorage.removeItem('mt5_raw_csv_candles');
    localStorage.removeItem('mt5_imported_filename');
    localStorage.removeItem('mt5_chart_colors');
    localStorage.removeItem('mt5_drawings');
    localStorage.removeItem('mt5_dark_mode');
    State.drawings = [];
    State.rawCSVCandles = [];
    
    // Restore default colors
    State.colors = {
        foreground: '#6e717a',
        grid: '#e2e2e4',
        barUp: '#375EEB',
        barDown: '#D03A20',
        bull: '#375EEB',
        bear: '#DD5E56',
        chartLine: '#00e676',
        volumes: '#00b0ff',
        bidLine: '#52A49A',
        askLine: '#DD5E56',
        stopLevels: '#d50000'
    };
    
    // Disable Dark Mode
    setDarkMode(false);
    updatePresetButtons('preset-default');
    
    // Update color inputs
    Object.keys(colorInputs).forEach(key => {
        const input = colorInputs[key];
        if (input) input.value = State.colors[key];
    });
    
    generateMockData();
    drawChart();
    alert('تم استعادة البيانات التاريخية الافتراضية وحذف الملف المحفوظ والألوان المخصصة والرسومات الفنية.');
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

// Dynamically aggregate base candles into target timeframe intervals
function aggregateCandles(baseCandles, targetMinutes) {
    if (!baseCandles || baseCandles.length === 0) return [];
    
    const map = new Map();
    
    baseCandles.forEach(c => {
        const t = new Date(c.time);
        
        let roundedTime;
        if (targetMinutes < 60) {
            const minutes = t.getMinutes();
            const roundedMins = Math.floor(minutes / targetMinutes) * targetMinutes;
            roundedTime = new Date(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), roundedMins, 0, 0);
        } else if (targetMinutes === 60) {
            roundedTime = new Date(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), 0, 0, 0);
        } else if (targetMinutes === 240) {
            const hours = t.getHours();
            const roundedHours = Math.floor(hours / 4) * 4;
            roundedTime = new Date(t.getFullYear(), t.getMonth(), t.getDate(), roundedHours, 0, 0, 0);
        } else {
            // Daily (D1)
            roundedTime = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0, 0);
        }
        
        const key = roundedTime.getTime();
        let bucket = map.get(key);
        if (!bucket) {
            bucket = {
                time: roundedTime,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                rawCandles: [c]
            };
            map.set(key, bucket);
        } else {
            bucket.rawCandles.push(c);
        }
    });
    
    const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
    
    return sortedKeys.map(key => {
        const bucket = map.get(key);
        bucket.rawCandles.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        
        const open = bucket.rawCandles[0].open;
        const close = bucket.rawCandles[bucket.rawCandles.length - 1].close;
        const high = Math.max(...bucket.rawCandles.map(c => c.high));
        const low = Math.min(...bucket.rawCandles.map(c => c.low));
        
        return {
            time: bucket.time,
            timeLabel: formatTimeLabel(bucket.time),
            open: open,
            high: high,
            low: low,
            close: close
        };
    });
}

// Helper to detect the base timeframe of imported CSV candles
function detectCSVTimeframe(candles) {
    if (!candles || candles.length < 2) return 5;
    let diffs = [];
    for (let i = 0; i < Math.min(15, candles.length - 1); i++) {
        const diffMs = new Date(candles[i+1].time).getTime() - new Date(candles[i].time).getTime();
        diffs.push(Math.round(diffMs / (60 * 1000)));
    }
    const counts = {};
    let maxCount = 0;
    let mode = 5;
    diffs.forEach(d => {
        if (d > 0) {
            counts[d] = (counts[d] || 0) + 1;
            if (counts[d] > maxCount) {
                maxCount = counts[d];
                mode = d;
            }
        }
    });
    return mode;
}

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
        
        // Save the raw unaggregated candles to State and localStorage
        State.rawCSVCandles = newCandles;
        try {
            const simplifiedRaw = newCandles.map(c => ({
                t: c.time.getTime(),
                o: c.open,
                h: c.high,
                l: c.low,
                c: c.close
            }));
            localStorage.setItem('mt5_raw_csv_candles', JSON.stringify(simplifiedRaw));
        } catch (e) {
            console.error('Failed to save raw CSV candles to localStorage:', e);
        }
        
        // Dynamically aggregate to the active timeframe minutes
        State.candles = aggregateCandles(newCandles, State.timeframeMinutes);
        State.replayIndex = Math.min(50, State.candles.length - 1);
        
        const latest = State.candles[State.candles.length - 1];
        if (latest) {
            State.currentBid = latest.close;
            State.currentAsk = latest.close + State.spread;
        }
        
        // Save the aggregated candles to localStorage for quick startup loads
        try {
            const simplifiedCandles = State.candles.map(c => ({
                t: c.time.getTime(),
                o: c.open,
                h: c.high,
                l: c.low,
                c: c.close
            }));
            localStorage.setItem('mt5_imported_candles', JSON.stringify(simplifiedCandles));
        } catch (e) {
            console.error('Failed to save aggregated candles to localStorage:', e);
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
                const detectedTf = detectCSVTimeframe(State.rawCSVCandles);
                let tfName = detectedTf + " دقيقة";
                if (detectedTf === 60) tfName = "ساعة واحدة (H1)";
                else if (detectedTf === 240) tfName = "4 ساعات (H4)";
                else if (detectedTf === 1440) tfName = "يومي (D1)";
                else if (detectedTf === 1) tfName = "دقيقة واحدة (M1)";
                else if (detectedTf === 5) tfName = "5 دقائق (M5)";
                else if (detectedTf === 15) tfName = "15 دقيقة (M15)";
                else if (detectedTf === 30) tfName = "30 دقيقة (M30)";
                
                alert(`تم استيراد ملف CSV بنجاح!\nالتردد المكتشف بالملف: ${tfName}\nإجمالي الشموع المجمعة: ${State.candles.length}`);
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
    // A. Restore previously active timeframe selection
    const savedTf = localStorage.getItem('mt5_active_tf') || 'M5';
    document.querySelectorAll('.tf-option').forEach(opt => {
        if (opt.dataset.tf === savedTf) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });
    
    const activeTfDisplay = document.getElementById('active-tf-display');
    const tfDisplayBtn = document.getElementById('tf-display-btn');
    if (activeTfDisplay) activeTfDisplay.textContent = savedTf;
    if (tfDisplayBtn) tfDisplayBtn.textContent = savedTf;
    
    // Toggle the header timeframe M15 overlay
    const tfOverlay = document.getElementById('header-tf-overlay');
    if (tfOverlay) {
        if (savedTf === 'M15') {
            tfOverlay.classList.remove('hidden');
        } else {
            tfOverlay.classList.add('hidden');
        }
    }
    
    let mins = 5;
    if (savedTf === 'M1') mins = 1;
    else if (savedTf === 'M5') mins = 5;
    else if (savedTf === 'M15') mins = 15;
    else if (savedTf === 'M30') mins = 30;
    else if (savedTf === 'H1') mins = 60;
    else if (savedTf === 'H4') mins = 240;
    else if (savedTf === 'D1') mins = 1440;
    State.timeframeMinutes = mins;

    // B. Load raw unaggregated CSV candles from localStorage
    const savedRaw = localStorage.getItem('mt5_raw_csv_candles');
    if (savedRaw) {
        try {
            const parsedRaw = JSON.parse(savedRaw);
            State.rawCSVCandles = parsedRaw.map(item => ({
                time: new Date(item.t),
                open: item.o,
                high: item.h,
                low: item.l,
                close: item.c
            }));
            console.log(`Loaded ${State.rawCSVCandles.length} raw CSV candles from cache.`);
        } catch (e) {
            console.error('Failed to parse cached raw CSV candles:', e);
        }
    }

    // C. Load cached aggregated candles
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
                console.log(`Loaded ${loadedCandles.length} aggregated candles from localStorage cache.`);
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
    // Migrate default colors to new specified color defaults if they still have the old ones
    if (State.colors && (State.colors.barUp === '#2962ff' || State.colors.barUp === '#2962FF')) {
        State.colors.barUp = '#375EEB';
        State.colors.barDown = '#D03A20';
        State.colors.bull = '#375EEB';
        State.colors.bear = '#DD5E56';
        State.colors.bidLine = '#52A49A';
        State.colors.askLine = '#DD5E56';
        localStorage.setItem('mt5_chart_colors', JSON.stringify(State.colors));
        
        // Update color inputs on screen
        if (typeof colorInputs !== 'undefined') {
            Object.keys(colorInputs).forEach(key => {
                const input = colorInputs[key];
                if (input) input.value = State.colors[key];
            });
        }
    }

    resizeCanvas();
    updateTradingPanelUI();
    updatePositionsProfit();
    
    // Force clean old service worker cache on first load of version 4
    if (!localStorage.getItem('sw_migrated_v4')) {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) {
                    registration.unregister();
                }
            });
        }
        if ('caches' in window) {
            caches.keys().then(names => {
                for (let name of names) caches.delete(name);
            });
        }
        localStorage.setItem('sw_migrated_v4', 'true');
        setTimeout(() => {
            window.location.reload(true); // Force reload to fetch everything fresh
        }, 200);
        return;
    }

    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js?v=4')
            .then(() => console.log('PWA Service Worker Registered'))
            .catch(err => console.log('Service Worker Registration Failed:', err));
    }
}

window.addEventListener('resize', resizeCanvas);
