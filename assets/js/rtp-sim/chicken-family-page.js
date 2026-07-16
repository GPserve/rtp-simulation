// Chicken-family RTP simulation page (CHICKEN / BAO / PENGUIN): difficulty
// (danger-cell count) and the assumed average cash-out point (cells
// passed). Game code and board size come from window.RTP_GAME set inline
// by each page (chicken/bao = 20 cells, penguin = 22).
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;
  var GAME_CODE = window.RTP_GAME.code;
  var TOTAL_CELLS = window.RTP_GAME.totalCells;

  // Danger cells per difficulty (chicken_paytable.py CHICKEN_DIFFICULTY_BONES).
  var DIFFICULTY_BONES = { Easy: 1, Medium: 3, Hard: 5, Expert: 10 };

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var difficultySelect = el("difficulty");
  var passInput = el("cells-pass");
  var passError = el("cells-pass-error");

  var validate = function () {
    var bet = P.fieldNumber(betInput, el("bet-amount-error"), { positive: true });
    var rtp = P.validateRtpField(rtpInput, el("rtp-setting-error"), GAME_CODE);
    var maxPass = TOTAL_CELLS - DIFFICULTY_BONES[difficultySelect.value];
    passError.textContent =
      "Cells passed must be an integer between 1 and " + maxPass + " (total cells − danger cells).";
    var pass = P.fieldNumber(passInput, passError, { min: 1, max: maxPass, integer: true });
    if (bet === null || rtp === null || pass === null) return null;
    return { betAmount: bet, rtp: rtp, cellsToPass: pass };
  };

  el("run-button").addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;
    var config = {
      gameCode: GAME_CODE,
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: { difficulty: difficultySelect.value, cellsToPass: fields.cellsToPass },
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
