import React, { useEffect, useMemo, useState } from "react";
import { motion, animate, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
    return `Market ${word} ${formatMoney(current.marketChange)} in Growth.`;
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
    return `Growth market move: ${current.marketChange >= 0 ? "+" : ""}${formatMoney(current.marketChange)}`;
  }

  if (phase === 3) {
    if (!current.isFinalYear) return "End of year balances.";
    return current.refill > 0
      ? `Final horizon refill: ${formatMoney(current.refill)} moved back into Income.`
      : "No refill available at the horizon.";
  }

  return "Watch the income bucket spend down while the growth bucket stays invested.";
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
  console.assert(getProgressText(2, rows[0]).includes("Growth market move"), "progress text has market step");
  console.assert(getPhaseLabel(3, rows[0]) === "End of year balances.", "non-final phase 3 does not mention refill");

  const oneYear = simulateYears(500000, 40, 1);
  console.assert(oneYear.length === 1, "one-year scenario returns one row");
  console.assert(oneYear[0].isFinalYear === true, "one-year scenario is final year");
}
runTests();

export default function IncomeGrowthBucketDiagram() {
  const [presentMode, setPresentMode] = useState(false);
  const [yearIndex, setYearIndex] = useState(0);
  const [years, setYears] = useState(10);
  const [phase, setPhase] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [totalAssets, setTotalAssets] = useState(1000000);
  const [incomePct, setIncomePct] = useState(30);

  const simulation = useMemo(
    () => simulateYears(totalAssets, incomePct, years),
    [totalAssets, incomePct, years]
  );

  const current = simulation[yearIndex] || simulation[0];

  // --- OpenAI Voice narration ---
  const speak = async (text) => {
    if (!voiceOn) return;
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
    } catch (e) {
      console.error("Voice error", e);
    }
  };

  const getNarration = (phase, c) => {
    if (phase === 1) {
      return `This year, you are living on your income bucket. We withdraw ${formatMoney(c.withdrawal)}, which directly funds your lifestyle while your investments remain untouched.`;
    }

    if (phase === 2) {
      if (c.marketChange >= 0) {
        return `At the same time, your growth bucket is invested in the market, and it increases by ${formatMoney(c.marketChange)}. This is where long term growth continues to work for you.`;
      }
      return `At the same time, your growth bucket is exposed to the market, and it declines by ${formatMoney(Math.abs(c.marketChange))}. Even during downturns, your income bucket protects your lifestyle.`;
    }

    if (phase === 3 && c.isFinalYear) {
      if (c.refill > 0) {
        return `Now that we have reached the end of the investment horizon, we take ${formatMoney(c.refill)} from the growth bucket and refill your income bucket, preparing it to support your next phase of retirement.`;
      }
      return `At the end of the horizon, there are no additional funds available to refill the income bucket.`;
    }

    return "";
  };
  const incomeDisplay = getBucketDisplayValue(current, "income", phase);
  const growthDisplay = getBucketDisplayValue(current, "growth", phase);

  useEffect(() => {
    setYearIndex((index) => Math.min(index, years - 1));
  }, [years]);

  useEffect(() => {
    setPhase(0);
  }, [yearIndex, totalAssets, incomePct, years]);

  const advance = () => {
    setAutoPlay(false);
    setPhase((currentPhase) => {
      if (currentPhase < 3) return currentPhase + 1;
      setYearIndex((index) => Math.min(years - 1, index + 1));
      return 0;
    });
  };

  const back = () => {
    setAutoPlay(false);
    setPhase(0);
    setYearIndex((index) => Math.max(0, index - 1));
  };

  useEffect(() => {
    if (!autoPlay) return undefined;

    const id = setInterval(() => {
      setPhase((currentPhase) => {
        if (currentPhase < 3) return currentPhase + 1;
        setYearIndex((index) => (index < years - 1 ? index + 1 : 0));
        return 0;
      });
    }, 1800);

    return () => clearInterval(id);
  }, [autoPlay, years]);

  // Speak on phase change
  useEffect(() => {
    const text = getNarration(phase, current);
    if (text) speak(text);
  }, [phase, yearIndex]);

  return (
    <div className="min-h-screen bg-white p-6 text-gray-900">
      <div className="fixed left-4 top-1/2 z-50 hidden -translate-y-1/2 md:block">
        <Button onClick={back} variant="secondary" disabled={yearIndex === 0}>
          Back
        </Button>
      </div>

      <div className="fixed right-4 top-1/2 z-50 hidden -translate-y-1/2 md:block">
        <Button onClick={advance}>Next</Button>
      </div>

      <div className="fixed right-4 top-6 z-50 flex gap-2">
        <Button onClick={() => setVoiceOn(v => !v)} variant="secondary">
          {voiceOn ? "Voice On" : "Voice Off"}
        </Button>
        <Button onClick={() => setAutoPlay((playing) => !playing)} variant="secondary">
          {autoPlay ? "Pause" : "Play"}
        </Button>
        <Button onClick={() => setPresentMode((p) => !p)}>
          {presentMode ? "Exit" : "Present"}
        </Button>
      </div>

      <div className={`mx-auto max-w-[1300px] space-y-6 ${presentMode ? "px-10" : ""}`}>
        <Card>
          <CardContent className="p-6 md:p-8">
            <div className="mb-6 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Investment Horizon Refill Strategy</p>
              <h2 className="mt-2 text-4xl font-bold md:text-5xl">Year {current.year}</h2>
              <p className="mx-auto mt-3 min-h-[32px] max-w-3xl text-xl font-semibold text-gray-700">
                {getPhaseLabel(phase, current)}
              </p>
            </div>

            <div className="relative grid gap-8 md:grid-cols-2">
              <Bucket
                title="Income Bucket"
                value={incomeDisplay}
                total={totalAssets}
                color="green"
                phase={phase}
                current={current}
              />
              <Bucket
                title="Growth Bucket"
                value={growthDisplay}
                total={totalAssets}
                color="blue"
                phase={phase}
                current={current}
              />

              <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 md:block">
                <AnimatePresence mode="wait">
                  {phase === 3 && current.isFinalYear && (
                    <motion.div
                      key={`refill-${current.year}`}
                      initial={{ opacity: 0, scale: 0.9, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.55 }}
                      className="rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-semibold text-blue-700 shadow-lg"
                    >
                      {current.refill > 0 ? `${formatMoney(current.refill)} → Income` : "No refill"}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="mx-auto mt-5 flex h-[72px] max-w-3xl items-start justify-center text-center text-lg font-semibold text-gray-700">
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
          </CardContent>
        </Card>

        {!presentMode && (
          <Controls
            totalAssets={totalAssets}
            setTotalAssets={setTotalAssets}
            incomePct={incomePct}
            setIncomePct={setIncomePct}
            years={years}
            setYears={setYears}
          />
        )}
      </div>
    </div>
  );
}

function Bucket({ title, value, total, color, phase, current }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const controls = animate(display, value, {
      duration: 1,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(latest),
    });

    return () => controls.stop();
  }, [value]);

  const percent = total > 0 ? Math.max(0, Math.min(display / total, 1)) : 0;
  const isIncome = title === "Income Bucket";
  const isGrowth = title === "Growth Bucket";
  const fillClass = color === "green" ? "bg-green-300" : "bg-blue-300";
  const baseClass = color === "green" ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50";

  return (
    <motion.div
      animate={{ scale: phase > 0 ? 1.01 : 1 }}
      transition={{ duration: 0.4 }}
      className={`relative h-[300px] overflow-hidden rounded-3xl border p-6 text-center shadow-sm ${baseClass}`}
    >
      <motion.div
        className={`absolute bottom-0 left-0 w-full ${fillClass} opacity-45`}
        animate={{ height: `${percent * 100}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-center">
        <h3 className="text-2xl font-semibold text-gray-700">{title}</h3>
        <p className="mt-4 text-4xl font-bold tracking-tight text-gray-950 md:text-5xl">
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
                className="text-lg font-bold text-red-700"
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
                className={`text-lg font-bold ${current.marketChange >= 0 ? "text-green-700" : "text-red-700"}`}
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
  const visibleRows = simulation.slice(0, yearIndex + 1);
  const last = simulation[simulation.length - 1];

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="text-left text-gray-700">
            <th className="p-3">Year</th>
            <th className="bg-green-100 p-3">Income Start</th>
            <th className="bg-green-100 p-3 text-red-700">Withdraw</th>
            <th className="bg-green-100 p-3">Income End</th>
            <th className="bg-blue-100 p-3">Growth Start</th>
            <th className="bg-blue-100 p-3">Market</th>
            <th className="bg-blue-100 p-3">Growth End</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence>
            {visibleRows.map((row, index) => {
              const isCurrent = index === yearIndex;
              const mutedCell = "bg-gray-100 text-gray-400";

              return (
                <motion.tr
                  key={row.year}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="border-t"
                >
                  <td className={`p-3 font-semibold ${isCurrent ? "" : mutedCell}`}>{row.year}</td>
                  <td className={`p-3 ${isCurrent ? "bg-green-50" : mutedCell}`}>{formatMoney(row.startIncome)}</td>
                  <td className={`p-3 ${isCurrent ? "bg-green-50 text-red-700" : mutedCell}`}>
                    {!isCurrent || phase >= 1 ? `-${formatMoney(row.withdrawal)}` : "—"}
                  </td>
                  <td className={`p-3 font-semibold ${isCurrent ? "bg-green-50" : mutedCell}`}>
                    {!isCurrent || phase >= 3 ? formatMoney(row.endIncome) : "—"}
                  </td>
                  <td className={`p-3 ${isCurrent ? "bg-blue-50" : mutedCell}`}>{formatMoney(row.startGrowth)}</td>
                  <td className={`p-3 ${isCurrent ? (row.marketChange >= 0 ? "bg-blue-50 text-green-700" : "bg-blue-50 text-red-700") : mutedCell}`}>
                    {!isCurrent || phase >= 2 ? `${row.marketChange >= 0 ? "+" : ""}${formatMoney(row.marketChange)}` : "—"}
                  </td>
                  <td className={`p-3 font-semibold ${isCurrent ? "bg-blue-50" : mutedCell}`}>
                    {!isCurrent || phase >= 3 ? formatMoney(row.endGrowth) : "—"}
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>

          {yearIndex === simulation.length - 1 && phase === 3 && (
            <tr className="border-t-2 border-black bg-gray-50 font-bold">
              <td className="p-3">Final</td>
              <td className="p-3" colSpan={6}>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <span className="text-green-700">Income Bucket: {formatMoney(last.endIncome)}</span>
                  <span className="text-blue-700">Growth Bucket: {formatMoney(last.endGrowth)}</span>
                  <span className="text-blue-700">
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
        <p className="font-semibold text-gray-700">{label}</p>
        <p className="text-2xl font-bold text-gray-950">{value}</p>
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
