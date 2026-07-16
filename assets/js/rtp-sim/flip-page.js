// Flip RTP simulation page (classification B — expected RTP depends on
// streak depth): field validation, weighted result rendering, per-depth
// analytic breakdown table. Shared glue lives in page-common.js; the
// closed-form breakdown comes from the engine (core.js on this page).
(function () {
  "use strict";

  var P = window.RtpSimPage;
  var el = P.el;

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var depthInputs = [1, 2, 3, 4, 5].map(function (n) {
    return el("depth-" + n);
  });
  var betError = el("bet-amount-error");
  var rtpError = el("rtp-setting-error");
  var depthError = el("depth-error");

  var validate = function () {
    var ok = true;

    var bet = P.parseField(betInput);
    var betOk = isFinite(bet) && bet > 0;
    betInput.classList.toggle("is-invalid", !betOk);
    betError.hidden = betOk;
    ok = ok && betOk;

    var rtp = P.parseField(rtpInput);
    var rtpCheck = P.validateRtpValue(rtp);
    rtpInput.classList.toggle("is-invalid", !rtpCheck.valid);
    rtpError.hidden = rtpCheck.valid;
    if (!rtpCheck.valid) {
      rtpError.textContent = P.RTP_MESSAGES[rtpCheck.reason] || P.RTP_MESSAGES.invalid_number;
    }
    ok = ok && rtpCheck.valid;

    var depths = depthInputs.map(P.parseField);
    var eachOk = true;
    depthInputs.forEach(function (input, i) {
      var vOk = isFinite(depths[i]) && depths[i] >= 0;
      input.classList.toggle("is-invalid", !vOk);
      eachOk = eachOk && vOk;
    });
    var sum = depths.reduce(function (a, b) { return a + b; }, 0);
    var sumOk = eachOk && Math.abs(sum - 100) < 0.001;
    depthError.hidden = sumOk;
    ok = ok && sumOk;

    return ok ? { betAmount: bet, rtp: rtp, depths: depths } : null;
  };

  var renderResult = function (config, result) {
    var main = result.main;
    var breakdown = RtpSim.analyticFlipDepthBreakdown(config.rtp, config.depths);

    el("result-subtitle").textContent =
      "Result of this simulation (average bet " +
      config.betAmount.toLocaleString("en-US") +
      " × " + P.SIMULATION_COUNT.toLocaleString("en-US") +
      " bets, total turnover " + P.fmtMoney(main.totalFlow) + ")";
    el("result-setting-line").textContent =
      "RTP Setting (single round): " + P.fmtPct(config.rtp) +
      " · 90% interval from 20 repeat samples of " +
      P.SIMULATION_COUNT.toLocaleString("en-US") + " bets each";

    el("stat-rtp-value").textContent = P.fmtPct(main.actualRtp.mean);
    el("stat-rtp-range").textContent =
      "90%: " + P.fmtPct(main.actualRtp.p5) + " ~ " + P.fmtPct(main.actualRtp.p95);
    el("stat-flow-value").textContent = P.fmtMoney(main.totalFlow);
    el("stat-profit-value").textContent = P.fmtMoney(main.houseProfit.mean);
    el("stat-profit-range").textContent =
      "90%: " + P.fmtMoney(main.houseProfit.p5) + " ~ " + P.fmtMoney(main.houseProfit.p95);

    el("breakdown-title").textContent =
      "Flip-Streak Depth Breakdown (for single-round setting " + P.fmtPct(config.rtp) + ")";
    var body = el("breakdown-body");
    body.textContent = "";
    breakdown.forEach(function (row) {
      var tr = document.createElement("tr");
      [
        row.depth === 5 ? "Depth 5+" : "Depth " + row.depth,
        row.multiplier.toFixed(2) + "×",
        row.actualRtp.toFixed(2) + "%",
        row.assumedShare + "%",
      ].forEach(function (cellText) {
        var td = document.createElement("td");
        td.textContent = cellText;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });

    // Weighted theoretical target: per-depth actual RTP weighted by the
    // assumed player share (the single-round setting itself is not the
    // expectation for flip).
    var weightedTarget = breakdown.reduce(function (sum, row) {
      return sum + (row.assumedShare / 100) * row.actualRtp;
    }, 0);

    el("chart-title").textContent =
      "Convergence Curve (for current RTP setting, " + P.fmtPct(config.rtp) + ")";
    el("chart-legend-simulated").textContent =
      "Simulated RTP (" + P.fmtPct(config.rtp) + " setting, one sample per volume)";
    el("chart-legend-theoretical").textContent = "Theoretical Target (weighted)";
    P.renderChart(el("chart-container"), result.convergence, weightedTarget);
  };

  el("run-button").addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;
    var config = {
      gameCode: "FLIP",
      count: P.SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      depths: fields.depths,
      params: {
        depth1: fields.depths[0],
        depth2: fields.depths[1],
        depth3: fields.depths[2],
        depth4: fields.depths[3],
        depth5Plus: fields.depths[4],
      },
    };
    P.runSimulation(config, function (result) {
      renderResult(config, result);
    });
  });

  [betInput, rtpInput].concat(depthInputs).forEach(function (input) {
    input.addEventListener("input", validate);
  });
})();
