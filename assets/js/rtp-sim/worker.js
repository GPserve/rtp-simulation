// Web Worker entry: runs the full Monte Carlo simulation off the main
// thread and streams progress back to the page.
importScripts("../vendor/sha256.js", "core.js");

self.onmessage = function (event) {
  var config = event.data;
  try {
    var result = RtpSim.runFullSimulation(config, function (progress) {
      self.postMessage({ type: "progress", progress: progress });
    });
    self.postMessage({ type: "result", result: result });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message ? err.message : err) });
  }
};
