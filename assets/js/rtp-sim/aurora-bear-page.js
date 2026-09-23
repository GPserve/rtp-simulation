// Aurora Bear RTP simulation page: no player-adjustable parameters (fixed reel
// strips and paytable), so only bet amount and RTP are validated.
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");

  var validate = function () {
    var bet = P.fieldNumber(betInput, el("bet-amount-error"), { positive: true });
    var rtp = P.validateRtpField(rtpInput, el("rtp-setting-error"), "AURORA_BEAR");
    if (bet === null || rtp === null) return null;
    return { betAmount: bet, rtp: rtp };
  };

  el("run-button").addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;
    var config = {
      gameCode: "AURORA_BEAR",
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: {},
    };
    P.runSimulation(config, function (result) {
      P.renderStandardResult(config, result);
    });
  });

  [betInput, rtpInput].forEach(function (input) {
    input.addEventListener("input", validate);
  });
})();
