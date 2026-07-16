// Shared page glue for the two hit-rate games (DICE / LIMBO): a single
// "Average Player Hit Rate" parameter maps onto the game's target
// (dice: roll-under point; limbo: target multiplier = rtp / hit rate).
// The game code comes from window.RTP_GAME set inline by the page.
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;
  var GAME_CODE = (window.RTP_GAME && window.RTP_GAME.code) || "DICE";

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var hitRateInput = el("hit-rate");

  var validate = function () {
    var bet = P.fieldNumber(betInput, el("bet-amount-error"), { positive: true });
    var rtp = P.validateRtpField(rtpInput, el("rtp-setting-error"), GAME_CODE);
    var hitRate = P.fieldNumber(hitRateInput, el("hit-rate-error"), { min: 0.01, max: 99.99 });
    if (bet === null || rtp === null || hitRate === null) return null;
    return { betAmount: bet, rtp: rtp, hitRate: hitRate };
  };

  el("run-button").addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;
    var config = {
      gameCode: GAME_CODE,
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: { hitRate: fields.hitRate },
    };
    P.runSimulation(config, function (result) {
      P.renderStandardResult(config, result);
    });
  });

  [betInput, rtpInput, hitRateInput].forEach(function (input) {
    input.addEventListener("input", validate);
  });
})();
