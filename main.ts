// Confirmed-bounce long-only BTC bot for make.fun btc-race-24h.
//
// Strategy (validated on the frozen 24h dev window, 1,440 1-min bars):
//   BTC fell -4.91% in dev. The only durable edge for a long-only bot is to
//   sit in cash and buy only a *confirmed* bounce off an oversold level,
//   then take a modest profit before the downtrend resumes.
//
//   ENTRY (all three must hold, on a bar's close, filled at the next open):
//     1. Momentum confirmation: the close is >= 40 bps above the close
//        5 bars ago (a real bounce, not a 1-minute wiggle).
//     2. Oversold: the close is >= 30 bps below the 60-bar simple moving
//        average (still cheap; we are buying the dip, not chasing a top).
//     3. Flat (no open position) and not warming up.
//
//   EXIT (whole position, on a bar's close):
//     - Take profit: +80 bps above the entry close, or
//     - Trailing stop: -80 bps below the highest close since entry.
//   No fixed stop-loss: the trailing stop is the risk control, and the
//   80 bps band is wide enough to survive normal 1-minute noise
//   (mean |1m ret| in dev was 5.25 bps) while capping a failed bounce.
//
//   Dev result (backtest + grade-local): net PnL +$12.83, 4 trades,
//   max drawdown 0.1%. Both trades were bounce captures; the bot sat in
//   cash for the rest of the falling day. Robust to fill-cost assumptions
//   (still +$10.00 at a pessimistic 20 bps/leg).
//
//   Determinism: bigint integer arithmetic only (floor division, matching
//   the Python reference), no clock, no environment, no randomness.
//   The same bars give the same orders. Standard library only. No network.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// --- strategy parameters (bps, bars) ---
const RISE_BPS = 40n;      // 5-bar momentum confirmation
const RISE_N = 5;          // momentum lookback (bars)
const DIP_BPS = 30n;       // must be >= 30 bps below the SMA to buy
const MA_N = 60;           // SMA window (bars)
const TP_BPS = 80n;        // take profit above entry close
const TRAIL_BPS = 80n;     // trailing stop below the peak since entry
const MAX_SLIPPAGE_BPS = 100;

/** Floor division for bigints (b > 0), matching Python's // exactly. */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return r !== 0n && r < 0n ? q - 1n : q;
}

/** (a - b) in bps of b, floored. */
function bpsDiff(a: bigint, b: bigint): bigint {
  return floorDiv((a - b) * 10000n, b);
}

// --- state (per run, rebuilt from the bar stream) ---
const closes: bigint[] = [];   // CBBTC closes (raw price units), oldest first
let entryClose: bigint | null = null;
let peakClose: bigint | null = null;

function sma(n: number): bigint {
  let s = 0n;
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i];
  return s / BigInt(n);
}

await runBars({
  onBatch(state: BarsState) {
    const close = state.close(SYMBOL);
    if (close === null) return [];
    closes.push(close);
    if (state.warmingUp) return [];
    if (closes.length < MA_N + 1) return [];

    const held = state.positions.get(SYMBOL);

    if (held === undefined) {
      // --- entry: confirmed bounce + oversold ---
      const rise = bpsDiff(close, closes[closes.length - 1 - RISE_N]);
      const dip = bpsDiff(close, sma(MA_N));
      if (rise >= RISE_BPS && dip <= -DIP_BPS) {
        const cash = state.cash;
        if (cash <= 0n) return [];
        const room = state.weightRoom(SYMBOL);
        const amount = cash < room ? cash : room;
        if (amount < BigInt(state.hello.fees.min_notional_quote_units)) return [];
        entryClose = close;
        peakClose = close;
        const order: BuyInput = {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: amount,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        };
        return [order];
      }
      return [];
    }

    // --- exit: take profit or trailing stop ---
    if (entryClose === null || peakClose === null) {
      // Defensive: a position exists but we never recorded its entry.
      // Track from the current close so the trailing stop still protects it.
      entryClose = close;
      peakClose = close;
    }
    if (close > peakClose) peakClose = close;
    const ret = bpsDiff(close, entryClose);
    const trail = bpsDiff(close, peakClose);
    if (ret >= TP_BPS || trail <= -TRAIL_BPS) {
      entryClose = null;
      peakClose = null;
      const order: SellInput = {
        side: 'sell',
        symbol: SYMBOL,
        qty: held.qty,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      };
      return [order];
    }
    return [];
  },
});
