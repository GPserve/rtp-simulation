// Keno RTP simulation page: paytable difficulty and number of picks (1–10).
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var difficultySelect = el("difficulty");
  var picksInput = el("picks-count");

  var validate = function () {
    var bet = P.fieldNumber(betInput, el("bet-amount-error"), { positive: true });
    var rtp = P.validateRtpField(rtpInput, el("rtp-setting-error"), "KENO");
    var picks = P.fieldNumber(picksInput, el("picks-count-error"), { min: 1, max: 10, integer: true });
    if (bet === null || rtp === null || picks === null) return null;
    return { betAmount: bet, rtp: rtp, picksCount: picks };
  };

  el("run-button").addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;
    var config = {
      gameCode: "KENO",
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: { difficulty: difficultySelect.value, picksCount: fields.picksCount },
    };
    P.runSimulation(config, function (result) {
      P.renderStandardResult(config, result);
    });
  });

  [betInput, rtpInput, picksInput].forEach(function (input) {
    input.addEventListener("input", validate);
  });
})();
