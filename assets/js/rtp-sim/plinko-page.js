// Plinko RTP simulation page: rows (8–16) and paytable risk level.
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var rowsInput = el("rows");
  var riskSelect = el("risk");

  var validate = function () {
    var bet = P.fieldNumber(betInput, el("bet-amount-error"), { positive: true });
    var rtp = P.validateRtpField(rtpInput, el("rtp-setting-error"), "PLINKO");
    var rows = P.fieldNumber(rowsInput, el("rows-error"), { min: 8, max: 16, integer: true });
    if (bet === null || rtp === null || rows === null) return null;
    return { betAmount: bet, rtp: rtp, rows: rows };
  };

  el("run-button").addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;
    var config = {
      gameCode: "PLINKO",
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: { rows: fields.rows, risk: riskSelect.value },
    };
    P.runSimulation(config, function (result) {
      P.renderStandardResult(config, result);
    });
  });

  [betInput, rtpInput, rowsInput].forEach(function (input) {
    input.addEventListener("input", validate);
  });
})();
