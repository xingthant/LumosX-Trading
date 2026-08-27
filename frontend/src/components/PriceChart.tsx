'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, UTCTimestamp, CrosshairMode } from 'lightweight-charts';
import { API_URL } from '@/lib/api';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Tick {
  price: number;
  volume?: number;
}

function volumeColor(up: boolean) {
  return up ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)';
}

export default function PriceChart({ pair, latestTick }: { pair: string; latestTick: Tick | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const currentCandleRef = useRef<Candle | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height: 320,
      layout: { background: { color: 'transparent' }, textColor: '#7d8998', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: '#161d26' }, horzLines: { color: '#161d26' } },
      rightPriceScale: { borderColor: '#1f2833' },
      timeScale: { borderColor: '#1f2833', timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#7d8998', width: 1, style: 3, labelBackgroundColor: '#1f2833' },
        horzLine: { color: '#7d8998', width: 1, style: 3, labelBackgroundColor: '#1f2833' },
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      priceScaleId: 'right',
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resize = () => chart.applyOptions({ width: containerRef.current?.clientWidth || 0 });
    resize();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
    };
  }, []);

  // Reload historical candles whenever the pair or timeframe changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_URL}/api/market/klines/${pair}?interval=${timeframe}&limit=300`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !candleSeriesRef.current || !volumeSeriesRef.current) return;
        const candles: Candle[] = data.candles || [];
        candleSeriesRef.current.setData(candles);
        volumeSeriesRef.current.setData(
          candles.map((c) => ({ time: c.time, value: c.volume, color: volumeColor(c.close >= c.open) }))
        );
        currentCandleRef.current = candles[candles.length - 1] || null;
        chartRef.current?.timeScale().scrollToRealTime();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pair, timeframe]);

  // Aggregate live ticks into the currently-forming candle, Binance-style.
  useEffect(() => {
    if (!latestTick || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    const bucketSeconds = TIMEFRAME_SECONDS[timeframe];
    const bucketTime = (Math.floor(Date.now() / 1000 / bucketSeconds) * bucketSeconds) as UTCTimestamp;
    const { price, volume = 0 } = latestTick;
    const current = currentCandleRef.current;

    let next: Candle;
    if (current && current.time === bucketTime) {
      next = {
        time: bucketTime,
        open: current.open,
        high: Math.max(current.high, price),
        low: Math.min(current.low, price),
        close: price,
        volume: current.volume + volume,
      };
    } else {
      const openPrice = current ? current.close : price;
      next = { time: bucketTime, open: openPrice, high: Math.max(openPrice, price), low: Math.min(openPrice, price), close: price, volume };
    }

    currentCandleRef.current = next;
    candleSeriesRef.current.update(next);
    volumeSeriesRef.current.update({ time: bucketTime, value: next.volume, color: volumeColor(next.close >= next.open) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestTick]);

  return (
    <div>
      <div className="mb-2 flex gap-1 overflow-x-auto">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase ${
              tf === timeframe ? 'bg-accent/15 text-accent' : 'text-muted'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>
      <div className="relative w-full">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-muted">Loading chart…</div>
        )}
        <div ref={containerRef} className="w-full" />
      </div>
    </div>
  );
}
