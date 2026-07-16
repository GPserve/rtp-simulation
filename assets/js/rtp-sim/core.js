// GanPlay RTP simulation engine core.
//
// Byte-for-byte port of the production result-generation and payout logic
// (mini_api services/seed_service.py + per-game payout functions). Pure
// functions: same input always yields the same output. Loadable in three
// contexts: page script, Web Worker (importScripts), and Node (for the
// Python-vs-JS parity harness).
//
// Production uses Python Decimal (quantize ROUND_HALF_EVEN). This engine
// approximates it with IEEE754 double + manual half-even rounding — it is a
// decision-support simulation preview, not a settlement ledger; float noise
// is far below simulation sampling noise.
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.RtpSim = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  var sha256lib = root.sha256 || (typeof require === "function" ? require("../vendor/sha256.js").sha256 : null);
  if (!sha256lib) throw new Error("js-sha256 must be loaded before core.js");

  var TWO_POW_NEG_53 = Math.pow(2, -53);

  var hmacSha256Hex = function (key, message) {
    return sha256lib.hmac(key, message);
  };

  // Round half-to-even at `decimals` places (approximates Decimal.quantize).
  var roundHalfEven = function (value, decimals) {
    var factor = Math.pow(10, decimals);
    var scaled = value * factor;
    var floor = Math.floor(scaled);
    var diff = scaled - floor;
    var EPS = 1e-7;
    var rounded;
    if (Math.abs(diff - 0.5) < EPS) {
      rounded = floor % 2 === 0 ? floor : floor + 1;
    } else {
      rounded = Math.round(scaled);
    }
    return rounded / factor;
  };

  var round2 = function (value) {
    return roundHalfEven(value, 2);
  };

  // ---------------------------------------------------------------------
  // seed_service.py::generate_dice_result — returns a 2-decimal Number.
  // Intermediate hex→integer conversion uses BigInt (values exceed the JS
  // 53-bit safe-integer range before the >>3 shift).
  // ---------------------------------------------------------------------
  var generateDiceResult = function (serverSeed, clientSeed, nonce) {
    var hashHex = hmacSha256Hex(serverSeed, clientSeed + ":" + nonce);
    var index = Number(BigInt("0x" + hashHex.slice(0, 15)) % 47n);
    var targetHex = hashHex.slice(index, index + 14);
    var numBig = BigInt("0x" + targetHex) >> 3n;
    var rawFloat = Number(numBig) * TWO_POW_NEG_53 * 10000;
    var diceResult = rawFloat / 100;
    return Number(diceResult.toFixed(2));
  };

  // ---------------------------------------------------------------------
  // modules/client/game/dice/game_dice.py::computed_win_amount
  // ---------------------------------------------------------------------
  var diceComputedWinAmount = function (opts) {
    var roll = opts.roll;
    var point = opts.point;
    var betAmount = opts.betAmount;
    var rtp = opts.rtp;
    var result = opts.result;

    var win = 0;
    var profit = 0;
    var rslt = 0;
    var multiplier = null;

    var isWin =
      (roll === "over" && result > point) ||
      (roll === "under" && result < point);

    if (isWin) {
      var RTP = round2(rtp / 100);
      var winchange = roll === "over" ? 100 - point : point;
      winchange = round2(winchange);
      multiplier = round2((100 / winchange) * RTP);
      win = round2(betAmount * multiplier);
      rslt = 1;
      profit = round2(win - betAmount);
    } else if (result === point) {
      rslt = 2;
      win = betAmount;
      profit = 0;
    } else {
      profit = -betAmount;
    }

    return { rslt: rslt, win: win, multiplier: multiplier, profit: profit };
  };

  // ---------------------------------------------------------------------
  // Game registry. classification A = strategy-independent (player strategy
  // only affects variance, never the expected RTP).
  // ---------------------------------------------------------------------
  var GAME_REGISTRY = {
    DICE: {
      classification: "A",
      defaultParams: { hitRate: 50 },
      // Average player hit rate (%) maps to roll="under" + point=hitRate.
      simulateOneUnit: function (serverSeed, clientSeed, nonce, params) {
        var result = generateDiceResult(serverSeed, clientSeed, nonce);
        var payout = diceComputedWinAmount({
          roll: "under",
          point: round2(params.hitRate),
          betAmount: params.betAmount,
          rtp: params.rtp,
          result: result,
        });
        return { invested: params.betAmount, win: payout.win };
      },
    },
  };

  // ---------------------------------------------------------------------
  // RTP input validation (ported from mini_api generic bounds: marshmallow
  // validate.Range(0.01, 99.99) on merchant game RTP).
  // ---------------------------------------------------------------------
  var GENERIC_MIN = 0.01;
  var GENERIC_MAX = 99.99;

  var validateRtp = function (gameCode, rtp) {
    if (!isFinite(rtp)) return { valid: false, reason: "invalid_number" };
    if (rtp < GENERIC_MIN || rtp > GENERIC_MAX) {
      return { valid: false, reason: "out_of_range" };
    }
    return { valid: true, reason: null };
  };

  // ---------------------------------------------------------------------
  // Monte Carlo loop: the same parameter set runs REPEATS full simulations;
  // the main result is the mean and the 90% interval (p5~p95) across
  // repeats. Invested and win are accumulated per bet (not betAmount×count)
  // so that gross profit === total turnover − total payout holds exactly.
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
    var merged = Object.assign({}, params, { betAmount: betAmount, rtp: rtp });
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
      var one = runOneRepeat(
        game,
        config.count,
        config.betAmount,
        config.rtp,
        config.params
      );
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

  return {
    roundHalfEven: roundHalfEven,
    round2: round2,
    hmacSha256Hex: hmacSha256Hex,
    generateDiceResult: generateDiceResult,
    diceComputedWinAmount: diceComputedWinAmount,
    GAME_REGISTRY: GAME_REGISTRY,
    validateRtp: validateRtp,
    REPEATS: REPEATS,
    SIMULATION_COUNT: SIMULATION_COUNT,
    CONVERGENCE_COUNT_TIERS: CONVERGENCE_COUNT_TIERS,
    runFullSimulation: runFullSimulation,
  };
});
