// Frog Cross RTP simulation page: difficulty (frogs per row / pads per row)
// and the assumed average cash-out point (rows passed, 1 to 9).
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;

  // The board always has 9 rows, whatever the difficulty.
  var ROWS = 9;

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var difficultySelect = el("difficulty");
  var passInput = el("rows-pass");
  var passError = el("rows-pass-error");

  var validate = function () {
    var bet = P.fieldNumber(betInput, el("bet-amount-error"), { positive: true });
    var rtp = P.validateRtpField(rtpInput, el("rtp-setting-error"), "FROG_CROSS");
    passError.textContent = "Rows passed must be an integer between 1 and " + ROWS + ".";
    var pass = P.fieldNumber(passInput, passError, { min: 1, max: ROWS, integer: true });
    if (bet === null || rtp === null || pass === null) return null;
    return { betAmount: bet, rtp: rtp, rowsToPass: pass };
  };

  el("run-button").addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;
    var config = {
      gameCode: "FROG_CROSS",
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: { difficulty: difficultySelect.value, rowsToPass: fields.rowsToPass },
    };
    P.runSimulation(config, function (result) {
      P.renderStandardResult(config, result);
    });
  });

  [betInput, rtpInput, passInput].forEach(function (input) {
    input.addEventListener("input", validate);
  });
  difficultySelect.addEventListener("change", validate);
})();
