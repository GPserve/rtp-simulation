// Mines RTP simulation page: mine count (1–24) and the assumed average
// cash-out point (cells opened, 1 to 25 − mine count).
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;
  var TOTAL_CELLS = 25;

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var mineInput = el("mine-count");
  var openInput = el("cells-open");
  var openError = el("cells-open-error");

  var validate = function () {
    var bet = P.fieldNumber(betInput, el("bet-amount-error"), { positive: true });
    var rtp = P.validateRtpField(rtpInput, el("rtp-setting-error"), "MINES");
    var mines = P.fieldNumber(mineInput, el("mine-count-error"), { min: 1, max: 24, integer: true });

    var maxOpen = mines === null ? TOTAL_CELLS - 1 : TOTAL_CELLS - mines;
    openError.textContent =
      "Cells opened must be an integer between 1 and " + maxOpen + " (25 − mine count).";
    var open = P.fieldNumber(openInput, openError, { min: 1, max: maxOpen, integer: true });

    if (bet === null || rtp === null || mines === null || open === null) return null;
    return { betAmount: bet, rtp: rtp, minesCount: mines, cellsToOpen: open };
  };

  el("run-button").addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;
    var config = {
      gameCode: "MINES",
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: { minesCount: fields.minesCount, cellsToOpen: fields.cellsToOpen },
    };
    P.runSimulation(config, function (result) {
      P.renderStandardResult(config, result);
    });
  });

  [betInput, rtpInput, mineInput, openInput].forEach(function (input) {
    input.addEventListener("input", validate);
  });
})();
