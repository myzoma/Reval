class TrendReversalAnalyzer {
    constructor() {
        this.isRunning = false;
        this.interval = null;
        this.coins = [];
        this.alerts = [];
        this.config = {
            reversalThreshold: 0.7,
            trendStrength: 3,
            interval: '4h',
            volumeThreshold: 1.5
        };
        
        this.initializeElements();
        this.bindEvents();
        this.loadTopCoins();
    }

    initializeElements() {
        this.elements = {
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            intervalSelect: document.getElementById('intervalSelect'),
            reversalThreshold: document.getElementById('reversalThreshold'),
            trendStrength: document.getElementById('trendStrength'),
            thresholdValue: document.getElementById('thresholdValue'),
            strengthValue: document.getElementById('strengthValue'),
            status: document.getElementById('status'),
            resultsGrid: document.getElementById('resultsGrid'),
            alertsList: document.getElementById('alertsList'),
            clearAlerts: document.getElementById('clearAlerts'),
            totalCoins: document.getElementById('totalCoins'),
            downtrendCoins: document.getElementById('downtrendCoins'),
            strongReversals: document.getElementById('strongReversals'),
            mediumReversals: document.getElementById('mediumReversals')
        };
    }

    bindEvents() {
        this.elements.startBtn.addEventListener('click', () => this.startAnalysis());
        this.elements.stopBtn.addEventListener('click', () => this.stopAnalysis());
        this.elements.clearAlerts.addEventListener('click', () => this.clearAlerts());
        
        this.elements.reversalThreshold.addEventListener('input', (e) => {
            this.config.reversalThreshold = parseFloat(e.target.value);
            this.elements.thresholdValue.textContent = e.target.value;
        });
        
        this.elements.trendStrength.addEventListener('input', (e) => {
            this.config.trendStrength = parseInt(e.target.value);
            this.elements.strengthValue.textContent = e.target.value;
        });
        
        this.elements.intervalSelect.addEventListener('change', (e) => {
            this.config.interval = e.target.value;
        });
    }

    async loadTopCoins() {
        try {
            const response = await fetch('https://api1.binance.com/api/v3/ticker/24hr');
            const data = await response.json();
            
            // فلترة العملات USDT وترتيبها حسب الحجم
            this.coins = data
                .filter(coin => coin.symbol.endsWith('USDT') && 
                              !coin.symbol.includes('UP') && 
                              !coin.symbol.includes('DOWN') &&
                              parseFloat(coin.quoteVolume) > 1000000)
                .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
                .slice(0, 50)
                .map(coin => coin.symbol);
                
            this.elements.totalCoins.textContent = this.coins.length;
        } catch (error) {
            console.error('خطأ في تحميل العملات:', error);
            this.addAlert('خطأ', 'فشل في تحميل قائمة العملات', 'trend');
        }
    }

    async startAnalysis() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.elements.startBtn.disabled = true;
        this.elements.stopBtn.disabled = false;
        this.elements.status.textContent = 'جاري التحليل...';
        
        await this.analyzeCoins();
        
        // تحديث كل 30 ثانية
        this.interval = setInterval(() => {
            this.analyzeCoins();
        }, 30000);
    }

    stopAnalysis() {
        this.isRunning = false;
        this.elements.startBtn.disabled = false;
        this.elements.stopBtn.disabled = true;
        this.elements.status.textContent = 'متوقف';
        
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    async analyzeCoins() {
        if (!this.isRunning) return;
        
        this.elements.resultsGrid.innerHTML = '<div class="loading">جاري تحليل العملات...</div>';
        
        const results = [];
        const batchSize = 5;
        
        for (let i = 0; i < this.coins.length; i += batchSize) {
            const batch = this.coins.slice(i, i + batchSize);
            const batchPromises = batch.map(symbol => this.analyzeCoin(symbol));
            
            try {
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults.filter(result => result !== null));
                
                // تأخير قصير لتجنب حدود API
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('خطأ في تحليل المجموعة:', error);
            }
        }
        
        this.displayResults(results);
        this.updateStats(results);
        this.elements.status.textContent = `تم تحليل ${results.length} عملة - آخر تحديث: ${new Date().toLocaleTimeString('ar-SA')}`;
    }
validateData(data) {
    return {
        price: isNaN(data.price) || data.price === null ? 0 : data.price,
        volume: isNaN(data.volume) || data.volume === null || data.volume === 0 ? 1 : data.volume,
        change24h: isNaN(data.change24h) || data.change24h === null ? 0 : data.change24h
    };
}
   async analyzeCoin(symbol) {
    try {
        const klines = await this.getKlineData(symbol, this.config.interval, 100);
        if (!klines || klines.length < 50) return null;
        
        // التحقق من صحة البيانات
        const lastKline = klines[klines.length - 1];
        if (!lastKline || isNaN(lastKline.close) || lastKline.close <= 0) {
            console.warn(`بيانات غير صحيحة لـ ${symbol}`);
            return null;
        }
        
        const analysis = this.performTechnicalAnalysis(klines);
        const trendAnalysis = this.analyzeTrend(analysis);
        const reversalScore = this.calculateReversalScore(analysis, trendAnalysis);
        
        if (trendAnalysis.isDowntrend && trendAnalysis.strength >= this.config.trendStrength) {
            const result = {
                symbol,
                price: lastKline.close,
                change24h: this.calculate24hChange(klines),
                analysis,
                trendAnalysis,
                reversalScore,
                timestamp: Date.now()
            };
            
            // التحقق من صحة النتيجة النهائية
            const validatedResult = {
                ...result,
                ...this.validateData(result)
            };
            
            this.checkForAlerts(validatedResult);
            return validatedResult;
        }
        
        return null;
    } catch (error) {
        console.error(`خطأ في تحليل ${symbol}:`, error);
        return null;
    }
}

   async getKlineData(symbol, interval, limit) {
    try {
        const response = await fetch(
            `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('بيانات فارغة أو غير صحيحة');
        }
        
        return data.map(kline => {
            const mappedKline = {
                openTime: parseInt(kline[0]),
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5])
            };
            
            // التحقق من صحة البيانات
            if (isNaN(mappedKline.close) || isNaN(mappedKline.volume) || 
                mappedKline.close <= 0 || mappedKline.volume < 0) {
                throw new Error('بيانات أسعار غير صحيحة');
            }
            
            return mappedKline;
        });
    } catch (error) {
        console.error(`خطأ في جلب بيانات ${symbol}:`, error);
        return null;
    }
}

    performTechnicalAnalysis(klines) {
        const closes = klines.map(k => k.close);
        const highs = klines.map(k => k.high);
        const lows = klines.map(k => k.low);
        const volumes = klines.map(k => k.volume);
        
        return {
            ema_fast: this.calculateEMA(closes, 20),
            ema_slow: this.calculateEMA(closes, 40),
            sma_trend: this.calculateSMA(closes, 60),
            rsi: this.calculateRSI(closes, 14),
            macd: this.calculateMACD(closes),
            volume_ratio: this.calculateVolumeRatio(volumes),
            stochastic: this.calculateStochastic(highs, lows, closes, 14),
            momentum: this.calculateMomentum(closes, 5),
            williams_r: this.calculateWilliamsR(highs, lows, closes, 14),
            support_resistance: this.findSupportResistance(highs, lows, 10)
        };
    }

    calculateEMA(data, period) {
        const multiplier = 2 / (period + 1);
        const ema = [data[0]];
        
        for (let i = 1; i < data.length; i++) {
            ema[i] = (data[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
        }
        
        return ema;
    }

    calculateSMA(data, period) {
        const sma = [];
        for (let i = period - 1; i < data.length; i++) {
            const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            sma[i] = sum / period;
        }
        return sma;
    }

    calculateRSI(data, period) {
        const gains = [];
        const losses = [];
        
        for (let i = 1; i < data.length; i++) {
            const change = data[i] - data[i - 1];
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }
        
        const avgGain = this.calculateSMA(gains, period);
        const avgLoss = this.calculateSMA(losses, period);
        
        return avgGain.map((gain, i) => {
            if (avgLoss[i] === 0) return 100;
            const rs = gain / avgLoss[i];
            return 100 - (100 / (1 + rs));
        });
    }

    calculateMACD(data) {
        const ema12 = this.calculateEMA(data, 12);
        const ema26 = this.calculateEMA(data, 26);
        const macdLine = ema12.map((val, i) => val - ema26[i]);
        const signalLine = this.calculateEMA(macdLine.filter(val => !isNaN(val)), 9);
        
        return {
            macdLine: macdLine,
            signalLine: signalLine,
            histogram: macdLine.map((val, i) => val - (signalLine[i] || 0))
        };
    }

    calculateVolumeRatio(volumes) {
    if (!volumes || volumes.length === 0) return 1;
    
    const validVolumes = volumes.filter(v => !isNaN(v) && v > 0);
    if (validVolumes.length === 0) return 1;
    
    const avgVolume = this.calculateSMA(validVolumes, Math.min(20, validVolumes.length));
    const currentVolume = validVolumes[validVolumes.length - 1];
    const currentAvg = avgVolume[avgVolume.length - 1];
    
    if (!currentAvg || currentAvg === 0 || isNaN(currentAvg)) return 1;
    
    const ratio = currentVolume / currentAvg;
    return isNaN(ratio) ? 1 : ratio;
}

    calculateStochastic(highs, lows, closes, period) {
        const k = [];
        for (let i = period - 1; i < closes.length; i++) {
            const highestHigh = Math.max(...highs.slice(i - period + 1, i + 1));
            const lowestLow = Math.min(...lows.slice(i - period + 1, i + 1));
            const currentClose = closes[i];
            k[i] = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
        }
        return { k: k, d: this.calculateSMA(k.filter(val => !isNaN(val)), 3) };
    }

    calculateMomentum(data, period) {
        const momentum = [];
        for (let i = period; i < data.length; i++) {
            momentum[i] = data[i] - data[i - period];
        }
        return momentum;
    }

    calculateWilliamsR(highs, lows, closes, period) {
        const williamsR = [];
        for (let i = period - 1; i < closes.length; i++) {
            const highestHigh = Math.max(...highs.slice(i - period + 1, i + 1));
            const lowestLow = Math.min(...lows.slice(i - period + 1, i + 1));
            const currentClose = closes[i];
            williamsR[i] = ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
        }
        return williamsR;
    }

    findSupportResistance(highs, lows, period) {
        const resistance = Math.max(...highs.slice(-period));
        const support = Math.min(...lows.slice(-period));
        return { support, resistance };
    }

    analyzeTrend(analysis) {
        const currentIndex = analysis.ema_fast.length - 1;
        const current = {
            close: analysis.ema_fast[currentIndex],
            ema_fast: analysis.ema_fast[currentIndex],
            ema_slow: analysis.ema_slow[currentIndex],
            sma_trend: analysis.sma_trend[currentIndex],
            rsi: analysis.rsi[analysis.rsi.length - 1],
            macd: analysis.macd.macdLine[analysis.macd.macdLine.length - 1],
            signal: analysis.macd.signalLine[analysis.macd.signalLine.length - 1]
        };

        let strength = 0;
        const conditions = [];

               // شرط 1: السعر أقل من المتوسطات
        if (current.close < current.ema_fast && current.ema_fast < current.ema_slow) {
            strength++;
            conditions.push('المتوسطات هابطة');
        }

        // شرط 2: المتوسط البطيء أقل من متوسط الترند
        if (current.ema_slow < current.sma_trend) {
            strength++;
            conditions.push('ترند عام هابط');
        }

        // شرط 3: MACD هابط
        if (current.macd < current.signal && current.macd < 0) {
            strength++;
            conditions.push('MACD هابط');
        }

        // شرط 4: RSI أقل من 50
        if (current.rsi < 50) {
            strength++;
            conditions.push('RSI ضعيف');
        }

        // شرط 5: الأسعار في انخفاض
        const recentPrices = analysis.ema_fast.slice(-3);
        if (recentPrices.every((price, i) => i === 0 || price < recentPrices[i - 1])) {
            strength++;
            conditions.push('انخفاض مستمر');
        }

        return {
            isDowntrend: strength >= this.config.trendStrength,
            strength: strength,
            conditions: conditions,
            maxStrength: 5
        };
    }

    calculateReversalScore(analysis, trendAnalysis) {
        if (!trendAnalysis.isDowntrend) return 0;

        let score = 0;
        const signals = [];
        const currentIndex = analysis.rsi.length - 1;
        
        // تحليل RSI
        const currentRSI = analysis.rsi[currentIndex];
        const prevRSI = analysis.rsi[currentIndex - 1];
        if (currentRSI < 30 && currentRSI > prevRSI) {
            score += 0.15;
            signals.push('RSI في منطقة تشبع بيعي');
        }

        // تحليل MACD
        const currentMACD = analysis.macd.macdLine[analysis.macd.macdLine.length - 1];
        const prevMACD = analysis.macd.macdLine[analysis.macd.macdLine.length - 2];
        if (currentMACD > prevMACD && currentMACD < 0) {
            score += 0.20;
            signals.push('MACD يظهر تحسن');
        }

        // تحليل الحجم
        if (analysis.volume_ratio > this.config.volumeThreshold) {
            score += 0.15;
            signals.push('حجم تداول مرتفع');
        }

        // تحليل Stochastic
        const currentK = analysis.stochastic.k[analysis.stochastic.k.length - 1];
        if (currentK < 20) {
            score += 0.10;
            signals.push('Stochastic في منطقة تشبع بيعي');
        }

        // تحليل Williams %R
        const currentWR = analysis.williams_r[analysis.williams_r.length - 1];
        if (currentWR < -80) {
            score += 0.08;
            signals.push('Williams %R يشير لتشبع بيعي');
        }

        // تحليل الزخم
        const momentum = analysis.momentum;
        const currentMomentum = momentum[momentum.length - 1];
        const prevMomentum = momentum[momentum.length - 2];
        if (currentMomentum > prevMomentum && prevMomentum < 0) {
            score += 0.12;
            signals.push('تحسن في الزخم');
        }

        // تحليل الدعم والمقاومة
        const currentPrice = analysis.ema_fast[analysis.ema_fast.length - 1];
        const support = analysis.support_resistance.support;
        if (Math.abs(currentPrice - support) / currentPrice < 0.02) {
            score += 0.15;
            signals.push('قريب من مستوى الدعم');
        }

        // تحليل التباعد (مبسط)
        const priceChange = (analysis.ema_fast[currentIndex] - analysis.ema_fast[currentIndex - 5]) / analysis.ema_fast[currentIndex - 5];
        const rsiChange = analysis.rsi[currentIndex] - analysis.rsi[currentIndex - 5];
        if (priceChange < 0 && rsiChange > 0) {
            score += 0.25;
            signals.push('تباعد إيجابي محتمل');
        }

        return {
            score: Math.min(score, 1.0),
            signals: signals,
            level: this.getReversalLevel(score)
        };
    }

    getReversalLevel(score) {
        if (score >= this.config.reversalThreshold) return 'strong';
        if (score >= this.config.reversalThreshold * 0.7) return 'medium';
        if (score >= this.config.reversalThreshold * 0.5) return 'weak';
        return 'none';
    }

    calculate24hChange(klines) {
        if (klines.length < 24) return 0;
        const current = klines[klines.length - 1].close;
        const previous = klines[klines.length - 24].close;
        return ((current - previous) / previous) * 100;
    }

    checkForAlerts(result) {
        const { symbol, reversalScore, trendAnalysis } = result;
        
        // تنبيه ترند هابط جديد
        if (trendAnalysis.isDowntrend && trendAnalysis.strength >= 4) {
            this.addAlert(
                `ترند هابط قوي - ${symbol}`,
                `قوة الترند: ${trendAnalysis.strength}/5`,
                'trend'
            );
        }

        // تنبيه انعكاس قوي
        if (reversalScore.level === 'strong') {
            this.addAlert(
                `انعكاس قوي - ${symbol}`,
                `نقاط الانعكاس: ${(reversalScore.score * 100).toFixed(1)}%`,
                'strong'
            );
        }

        // تنبيه انعكاس متوسط
        if (reversalScore.level === 'medium') {
            this.addAlert(
                `انعكاس متوسط - ${symbol}`,
                `نقاط الانعكاس: ${(reversalScore.score * 100).toFixed(1)}%`,
                'medium'
            );
        }
    }

    addAlert(title, message, type) {
        const alert = {
            id: Date.now(),
            title,
            message,
            type,
            timestamp: new Date()
        };

        this.alerts.unshift(alert);
        
        // الاحتفاظ بآخر 50 تنبيه فقط
        if (this.alerts.length > 50) {
            this.alerts = this.alerts.slice(0, 50);
        }

        this.renderAlerts();
    }

    renderAlerts() {
        this.elements.alertsList.innerHTML = this.alerts.map(alert => `
            <div class="alert-item alert-${alert.type}">
                <div class="alert-content">
                    <div class="alert-title">${alert.title}</div>
                    <div class="alert-message">${alert.message}</div>
                </div>
                <div class="alert-time">${alert.timestamp.toLocaleTimeString('ar-SA')}</div>
            </div>
        `).join('');
    }

    clearAlerts() {
        this.alerts = [];
        this.elements.alertsList.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">لا توجد تنبيهات</div>';
    }

    displayResults(results) {
        if (results.length === 0) {
            this.elements.resultsGrid.innerHTML = '<div style="text-align: center; color: #888; padding: 40px;">لا توجد عملات تطابق المعايير حالياً</div>';
            return;
        }

        // ترتيب النتائج حسب نقاط الانعكاس
        results.sort((a, b) => b.reversalScore.score - a.reversalScore.score);

        this.elements.resultsGrid.innerHTML = results.map(result => this.createCoinCard(result)).join('');
    }

  createCoinCard(result) {
    const { symbol, price, change24h, analysis, trendAnalysis, reversalScore } = result;
    
    // التأكد من صحة البيانات قبل العرض
    const safePrice = isNaN(price) || price <= 0 ? 0 : price;
    const safeChange = isNaN(change24h) ? 0 : change24h;
    const safeVolumeRatio = isNaN(analysis.volume_ratio) || analysis.volume_ratio <= 0 ? 1 : analysis.volume_ratio;
    
    const currentRSI = analysis.rsi[analysis.rsi.length - 1];
    const currentStoch = analysis.stochastic.k[analysis.stochastic.k.length - 1];
    const macdTrend = analysis.macd.macdLine[analysis.macd.macdLine.length - 1] > 
                     analysis.macd.signalLine[analysis.macd.signalLine.length - 1] ? 'صاعد' : 'هابط';

    // تحديد عدد الخانات العشرية حسب السعر
    const priceDecimals = safePrice > 1 ? 4 : 8;
    const displayPrice = safePrice > 0 ? safePrice.toFixed(priceDecimals) : 'غير متاح';

    return `
        <div class="coin-card ${reversalScore.level}-reversal">
            <div class="coin-header">
                <div class="coin-symbol">${symbol.replace('USDT', '/USDT')}</div>
                <div class="coin-price">$${displayPrice}</div>
            </div>
            
            <div class="coin-metrics">
                <div class="metric">
                    <span class="metric-label">التغير 24س:</span>
                    <span class="metric-value" style="color: ${safeChange >= 0 ? '#00ff88' : '#ff4444'}">${safeChange.toFixed(2)}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">قوة الترند:</span>
                    <span class="metric-value">${trendAnalysis.strength}/5</span>
                </div>
                <div class="metric">
                    <span class="metric-label">RSI:</span>
                    <span class="metric-value" style="color: ${currentRSI < 30 ? '#00ff88' : currentRSI > 70 ? '#ff4444' : '#e0e0e0'}">${currentRSI.toFixed(1)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">MACD:</span>
                    <span class="metric-value" style="color: ${macdTrend === 'صاعد' ? '#00ff88' : '#ff4444'}">${macdTrend}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Stochastic:</span>
                    <span class="metric-value" style="color: ${currentStoch < 20 ? '#00ff88' : currentStoch > 80 ? '#ff4444' : '#e0e0e0'}">${currentStoch.toFixed(1)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">الحجم:</span>
                    <span class="metric-value" style="color: ${safeVolumeRatio > 1.5 ? '#00ff88' : '#e0e0e0'}">${safeVolumeRatio.toFixed(1)}x</span>
                </div>
            </div>

            <div class="reversal-score">
                <div class="score-label">نقاط الانعكاس</div>
                <div class="score-value score-${reversalScore.level}">
                    ${(reversalScore.score * 100).toFixed(1)}%
                </div>
            </div>

            ${reversalScore.signals.length > 0 ? `
                <div class="reversal-signals">
                    <div class="signals-title">الإشارات:</div>
                    <div class="signals-list">
                        ${reversalScore.signals.slice(0, 3).map(signal => `
                            <span class="signal-item">${signal}</span>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div class="trend-conditions">
                <div class="conditions-title">شروط الترند:</div>
                <div class="conditions-list">
                    ${trendAnalysis.conditions.slice(0, 3).map(condition => `
                        <span class="condition-item">✓ ${condition}</span>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// إضافة دالة لإعادة تحميل العملات التي بها مشاكل
async retryFailedCoins() {
    const failedCoins = this.coins.filter(symbol => {
        // منطق لتحديد العملات التي فشلت
        return true; // مؤقت
    });
    
    if (failedCoins.length > 0) {
        console.log(`إعادة محاولة تحليل ${failedCoins.length} عملة`);
        // إعادة تحليل العملات الفاشلة
    }
}

    updateStats(results) {
        const downtrendCount = results.length;
        const strongReversals = results.filter(r => r.reversalScore.level === 'strong').length;
        const mediumReversals = results.filter(r => r.reversalScore.level === 'medium').length;

        this.elements.downtrendCoins.textContent = downtrendCount;
        this.elements.strongReversals.textContent = strongReversals;
        this.elements.mediumReversals.textContent = mediumReversals;
    }
}

// تشغيل التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    new TrendReversalAnalyzer();
});

// معالجة الأخطاء العامة
window.addEventListener('error', (event) => {
    console.error('خطأ في التطبيق:', event.error);
});

// معالجة الأخطاء غير المعالجة في الـ Promises
window.addEventListener('unhandledrejection', (event) => {
    console.error('خطأ في Promise:', event.reason);
    event.preventDefault();
});

