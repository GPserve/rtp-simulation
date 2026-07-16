// Baccarat RTP simulation page: assumed player bet-type distribution
// (player / banker / tie, must sum to 100%). RTP validation uses the
// engine's dedicated baccarat bounds (min 55.39, per-bet-type
// reachability), which is why this page loads engine.js + core.js.
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var pctInputs = ["player-pct", "banker-pct", "tie-pct"].map(el);
  var distError = el("dist-error");

  var validate = function () {
    var bet = P.fieldNumber(betInput, el("bet-amount-error"), { positive: true });
    var rtp = P.validateRtpField(rtpInput, el("rtp-setting-error"), "BACCARAT");

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
      gameCode: "BACCARAT",
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: {
        playerPct: fields.pcts[0],
        bankerPct: fields.pcts[1],
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
