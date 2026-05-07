import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, animate, AnimatePresence } from "framer-motion";

// ─── Inline Components ────────────────────────────────────────────────────────

function Card({ className = "", children, ...props }) {
  return (
    <div className={`rounded-2xl border border-white/12 bg-white/6 shadow-2xl ${className}`} {...props}>
      {children}
    </div>
  );
}

function Button({ className = "", variant = "default", type = "button", children, ...props }) {
  const variants = {
    default: "bg-white text-gray-950 hover:bg-white/90 disabled:bg-white/30 disabled:text-gray-500",
    secondary: "bg-white/12 text-white hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30",
  };
  return (
    <button
      type={type}
      className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed ${variants[variant] || variants.default} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function AnimatedMoney({ value, className = "" }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const controls = animate(display, value, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value]);
  return (
    <span className={className}>
      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(display)}
    </span>
  );
}

// ─── Simulation ───────────────────────────────────────────────────────────────

function simulateSOR(startBalance, withdrawal, returns) {
  const results = [];
  let balance = startBalance;

  for (let i = 0; i < returns.length; i += 1) {
    const startBal = balance;
    const alreadyDepleted = balance <= 0;
    const actualWithdrawal = Math.min(withdrawal, balance);
    const afterWithdrawal = balance - actualWithdrawal;
    const returnRate = returns[i];
    const marketChange = afterWithdrawal * returnRate;
    const endBalance = Math.max(0, afterWithdrawal + marketChange);
    const isDepletionYear = !alreadyDepleted && actualWithdrawal < withdrawal;

    results.push({
      year: i + 1,
      startBalance: startBal,
      withdrawal: actualWithdrawal,
      returnRate,
      marketChange,
      endBalance,
      isDepleted: alreadyDepleted,
      isDepletionYear,
    });

    balance = endBalance;
  }

  return results;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const START_BALANCE = 1_000_000;
const ANNUAL_WITHDRAWAL = 60_000;
const YEARS = 20;

// S&P 500 annual total returns (with dividends), two real 20-year retirement windows
// Scenario 1: Retired January 2000 — dot-com crash immediately, then 2008 in year 9
const BAD_FIRST_RETURNS = [
  -0.091, -0.119, -0.221,  // 2000, 2001, 2002 — dot-com bust
   0.287,  0.109,  0.049,  // 2003, 2004, 2005
   0.158,  0.055, -0.370,  // 2006, 2007, 2008 — financial crisis
   0.265,  0.151,  0.021,  // 2009, 2010, 2011
   0.160,  0.324,  0.137,  // 2012, 2013, 2014
   0.014,  0.120,  0.218,  // 2015, 2016, 2017
  -0.044,  0.315,          // 2018, 2019
];
// Scenario 2: Retired January 1995 — five boom years first, same crashes hit later
const GOOD_FIRST_RETURNS = [
   0.376,  0.230,  0.334,  // 1995, 1996, 1997 — tech boom
   0.286,  0.210,          // 1998, 1999
  -0.091, -0.119, -0.221,  // 2000, 2001, 2002 — dot-com bust (years 6-8)
   0.287,  0.109,  0.049,  // 2003, 2004, 2005
   0.158,  0.055, -0.370,  // 2006, 2007, 2008 — financial crisis (year 14)
   0.265,  0.151,  0.021,  // 2009, 2010, 2011
   0.160,  0.324,  0.137,  // 2012, 2013, 2014
];

// Calendar year lookup for each retirement year (index = retirement year - 1)
const BAD_CAL_YEARS  = [2000,2001,2002,2003,2004,2005,2006,2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019];
const GOOD_CAL_YEARS = [1995,1996,1997,1998,1999,2000,2001,2002,2003,2004,2005,2006,2007,2008,2009,2010,2011,2012,2013,2014];

const BAD_COLOR = "#C44B4B";
const GOOD_COLOR = "#2D9F83";

const PREP_STEPS = [
  "Loading market data",
  "Building return sequences",
  "Calculating portfolio paths",
  "Preparing narration",
];
const MIN_PREP_DURATION_MS = 6500;

// ─── Formatters & Helpers ─────────────────────────────────────────────────────

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatPct(rate) {
  const pct = Math.abs(rate * 100).toFixed(0);
  return rate >= 0 ? `+${pct}%` : `-${pct}%`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateSpeechMs(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1200, Math.min(7000, words * 255));
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// Phase system: 0=intro, 1=withdrawal, 2=bad market moves, 3=good market moves, 4=close
// The good portfolio holds at its post-withdrawal value during phase 2 so it animates separately in phase 3.
function getPortfolioDisplayValue(yearData, phase, isGood = false) {
  if (!yearData) return 0;
  if (yearData.isDepleted) return 0;
  if (yearData.isDepletionYear) {
    if (phase <= 1) return yearData.startBalance;
    return 0;
  }
  if (phase === 0) return yearData.startBalance;
  if (phase === 1) return yearData.startBalance - yearData.withdrawal;
  if (phase === 2 && isGood) return yearData.startBalance - yearData.withdrawal; // good waits
  return yearData.endBalance;
}

// ─── Voice Infrastructure ─────────────────────────────────────────────────────

const SPEECH_CACHE_MAX = 96;
const speechBlobUrlCache = new Map();
const speechInflight = new Map();

function rememberSpeechUrl(text, url) {
  if (speechBlobUrlCache.has(text)) speechBlobUrlCache.delete(text);
  speechBlobUrlCache.set(text, url);
  while (speechBlobUrlCache.size > SPEECH_CACHE_MAX) {
    const oldestKey = speechBlobUrlCache.keys().next().value;
    const oldestUrl = speechBlobUrlCache.get(oldestKey);
    speechBlobUrlCache.delete(oldestKey);
    URL.revokeObjectURL(oldestUrl);
  }
}

async function fetchSpeech(text) {
  if (speechBlobUrlCache.has(text)) return speechBlobUrlCache.get(text);
  if (speechInflight.has(text)) return speechInflight.get(text);

  const promise = (async () => {
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || res.status === 204) return null;
      const blob = await res.blob();
      if (!blob.size) return null;
      const url = URL.createObjectURL(blob);
      rememberSpeechUrl(text, url);
      return url;
    } catch {
      return null;
    } finally {
      speechInflight.delete(text);
    }
  })();

  speechInflight.set(text, promise);
  return promise;
}

async function mapWithConcurrency(items, mapper, concurrency = 4) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await mapper(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}

// ─── Narration ────────────────────────────────────────────────────────────────

function getSetupNarration(stage) {
  if (stage === "setup") {
    return `In this walkthrough, we look at sequence of returns risk using two real retirement timelines. Both retirees start with one million dollars and withdraw sixty thousand dollars every year. The difference: one retires in January two-thousand, right at the peak of the dot-com bubble. The other retires in January nineteen-ninety-five, at the beginning of one of the greatest bull markets in history.`;
  }
  if (stage === "bad-intro") {
    return `The retiree who starts in two-thousand faces an immediate crisis. The dot-com bubble collapses in year one — the S-and-P five-hundred falls nine percent. Year two, another twelve percent drop. Year three, twenty-two percent. Three consecutive market declines right out of the gate. Then in year nine of their retirement — two-thousand-eight — the financial crisis hits a portfolio that has already been badly damaged.`;
  }
  if (stage === "good-intro") {
    return `The retiree who starts in nineteen-ninety-five enters the same market — but at the right moment. Year one is up thirty-eight percent. Year two, twenty-three percent. Year three, thirty-three percent. Five consecutive double-digit years before a single down year arrives. When the dot-com bust eventually comes in years six, seven, and eight — and when two-thousand-eight hits in year fourteen — this portfolio absorbs each blow from a position of strength.`;
  }
  if (stage === "handoff") {
    return `Same amount invested. Same withdrawals. Real S-and-P five-hundred returns. Just different starting years. Let us watch twenty years play out.`;
  }
  return "";
}

function getSetupStageText(stage) {
  if (stage === "preparing") return "Loading real S&P 500 data for 1995–2019...";
  if (stage === "setup") return "Two retirees. One million dollars each. Different starting years.";
  if (stage === "bad-intro") return "Retired Jan 2000 — dot-com crash in year 1.";
  if (stage === "good-intro") return "Retired Jan 1995 — five bull years before any crash.";
  if (stage === "handoff") return "Real data. Real outcomes. Let the simulation run.";
  return "";
}

// Phases: 0=intro, 1=withdrawal, 2=bad market, 3=good market, 4=close
function getYearNarration(phase, badYear, goodYear) {
  const y = badYear.year;
  const badEnd = formatMoney(badYear.endBalance);
  const goodEnd = formatMoney(goodYear.endBalance);
  const gap = formatMoney(Math.abs(goodYear.endBalance - badYear.endBalance));
  const badMktAmt = formatMoney(Math.abs(badYear.marketChange));
  const goodMktAmt = formatMoney(Math.abs(goodYear.marketChange));
  const withdrawal = formatMoney(ANNUAL_WITHDRAWAL);
  const afterWithdrawal = formatMoney(START_BALANCE - ANNUAL_WITHDRAWAL);

  if (y === 1) {
    if (phase === 0) return `Year one of retirement. January two-thousand for the first retiree — January nineteen-ninety-five for the second. Both start with one million dollars.`;
    if (phase === 1) return `Each pays ${withdrawal} in living expenses. Both portfolios drop to ${afterWithdrawal}.`;
    if (phase === 2) return `The market in two-thousand falls nine percent as the dot-com bubble begins to burst. Retired Two-Thousand takes the full blow — portfolio drops to ${badEnd}.`;
    if (phase === 3) return `In nineteen-ninety-five, the tech boom is just getting started. The S-and-P surges thirty-eight percent. Retired Ninety-Five climbs to ${goodEnd}.`;
    if (phase === 4) return `After just one year — a ${gap} gap. And it is only year one.`;
  }

  if (y === 2) {
    if (phase === 0) return `Year two. Two-thousand-one for Retired Two-Thousand. Nineteen-ninety-six for Retired Ninety-Five.`;
    if (phase === 1) return `Another ${withdrawal} in living expenses comes out of each portfolio.`;
    if (phase === 2) return `Two-thousand-one. The dot-com crash continues — and September eleventh adds to the stress. The market falls twelve percent. Retired Two-Thousand drops to ${badEnd}.`;
    if (phase === 3) return `Nineteen-ninety-six. The bull market keeps running. Twenty-three percent from the market lifts Retired Ninety-Five to ${goodEnd}.`;
    if (phase === 4) return `The gap is now ${gap}. Retired Two-Thousand has lost nearly forty percent in just two years — while still paying living expenses every year.`;
  }

  if (y === 3) {
    if (phase === 0) return `Year three. Two-thousand-two for Retired Two-Thousand — the worst year of the dot-com crash. Nineteen-ninety-seven for Retired Ninety-Five.`;
    if (phase === 1) return `${withdrawal} in living expenses withdrawn from each.`;
    if (phase === 2) return `Two-thousand-two delivers the worst blow yet — the market falls twenty-two percent. Third straight down year for Retired Two-Thousand. Portfolio drops to ${badEnd}.`;
    if (phase === 3) return `Nineteen-ninety-seven. The tech boom is still raging — thirty-three percent from the market. Retired Ninety-Five climbs to ${goodEnd}.`;
    if (phase === 4) return `Three consecutive down years, with withdrawals coming out every year. Each withdrawal was selling into a falling market. That forced selling at the worst time is the core of sequence of returns risk.`;
  }

  if (y === 4) {
    if (phase === 0) return `Year four. Two-thousand-three — the market finally recovers. Nineteen-ninety-eight for Retired Ninety-Five.`;
    if (phase === 1) return `${withdrawal} in living expenses from each.`;
    if (phase === 2) return `Two-thousand-three. The market rebounds twenty-nine percent. Retired Two-Thousand gains ${badMktAmt} from the market.`;
    if (phase === 3) return `Almost the same return in nineteen-ninety-eight — twenty-nine percent. But Retired Ninety-Five gains ${goodMktAmt}. Same percentage. Very different dollars. The base is everything.`;
    if (phase === 4) return `Even with a strong recovery, Retired Two-Thousand is still shrinking. The withdrawals are too large relative to the damaged base.`;
  }

  if (y === 5) {
    if (phase === 0) return `Year five. Two-thousand-four for Retired Two-Thousand. Nineteen-ninety-nine for Retired Ninety-Five.`;
    if (phase === 1) return `${withdrawal} in living expenses from each.`;
    if (phase === 2) return `Two-thousand-four. Eleven percent from the market — ${badMktAmt} gained. Still not enough to outpace the sixty-thousand withdrawal. The portfolio shrinks again.`;
    if (phase === 3) return `Nineteen-ninety-nine — peak of the dot-com era. Twenty-one percent from the market adds ${goodMktAmt} to Retired Ninety-Five's already large portfolio.`;
    if (phase === 4) return `The gap now stands at ${gap}. Retired Ninety-Five has nearly tripled their wealth while Retired Two-Thousand keeps shrinking.`;
  }

  if (y === 6) {
    if (phase === 0) return `Year six. Two-thousand-five for Retired Two-Thousand. And year two-thousand arrives for Retired Ninety-Five — their first down year.`;
    if (phase === 1) return `${withdrawal} in living expenses from each.`;
    if (phase === 2) return `Two-thousand-five. Five percent from the market — ${badMktAmt} gained, but still less than the withdrawal. Retired Two-Thousand's portfolio falls again.`;
    if (phase === 3) return `The year two-thousand hits Retired Ninety-Five — the dot-com crash, down nine percent. But from a portfolio above two point seven million, it barely registers. They drop to ${goodEnd}.`;
    if (phase === 4) return `The same nine percent decline — catastrophic in year one, a minor setback in year six. That is the asymmetry. That is what the cushion buys you.`;
  }

  return "";
}

function getFinaleNarration(index, badYear, goodYear, sub) {
  const goodEnd = formatMoney(goodYear.endBalance);
  const goodCal = GOOD_CAL_YEARS[index];
  const badCal = BAD_CAL_YEARS[index];

  // index 15 = year 16: two-thousand retiree on the brink (2015 vs 2010)
  if (index === 15) {
    if (sub === "intro") return `Year sixteen. Twenty-fifteen for the two-thousand retiree. Twenty-ten for the nineteen-ninety-five retiree.`;
    if (sub === "market") return `The market gains one point four percent in twenty-fifteen — but on a portfolio of barely seventeen thousand dollars, that amounts to about two hundred dollars. The nineteen-ninety-five retiree, in twenty-ten, gains fifteen percent — over two hundred seventy-five thousand dollars from the market alone.`;
    if (sub === "close") return `Seventeen thousand versus over two million one hundred thousand. The two-thousand retiree has one withdrawal left before the money runs out.`;
  }
  // index 16 = year 17: depletion (2016 vs 2011) — handled by the depletion block in buildSORSegments
  // index 17 = year 18: post-depletion (2017 vs 2012)
  if (index === 17) {
    if (sub === "market") return `Year eighteen. The two-thousand retiree's portfolio has been at zero for a year. The nineteen-ninety-five retiree is now in twenty-twelve — the market gains sixteen percent, pushing the portfolio to ${goodEnd}.`;
    if (sub === "close") return `The nineteen-ninety-five retiree is compounding toward their final year.`;
  }
  // index 18 = year 19: (2018 vs 2013)
  if (index === 18) {
    if (sub === "intro") return `Year nineteen. Twenty-eighteen brings a four percent market decline for the two-thousand retiree — but they are at zero. The nineteen-ninety-five retiree is in twenty-thirteen.`;
    if (sub === "market") return `Twenty-thirteen delivers thirty-two percent from the market. The nineteen-ninety-five retiree gains nearly eight hundred thousand dollars in a single year — ending at ${goodEnd}.`;
    if (sub === "close") return `Nearly three point two million dollars. One year remaining.`;
  }
  // index 19 = year 20: final (2019 vs 2014)
  if (index === 19) {
    if (sub === "intro") return `Year twenty. The final year. Twenty-nineteen and twenty-fourteen.`;
    if (sub === "market") return `The market gains fourteen percent in twenty-fourteen for the nineteen-ninety-five retiree. After twenty years of retirement — with the same sixty-thousand withdrawal every year — the portfolio finishes at ${goodEnd}. The two-thousand retiree has been at zero for three years.`;
    if (sub === "close") return `${goodEnd} versus zero. Same starting balance. Same withdrawals. Two different starting years.`;
  }
  return "";
}

function getPhaseLabel(phase, badYear, goodYear) {
  const withdrawal = formatMoney(ANNUAL_WITHDRAWAL);
  if (!badYear) return "";

  if (phase === 0) {
    if (badYear.isDepleted) return `Year ${badYear.year} — Retired '00 portfolio at zero.`;
    return `Year ${badYear.year} — Both portfolios begin the year.`;
  }
  if (phase === 1) {
    if (badYear.isDepletionYear) return `Retired '00 only has ${formatMoney(badYear.startBalance)} remaining.`;
    if (badYear.isDepleted) return `Retired '00 depleted — no withdrawal possible.`;
    return `Annual withdrawal: ${withdrawal} from each portfolio.`;
  }
  if (phase === 2) {
    if (badYear.isDepletionYear) return `Retired '00: DEPLETED`;
    if (badYear.isDepleted) return `Retired '00: no change (at zero)`;
    return `Retired '00: ${formatPct(badYear.returnRate)} market return`;
  }
  if (phase === 3) {
    if (badYear.isDepleted || badYear.isDepletionYear) return `Retired '95: ${formatPct(goodYear.returnRate)} market return`;
    return `Retired '95: ${formatPct(goodYear.returnRate)} market return`;
  }
  if (phase === 4) {
    const gap = formatMoney(Math.abs(goodYear.endBalance - badYear.endBalance));
    if (badYear.isDepleted || badYear.isDepletionYear) return `Gap: ${formatMoney(goodYear.endBalance)} vs $0`;
    return `End of year ${badYear.year}. Gap: ${gap}`;
  }
  return "";
}

// ─── Segment Builder ──────────────────────────────────────────────────────────

function buildSORSegments({ badSim, goodSim, includeIntro }) {
  const segments = [];

  if (includeIntro) {
    for (const stage of ["setup", "bad-intro", "good-intro", "handoff"]) {
      segments.push({
        kind: "intro",
        section: "intro",
        stage,
        text: getSetupNarration(stage),
        pauseAfter: stage === "handoff" ? 280 : 220,
      });
    }
  }

  // Full treatment: years 1–6 (indices 0–5)
  // 5 phases per year: 0=intro, 1=withdrawal, 2=bad market, 3=good market, 4=close
  for (let index = 0; index <= 5; index += 1) {
    const bad = badSim[index];
    const good = goodSim[index];
    const isDramatic = index < 3;
    const p = isDramatic
      ? { p0: 350, p1: 700, p2: 600, p3: 600, p4: 900 }
      : { p0: 200, p1: 500, p2: 400, p3: 400, p4: 700 };

    segments.push(
      { kind: "year", section: "walkthrough", yearIndex: index, phase: 0, text: getYearNarration(0, bad, good), waitForEnd: true, leadMs: 120, pauseAfter: p.p0 },
      { kind: "year", section: "walkthrough", yearIndex: index, phase: 1, text: getYearNarration(1, bad, good), waitForEnd: true, pauseAfter: p.p1 },
      { kind: "year", section: "walkthrough", yearIndex: index, phase: 2, text: getYearNarration(2, bad, good), waitForEnd: true, pauseAfter: p.p2 },
      { kind: "year", section: "walkthrough", yearIndex: index, phase: 3, text: getYearNarration(3, bad, good), waitForEnd: true, pauseAfter: p.p3 },
      { kind: "year", section: "walkthrough", yearIndex: index, phase: 4, text: getYearNarration(4, bad, good), waitForEnd: true, pauseAfter: p.p4 },
    );
  }

  // Fast track: years 7–15 (indices 6–14)
  // Year 9 (index 8) = 2008 financial crisis for the 2000 retiree — call it out explicitly
  const fastStart = 6;
  const fastEnd = 14;
  const depletionIndex = badSim.findIndex(y => y.isDepletionYear); // dynamic: index 16 with real data
  const finalFastBad = badSim[fastEnd];
  const finalFastGood = goodSim[fastEnd];

  segments.push({
    kind: "voice-only",
    section: "fasttrack",
    text: `From here we fast-forward through years seven to fifteen. The real-world data gets more intense — and year nine brings the two-thousand-eight financial crisis. Watch what it does to each portfolio.`,
    waitForEnd: true,
    pauseAfter: 300,
  });

  for (let index = fastStart; index <= fastEnd; index += 1) {
    const tick = { kind: "fast-year", section: "fasttrack", yearIndex: index, phase: 1, pauseAfter: 900 };
    if (index === fastStart) {
      tick.text = `Each year, sixty thousand dollars comes out. The two-thousand retiree is watching a slowly shrinking base. By year nine, two-thousand-eight will hit. By year ten, the balance is below ${formatMoney(badSim[9].endBalance)}. By year fourteen, below ${formatMoney(badSim[13].endBalance)}.`;
      tick.waitForEnd = false;
      tick.setFastPass = "bad";
    }
    if (index === 8) {
      tick.text = `Year nine — two-thousand-eight. The financial crisis. The market falls thirty-seven percent. For the two-thousand retiree, who has already been depleted by the dot-com crash, this is devastating.`;
      tick.pauseAfter = 1600;
    }
    segments.push(tick);
  }

  segments.push({ kind: "wait-audio", section: "fasttrack", pauseAfter: 400 });

  for (let index = fastStart; index <= fastEnd; index += 1) {
    const tick = { kind: "fast-year", section: "fasttrack", yearIndex: index, phase: 2, pauseAfter: 1100 };
    if (index === fastStart) {
      tick.text = `Now watch the nineteen-ninety-five retiree. They are still in the dot-com era — absorbing those same crashes from a much larger base. Year fourteen brings two-thousand-eight for them. By year ten, above ${formatMoney(goodSim[9].endBalance)}. By year fourteen, above ${formatMoney(goodSim[13].endBalance)}.`;
      tick.waitForEnd = false;
      tick.setFastPass = "good";
    }
    if (index === 13) {
      tick.text = `Year fourteen — two-thousand-eight for the nineteen-ninety-five retiree. Same thirty-seven percent drop. But they absorb it from over two and a half million dollars.`;
      tick.pauseAfter = 1600;
    }
    segments.push(tick);
  }

  segments.push(
    { kind: "wait-audio", section: "fasttrack", pauseAfter: 300 },
    { kind: "fast-year", section: "fasttrack", yearIndex: fastEnd, phase: 2, setFastPass: "done", pauseAfter: 800 },
    {
      kind: "voice-only",
      section: "fasttrack",
      text: `After fifteen years — the two-thousand retiree is down to ${formatMoney(finalFastBad.endBalance)}. The nineteen-ninety-five retiree has grown to ${formatMoney(finalFastGood.endBalance)}. Over ${formatMoney(finalFastGood.endBalance - finalFastBad.endBalance)} apart. Same S-and-P five-hundred returns. Same withdrawals. Just different starting years.`,
      waitForEnd: true,
      pauseAfter: 400,
    },
    { kind: "gate", section: "fasttrack" },
  );

  // Finale: years 16–20 (indices 15–19)
  // Index 15 = "on the brink" (2015, barely alive with $17k)
  // depletionIndex = 16 = year 17 (2016) — depletion year
  for (let index = 15; index <= YEARS - 1; index += 1) {
    const bad = badSim[index];
    const good = goodSim[index];

    if (index === 15) {
      // On the brink — barely alive at $17k
      segments.push(
        { kind: "year", section: "finale", yearIndex: 15, phase: 0, text: getFinaleNarration(15, bad, good, "intro"), waitForEnd: true, leadMs: 120, pauseAfter: 1200 },
        { kind: "year", section: "finale", yearIndex: 15, phase: 1, text: `Living expenses come out. The two-thousand retiree has only ${formatMoney(bad.startBalance)} left — less than a third of one annual withdrawal.`, waitForEnd: true, pauseAfter: 800 },
        { kind: "year", section: "finale", yearIndex: 15, phase: 2, text: getFinaleNarration(15, bad, good, "market"), waitForEnd: true, pauseAfter: 1200 },
        { kind: "year", section: "finale", yearIndex: 15, phase: 3, text: `The nineteen-ninety-five retiree is in twenty-ten — gaining fifteen percent, adding over two hundred seventy-five thousand dollars from the market. Portfolio reaches ${formatMoney(good.endBalance)}.`, waitForEnd: true, pauseAfter: 1200 },
        { kind: "year", section: "finale", yearIndex: 15, phase: 4, text: getFinaleNarration(15, bad, good, "close"), waitForEnd: true, pauseAfter: 2000 },
      );
    } else if (index === depletionIndex) {
      // Depletion year — bad depletes in phase 2, good moves in phase 3
      segments.push(
        { kind: "year", section: "finale", yearIndex: index, phase: 0, text: `Year seventeen. Twenty-sixteen. The market is up twelve percent — but it no longer matters for Retired Two-Thousand.`, waitForEnd: true, leadMs: 120, pauseAfter: 1200 },
        { kind: "year", section: "finale", yearIndex: index, phase: 1, text: `The annual living expense is sixty thousand dollars. The portfolio only has ${formatMoney(bad.startBalance)} left.`, waitForEnd: true, pauseAfter: 800 },
        { kind: "year", section: "finale", yearIndex: index, phase: 2, text: `The two-thousand retiree takes what remains. The portfolio goes to zero.`, waitForEnd: true, pauseAfter: 3500 },
        { kind: "year", section: "finale", yearIndex: index, phase: 3, text: `Twenty-eleven for Retired Ninety-Five. The market gains two percent — a quiet year. Portfolio moves to ${formatMoney(good.endBalance)}.`, waitForEnd: true, pauseAfter: 1000 },
        { kind: "year", section: "finale", yearIndex: index, phase: 4, text: `The two-thousand retiree has run out of money. Seventeen years into a twenty-year retirement. The nineteen-ninety-five retiree still has over ${formatMoney(good.endBalance)}.`, waitForEnd: true, pauseAfter: 2500 },
      );
    } else if (index === depletionIndex + 1) {
      segments.push(
        { kind: "year", section: "finale", yearIndex: index, phase: 0, pauseAfter: 500 },
        { kind: "year", section: "finale", yearIndex: index, phase: 3, text: getFinaleNarration(index, bad, good, "market"), waitForEnd: true, pauseAfter: 1400 },
        { kind: "year", section: "finale", yearIndex: index, phase: 4, text: getFinaleNarration(index, bad, good, "close"), waitForEnd: false, pauseAfter: 1000 },
      );
    } else {
      segments.push(
        { kind: "year", section: "finale", yearIndex: index, phase: 0, text: getFinaleNarration(index, bad, good, "intro"), waitForEnd: false, leadMs: 100, pauseAfter: 300 },
        { kind: "year", section: "finale", yearIndex: index, phase: 3, text: getFinaleNarration(index, bad, good, "market"), waitForEnd: true, pauseAfter: 1200 },
        { kind: "year", section: "finale", yearIndex: index, phase: 4, text: getFinaleNarration(index, bad, good, "close"), waitForEnd: true, pauseAfter: index === YEARS - 1 ? 4500 : 2000 },
      );
    }
  }

  // Conclusion
  const finalGood = goodSim[YEARS - 1];
  segments.push({
    kind: "conclusion",
    section: "conclusion",
    text: `One million dollars. Sixty thousand withdrawn every year. Real S-and-P five-hundred returns. The two-thousand retiree ran out of money in year seventeen — three years before the end of their planned retirement. The nineteen-ninety-five retiree finished with over three and a half million dollars. Sequence of returns risk is not a theory. It is what actually happened to people who retired in the year two-thousand.`,
    waitForEnd: true,
    pauseAfter: 3000,
  });

  return segments;
}

// ─── PrepProgressRing ─────────────────────────────────────────────────────────

function PrepProgressRing({ current, total }) {
  const size = 96;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(current / total, 1) : 0;
  const dashOffset = circumference * (1 - ratio);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="sor-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={BAD_COLOR} />
            <stop offset="100%" stopColor={GOOD_COLOR} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="url(#sor-ring-grad)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="url(#sor-ring-grad)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${circumference * 0.08} ${circumference}`}
          animate={{ strokeDashoffset: [0, -circumference] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          style={{ opacity: ratio < 1 ? 0.5 : 0 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums leading-none">{current}</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">of {total}</span>
      </div>
    </div>
  );
}

function PrepStepIndicator({ isDone, isActive, accent }) {
  if (isDone) {
    return (
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: GOOD_COLOR }}>✓</span>
    );
  }
  if (isActive) {
    return (
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <motion.span className="absolute inset-0 rounded-full" style={{ backgroundColor: accent }} animate={{ scale: [1, 1.8], opacity: [0.5, 0] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }} />
        <motion.span className="relative h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }} />
      </span>
    );
  }
  return <span className="h-6 w-6 shrink-0 rounded-full border border-white/15" />;
}

// ─── ReturnSequenceBar ────────────────────────────────────────────────────────

function ReturnSequenceBar({ returns, active }) {
  return (
    <div className="mt-5 flex gap-[3px]">
      {returns.map((r, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: active ? 1 : 0.25, scaleY: 1 }}
          transition={{ duration: 0.2, delay: i * 0.025 }}
          style={{ transformOrigin: "bottom" }}
          className={`h-6 flex-1 rounded-[2px] ${r > 0 ? "bg-emerald-500" : "bg-red-500"}`}
          title={`Year ${i + 1}: ${r > 0 ? "+" : ""}${(r * 100).toFixed(0)}%`}
        />
      ))}
    </div>
  );
}

// ─── SORIntroOverlay ──────────────────────────────────────────────────────────

function SORIntroOverlay({ stage, prepStep }) {
  const isPreparing = stage === "preparing";
  const showBadCard = stage === "bad-intro" || stage === "good-intro" || stage === "handoff";
  const showGoodCard = stage === "good-intro" || stage === "handoff";
  const badActive = stage === "bad-intro" || stage === "handoff";
  const goodActive = stage === "good-intro" || stage === "handoff";

  return (
    <AnimatePresence>
      {stage !== "off" && (
        <motion.div
          key="sor-intro"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950 px-10 text-white"
        >
          <div className="w-full max-w-5xl">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-10 text-center"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/55">Sequence of Returns Risk</p>
              <h1 className="mt-3 text-5xl font-bold tracking-normal">Does Timing Matter?</h1>
              <motion.p
                key={stage}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="mx-auto mt-4 min-h-[36px] max-w-3xl text-xl font-semibold text-white/80"
              >
                {getSetupStageText(stage)}
              </motion.p>
            </motion.div>

            {isPreparing ? (
              <div className="mx-auto flex h-[380px] max-w-2xl flex-col items-center justify-center">
                <PrepProgressRing current={prepStep} total={PREP_STEPS.length} />
                <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-white/55">Preparing simulation</p>
                <div className="mt-8 w-full space-y-3">
                  {PREP_STEPS.map((step, index) => {
                    const isDone = index < prepStep;
                    const isActive = index === prepStep;
                    const accent = index % 2 === 0 ? BAD_COLOR : GOOD_COLOR;
                    return (
                      <motion.div
                        key={step}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: index * 0.05 }}
                        className={`relative flex items-center justify-between overflow-hidden rounded-2xl border px-5 py-3 text-sm font-semibold transition-colors ${isActive ? "bg-white/12 text-white" : isDone ? "bg-white/8 text-white/70" : "border-white/10 bg-white/[0.03] text-white/35"}`}
                        style={isActive ? { borderColor: `${accent}99`, boxShadow: `0 8px 24px -12px ${accent}cc, inset 0 0 0 1px ${accent}40` } : isDone ? { borderColor: `${GOOD_COLOR}59` } : undefined}
                      >
                        {isActive && (
                          <motion.span
                            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3"
                            style={{ background: `linear-gradient(90deg, transparent, ${accent}40, transparent)` }}
                            animate={{ left: ["-33%", "133%"] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                          />
                        )}
                        <span className="relative">{step}</span>
                        <PrepStepIndicator isDone={isDone} isActive={isActive} accent={accent} />
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {/* Bad First card */}
                <motion.div
                  animate={{
                    opacity: !showBadCard ? 0.15 : badActive && !goodActive ? 1 : stage === "handoff" ? 1 : 0.4,
                    scale: badActive ? 1.02 : 0.97,
                  }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                  className={`relative overflow-hidden rounded-3xl border bg-white/8 p-6 text-center shadow-2xl ${badActive ? "border-[#C44B4B]/60 ring-2 ring-[#C44B4B]/40" : "border-white/15"}`}
                >
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: BAD_COLOR }} />
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/55">Retired Jan 2000</p>
                  </div>
                  <p className="text-4xl font-bold">{formatMoney(START_BALANCE)}</p>
                  <p className="mt-2 text-sm text-white/50">Starting portfolio</p>
                  <AnimatePresence>
                    {showBadCard && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                        <ReturnSequenceBar returns={BAD_FIRST_RETURNS} active={badActive} />
                        <p className="mt-2 text-xs text-white/40">
                          <span className="text-red-400 font-semibold">Dot-com crash in year 1</span> · 2008 crisis in year 9
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Good First card */}
                <motion.div
                  animate={{
                    opacity: !showGoodCard ? 0.15 : goodActive && !badActive ? 1 : stage === "handoff" ? 1 : 0.4,
                    scale: goodActive ? 1.02 : 0.97,
                  }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                  className={`relative overflow-hidden rounded-3xl border bg-white/8 p-6 text-center shadow-2xl ${goodActive ? "border-[#2D9F83]/60 ring-2 ring-[#2D9F83]/40" : "border-white/15"}`}
                >
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: GOOD_COLOR }} />
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/55">Retired Jan 1995</p>
                  </div>
                  <p className="text-4xl font-bold">{formatMoney(START_BALANCE)}</p>
                  <p className="mt-2 text-sm text-white/50">Starting portfolio</p>
                  <AnimatePresence>
                    {showGoodCard && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                        <ReturnSequenceBar returns={GOOD_FIRST_RETURNS} active={goodActive} />
                        <p className="mt-2 text-xs text-white/40">
                          <span className="text-emerald-400 font-semibold">Five bull years first</span> · Same crashes hit later
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {stage === "setup" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="md:col-span-2 text-center"
                  >
                    <p className="text-sm text-white/50">
                      Same average return (~5.4% /yr) · Same ${(ANNUAL_WITHDRAWAL / 1000).toFixed(0)}k annual withdrawal · Same 20-year horizon
                    </p>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Portfolio Component ──────────────────────────────────────────────────────

function Portfolio({ label, calYear, color, value, total, phase, year, spotlight, dimmed, marketPhase = 2 }) {
  const [display, setDisplay] = useState(value);
  const isDepletionActive = year && year.isDepletionYear && phase >= 2;
  const isDepleted = (year && year.isDepleted) || isDepletionActive;

  useEffect(() => {
    const controls = animate(display, value, {
      duration: isDepletionActive ? 2.2 : 1.0,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, isDepletionActive]);

  const fillPct = total > 0 ? Math.max(0, Math.min(display / total, 1)) * 100 : 0;

  return (
    <motion.div
      animate={{ scale: spotlight ? 1.035 : 1, opacity: dimmed ? 0.45 : 1 }}
      transition={{ duration: 0.4 }}
      className={`relative h-[300px] overflow-hidden rounded-3xl border p-6 text-center shadow-2xl z-0 ${isDepleted ? "border-red-500/50" : spotlight ? "border-white/30 z-40 ring-2 ring-white/60" : "border-white/15"} bg-white/8`}
      style={
        isDepletionActive
          ? { boxShadow: "0 0 40px rgba(196,75,75,0.35)" }
          : spotlight && !isDepleted
            ? { boxShadow: `0 0 28px ${color}55` }
            : undefined
      }
    >
      {/* Liquid fill */}
      <motion.div
        className="absolute bottom-0 left-0 w-full"
        style={{ backgroundColor: isDepleted ? "#C44B4B" : color, opacity: isDepleted ? 0.5 : 1 }}
        animate={{ height: isDepletionActive ? "0%" : `${fillPct}%` }}
        transition={{ duration: isDepletionActive ? 2.2 : 1.0, ease: isDepletionActive ? [0.4, 0, 0.2, 1] : "easeOut" }}
      />

      {/* Depletion pulse ring */}
      <AnimatePresence>
        {isDepletionActive && (
          <motion.div
            key="depletion-pulse"
            className="pointer-events-none absolute inset-0 rounded-3xl"
            animate={{
              boxShadow: [
                "inset 0 0 0px rgba(196,75,75,0)",
                "inset 0 0 50px rgba(196,75,75,0.5)",
                "inset 0 0 0px rgba(196,75,75,0)",
              ],
            }}
            transition={{ duration: 2, repeat: 2 }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex h-full flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: isDepleted ? "#ef4444" : color }} />
            <h3 className="text-xl font-semibold text-white/85">{label}</h3>
          </div>
          {calYear && <p className="text-xs font-semibold tabular-nums text-white/35">{calYear}</p>}
        </div>

        <p className="mt-4 text-4xl font-bold tracking-tight text-white md:text-5xl">
          {isDepleted ? "$0" : formatMoney(display)}
        </p>

        <div className="mt-3 h-8">
          <AnimatePresence mode="wait">
            {!isDepleted && phase === 1 && (
              <motion.div key={`w-${year?.year}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-base font-bold text-red-300">
                -{formatMoney(year?.withdrawal || ANNUAL_WITHDRAWAL)}
              </motion.div>
            )}
            {year?.isDepletionYear && phase === 1 && (
              <motion.div key="depletion-warning" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-bold text-red-400">
                Cannot cover ${(ANNUAL_WITHDRAWAL / 1000).toFixed(0)}k withdrawal
              </motion.div>
            )}
            {!year?.isDepletionYear && !year?.isDepleted && phase === marketPhase && year && (
              <motion.div key={`m-${year.year}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <span className={`text-base font-bold ${year.returnRate >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {formatPct(year.returnRate)}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {isDepleted && (
            <motion.div
              key="depleted-badge"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-2 rounded-full border border-red-500/40 bg-red-500/15 px-4 py-1.5 text-sm font-bold text-red-400 tracking-wide"
            >
              DEPLETED
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── GapIndicator ─────────────────────────────────────────────────────────────

function GapIndicator({ gap, isDepletion }) {
  const [displayGap, setDisplayGap] = useState(gap);

  useEffect(() => {
    const controls = animate(displayGap, gap, {
      duration: 1.0,
      ease: "easeOut",
      onUpdate: (v) => setDisplayGap(v),
    });
    return () => controls.stop();
  }, [gap]);

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-3 shrink-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/35">Gap</p>
      <motion.div
        animate={{ scale: isDepletion ? 1.08 : 1 }}
        transition={{ duration: 0.5 }}
        className={`rounded-2xl border px-3 py-2 text-center min-w-[110px] ${isDepletion ? "border-red-500/40 bg-red-500/10" : "border-white/15 bg-white/6"}`}
      >
        <p className={`text-sm font-bold tabular-nums ${isDepletion ? "text-red-300" : "text-white/80"}`}>
          {formatMoney(displayGap)}
        </p>
      </motion.div>
    </div>
  );
}

// ─── SOR Fast Track Table ─────────────────────────────────────────────────────

function SORFastTrackTable({ badSim, goodSim, yearIndex, phase, fastPass }) {
  const badRef = useRef(null);
  const goodRef = useRef(null);

  const ftRows = badSim.slice(6, 15).map((bad, i) => {
    const idx = i + 6;
    const good = goodSim[idx];
    return { bad, good, idx, isCurrent: idx === yearIndex, isPast: idx < yearIndex, isFuture: idx > yearIndex };
  });

  useEffect(() => {
    const activeEl = (fastPass === "bad" ? badRef : goodRef).current?.querySelector("[data-active]");
    if (activeEl) activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [yearIndex, fastPass]);

  const badDone = fastPass === "good" || fastPass === "done";
  const goodDone = fastPass === "done";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div
        ref={badRef}
        className={`rounded-2xl border border-[#C44B4B]/30 bg-white/6 shadow-2xl transition-opacity duration-300 ${badDone ? "opacity-40" : "opacity-100"}`}
      >
        <div className="rounded-t-2xl px-4 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: BAD_COLOR }}>
          Retired 2000 · S&P 500 Real Returns
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/55">
              <th className="p-3">Year</th>
              <th className="p-3">Start</th>
              <th className="p-3">End</th>
            </tr>
          </thead>
          <tbody>
            {ftRows.map(({ bad, idx, isCurrent, isPast, isFuture }) => {
              const active = badDone ? false : isCurrent;
              const past = badDone ? true : isPast;
              const future = badDone ? false : isFuture;
              const text = active ? "text-white font-semibold" : past ? "text-white/45" : "text-white/20";
              return (
                <motion.tr
                  key={idx}
                  {...(active ? { "data-active": true } : {})}
                  animate={{ opacity: future ? 0.3 : 1, backgroundColor: active ? "rgba(196,75,75,0.15)" : "transparent" }}
                  transition={{ duration: 0.25 }}
                  className="border-t border-white/8"
                >
                  <td className={`p-3 font-semibold ${text}`}>{bad.year}<span className="ml-1 font-normal opacity-60">· {BAD_CAL_YEARS[idx]}</span></td>
                  <td className={`p-3 ${text}`}>{!future ? formatMoney(bad.startBalance) : "—"}</td>
                  <td className={`p-3 font-semibold ${active ? "text-red-300" : past ? "text-red-300/40" : "text-white/20"}`}>
                    {(past || (active && phase >= 2)) ? formatMoney(bad.endBalance) : "—"}
                  </td>
                </motion.tr>
              );
            })}
            {(fastPass === "done") && (
              <motion.tr initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="border-t-2 border-[#C44B4B]/40 bg-[#C44B4B]/10">
                <td className="p-3 text-base font-bold text-white" colSpan={2}>After Year 15</td>
                <td className="p-3 text-xl font-bold text-red-300">{formatMoney(badSim[14].endBalance)}</td>
              </motion.tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        ref={goodRef}
        className={`rounded-2xl border border-[#2D9F83]/30 bg-white/6 shadow-2xl transition-opacity duration-300 ${fastPass === "bad" ? "opacity-30" : "opacity-100"}`}
      >
        <div className="rounded-t-2xl px-4 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: GOOD_COLOR }}>
          Retired 1995 · S&P 500 Real Returns
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/55">
              <th className="p-3">Year</th>
              <th className="p-3">Start</th>
              <th className="p-3">End</th>
            </tr>
          </thead>
          <tbody>
            {ftRows.map(({ good, idx, isCurrent, isPast, isFuture }) => {
              const active = fastPass === "bad" ? false : isCurrent;
              const past = fastPass === "bad" ? false : isPast;
              const future = fastPass === "bad" ? true : isFuture;
              const text = active ? "text-white font-semibold" : past ? "text-white/45" : "text-white/20";
              return (
                <motion.tr
                  key={idx}
                  {...(active ? { "data-active": true } : {})}
                  animate={{ opacity: future ? 0.3 : 1, backgroundColor: active ? "rgba(45,159,131,0.15)" : "transparent" }}
                  transition={{ duration: 0.25 }}
                  className="border-t border-white/8"
                >
                  <td className={`p-3 font-semibold ${text}`}>{good.year}<span className="ml-1 font-normal opacity-60">· {GOOD_CAL_YEARS[idx]}</span></td>
                  <td className={`p-3 ${text}`}>{!future ? formatMoney(good.startBalance) : "—"}</td>
                  <td className={`p-3 font-semibold ${active ? "text-emerald-300" : past ? "text-emerald-300/40" : "text-white/20"}`}>
                    {(past || (active && phase >= 2)) ? formatMoney(good.endBalance) : "—"}
                  </td>
                </motion.tr>
              );
            })}
            {(fastPass === "done") && (
              <motion.tr initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="border-t-2 border-[#2D9F83]/40 bg-[#2D9F83]/10">
                <td className="p-3 text-base font-bold text-white" colSpan={2}>After Year 15</td>
                <td className="p-3 text-xl font-bold text-emerald-300">{formatMoney(goodSim[14].endBalance)}</td>
              </motion.tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Summary Table ─────────────────────────────────────────────────────────────

function SummaryTable({ badSim, goodSim, yearIndex, phase }) {
  const visibleRows = badSim.slice(0, yearIndex + 1).map((bad, i) => ({ bad, good: goodSim[i] })).reverse();

  const badHeaderBg = { backgroundColor: `${BAD_COLOR}cc` };
  const goodHeaderBg = { backgroundColor: `${GOOD_COLOR}cc` };

  return (
    <div className="mt-8 overflow-x-auto rounded-3xl border border-white/15 bg-white/8 shadow-2xl">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="text-left text-white">
            <th className="p-3 text-center" style={badHeaderBg} colSpan={4}>Retired Jan 2000</th>
            <th className="p-3 text-center" style={goodHeaderBg} colSpan={4}>Retired Jan 1995</th>
          </tr>
          <tr className="text-left text-white/80 text-xs">
            <th className="p-3" style={{ backgroundColor: `${BAD_COLOR}88` }}>Year</th>
            <th className="p-3" style={{ backgroundColor: `${BAD_COLOR}88` }}>Start Balance</th>
            <th className="p-3" style={{ backgroundColor: `${BAD_COLOR}88` }}>Living Expense</th>
            <th className="p-3" style={{ backgroundColor: `${BAD_COLOR}88` }}>Market Change</th>
            <th className="p-3" style={{ backgroundColor: `${GOOD_COLOR}88` }}>Year</th>
            <th className="p-3" style={{ backgroundColor: `${GOOD_COLOR}88` }}>Start Balance</th>
            <th className="p-3" style={{ backgroundColor: `${GOOD_COLOR}88` }}>Living Expense</th>
            <th className="p-3" style={{ backgroundColor: `${GOOD_COLOR}88` }}>Market Change</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence>
            {visibleRows.map(({ bad, good }) => {
              const isCurrent = bad.year === yearIndex + 1;
              const muted = "bg-white/[0.03] text-white/35";
              const showWithdrawal = !isCurrent || phase >= 1;
              const showBadMarket = !isCurrent || phase >= 2;
              const showGoodMarket = !isCurrent || phase >= 3;
              const badDepleted = bad.isDepleted || (bad.isDepletionYear && phase >= 2);
              const badCalYear = BAD_CAL_YEARS[bad.year - 1];
              const goodCalYear = GOOD_CAL_YEARS[good.year - 1];
              return (
                <motion.tr key={bad.year} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border-t border-white/10">
                  <td className={`p-3 font-semibold tabular-nums ${isCurrent ? "text-white" : muted}`}>{badCalYear}</td>
                  <td className={`p-3 ${isCurrent ? "text-white" : muted}`}>{formatMoney(bad.startBalance)}</td>
                  <td className={`p-3 font-semibold ${isCurrent ? (showWithdrawal ? "text-red-300" : "text-white/20") : muted}`}>
                    {showWithdrawal ? `-${formatMoney(bad.withdrawal)}` : "—"}
                  </td>
                  <td className={`p-3 font-semibold ${isCurrent ? (showBadMarket ? (bad.returnRate < 0 ? "text-red-400" : "text-emerald-300") : "text-white/20") : muted}`}>
                    {showBadMarket ? (badDepleted ? "DEPLETED" : `${bad.marketChange >= 0 ? "+" : ""}${formatMoney(bad.marketChange)}`) : "—"}
                  </td>

                  <td className={`p-3 font-semibold tabular-nums ${isCurrent ? "text-white" : muted}`}>{goodCalYear}</td>
                  <td className={`p-3 ${isCurrent ? "text-white" : muted}`}>{formatMoney(good.startBalance)}</td>
                  <td className={`p-3 font-semibold ${isCurrent ? (showWithdrawal ? "text-red-300" : "text-white/20") : muted}`}>
                    {showWithdrawal ? `-${formatMoney(good.withdrawal)}` : "—"}
                  </td>
                  <td className={`p-3 font-semibold ${isCurrent ? (showGoodMarket ? (good.returnRate < 0 ? "text-red-400" : "text-emerald-300") : "text-white/20") : muted}`}>
                    {showGoodMarket ? `${good.marketChange >= 0 ? "+" : ""}${formatMoney(good.marketChange)}` : "—"}
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}

// ─── Conclusion Screen ────────────────────────────────────────────────────────

function ConclusionScreen({ finalGood }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7 }}
      className="mt-10 rounded-3xl border border-white/15 bg-white/6 p-10 text-center shadow-2xl"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">After 20 Years</p>
      <div className="mt-6 flex flex-col items-center justify-center gap-6 md:flex-row md:gap-16">
        <div>
          <p className="text-sm text-white/50" style={{ color: `${BAD_COLOR}aa` }}>Retired January 2000</p>
          <p className="mt-1 text-5xl font-bold text-red-400">$0</p>
          <p className="mt-1 text-xs text-white/40">Depleted in year 17 (2016)</p>
        </div>
        <div className="text-3xl font-bold text-white/20">vs</div>
        <div>
          <p className="text-sm" style={{ color: `${GOOD_COLOR}bb` }}>Retired January 1995</p>
          <p className="mt-1 text-5xl font-bold" style={{ color: GOOD_COLOR }}>
            {formatMoney(finalGood)}
          </p>
          <p className="mt-1 text-xs text-white/40">Portfolio survived</p>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-2xl text-lg font-semibold text-white/70">
        Real S&P 500 returns. Same starting balance. Same withdrawals.
        <br />
        The only difference was the year they retired.
      </p>
      <a
        href="/"
        className="mt-8 inline-block rounded-xl border border-white/20 bg-white/8 px-8 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/15 hover:text-white"
      >
        ← Back to Bucket Strategy
      </a>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SequenceOfReturnsDemo() {
  const [showLanding, setShowLanding] = useState(true);
  const [yearIndex, setYearIndex] = useState(0);
  const [phase, setPhase] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [introStage, setIntroStage] = useState("off");
  const [prepStep, setPrepStep] = useState(0);
  const [playCursor, setPlayCursor] = useState(0);
  const [presentationSegments, setPresentationSegments] = useState([]);
  const [isPrepared, setIsPrepared] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [skipSignal, setSkipSignal] = useState(0);
  const [fastTableVisible, setFastTableVisible] = useState(false);
  const [waitingAtGate, setWaitingAtGate] = useState(false);
  const [fastPass, setFastPass] = useState("bad");
  const [conclusionVisible, setConclusionVisible] = useState(false);
  const audioRef = useRef(null);
  const playCursorRef = useRef(0);
  const skipPhaseRef = useRef(null);

  const badSim = useMemo(() => simulateSOR(START_BALANCE, ANNUAL_WITHDRAWAL, BAD_FIRST_RETURNS), []);
  const goodSim = useMemo(() => simulateSOR(START_BALANCE, ANNUAL_WITHDRAWAL, GOOD_FIRST_RETURNS), []);

  const badYear = badSim[yearIndex] || badSim[0];
  const goodYear = goodSim[yearIndex] || goodSim[0];

  const badDisplay = getPortfolioDisplayValue(badYear, phase, false);
  const goodDisplay = getPortfolioDisplayValue(goodYear, phase, true);
  const gapDisplay = Math.max(0, goodDisplay - badDisplay);

  const stopCurrentAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.onpause = null;
    try { audio.pause(); } catch {}
  };

  const stopPresentation = () => {
    setAutoPlay(false);
    setIntroStage("off");
    setPrepStep(0);
    setWaitingAtGate(false);
    stopCurrentAudio();
  };

  const resetPresentation = () => {
    playCursorRef.current = 0;
    setPlayCursor(0);
    setPresentationSegments([]);
    setIsPrepared(false);
    setPrepStep(0);
    setFastTableVisible(false);
    setFastPass("bad");
    setConclusionVisible(false);
  };

  const skipSection = () => {
    if (!autoPlay || !presentationSegments.length) return;
    const cursorNow = playCursorRef.current;
    const currentSection = presentationSegments[cursorNow]?.section;
    let target = presentationSegments.length;
    for (let i = cursorNow + 1; i < presentationSegments.length; i += 1) {
      if (presentationSegments[i].section !== currentSection) { target = i; break; }
    }
    if (target >= presentationSegments.length) { stopPresentation(); return; }
    const seg = presentationSegments[target];
    stopCurrentAudio();
    if (seg.kind === "year" || seg.kind === "fast-year") {
      if (seg.phase !== 0) skipPhaseRef.current = seg.phase;
      setYearIndex(seg.yearIndex);
      setPhase(seg.phase);
    }
    if (seg.kind === "intro") setIntroStage(seg.stage);
    else setIntroStage("off");
    playCursorRef.current = target;
    setPlayCursor(target);
    setSkipSignal((s) => s + 1);
  };

  const continueFromGate = () => {
    setWaitingAtGate(false);
    playCursorRef.current += 1;
    setPlayCursor(playCursorRef.current);
    setSkipSignal((s) => s + 1);
  };

  const loadSpeech = async (text) => {
    if (!text || !voiceOn) return null;
    return fetchSpeech(text);
  };

  const loadSpeechReliable = async (text, { attempts = 2, timeoutMs = 9000 } = {}) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const url = await withTimeout(loadSpeech(text), timeoutMs);
      if (url) return url;
      await delay(450 + attempt * 700);
    }
    return null;
  };

  const playLoadedSpeech = async (url, text, { waitForEnd = true } = {}) => {
    if (!text) return;
    let resolvedUrl = url || await loadSpeech(text);

    if (!resolvedUrl) {
      if ("speechSynthesis" in window) {
        await new Promise((resolve) => {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.02;
          utterance.pitch = 0.95;
          utterance.onend = resolve;
          utterance.onerror = resolve;
          window.speechSynthesis.speak(utterance);
        });
      } else if (waitForEnd) {
        await delay(estimateSpeechMs(text));
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    audio.src = resolvedUrl;
    audio.onended = null;
    audio.onerror = null;
    audio.onpause = null;

    try { await audio.play(); } catch { return; }

    if (waitForEnd) {
      await new Promise((resolve) => {
        const cleanup = () => { audio.onended = null; audio.onerror = null; audio.onpause = null; resolve(); };
        audio.onended = cleanup;
        audio.onerror = cleanup;
        audio.onpause = cleanup;
      });
    }
  };

  const speak = async (text, { waitForEnd = false } = {}) => {
    if (!text || !voiceOn) { if (waitForEnd) await delay(estimateSpeechMs(text)); return; }
    const url = await loadSpeech(text);
    await playLoadedSpeech(url, text, { waitForEnd });
  };

  // Computed display state
  const currentSegment = presentationSegments[playCursor];
  const isFastTracking = autoPlay && currentSegment?.kind === "fast-year";
  const inFastTrackSection = autoPlay && currentSegment?.section === "fasttrack";
  const currentSection = autoPlay ? currentSegment?.section : null;
  const showFastTable = fastTableVisible || isFastTracking;
  const showPortfolios = !isFastTracking && !inFastTrackSection && !waitingAtGate;
  const isConclusion = conclusionVisible;
  const showIntro = introStage !== "off";

  const isDepletionPhase = badYear.isDepletionYear && phase >= 2;
  // Phase 2 = bad portfolio's market move; Phase 3 = good portfolio's market move
  const spotlightBad = phase === 2 && !badYear.isDepleted;
  const spotlightGood = phase === 3 && !goodYear.isDepleted && !badYear.isDepletionYear;

  useEffect(() => {
    if (isFastTracking && !fastTableVisible) setFastTableVisible(true);
  }, [isFastTracking]);

  useEffect(() => {
    if (skipPhaseRef.current !== null) {
      setPhase(skipPhaseRef.current);
      skipPhaseRef.current = null;
    } else {
      setPhase(0);
    }
  }, [yearIndex]);

  // Main autoplay engine
  useEffect(() => {
    if (!autoPlay) return undefined;
    let cancelled = false;

    const prepareSegments = async () => {
      const includeIntro = playCursor === 0 && yearIndex === 0 && phase === 0;
      const segments = buildSORSegments({ badSim, goodSim, includeIntro });

      const prepStart = Date.now();
      if (includeIntro) { setIntroStage("preparing"); setPrepStep(0); }

      const prepared = segments.map((seg) => ({ ...seg, speechUrl: null }));
      const textBearing = prepared.map((seg, index) => ({ seg, index })).filter(({ seg }) => seg.text);

      let workRatio = 0;
      let stepTicker = null;
      if (includeIntro) {
        stepTicker = setInterval(() => {
          const timeRatio = Math.min((Date.now() - prepStart) / MIN_PREP_DURATION_MS, 1);
          const ratio = Math.min(workRatio, timeRatio);
          const step = Math.min(PREP_STEPS.length - 1, Math.floor(ratio * PREP_STEPS.length));
          setPrepStep(step);
        }, 80);
      }

      try {
        if (textBearing.length > 0) {
          const total = textBearing.length;
          let completed = 0;
          await mapWithConcurrency(
            textBearing,
            async ({ seg, index: segIdx }) => {
              if (cancelled) return;
              const url = await loadSpeechReliable(seg.text, { attempts: 2, timeoutMs: 8000 });
              if (cancelled) return;
              prepared[segIdx].speechUrl = url;
              completed += 1;
              workRatio = completed / total;
            },
            5
          );
        } else {
          workRatio = 1;
        }

        if (cancelled) return;
        if (includeIntro) {
          const elapsed = Date.now() - prepStart;
          if (elapsed < MIN_PREP_DURATION_MS) await delay(MIN_PREP_DURATION_MS - elapsed);
          if (cancelled) return;
          setPrepStep(PREP_STEPS.length - 1);
          await delay(250);
          if (cancelled) return;
        }
      } finally {
        if (stepTicker) clearInterval(stepTicker);
      }

      setPresentationSegments(prepared);
      setIsPrepared(true);
      if (includeIntro) setIntroStage("off");
    };

    if (!isPrepared || !presentationSegments.length) {
      prepareSegments();
      return () => { cancelled = true; if (!autoPlay) setIntroStage("off"); };
    }

    const runPresentation = async () => {
      for (let index = playCursorRef.current; index < presentationSegments.length; index += 1) {
        if (cancelled) return;

        const segment = presentationSegments[index];
        playCursorRef.current = index;
        setPlayCursor(index);

        if (segment.kind === "gate") { setWaitingAtGate(true); return; }

        if (segment.kind === "conclusion") {
          setConclusionVisible(true);
          if (segment.text) {
            await playLoadedSpeech(segment.speechUrl, segment.text, { waitForEnd: segment.waitForEnd !== false });
          }
          if (cancelled) return;
          await delay(segment.pauseAfter || 0);
          playCursorRef.current = index + 1;
          setPlayCursor(index + 1);
          continue;
        }

        if (segment.kind === "wait-audio") {
          const audio = audioRef.current;
          if (audio && !audio.paused && !audio.ended) {
            await new Promise((resolve) => {
              const cleanup = () => { audio.onended = null; audio.onerror = null; audio.onpause = null; resolve(); };
              audio.onended = cleanup; audio.onerror = cleanup; audio.onpause = cleanup;
            });
          }
        }

        if (segment.kind === "intro") { setIntroStage(segment.stage); await delay(90); }

        if (segment.kind === "year" || segment.kind === "fast-year") {
          setIntroStage("off");
          if (segment.setFastPass) setFastPass(segment.setFastPass);
          if (segment.forcePhase) skipPhaseRef.current = segment.phase;
          setYearIndex(segment.yearIndex);
          setPhase(segment.phase);
          if (segment.leadMs) await delay(segment.leadMs);
        }

        if (cancelled) return;

        if (segment.text) {
          await playLoadedSpeech(segment.speechUrl, segment.text, { waitForEnd: segment.waitForEnd !== false });
        }

        if (cancelled) return;
        await delay(segment.pauseAfter || 0);
        playCursorRef.current = index + 1;
        setPlayCursor(index + 1);
      }

      if (!cancelled) { setAutoPlay(false); setIntroStage("off"); }
    };

    runPresentation();
    return () => { cancelled = true; stopCurrentAudio(); };
  }, [autoPlay, isPrepared, presentationSegments, voiceOn, skipSignal]);

  const badCalYear = BAD_CAL_YEARS[yearIndex] ?? BAD_CAL_YEARS[0];
  const goodCalYear = GOOD_CAL_YEARS[yearIndex] ?? GOOD_CAL_YEARS[0];
  const yearLabel = inFastTrackSection || waitingAtGate
    ? "Retirement Years 7–15"
    : currentSection === "conclusion" || isConclusion
      ? "20 Years Later"
      : `Retirement Year ${badYear.year}`;
  const calYearSubLabel = inFastTrackSection || waitingAtGate || isConclusion
    ? null
    : `${badCalYear} (Retired '00) · ${goodCalYear} (Retired '95)`;

  const phaseLabel = (inFastTrackSection || waitingAtGate) ? "Running the strategy forward..." :
    isConclusion ? "The sequence of returns risk revealed." :
    getPhaseLabel(phase, badYear, goodYear);

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <audio ref={audioRef} />

      <SORIntroOverlay stage={introStage} prepStep={prepStep} />

      {showLanding && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950">
          <div className="mx-auto max-w-xl px-6 text-center">
            <img src="/assets/logo-tagline-sm.png" alt="CMG Wealth Management" className="mx-auto mb-10 w-64" />
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/40">Sequence of Returns Risk</p>
            <h1 className="mt-4 text-5xl font-bold tracking-tight md:text-6xl">Does Timing Matter?</h1>
            <p className="mx-auto mt-5 max-w-md text-lg text-white/60">
              Two real retirees. One million dollars each. Same S&P 500 returns — just different starting years. One ran out of money. One tripled their wealth.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3">
              <button
                onClick={() => { setIntroStage("preparing"); setShowLanding(false); setAutoPlay(true); }}
                className="rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-gray-950 shadow-lg transition hover:bg-white/90"
              >
                Start Simulation
              </button>
              <a href="/" className="mt-2 text-sm text-white/35 hover:text-white/60 transition">
                ← View: Bucket Strategy
              </a>
            </div>
          </div>
        </div>
      )}

      {!showLanding && (
        <div className="fixed right-4 top-6 z-[80] flex gap-2">
          <Button
            onClick={() => { if (voiceOn) stopCurrentAudio(); resetPresentation(); setVoiceOn((v) => !v); }}
            variant="secondary"
          >
            {voiceOn ? "AI Voice On" : "AI Voice Off"}
          </Button>
          <Button onClick={() => setAutoPlay((p) => !p)} variant="secondary">
            {autoPlay ? "Pause" : "Play"}
          </Button>
          {autoPlay && presentationSegments.length > 0 && (
            <Button onClick={skipSection} variant="secondary">Skip →</Button>
          )}
          <Button
            onClick={() => { stopPresentation(); resetPresentation(); setYearIndex(0); setPhase(0); setShowLanding(true); }}
            variant="secondary"
          >
            Exit
          </Button>
        </div>
      )}

      <div className="mx-auto max-w-6xl space-y-8 px-10 pt-16">
        <div className="p-6 md:p-8">
          <div className="relative z-40 mb-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/55">Sequence of Returns Risk · Real S&P 500 Data</p>
            <h2 className="mt-3 text-5xl font-bold tracking-normal">{yearLabel}</h2>
            {calYearSubLabel && (
              <p className="mt-1 text-sm font-semibold text-white/40 tabular-nums">{calYearSubLabel}</p>
            )}
            <p className="mx-auto mt-3 min-h-[32px] max-w-3xl text-xl font-semibold text-white/80">
              {waitingAtGate ? "" : phaseLabel}
            </p>
          </div>

          <AnimatePresence>
            {showFastTable && (
              <motion.div
                key="fast-table"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="relative z-40 mb-8"
              >
                <SORFastTrackTable
                  badSim={badSim}
                  goodSim={goodSim}
                  yearIndex={yearIndex}
                  phase={phase}
                  fastPass={fastPass}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {waitingAtGate && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="relative z-40 -mt-4 mb-8 flex justify-center"
              ref={(el) => { if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }}
            >
              <button
                onClick={continueFromGate}
                className="rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-gray-950 shadow-lg transition hover:bg-white/90"
              >
                Continue to Finale →
              </button>
            </motion.div>
          )}

          <AnimatePresence>
            {showPortfolios && !isConclusion && (
              <motion.div
                key="portfolios"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="flex items-stretch gap-3"
              >
                <div className="flex-1">
                  <Portfolio
                    label="Retired Jan '00"
                    calYear={badCalYear}
                    color={BAD_COLOR}
                    value={badDisplay}
                    total={START_BALANCE}
                    phase={phase}
                    year={badYear}
                    marketPhase={2}
                    spotlight={spotlightBad}
                    dimmed={false}
                  />
                </div>
                <GapIndicator gap={gapDisplay} isDepletion={badYear.isDepletionYear && phase >= 2} />
                <div className="flex-1">
                  <Portfolio
                    label="Retired Jan '95"
                    calYear={goodCalYear}
                    color={GOOD_COLOR}
                    value={goodDisplay}
                    total={START_BALANCE}
                    phase={phase}
                    year={goodYear}
                    marketPhase={3}
                    spotlight={spotlightGood}
                    dimmed={isDepletionPhase}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {isConclusion && (
            <ConclusionScreen finalGood={goodSim[YEARS - 1].endBalance} />
          )}

          {!showFastTable && !isConclusion && !showLanding && (
            <SummaryTable badSim={badSim} goodSim={goodSim} yearIndex={yearIndex} phase={phase} />
          )}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SequenceOfReturnsDemo />
  </React.StrictMode>
);
