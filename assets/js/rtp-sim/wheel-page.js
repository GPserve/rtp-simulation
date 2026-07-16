// Wheel RTP simulation page: segment count and paytable risk level
// (both fixed option sets, no free numeric game parameters).
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var segmentsSelect = el("segments");
  var riskSelect = el("risk");

  var validate = function () {
    var bet = P.fieldNumber(betInput, el("bet-amount-error"), { positive: true });
    var rtp = P.validateRtpField(rtpInput, el("rtp-setting-error"), "WHEEL");
    if (bet === null || rtp === null) return null;
    return { betAmount: bet, rtp: rtp };
  };

  el("run-button").addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;
    var config = {
      gameCode: "WHEEL",
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: { segments: Number(segmentsSelect.value), risk: riskSelect.value },
    };
    P.runSimulation(config, function (result) {
      P.renderStandardResult(config, result);
    });
  });

  [betInput, rtpInput].forEach(function (input) {
    input.addEventListener("input", validate);
  });
})();
