import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, animate, AnimatePresence } from "framer-motion";

function Card({ className = "", children, ...props }) {
  return (
    <div
      className={`rounded-2xl border border-white/12 bg-white/6 shadow-2xl ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

function CardContent({ className = "", children, ...props }) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

function Button({
  className = "",
  variant = "default",
  type = "button",
  children,
  ...props
}) {
  const variants = {
    default: "bg-white text-gray-950 hover:bg-white/90 disabled:bg-white/30 disabled:text-gray-500",
    secondary:
      "bg-white/12 text-white hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30",
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

// V2: Refill ONLY at end of horizon
function simulateYears(total, incomePct, years) {
  let income = total * (incomePct / 100);
  let growth = total - income;
  const initialIncome = income;
  const results = [];

  for (let i = 0; i < years; i += 1) {
    const isDownYear = i === 1 || i === 2;
    const growthRate = isDownYear ? -0.15 : 0.07;

    const startIncome = income;
    const startGrowth = growth;
    const withdrawal = startIncome * 0.12;
    const afterWithdrawalIncome = Math.max(0, startIncome - withdrawal);

    const marketChange = startGrowth * growthRate;
    const afterMarketGrowth = Math.max(0, startGrowth + marketChange);

    let refill = 0;
    let endIncome = afterWithdrawalIncome;
    let endGrowth = afterMarketGrowth;

    const isFinalYear = i === years - 1;
    if (isFinalYear) {
      const needed = Math.max(0, initialIncome - afterWithdrawalIncome);
      const available = Math.max(0, afterMarketGrowth);
      refill = Math.min(needed, available);
      endIncome = afterWithdrawalIncome + refill;
      endGrowth = Math.max(0, afterMarketGrowth - refill);
    }

    income = endIncome;
    growth = endGrowth;

    results.push({
      year: i + 1,
      startIncome,
      startGrowth,
      withdrawal,
      marketChange,
      refill,
      afterWithdrawalIncome,
      afterMarketGrowth,
      endIncome,
      endGrowth,
      isDownYear,
      growthRate,
      isFinalYear,
    });
  }

  return results;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getBucketDisplayValue(current, bucketType, phase) {
  if (bucketType === "income") {
    if (phase === 0) return current.startIncome;
    if (phase === 1 || phase === 2) return current.afterWithdrawalIncome;
    return current.endIncome;
  }

  if (phase === 0 || phase === 1) return current.startGrowth;
  if (phase === 2) return current.afterMarketGrowth;
  return current.endGrowth;
}

function getPhaseLabel(phase, current) {
  if (phase === 1) return `${formatMoney(current.withdrawal)} withdrawn from Income.`;

  if (phase === 2) {
    const word = current.marketChange >= 0 ? "gains" : "drops";
    return `Market ${word} ${formatMoney(Math.abs(current.marketChange))} in Growth.`;
  }

  if (phase === 3) {
    if (!current.isFinalYear) return "End of year balances.";
    return current.refill > 0
      ? `${formatMoney(current.refill)} refilled from Growth to Income.`
      : "No refill possible at the horizon.";
  }

  return "Watch the income bucket spend down while growth stays invested.";
}

function getProgressText(phase, current) {
  if (phase === 1) return `Income withdrawal: -${formatMoney(current.withdrawal)}`;

  if (phase === 2) {
    return `Market return: ${current.marketChange >= 0 ? "+" : "-"}${formatMoney(Math.abs(current.marketChange))}`;
  }

  if (phase === 3) {
    if (!current.isFinalYear) return "End of year balances.";
    return current.refill > 0
      ? `Final horizon refill: ${formatMoney(current.refill)} moved back into Income.`
      : "No refill available at the horizon.";
  }

  return "Watch the income bucket spend down while the growth bucket stays invested.";
}

function pickNarration(options, current, phase) {
  return options[(current.year + phase) % options.length];
}

function getNarration(phase, current, yearCount) {
  const withdrawal = formatMoney(current.withdrawal);
  const marketMove = formatMoney(Math.abs(current.marketChange));
  const refill = formatMoney(current.refill);
  const isEarlyYear = current.year <= 2;
  const isLateYear = current.year >= yearCount - 1;

  if (phase === 1) {
    return pickNarration(
      [
        `In year ${current.year}, we use cash from the income bucket for spending. ${withdrawal} comes out. Our investments in the growth bucket stay in the market.`,
        `This is a planned withdrawal. ${withdrawal} in cash comes from the income bucket, so we do not need to sell our investments this year.`,
        `This plan gives each bucket a job. The income bucket holds cash for the bills. The growth bucket holds investments for later.`,
        `Year ${current.year} starts with a simple draw. ${withdrawal} in cash comes out of the income bucket, and our investments stay on track.`,
      ],
      current,
      phase
    );
  }

  if (phase === 2 && current.marketChange < 0) {
    if (current.year === 2) {
      return `In this example, the market drops ${marketMove}. But spending still comes from cash in the income bucket, so we avoid selling our investments after a decline.`;
    }

    return `A second consecutive decline. Our investments fall another ${marketMove}. Cash in the income bucket still covers spending, giving our investments time to recover.`;
  }

  if (phase === 2) {
    const options = isEarlyYear
      ? [
          `The growth bucket gains ${marketMove}. Early gains help support future refills.`,
          `Our investments add ${marketMove}. Cash in the income bucket handles spending, while the growth bucket keeps working for later.`,
        ]
      : isLateYear
        ? [
            `Our investments add ${marketMove}. Near the end, these gains can help refill cash in the income bucket.`,
            `The market adds ${marketMove}. This helps the plan as we get close to the finish.`,
          ]
        : [
            `Our investments rise by ${marketMove}. Spending stays steady from cash, and the growth bucket stays in the market.`,
            `Our investments gain ${marketMove}. Good years help balance out down years.`,
            `The growth bucket adds ${marketMove} this year. The plan gives our investments time to work.`,
          ];

    return pickNarration(options, current, phase);
  }

  if (phase === 3) {
    if (current.isFinalYear) {
      if (current.refill > 0) {
        return `The growth bucket has done its job. We move ${refill} back into cash in the income bucket, refilling the spending reserve for another cycle.`;
      }

      return `At the end, there is not enough in our investments to refill the income bucket. That means we should review spending, the allocation, or the time period.`;
    }

    return pickNarration(
      [
        `That closes year ${current.year}. Cash in the income bucket is lower on purpose, and our investments stayed in the market.`,
        `End of year ${current.year}. We do not refill yet. We give our investments more time to work.`,
        `Year ${current.year} is complete. Spending came from cash, and our investments stayed focused on the future.`,
      ],
      current,
      phase
    );
  }

  return "";
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function estimateSpeechMs(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1200, Math.min(6500, words * 255));
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

// --- Module-level voice cache ---
// Once a piece of narration has been generated to a blob URL, reuse it for
// the rest of the tab session. Concurrent requests for identical text wait
// on the same fetch instead of hammering the server.
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
    } catch (error) {
      console.error("Voice fetch error:", error);
      return null;
    } finally {
      speechInflight.delete(text);
    }
  })();

  speechInflight.set(text, promise);
  return promise;
}

// Bounded-concurrency parallel mapper — keeps prep snappy without hammering
// ElevenLabs' per-key concurrency limit.
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
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    worker
  );
  await Promise.all(workers);
  return results;
}

const PREP_STEPS = [
  "Checking starting amount",
  "Reviewing income allocation",
  "Analyzing time horizon",
  "Running market sequence",
  "Preparing narration",
];

const MIN_PREP_DURATION_MS = 7000;

function getAutoplayNarration(stage, current, yearCount) {
  const withdrawal = formatMoney(current.withdrawal);
  const marketMove = formatMoney(Math.abs(current.marketChange));
  const finalYear = current.year === yearCount;

  if (stage === "intro") {
    if (current.year === 1) {
      return `Here we are in year 1. The cash in the income bucket is for spending. Our investments in the growth bucket stay in the market.`;
    }

    if (current.isDownYear && current.year === 2) {
      return `Year 2 brings a market downturn. This is where the bucket strategy really matters. Even when the market drops, spending still comes from the cash in the income bucket. We do not have to sell anything.`;
    }

    if (current.isDownYear) {
      return `Year 3, and the market dips again. Two down years back to back. But the income bucket still has cash to cover spending, so our investments stay right where they are.`;
    }

    if (finalYear) {
      return `This is the final year. One last withdrawal, one last market move, and then the refill.`;
    }

    return `Now we move into year ${current.year}. The income bucket pays spending. The growth bucket stays invested.`;
  }

  if (stage === "withdrawal") {
    return `First, we pull ${withdrawal} in cash from the income bucket for this year's spending.`;
  }

  if (stage === "market") {
    if (current.marketChange < 0 && current.year === 2) {
      return `Our investments in the growth bucket are down ${marketMove}. Because spending comes from cash in the income bucket, we can leave our investments alone and wait.`;
    }

    if (current.marketChange < 0) {
      return `Another decline, and the income bucket still covered every dollar of spending. The growth bucket just needs time.`;
    }

    return `Our investments in the growth bucket add ${marketMove}. A good year for growth while the income bucket handled the bills.`;
  }

  if (stage === "close" && finalYear) {
    if (current.refill > 0) {
      return `Here is the payoff. We move ${formatMoney(current.refill)} from the growth bucket back into cash in the income bucket, refilling the spending reserve. The bucket strategy did its job.`;
    }

    return `At the end, the growth bucket does not have enough to refill the income bucket. That tells us to revisit the spending plan, the time horizon, or the allocation.`;
  }

  if (stage === "close") {
    if (current.year === 1) {
      return `Year 1 is done. Straightforward.`;
    }

    if (current.isDownYear && current.year === 2) {
      return `Spending was covered by cash. Our investments took a hit, but we did not have to sell.`;
    }

    if (current.isDownYear) {
      return `The worst is behind us. Now we give our investments time to recover.`;
    }

    return `That completes year ${current.year}. We leave the buckets alone and keep moving toward the refill.`;
  }

  return "";
}

function getStrategyIntroNarration(stage, totalAssets, incomePct) {
  const incomeAmount = totalAssets * (incomePct / 100);
  const growthAmount = totalAssets - incomeAmount;

  if (stage === "total") {
    return `In this walkthrough, we will look at an income and growth bucket strategy. The idea is straightforward. We split one portfolio into two buckets, each with its own job. The income bucket holds cash that we draw from for spending each year. The growth bucket stays fully invested in the market and we do not touch it. Over time, those investments can grow, and at the end, we use that growth to refill the income bucket for the next cycle. We begin with one portfolio: ${formatMoney(totalAssets)}.`;
  }

  if (stage === "income") {
    return `From that portfolio, ${formatMoney(incomeAmount)}, or ${incomePct} percent, goes into the income bucket as cash. This is the money set aside for planned spending.`;
  }

  if (stage === "growth") {
    return `The remaining ${formatMoney(growthAmount)} goes into the growth bucket as investments. This money stays in the market, so it has time to grow and help refill the income bucket later.`;
  }

  if (stage === "handoff") {
    return `Now both buckets are funded. Let's watch how the strategy works year by year.`;
  }

  return "";
}

function getIntroStageText(stage) {
  if (stage === "preparing") return "Analyzing portfolio, time horizon, and bucket allocation...";
  if (stage === "total") return "We begin by separating one portfolio into two clear jobs.";
  if (stage === "income") return "First, lifestyle spending is funded from the Income Bucket.";
  if (stage === "growth") return "Then the remaining capital stays invested in the Growth Bucket.";
  if (stage === "handoff") return "Now the year-by-year strategy can begin.";
  return "";
}

function getFastTrackNarration(stage, startYear, endYear, finalRow) {
  if (stage === "setup") {
    return `From here, the plan keeps running. Each year, cash comes out of the income bucket for spending. Meanwhile, using a conservative estimate of market growth, our investments in the growth bucket continue to work.`;
  }

  if (stage === "summary") {
    const growthEnd = formatMoney(finalRow.afterMarketGrowth);
    const incomeEnd = formatMoney(finalRow.afterWithdrawalIncome);
    return `Over ${endYear} years, the income bucket paid out spending every single year. Even through two back-to-back market downturns, we never had to sell our investments. Using conservative growth estimates, the growth bucket has worked its way to ${growthEnd}, and the income bucket sits at ${incomeEnd}. So what happens next?`;
  }

  if (stage === "reveal") {
    if (finalRow.refill > 0) {
      return `Now our investments have had time to recover. We move ${formatMoney(finalRow.refill)} from the growth bucket back into cash in the income bucket, replenishing the spending reserve for the next cycle. That is the bucket strategy at work.`;
    }
    return `At the end, there is not enough in our investments to refill the income bucket. The next step is to review spending, the allocation, or the time period.`;
  }

  return "";
}

function buildPresentationSegments({
  simulation,
  startIndex,
  years,
  totalAssets,
  incomePct,
  includeIntro,
}) {
  const segments = [];

  if (includeIntro) {
    for (const stage of ["total", "income", "growth", "handoff"]) {
      segments.push({
        kind: "intro",
        section: "intro",
        stage,
        text: getStrategyIntroNarration(stage, totalAssets, incomePct),
        pauseAfter: stage === "growth" || stage === "handoff" ? 220 : 180,
      });
    }
  }

  const normalEndIndex = Math.min(2, simulation.length - 1);
  for (let index = startIndex; index <= normalEndIndex; index += 1) {
    const row = simulation[index];
    const isDownYear = row.isDownYear;

    segments.push(
      {
        kind: "year",
        section: "walkthrough",
        yearIndex: index,
        phase: 0,
        text: getAutoplayNarration("intro", row, years),
        leadMs: 140,
        pauseAfter: isDownYear ? 500 : 250,
      },
      {
        kind: "year",
        section: "walkthrough",
        yearIndex: index,
        phase: 1,
        text: getAutoplayNarration("withdrawal", row, years),
        leadMs: 0,
        pauseAfter: isDownYear ? 700 : 500,
      },
      {
        kind: "year",
        section: "walkthrough",
        yearIndex: index,
        phase: 2,
        text: getAutoplayNarration("market", row, years),
        leadMs: 0,
        pauseAfter: isDownYear ? 1000 : 650,
      },
      {
        kind: "year",
        section: "walkthrough",
        yearIndex: index,
        phase: 3,
        text: getAutoplayNarration("close", row, years),
        leadMs: 0,
        pauseAfter: row.isFinalYear ? 2200 : isDownYear ? 900 : 800,
      }
    );
  }

  if (simulation.length > 3) {
    const fastTrackStartIndex = Math.max(3, startIndex);
    const finalIndex = simulation.length - 1;
    const finalRow = simulation[finalIndex];

    let isFirstFastTick = true;
    for (let index = fastTrackStartIndex; index <= finalIndex; index += 1) {
      for (const phase of [0, 1, 2]) {
        const tick = {
          kind: "fast-year",
          section: "fasttrack",
          yearIndex: index,
          phase,
          pauseAfter: phase === 0 ? 450 : phase === 1 ? 650 : 700,
        };
        if (isFirstFastTick) {
          tick.text = getFastTrackNarration("setup", fastTrackStartIndex + 1, years, finalRow);
          tick.waitForEnd = false;
          isFirstFastTick = false;
        }
        segments.push(tick);
      }

      if (index < finalIndex) {
        segments.push({
          kind: "fast-year",
          section: "fasttrack",
          yearIndex: index,
          phase: 3,
          pauseAfter: 600,
        });
      }
    }

    segments.push(
      {
        kind: "voice-only",
        section: "finale",
        text: getFastTrackNarration("summary", fastTrackStartIndex + 1, years, finalRow),
        waitForEnd: true,
        pauseAfter: 600,
      },
      {
        kind: "voice-only",
        section: "finale",
        text: getFastTrackNarration("reveal", fastTrackStartIndex + 1, years, finalRow),
        waitForEnd: false,
        pauseAfter: 2000,
      },
      {
        kind: "year",
        section: "finale",
        yearIndex: finalIndex,
        phase: 3,
        waitForEnd: false,
        pauseAfter: 3500,
      }
    );
  }

  return segments;
}

function runTests() {
  const rows = simulateYears(1000000, 30, 10);
  console.assert(rows.length === 10, "rows length");
  console.assert(rows[0].startIncome === 300000, "income starts at 30% allocation");
  console.assert(rows[0].startGrowth === 700000, "growth starts at remaining allocation");
  console.assert(rows.slice(0, 9).every((row) => row.refill === 0), "no refill before final year");
  console.assert(rows[9].isFinalYear === true, "final year flag");
  console.assert(rows[9].refill >= 0, "final year refill is non-negative");
  console.assert(getProgressText(1, rows[0]).includes("Income withdrawal"), "progress text has withdrawal step");
  console.assert(getProgressText(2, rows[0]).includes("Market return"), "progress text has market step");
  console.assert(getPhaseLabel(3, rows[0]) === "End of year balances.", "non-final phase 3 does not mention refill");
  console.assert(getNarration(2, rows[1], 10).includes("avoid selling our investments"), "first down year frames strategy");
  console.assert(getNarration(2, rows[2], 10).includes("time to recover"), "second down year frames recovery");

  const oneYear = simulateYears(500000, 40, 1);
  console.assert(oneYear.length === 1, "one-year scenario returns one row");
  console.assert(oneYear[0].isFinalYear === true, "one-year scenario is final year");
}
runTests();

export default function IncomeGrowthBucketDiagram() {
  const [presentMode, setPresentMode] = useState(true);
  const [showLanding, setShowLanding] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [yearIndex, setYearIndex] = useState(0);
  const [years, setYears] = useState(10);
  const [phase, setPhase] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [introStage, setIntroStage] = useState("off");
  const [prepStep, setPrepStep] = useState(0);
  const [playCursor, setPlayCursor] = useState(0);
  const [presentationSegments, setPresentationSegments] = useState([]);
  const [isPrepared, setIsPrepared] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [totalAssets, setTotalAssets] = useState(1000000);
  const [incomePct, setIncomePct] = useState(30);
  const [skipSignal, setSkipSignal] = useState(0);
  const audioRef = useRef(null);
  const playCursorRef = useRef(0);
  const skipPhaseRef = useRef(null);

  const simulation = useMemo(
    () => simulateYears(totalAssets, incomePct, years),
    [totalAssets, incomePct, years]
  );

  const current = simulation[yearIndex] || simulation[0];
  const showIntro = introStage !== "off";

  // Pool a single <audio> element across the whole session. Creating a fresh
  // Audio() per clip is fragile on iOS Safari and easy to leak.
  const stopCurrentAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    try { audio.pause(); } catch {}
    // keep the element pooled — don't null the ref
  };

  const stopPresentation = () => {
    setAutoPlay(false);
    setIntroStage("off");
    setPrepStep(0);
    stopCurrentAudio();
  };

  const resetPresentation = () => {
    playCursorRef.current = 0;
    setPlayCursor(0);
    setPresentationSegments([]);
    setIsPrepared(false);
    setPrepStep(0);
  };

  const skipSection = () => {
    if (!autoPlay || !presentationSegments.length) return;
    const cursorNow = playCursorRef.current;
    const currentSection = presentationSegments[cursorNow]?.section;
    let target = presentationSegments.length;
    for (let i = cursorNow + 1; i < presentationSegments.length; i += 1) {
      if (presentationSegments[i].section !== currentSection) {
        target = i;
        break;
      }
    }
    if (target >= presentationSegments.length) {
      stopPresentation();
      return;
    }
    const seg = presentationSegments[target];
    stopCurrentAudio();
    if (seg.kind === "year" || seg.kind === "fast-year") {
      skipPhaseRef.current = seg.phase;
      setYearIndex(seg.yearIndex);
      setPhase(seg.phase);
    } else if (seg.section === "finale") {
      skipPhaseRef.current = 2;
      setYearIndex(simulation.length - 1);
      setPhase(2);
    }
    if (seg.kind === "intro") {
      setIntroStage(seg.stage);
    } else {
      setIntroStage("off");
    }
    playCursorRef.current = target;
    setPlayCursor(target);
    setSkipSignal((s) => s + 1);
  };

  // Cache-aware narration loader. Cache lookup is synchronous (instant);
  // first-time text goes through the deduped fetchSpeech.
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

    let resolvedUrl = url;
    if (!resolvedUrl) {
      resolvedUrl = await loadSpeech(text);
    }

    if (!resolvedUrl) {
      // ElevenLabs unavailable (timeout, key issue, network). Fall back to
      // system TTS so the presentation still narrates, but log it visibly so
      // the user knows the AI voice didn't play.
      console.warn(
        `[voice] ElevenLabs failed; using system TTS for: "${text.slice(0, 60)}..."`
      );
      if ("speechSynthesis" in window) {
        await new Promise((resolve) => {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.02;
          utterance.pitch = 0.95;
          utterance.onend = resolve;
          utterance.onerror = resolve;
          window.speechSynthesis.speak(utterance);
          if (!waitForEnd) resolve();
        });
        return;
      }
      if (waitForEnd) await delay(estimateSpeechMs(text));
      return;
    }

    stopCurrentAudio();

    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    audio.src = resolvedUrl;
    try { audio.load(); } catch {}

    if (waitForEnd) {
      await new Promise((resolve) => {
        const cleanup = () => {
          audio.onended = null;
          audio.onerror = null;
          resolve();
        };
        audio.onended = cleanup;
        audio.onerror = (event) => {
          console.warn("[voice] audio playback error", event);
          cleanup();
        };
        audio.play().catch((err) => {
          console.warn("[voice] audio.play() rejected:", err?.message || err);
          cleanup();
        });
      });
      return;
    }

    audio.play().catch((err) => {
      console.warn("[voice] audio.play() rejected:", err?.message || err);
    });
  };

  // --- Voice narration ---
  // Wrapper used for ad-hoc speech outside the autoplay loop (e.g. clicking
  // Next manually). Goes through the same cache + pool path.
  const speak = async (text, { waitForEnd = false } = {}) => {
    if (!text) return;
    if (!voiceOn) {
      if (waitForEnd) await delay(estimateSpeechMs(text));
      return;
    }
    const url = await loadSpeech(text);
    await playLoadedSpeech(url, text, { waitForEnd });
  };

  const incomeDisplay = getBucketDisplayValue(current, "income", phase);
  const growthDisplay = getBucketDisplayValue(current, "growth", phase);
  const isFastTracking = autoPlay && presentationSegments[playCursor]?.kind === "fast-year";
  const spotlightTarget = isFastTracking
    ? "none"
    : phase === 1 ? "income" : phase === 2 ? "growth" : phase === 3 ? "both" : "none";

  useEffect(() => {
    setYearIndex((index) => Math.min(index, years - 1));
  }, [years]);

  useEffect(() => {
    if (skipPhaseRef.current !== null) {
      setPhase(skipPhaseRef.current);
      skipPhaseRef.current = null;
    } else {
      setPhase(0);
    }
  }, [yearIndex, totalAssets, incomePct, years]);

  const advance = () => {
    stopPresentation();
    resetPresentation();
    setPhase((currentPhase) => {
      if (currentPhase < 3) return currentPhase + 1;
      setYearIndex((index) => Math.min(years - 1, index + 1));
      return 0;
    });
  };

  const back = () => {
    stopPresentation();
    resetPresentation();
    setPhase(0);
    setYearIndex((index) => Math.max(0, index - 1));
  };

  useEffect(() => {
    if (!autoPlay) return undefined;

    let cancelled = false;

    const prepareSegments = async () => {
      const includeIntro = playCursor === 0 && yearIndex === 0 && phase === 0;
      const segments = buildPresentationSegments({
        simulation,
        startIndex: yearIndex,
        years,
        totalAssets,
        incomePct,
        includeIntro,
      });

      const prepStart = Date.now();
      if (includeIntro) {
        setIntroStage("preparing");
        setPrepStep(0);
      }

      const prepared = segments.map((segment) => ({
        ...segment,
        speechUrl: null,
      }));

      // Preload speech for every text-bearing segment in parallel (bounded
      // concurrency). The previous implementation only pre-fetched the intro
      // segments, so each year clip stalled the playback loop on its own
      // round-trip to ElevenLabs.
      const textBearing = prepared
        .map((segment, index) => ({ segment, index }))
        .filter(({ segment }) => segment.text);

      // Display progress is gated by min(workRatio, timeRatio) so the prep
      // animation always lasts at least MIN_PREP_DURATION_MS even when every
      // clip is already cached and downloads finish instantly.
      let workRatio = 0;
      let stepTicker = null;
      if (includeIntro) {
        stepTicker = setInterval(() => {
          const timeRatio = Math.min(
            (Date.now() - prepStart) / MIN_PREP_DURATION_MS,
            1
          );
          const ratio = Math.min(workRatio, timeRatio);
          const step = Math.min(
            PREP_STEPS.length - 1,
            Math.floor(ratio * PREP_STEPS.length)
          );
          setPrepStep(step);
        }, 80);
      }

      try {
        if (textBearing.length > 0) {
          const total = textBearing.length;
          let completed = 0;

          await mapWithConcurrency(
            textBearing,
            async ({ segment, index: segmentIndex }) => {
              if (cancelled) return;
              const url = await loadSpeechReliable(segment.text, {
                attempts: 2,
                timeoutMs: 8000,
              });
              if (cancelled) return;
              prepared[segmentIndex].speechUrl = url;
              completed += 1;
              workRatio = completed / total;
            },
            4
          );
        } else {
          workRatio = 1;
        }

        if (cancelled) return;

        if (includeIntro) {
          const elapsed = Date.now() - prepStart;
          if (elapsed < MIN_PREP_DURATION_MS) {
            await delay(MIN_PREP_DURATION_MS - elapsed);
          }
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
      return () => {
        cancelled = true;
        if (!autoPlay) setIntroStage("off");
      };
    }

    const runPresentation = async () => {
      for (let index = playCursorRef.current; index < presentationSegments.length; index += 1) {
        if (cancelled) return;

        const segment = presentationSegments[index];
        playCursorRef.current = index;
        setPlayCursor(index);

        if (segment.kind === "intro") {
          setIntroStage(segment.stage);
          await delay(90);
        }

        if (segment.kind === "year" || segment.kind === "fast-year") {
          setIntroStage("off");
          setYearIndex(segment.yearIndex);
          setPhase(segment.phase);
          if (segment.leadMs) await delay(segment.leadMs);
        }

        if (cancelled) return;

        if (segment.text) {
          await playLoadedSpeech(segment.speechUrl, segment.text, {
            waitForEnd: segment.waitForEnd !== false,
          });
        }

        if (cancelled) return;
        await delay(segment.pauseAfter || 0);
        playCursorRef.current = index + 1;
        setPlayCursor(index + 1);
      }

      if (!cancelled) {
        setAutoPlay(false);
        setIntroStage("off");
        resetPresentation();
      }
    };

    runPresentation();

    return () => {
      cancelled = true;
      stopCurrentAudio();
    };
  }, [
    autoPlay,
    isPrepared,
    presentationSegments,
    simulation,
    years,
    voiceOn,
    totalAssets,
    incomePct,
    skipSignal,
  ]);

  // Speak on phase change
  useEffect(() => {
    if (autoPlay) return;
    const text = getNarration(phase, current, years);
    if (text) speak(text);
  }, [phase, yearIndex, autoPlay]);

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <StrategyIntroOverlay
        stage={introStage}
        prepStep={prepStep}
        totalAssets={totalAssets}
        incomePct={incomePct}
      />

      {showLanding && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950">
          <div className="mx-auto max-w-xl px-6 text-center">
            <img src="/assets/logo-tagline-sm.png" alt="CMG Wealth Management" className="mx-auto mb-10 w-64" />
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/40">Income & Growth</p>
            <h1 className="mt-4 text-5xl font-bold tracking-tight md:text-6xl">Bucket Strategy</h1>
            <p className="mx-auto mt-5 max-w-md text-lg text-white/60">
              See how splitting one portfolio into two buckets can protect spending through market downturns.
            </p>

            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="mt-8 grid gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-left md:grid-cols-3">
                    <SliderControl label="Total Savings" value={formatMoney(totalAssets)} min={250000} max={3000000} step={25000} rawValue={totalAssets} onChange={setTotalAssets} />
                    <SliderControl label="Income Allocation" value={`${incomePct}%`} min={10} max={80} step={5} rawValue={incomePct} onChange={setIncomePct} />
                    <SliderControl label="Investment Horizon" value={`${years} years`} min={5} max={25} step={1} rawValue={years} onChange={setYears} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={() => {
                  setIntroStage("preparing");
                  setShowLanding(false);
                  setAutoPlay(true);
                }}
                className="rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-gray-950 shadow-lg transition hover:bg-white/90"
              >
                Start Simulation
              </button>
              <button
                onClick={() => setShowSettings((s) => !s)}
                className="rounded-xl border border-white/20 bg-white/5 px-8 py-3.5 text-base font-semibold text-white/80 transition hover:bg-white/10"
              >
                {showSettings ? "Hide Settings" : "Adjust Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {spotlightTarget !== "none" && !showIntro && !showLanding && (
          <motion.div
            key="page-spotlight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="pointer-events-none fixed inset-0 z-30 bg-gray-950/45 backdrop-blur-[1px]"
          />
        )}
      </AnimatePresence>

      {!showLanding && (
        <div className="fixed right-4 top-6 z-[80] flex gap-2">
          <Button
            onClick={() => {
              if (voiceOn) stopCurrentAudio();
              resetPresentation();
              setVoiceOn(v => !v);
            }}
            title="Narration uses an AI-generated OpenAI voice."
            variant="secondary"
          >
            {voiceOn ? "AI Voice On" : "AI Voice Off"}
          </Button>
          <Button onClick={() => setAutoPlay((playing) => !playing)} variant="secondary">
            {autoPlay ? "Pause" : "Play"}
          </Button>
          {autoPlay && presentationSegments.length > 0 && (
            <Button onClick={skipSection} variant="secondary">
              Skip →
            </Button>
          )}
          <Button
            onClick={() => {
              stopPresentation();
              resetPresentation();
              setYearIndex(0);
              setPhase(0);
              setShowLanding(true);
              setShowSettings(false);
            }}
            variant="secondary"
          >
            Exit
          </Button>
        </div>
      )}

      <div className={`mx-auto max-w-6xl space-y-8 pt-16 ${presentMode ? "px-10" : ""}`}>
        <div>
          <div className="p-6 md:p-8">
            <div className="relative z-40 mb-10 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/55">Investment Horizon Refill Strategy</p>
              <h2 className="mt-3 text-5xl font-bold tracking-normal">Year {current.year}</h2>
              <p className="mx-auto mt-3 min-h-[32px] max-w-3xl text-xl font-semibold text-white/80">
                {getPhaseLabel(phase, current)}
              </p>
            </div>

            <div className="relative grid gap-7 md:grid-cols-2">
              <Bucket
                title="Income Bucket"
                value={incomeDisplay}
                total={totalAssets}
                color="green"
                phase={phase}
                current={current}
                spotlight={spotlightTarget === "income" || spotlightTarget === "both"}
                dimmed={spotlightTarget === "growth"}
                refillGlow={phase === 3 && current.isFinalYear && current.refill > 0}
              />
              <Bucket
                title="Growth Bucket"
                value={growthDisplay}
                total={totalAssets}
                color="blue"
                phase={phase}
                current={current}
                spotlight={spotlightTarget === "growth" || spotlightTarget === "both"}
                dimmed={spotlightTarget === "income"}
                refillGlow={phase === 3 && current.isFinalYear && current.refill > 0}
              />

              <div className="pointer-events-none absolute left-1/2 top-1/2 z-50 hidden -translate-x-1/2 -translate-y-1/2 md:block">
                <AnimatePresence mode="wait">
                  {phase === 3 && current.isFinalYear && current.refill > 0 && (
                    <motion.div
                      key={`refill-arrow-${current.year}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <RefillArrow />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, delay: 1.0 }}
                        className="rounded-full border border-white/20 bg-white px-5 py-3 text-sm font-semibold text-[#397AA8] shadow-lg"
                      >
                        Income ← {formatMoney(current.refill)}
                      </motion.div>
                    </motion.div>
                  )}
                  {phase === 3 && current.isFinalYear && current.refill === 0 && (
                    <motion.div
                      key={`no-refill-${current.year}`}
                      initial={{ opacity: 0, scale: 0.9, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.55 }}
                      className="rounded-full border border-white/20 bg-white px-5 py-3 text-sm font-semibold text-gray-500 shadow-lg"
                    >
                      No refill available
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="mx-auto mt-8 flex h-[72px] max-w-3xl items-start justify-center text-center text-xl font-semibold text-white/80">
              <AnimatePresence mode="wait">
                <motion.p
                  key={`${current.year}-${phase}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45 }}
                >
                  {getProgressText(phase, current)}
                </motion.p>
              </AnimatePresence>
            </div>

            <YearTable simulation={simulation} yearIndex={yearIndex} phase={phase} />
          </div>
        </div>

      </div>
    </div>
  );
}

function PrepProgressRing({ current, total }) {
  const size = 96;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(current / total, 1) : 0;
  const dashOffset = circumference * (1 - ratio);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <defs>
          <linearGradient id="prep-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#397AA8" />
            <stop offset="100%" stopColor="#4c8536" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#prep-ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#prep-ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.08} ${circumference}`}
          animate={{ strokeDashoffset: [0, -circumference] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          style={{ opacity: ratio < 1 ? 0.5 : 0 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums leading-none">{current}</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
          of {total}
        </span>
      </div>
    </div>
  );
}

function PrepStepIndicator({ isDone, isActive, accent }) {
  if (isDone) {
    return (
      <span
        className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: "#4c8536" }}
      >
        ✓
      </span>
    );
  }
  if (isActive) {
    return (
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: accent }}
          animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.span
          className="relative h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: accent }}
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>
    );
  }
  return (
    <span className="h-6 w-6 shrink-0 rounded-full border border-white/15" />
  );
}

function StrategyIntroOverlay({ stage, prepStep, totalAssets, incomePct }) {
  const incomeAmount = totalAssets * (incomePct / 100);
  const growthAmount = totalAssets - incomeAmount;
  const showIncome = stage === "income" || stage === "growth" || stage === "handoff";
  const showGrowth = stage === "growth" || stage === "handoff";
  const isPreparing = stage === "preparing";
  const portfolioRemaining =
    stage === "income" ? growthAmount : stage === "growth" || stage === "handoff" ? 0 : totalAssets;

  return (
    <AnimatePresence>
      {stage !== "off" && (
        <motion.div
          key="strategy-intro"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950 px-10 text-white"
        >
          <div className="w-full max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-10 text-center"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/55">
                Investment Horizon Refill Strategy
              </p>
              <h1 className="mt-3 text-5xl font-bold tracking-normal">
                Starting Portfolio
              </h1>
              <motion.p
                key={stage}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="mx-auto mt-4 min-h-[36px] max-w-3xl text-xl font-semibold text-white/80"
              >
                {getIntroStageText(stage)}
              </motion.p>
            </motion.div>

            {isPreparing ? (
              <div className="mx-auto flex h-[420px] max-w-2xl flex-col items-center justify-center">
                <PrepProgressRing current={prepStep} total={PREP_STEPS.length} />
                <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-white/55">
                  Preparing strategy view
                </p>
                <div className="mt-8 w-full space-y-3">
                  {PREP_STEPS.map((step, index) => {
                    const isDone = index < prepStep;
                    const isActive = index === prepStep;
                    const accent = index % 2 === 0 ? "#4c8536" : "#397AA8";

                    return (
                      <motion.div
                        key={step}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: index * 0.05 }}
                        className={`relative flex items-center justify-between overflow-hidden rounded-2xl border px-5 py-3 text-sm font-semibold transition-colors ${
                          isActive
                            ? "bg-white/12 text-white"
                            : isDone
                              ? "bg-white/8 text-white/70"
                              : "border-white/10 bg-white/[0.03] text-white/35"
                        }`}
                        style={
                          isActive
                            ? {
                                borderColor: `${accent}99`,
                                boxShadow: `0 8px 24px -12px ${accent}cc, inset 0 0 0 1px ${accent}40`,
                              }
                            : isDone
                              ? { borderColor: "rgba(76,133,54,0.35)" }
                              : undefined
                        }
                      >
                        {isActive && (
                          <motion.span
                            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3"
                            style={{
                              background: `linear-gradient(90deg, transparent, ${accent}40, transparent)`,
                            }}
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
              <>
                <div className="mb-9 flex items-center justify-center">
                  <motion.div
                    initial={{ scale: 0.96, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.55 }}
                    className="rounded-2xl border border-white/15 bg-white px-8 py-5 text-center text-gray-950 shadow-2xl"
                  >
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Unallocated Portfolio
                    </p>
                    <AnimatedMoney
                      value={portfolioRemaining}
                      className="mt-2 block text-5xl font-bold"
                    />
                  </motion.div>
                </div>

                <div className="relative grid gap-7 md:grid-cols-2">
                  <IntroBucket
                    title="Income Bucket"
                    value={incomeAmount}
                    caption={`${incomePct}% spending reserve`}
                    color="#4c8536"
                    visible={showIncome}
                    highlighted={stage === "income" || stage === "handoff"}
                    dimmed={stage === "growth"}
                    fillPercent={incomePct}
                  />
                  <IntroBucket
                    title="Growth Bucket"
                    value={growthAmount}
                    caption={`${100 - incomePct}% long-term investment`}
                    color="#397AA8"
                    visible={showGrowth}
                    highlighted={stage === "growth" || stage === "handoff"}
                    dimmed={false}
                    fillPercent={100 - incomePct}
                  />

                  <AnimatePresence>
                    {(stage === "income" || stage === "growth") && (
                      <motion.div
                        key={`allocation-${stage}`}
                        initial={{ opacity: 0, scale: 0.9, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.35 }}
                        className={`pointer-events-none absolute -top-5 hidden -translate-x-1/2 rounded-full border border-white/20 bg-white px-5 py-3 text-sm font-bold text-gray-950 shadow-xl md:block ${
                          stage === "income"
                            ? "left-1/4"
                            : "left-3/4"
                        }`}
                      >
                        {stage === "income"
                          ? `${formatMoney(incomeAmount)} to Income`
                          : `${formatMoney(growthAmount)} to Growth`}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function IntroBucket({
  title,
  value,
  caption,
  color,
  visible,
  highlighted = false,
  dimmed = false,
  fillPercent,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, scale: 0.96 }}
      animate={{
        opacity: !visible ? 0.18 : dimmed ? 0.32 : 1,
        y: visible ? 0 : 22,
        scale: highlighted ? 1.025 : visible ? 1 : 0.96,
      }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`relative h-[260px] overflow-hidden rounded-3xl border border-white/15 bg-white/8 p-6 text-center shadow-2xl ${
        highlighted ? "ring-4 ring-white/80" : ""
      }`}
    >
      <motion.div
        className="absolute bottom-0 left-0 w-full"
        style={{ backgroundColor: color }}
        animate={{ height: visible ? `${fillPercent}%` : "0%" }}
        transition={{ duration: 1.15, ease: "easeOut" }}
      />
      <div className="relative z-10 flex h-full flex-col items-center justify-center">
        <h2 className="text-3xl font-semibold">{title}</h2>
        <AnimatedMoney
          value={visible ? value : 0}
          className="mt-4 block text-5xl font-bold"
        />
        <p className="mt-3 text-base font-semibold text-white/75">{caption}</p>
      </div>
    </motion.div>
  );
}

function AnimatedMoney({ value, className = "" }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const controls = animate(display, value, {
      duration: 1.15,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(latest),
    });

    return () => controls.stop();
  }, [value]);

  return <span className={className}>{formatMoney(display)}</span>;
}

function RefillArrow() {
  return (
    <svg width="120" height="32" viewBox="0 0 120 32" fill="none">
      <defs>
        <linearGradient id="refill-grad" x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#397AA8" />
          <stop offset="100%" stopColor="#4c8536" />
        </linearGradient>
      </defs>
      <motion.path
        d="M110 16 C 85 16, 75 6, 60 6 C 45 6, 35 16, 10 16"
        stroke="url(#refill-grad)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="4 6"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.0, ease: "easeInOut" }}
      />
      <motion.polygon
        points="14,10 4,16 14,22"
        fill="#4c8536"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.8 }}
      />
    </svg>
  );
}

function Bucket({ title, value, total, color, phase, current, spotlight = false, dimmed = false, refillGlow = false }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const controls = animate(display, value, {
      duration: refillGlow ? 2.2 : 1,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(latest),
    });

    return () => controls.stop();
  }, [value, refillGlow]);

  const percent = total > 0 ? Math.max(0, Math.min(display / total, 1)) : 0;
  const isIncome = title === "Income Bucket";
  const isGrowth = title === "Growth Bucket";
  const fillClass = color === "green" ? "bg-[#4c8536]" : "bg-[#397AA8]";
  const baseClass = "border-white/15 bg-white/8";

  return (
    <motion.div
      animate={{
        scale: spotlight ? 1.035 : phase > 0 ? 1.01 : 1,
        opacity: dimmed ? 0.45 : 1,
      }}
      transition={{ duration: 0.4 }}
      className={`relative h-[300px] overflow-hidden rounded-3xl border p-6 text-center shadow-2xl ${spotlight ? "z-40 ring-4 ring-white/80" : refillGlow ? "z-40" : "z-0"} ${baseClass}`}
      style={refillGlow ? { boxShadow: `0 0 30px ${color === "green" ? "rgba(76,133,54,0.4)" : "rgba(57,122,168,0.4)"}` } : undefined}
    >
      <motion.div
        className={`absolute bottom-0 left-0 w-full ${fillClass}`}
        animate={{ height: `${percent * 100}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-center">
        <h3 className="text-2xl font-semibold text-white/85">{title}</h3>
        <p className="mt-4 text-4xl font-bold tracking-tight text-white md:text-5xl">
          {formatMoney(display)}
        </p>

        <div className="mt-3 h-8">
          <AnimatePresence mode="wait">
            {isIncome && phase === 1 && (
              <motion.div
                key={`withdraw-${current.year}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-lg font-bold text-red-300"
              >
                -{formatMoney(current.withdrawal)} withdrawn
              </motion.div>
            )}

            {isGrowth && phase === 2 && (
              <motion.div
                key={`market-${current.year}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`text-lg font-bold ${current.marketChange >= 0 ? "text-[#b8e2aa]" : "text-red-300"}`}
              >
                {current.marketChange >= 0 ? "+" : ""}{formatMoney(current.marketChange)} market
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function YearTable({ simulation, yearIndex, phase }) {
  const visibleRows = simulation.slice(0, yearIndex + 1).reverse();
  const last = simulation[simulation.length - 1];

  return (
    <div className="mt-8 overflow-x-auto rounded-3xl border border-white/15 bg-white/8 shadow-2xl">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="text-left text-white/80">
            <th className="bg-white/10 p-4 text-white">Year</th>
            <th className="bg-[#4c8536] p-4 text-white">Income Start</th>
            <th className="bg-[#4c8536] p-4 text-white">Withdraw</th>
            <th className="bg-[#4c8536] p-4 text-white">Income End</th>
            <th className="bg-[#397AA8] p-4 text-white">Growth Start</th>
            <th className="bg-[#397AA8] p-4 text-white">Market Return</th>
            <th className="bg-[#397AA8] p-4 text-white">Growth End</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence>
            {visibleRows.map((row) => {
              const isCurrent = row.year === yearIndex + 1;
              const mutedCell = "bg-white/[0.03] text-white/35";

              return (
                <motion.tr
                  key={row.year}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="border-t border-white/10"
                >
                  <td className={`p-4 font-semibold ${isCurrent ? "" : mutedCell}`}>{row.year}</td>
                  <td className={`p-4 ${isCurrent ? "bg-white/10 text-white" : mutedCell}`}>{formatMoney(row.startIncome)}</td>
                  <td className={`p-4 ${isCurrent ? "bg-white/10 text-red-300" : mutedCell}`}>
                    {!isCurrent || phase >= 1 ? `-${formatMoney(row.withdrawal)}` : "—"}
                  </td>
                  <td className={`p-4 font-semibold ${isCurrent ? "bg-white/10 text-white" : mutedCell}`}>
                    {!isCurrent || phase >= 3 ? formatMoney(row.endIncome) : "—"}
                  </td>
                  <td className={`p-4 ${isCurrent ? "bg-white/10 text-white" : mutedCell}`}>{formatMoney(row.startGrowth)}</td>
                  <td className={`p-4 ${
                    isCurrent
                      ? row.marketChange >= 0 ? "bg-white/10 text-[#b8e2aa]" : "bg-white/10 text-red-300"
                      : row.marketChange >= 0 ? "bg-white/[0.03] text-[#b8e2aa]/50" : "bg-white/[0.03] text-red-300/50"
                  }`}>
                    {!isCurrent || phase >= 2 ? `${row.marketChange >= 0 ? "+" : "-"}${formatMoney(Math.abs(row.marketChange))}` : "—"}
                  </td>
                  <td className={`p-4 font-semibold ${isCurrent ? "bg-white/10 text-white" : mutedCell}`}>
                    {!isCurrent || phase >= 3 ? formatMoney(row.endGrowth) : "—"}
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>

          {yearIndex === simulation.length - 1 && phase === 3 && (
            <tr className="border-t-2 border-white/40 bg-white/10 font-bold">
              <td className="p-4">Final</td>
              <td className="p-4" colSpan={6}>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <span className="text-[#b8e2aa]">Income Bucket: {formatMoney(last.endIncome)}</span>
                  <span className="text-[#a8d3ef]">Growth Bucket: {formatMoney(last.endGrowth)}</span>
                  <span className="text-[#a8d3ef]">
                    {last.refill > 0 ? `Refill applied: ${formatMoney(last.refill)}` : "No refill available at horizon"}
                  </span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Controls({ totalAssets, setTotalAssets, incomePct, setIncomePct, years, setYears }) {
  return (
    <Card>
      <CardContent className="grid gap-6 p-6 md:grid-cols-3">
        <SliderControl
          label="Total Savings"
          value={formatMoney(totalAssets)}
          min={250000}
          max={3000000}
          step={25000}
          rawValue={totalAssets}
          onChange={setTotalAssets}
        />
        <SliderControl
          label="Income Allocation"
          value={`${incomePct}%`}
          min={10}
          max={80}
          step={5}
          rawValue={incomePct}
          onChange={setIncomePct}
        />
        <SliderControl
          label="Investment Horizon"
          value={`${years} years`}
          min={5}
          max={25}
          step={1}
          rawValue={years}
          onChange={setYears}
        />
      </CardContent>
    </Card>
  );
}

function SliderControl({ label, value, min, max, step, rawValue, onChange }) {
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <p className="font-semibold text-white/75">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={rawValue}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <IncomeGrowthBucketDiagram />
  </React.StrictMode>
);
