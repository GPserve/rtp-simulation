// Dragon Tiger RTP simulation page: assumed player bet-type distribution
// (dragon / tiger / tie, must sum to 100%). RTP validation uses the generic
// range (linear proportional scaling, no dedicated floor / reachability —
// see engine paytables/dragontiger.js). The AI Dragon Tiger re-skin page
// reuses this script via <body data-game-code="AI_DRAGON_TIGER"> (identical
// math, alias in the engine registry).
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;

  var GAME_CODE = document.body.dataset.gameCode || "DRAGON_TIGER";

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var pctInputs = ["dragon-pct", "tiger-pct", "tie-pct"].map(el);
  var distError = el("dist-error");

  var validate = function () {
    var bet = P.fieldNumber(betInput, el("bet-amount-error"), { positive: true });
    var rtp = P.validateRtpField(rtpInput, el("rtp-setting-error"), GAME_CODE);

    var pcts = pctInputs.map(function (input) {
      return P.fieldNumber(input, null, { min: 0 });
    });
    var eachOk = pcts.every(function (v) { return v !== null; });
    var sum = pcts.reduce(function (a, b) { return a + (b || 0); }, 0);
    var sumOk = eachOk && Math.abs(sum - 100) < 0.001;
    distError.hidden = sumOk;

    if (bet === null || rtp === null || !sumOk) return null;
    return { betAmount: bet, rtp: rtp, pcts: pcts };
  };

  el("run-button").addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;
    var config = {
      gameCode: GAME_CODE,
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: {
        dragonPct: fields.pcts[0],
        tigerPct: fields.pcts[1],
        tiePct: fields.pcts[2],
      },
    };
    P.runSimulation(config, function (result) {
      P.renderStandardResult(config, result);
    });
  });

  [betInput, rtpInput].concat(pctInputs).forEach(function (input) {
    input.addEventListener("input", validate);
  });
})();
