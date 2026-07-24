// Baccarat RTP simulation page: assumed player bet-type distribution
// (player / banker / tie, must sum to 100%). RTP validation uses the
// generic range (proportional base-board scaling since 2026-07-17 — no
// dedicated floor / reachability), aligned with mini_api merchant checks.
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;

  // AI 換皮頁複用本腳本：<body data-game-code="AI_BACCARAT">（引擎 registry alias、數學同本體）。
  var GAME_CODE = document.body.dataset.gameCode || "BACCARAT";

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var pctInputs = ["player-pct", "banker-pct", "tie-pct"].map(el);
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
