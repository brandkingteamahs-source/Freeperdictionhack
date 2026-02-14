const API = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";
let history = []; 
let resultHistory = []; 
let lastProcessedPeriod = null;
let strategyStats = {
    followTrend: { wins: 0, attempts: 0, score: 0, displayName: "Follow Trend" },
    alternating: { wins: 0, attempts: 0, score: 0, displayName: "Alternating" },
    breakStreak: { wins: 0, attempts: 0, score: 0, displayName: "Break Streak" } 
};

const strategies = {
    followTrend: (r) => r.length < 1 ? 'Big' : r[0],
    alternating: (r) => r.length < 1 ? 'Small' : (r[0] === 'Big' ? 'Small' : 'Big'),
    breakStreak: (r) => {
        if (r.length < 4) return null;
        const last = r[0];
        if (r.slice(0, 4).every(x => x === last)) return last === 'Big' ? 'Small' : 'Big';
        return null;
    }
};

function evaluateStrategies(last, second) {
    if (!last || !second) return;
    const prev = [second, ...resultHistory.slice(2)];
    for (const key in strategies) {
        const p = strategies[key](prev);
        if (p !== null) {
            strategyStats[key].attempts++;
            if (p === last) strategyStats[key].wins++;
            strategyStats[key].score = Math.round((strategyStats[key].wins / strategyStats[key].attempts) * 100);
        }
    }
}

function getBestStrategy() {
    let best = 'followTrend', max = -1;
    for (const k in strategyStats) {
        if (strategyStats[k].attempts >= 5 && strategyStats[k].score > max) {
            max = strategyStats[k].score; best = k;
        }
    }
    return best;
}

function predictNext(results) {
    const best = getBestStrategy();
    document.getElementById('activeStrategy').textContent = `${strategyStats[best].displayName} (${strategyStats[best].score}%)`;
    let pred = strategies[best](results);
    if (pred === null) {
        document.getElementById('activeStrategy').textContent += " (Fallback: Trend)";
        return strategies.followTrend(results);
    }
    return pred;
}

const pad = n => n < 10 ? '0' + n : n;
const label = num => (num === null) ? '--' : (num <= 4 ? 'Small' : 'Big'); 

async function fetchLatestData() {
    try {
        const res = await fetch(`${API}?ts=${Date.now()}`);
        const json = await res.json();
        return json.data.list.slice(0, 20).map(x => ({ period: x.issueNumber, num: +x.number }));
    } catch { return null; }
}

function renderDashboard() {
    const wins = history.filter(h => h.correct).length;
    const losses = history.filter(h => h.correct === false).length;
    const total = wins + losses;
    const accuracy = total > 0 ? `${Math.round((wins / total) * 100)}%` : "--";
    document.getElementById('wins').textContent = pad(wins);
    document.getElementById('losses').textContent = pad(losses);
    document.getElementById('total').textContent = total;
    document.getElementById('accuracy').textContent = accuracy;
    if (resultHistory.length > 0) {
        let streak = 0, type = resultHistory[0];
        for (const r of resultHistory) { if (r === type) streak++; else break; }
        document.getElementById('currentStreak').textContent = `${type.slice(0,1)} x${streak}`;
    } else document.getElementById('currentStreak').textContent = '--';
}

function renderHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    history.filter(e => e.actual !== 'loading...').slice(0, 5).forEach(e => {
        const div = document.createElement('div');
        div.className = 'prediction-box';
        const resultClass = e.correct ? 'history-result-text win-color' : 'history-result-text loss-color';
        const resultText = e.correct ? 'WIN' : 'LOSS';
        const guessClass = e.guess === 'Small' ? 'win-color' : 'loss-color';
        const actualClass = e.actual === 'Small' ? 'win-color' : 'loss-color';
        div.innerHTML = `
            <p><label>PERIOD</label> : <span class="predict-value loss-color">${e.period}</span></p>
            <p><label>PREDICT</label> : <span class="predict-value ${guessClass}">${e.guess}</span></p>
            <p><label>RESULT</label> : 
                <span class="predict-value ${actualClass}">
                    ${e.actual} [${e.num}] 
                    <span class="${resultClass}">(${resultText})</span>
                </span>
            </p>`;
        list.appendChild(div);
    });
    renderDashboard();
}

let countdownIv = null;
function startCountdown(seconds = 60) {
    if (countdownIv) clearInterval(countdownIv);
    let cnt = seconds;
    const el = document.getElementById('countdown');
    const update = () => {
        el.textContent = `00:${pad(cnt)}`;
        el.classList.toggle('timer-red', cnt <= 5);
        if (cnt-- <= 0) { clearInterval(countdownIv); el.textContent = "Updating..."; tick(true); }
    };
    update(); countdownIv = setInterval(update, 1000);
}

let isTicking = false;
async function tick(force = false) {
    if (isTicking && !force) return;
    isTicking = true;
    try {
        const draws = await fetchLatestData();
        if (!draws || draws.length === 0) return;
        const latest = draws[0];
        if (lastProcessedPeriod === latest.period && !force) return;
        
        const lastResult = label(latest.num);
        const secondLast = draws.length > 1 ? label(draws[1].num) : null;
        if (lastProcessedPeriod !== null) evaluateStrategies(lastResult, secondLast);
        
        resultHistory = draws.map(d => label(d.num));
        const lastPred = history[0];
        if (lastPred && lastPred.period === latest.period) {
            lastPred.num = latest.num;
            lastPred.actual = lastResult;
            lastPred.correct = lastPred.guess === lastPred.actual;
        }
        
        const nextPeriod = String(BigInt(latest.period) + 1n);
        const nextGuess = predictNext(resultHistory);
        const newPred = { period: nextPeriod, guess: nextGuess, num: null, actual: 'loading...', correct: null };
        history.unshift(newPred);
        if (history.length > 100) history.pop();
        
        document.getElementById('nextPeriod').textContent = nextPeriod;
        const np = document.getElementById('nextPrediction');
        np.textContent = nextGuess;
        np.className = `predict-value ${nextGuess === 'Small' ? 'win-color' : 'loss-color'}`; 
        
        renderHistory();
        lastProcessedPeriod = latest.period;
        startCountdown(60);
    } finally { isTicking = false; }
}

document.getElementById('clearBtn').addEventListener('click', () => {
    if (window.confirm("Clear all history and reset strategy scores?")) {
        history = []; resultHistory = []; lastProcessedPeriod = null;
        strategyStats = {
            followTrend: { wins: 0, attempts: 0, score: 0, displayName: "Follow Trend" },
            alternating: { wins: 0, attempts: 0, score: 0, displayName: "Alternating" },
            breakStreak: { wins: 0, attempts: 0, score: 0, displayName: "Break Streak" }
        };
        renderHistory();
        document.getElementById('activeStrategy').textContent = "Calculating...";
        tick(true);
    }
});

tick(true);
setInterval(() => tick(false), 60000);
