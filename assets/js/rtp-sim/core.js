// GanPlay RTP simulation core: Monte Carlo loop over the bundled game
// engine (engine.js — verbatim golden-tested ports of the production
// result-generation and payout logic). Loadable in page, Web Worker and
// Node (parity harnesses).
//
// Production uses Python Decimal (quantize ROUND_HALF_EVEN); the engine
// approximates it with IEEE754 double + manual half-even rounding — this is
// a decision-support preview, not a settlement ledger.
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.RtpSim = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  var RtpEngine = root.RtpEngine || (typeof require === "function" ? require("./engine.js") : null);
  if (!RtpEngine) throw new Error("engine.js must be loaded before core.js");

  var req = RtpEngine.require;
  var round2 = req("decimal-utils.js").round2;
  var seed = req("seed.js");
  var limboPaytable = req("paytables/limbo.js");

  // ---------------------------------------------------------------------
  // LIMBO override. The bundled source module predates the production fix
  // that wired effective_rtp into result generation (mini_api `76a8067`,
  // game_limbo.py: house_edge = 100 − effective_rtp passed into
  // generate_limbo_result) and pins house_edge to 1. This override
  // simulates current production behaviour, so the RTP input is live.
  // ---------------------------------------------------------------------
  var limboHitRateToTarget = function (hitRate, rtp) {
    // P(crash ≥ m) ≈ rtp/(100·m) ⇒ target m for a given hit rate = rtp/h.
    var raw = rtp / hitRate;
    return round2(
      Math.min(limboPaytable.TARGET_MAX, Math.max(limboPaytable.TARGET_MIN, raw))
    );
  };

  var LIMBO_CURRENT_PRODUCTION = {
    classification: "A",
    defaultParams: { hitRate: 50 },
    simulateOneUnit: function (serverSeed, clientSeed, nonce, params) {
      // house_edge is DECIMAL(4,2)-exact in production (Decimal 100 − rtp,
      // then float()); toFixed(2) recovers the exact decimal value before
      // the float pipeline.
      var houseEdge = Number((100 - params.rtp).toFixed(2));
      var crashPoint = seed.generateLimboResult(serverSeed, clientSeed, nonce, houseEdge);
      var payout = limboPaytable.computedWinAmount({
        targetMultiplier: limboHitRateToTarget(params.hitRate, params.rtp),
        crashPoint: crashPoint,
        betAmount: params.betAmount,
      });
      return { invested: params.betAmount, win: payout.win };
    },
  };

  var GAME_REGISTRY = Object.assign({}, RtpEngine.GAME_REGISTRY, {
    LIMBO: LIMBO_CURRENT_PRODUCTION,
  });

  // ---------------------------------------------------------------------
  // Monte Carlo loop: the same parameter set runs REPEATS full simulations;
  // the main result is the mean and the 90% interval (p5~p95) across
  // repeats. Invested and win are accumulated per bet (blackjack side bets
  // can push per-bet invested above betAmount), so gross profit === total
  // turnover − total payout holds exactly.
  // ---------------------------------------------------------------------
  var REPEATS = 20;
  var SIMULATION_COUNT = 100000;
  var CONVERGENCE_COUNT_TIERS = [100, 500, 1000, 5000, 10000, 50000, 100000];
  var CLIENT_SEED = "rtp-simulation-client";

  var randomHexServerSeed = function () {
    var bytes = new Uint8Array(32);
    var cryptoObj = root.crypto;
    if (cryptoObj && cryptoObj.getRandomValues) {
      cryptoObj.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    var hex = "";
    for (var j = 0; j < bytes.length; j += 1) {
      hex += bytes[j].toString(16).padStart(2, "0");
    }
    return hex;
  };

  var percentile = function (sortedArr, p) {
    if (sortedArr.length === 1) return sortedArr[0];
    var idx = (p / 100) * (sortedArr.length - 1);
    var lower = Math.floor(idx);
    var upper = Math.ceil(idx);
    if (lower === upper) return sortedArr[lower];
    var frac = idx - lower;
    return sortedArr[lower] * (1 - frac) + sortedArr[upper] * frac;
  };

  var mean = function (arr) {
    var sum = 0;
    for (var i = 0; i < arr.length; i += 1) sum += arr[i];
    return sum / arr.length;
  };

  var runOneRepeat = function (game, count, betAmount, rtp, params) {
    var serverSeed = randomHexServerSeed();
    var merged = Object.assign({}, game.defaultParams, params, {
      betAmount: betAmount,
      rtp: rtp,
    });
    var totalInvested = 0;
    var totalWin = 0;
    for (var i = 0; i < count; i += 1) {
      var unit = game.simulateOneUnit(serverSeed, CLIENT_SEED, i + 1, merged);
      totalInvested += unit.invested;
      totalWin += unit.win;
    }
    return {
      actualRtp: totalInvested > 0 ? (totalWin / totalInvested) * 100 : 0,
      houseProfit: totalInvested - totalWin,
      totalFlow: totalInvested,
    };
  };

  // Full run = main result (REPEATS × count bets) + convergence curve
  // (one sample per tier). Progress counts both phases in one bar.
  var runFullSimulation = function (config, onProgress) {
    var game = GAME_REGISTRY[config.gameCode];
    if (!game) throw new Error("unknown game code: " + config.gameCode);

    var totalSteps = REPEATS + CONVERGENCE_COUNT_TIERS.length;
    var doneSteps = 0;
    var reportStep = function (repeatLabel) {
      doneSteps += 1;
      if (onProgress) {
        onProgress({
          repeatIndex: repeatLabel,
          repeats: REPEATS,
          percent: Math.round((doneSteps / totalSteps) * 100),
        });
      }
    };

    var rtpSamples = [];
    var profitSamples = [];
    var flowSamples = [];
    for (var r = 0; r < REPEATS; r += 1) {
      var one = runOneRepeat(game, config.count, config.betAmount, config.rtp, config.params);
      rtpSamples.push(one.actualRtp);
      profitSamples.push(one.houseProfit);
      flowSamples.push(one.totalFlow);
      reportStep(r + 1);
    }

    var convergence = [];
    for (var t = 0; t < CONVERGENCE_COUNT_TIERS.length; t += 1) {
      var tierRun = runOneRepeat(
        game,
        CONVERGENCE_COUNT_TIERS[t],
        config.betAmount,
        config.rtp,
        config.params
      );
      convergence.push(tierRun.actualRtp);
      reportStep(REPEATS);
    }

    var sortedRtp = rtpSamples.slice().sort(function (a, b) { return a - b; });
    var sortedProfit = profitSamples.slice().sort(function (a, b) { return a - b; });

    return {
      main: {
        actualRtp: {
          mean: mean(rtpSamples),
          p5: percentile(sortedRtp, 5),
          p95: percentile(sortedRtp, 95),
        },
        houseProfit: {
          mean: mean(profitSamples),
          p5: percentile(sortedProfit, 5),
          p95: percentile(sortedProfit, 95),
        },
        totalFlow: mean(flowSamples),
      },
      convergence: convergence,
    };
  };

  // BLACKJACK theoretical perfect-strategy result needs no simulation.
  var blackjackTheoreticalResult = function (rtp, betAmount, count) {
    var totalFlow = betAmount * count;
    var totalWin = totalFlow * (rtp / 100);
    return { actualRtp: rtp, totalFlow: totalFlow, houseProfit: totalFlow - totalWin };
  };

  return {
    engine: RtpEngine,
    round2: round2,
    validateRtp: RtpEngine.validateRtp,
    GAME_REGISTRY: GAME_REGISTRY,
    REPEATS: REPEATS,
    SIMULATION_COUNT: SIMULATION_COUNT,
    CONVERGENCE_COUNT_TIERS: CONVERGENCE_COUNT_TIERS,
    runFullSimulation: runFullSimulation,
    blackjackTheoreticalResult: blackjackTheoreticalResult,
    // parity-harness / page re-exports
    generateDiceResult: seed.generateDiceResult,
    diceComputedWinAmount: req("paytables/dice.js").computedWinAmount,
    generateFlipResult: seed.generateFlipResult,
    flipMultiplierForStreak: req("paytables/flip.js").multiplierForStreak,
    analyticFlipDepthBreakdown: req("games/flip.js").analyticDepthBreakdown,
    generateLimboResult: seed.generateLimboResult,
    limboComputedWinAmount: limboPaytable.computedWinAmount,
    limboHitRateToTarget: limboHitRateToTarget,
  };
});
