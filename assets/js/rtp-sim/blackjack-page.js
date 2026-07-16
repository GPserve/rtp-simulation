// Blackjack RTP simulation page (classification C — result quality depends
// on player decisions): no strategy parameters; renders the theoretical
// perfect-strategy value next to the average-player simulated value. RTP
// validation uses the engine's dedicated bounds (min 52.29 + scale-table
// reachability), which is why this page loads engine.js + core.js.
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");

  var validate = function () {
    var bet = P.fieldNumber(betInput, el("bet-amount-error"), { positive: true });
    var rtp = P.validateRtpField(rtpInput, el("rtp-setting-error"), "BLACKJACK");
    if (bet === null || rtp === null) return null;
    return { betAmount: bet, rtp: rtp };
  };

  var renderResult = function (config, result) {
    var main = result.main;
    var theo = RtpSim.blackjackTheoreticalResult(
      config.rtp,
      config.betAmount,
      P.SIMULATION_COUNT
    );

    el("result-subtitle").textContent =
      "Result of this simulation (average bet " +
      config.betAmount.toLocaleString("en-US") +
      " × " + P.SIMULATION_COUNT.toLocaleString("en-US") +
      " bets, total turnover " + P.fmtMoney(main.totalFlow) + ")";
    el("result-setting-line").textContent =
      "RTP Setting: " + P.fmtPct(config.rtp) +
      " · 90% interval from 20 repeat samples of " +
      P.SIMULATION_COUNT.toLocaleString("en-US") + " bets each";

    el("stat-flow-value").textContent = P.fmtMoney(main.totalFlow);
    el("bj-theo-rtp").textContent = P.fmtPct(theo.actualRtp);
    el("bj-theo-profit").textContent = P.fmtMoney(theo.houseProfit);

    el("stat-rtp-value").textContent = P.fmtPct(main.actualRtp.mean);
    el("stat-rtp-range").textContent =
      "90%: " + P.fmtPct(main.actualRtp.p5) + " ~ " + P.fmtPct(main.actualRtp.p95);
    el("stat-profit-value").textContent = P.fmtMoney(main.houseProfit.mean);
    el("stat-profit-range").textContent =
      "90%: " + P.fmtMoney(main.houseProfit.p5) + " ~ " + P.fmtMoney(main.houseProfit.p95);

    el("chart-title").textContent =
      "Convergence Curve (for current RTP setting, " + P.fmtPct(config.rtp) + ")";
    el("chart-legend-simulated").textContent =
      "Average-Player Simulated Value (" + P.fmtPct(config.rtp) + " setting, one sample per volume)";
    el("chart-legend-theoretical").textContent =
      "Theoretical Perfect-Strategy Value " + P.fmtPct(config.rtp);
    P.renderChart(el("chart-container"), result.convergence, config.rtp);
  };

  el("run-button").addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;
    var config = {
      gameCode: "BLACKJACK",
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: {},
    };
    P.runSimulation(config, function (result) {
      renderResult(config, result);
    });
  });

  [betInput, rtpInput].forEach(function (input) {
    input.addEventListener("input", validate);
  });
})();
