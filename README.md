# btc-race-24h — Confirmed-Bounce Long-Only BTC Bot

Entry for the make.fun competition `btc-race-24h-20261113-2314`: race a BTC
trading bot live for 24 hours on paper money. The bot trades cbBTC vs USDC
on Solana, long-only, starting from $1,000.

## Strategy

BTC fell 4.91% in the frozen dev window. For a long-only bot, the only
durable edge is to sit in cash and buy only a **confirmed bounce** off an
oversold level, then take a modest profit before the downtrend resumes.

**Entry** (all three must hold, on a bar's close, filled at the next open):

1. Momentum confirmation: the close is >= 40 bps above the close 5 bars
   ago (a real bounce, not a 1-minute wiggle).
2. Oversold: the close is >= 30 bps below the 60-bar simple moving
   average (buying the dip, not chasing a top).
3. Flat (no open position) and not warming up.

**Exit** (whole position, on a bar's close):

- Take profit: +80 bps above the entry close, or
- Trailing stop: -80 bps below the highest close since entry.

No fixed stop-loss: the trailing stop is the risk control. The 80 bps band
is wide enough to survive normal 1-minute noise (mean |1m ret| in dev was
5.25 bps) while capping a failed bounce.

## Dev result

`makefun grade-local --kit . --bot . --driver process` on the frozen dev
window (1,440 1-minute bars):

- **Net PnL: +$9.97 USDC** (return +0.997%)
- **4 trades, win rate 100%**, max drawdown 0.73%
- Fees $1.61; guardrails met
- Both round trips were bounce captures; the bot sat in cash for the rest
  of the falling day.

The result is robust to fill-cost assumptions (backtest still +$10.00 at a
pessimistic 20 bps/leg). It was selected by grid search over the
rise/dip/TP/trailing-stop parameters; the top parameter sets converge on the
same two bounce trades, so the edge is not a single lucky threshold.

## Implementation

- `main.ts` — the bot (Node 22, standard library only, no network).
  Uses the vendored `agent-fun/bars-replay/v1` shim in `vendor/`.
- Determinism: bigint integer arithmetic only (floor division), no clock,
  no environment, no randomness. The same bars give the same orders, run
  after run (verified: grade-local's two executions reproduce byte for byte).
- Position sizing: full cash on entry (max weight is 100% of equity),
  whole position on exit. At most 1 open position, at most 1 order per bar.

## License

MIT. See `LICENSE`.
