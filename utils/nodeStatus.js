var async = require('async');
var Web3 = require('web3');

var nodeStatus = function (config) {
  var self = this;
  this.conf = config;

  this.nbrPeers = -1;
  this.version = "";

  this.updateStatus = function () {
    var web3 = new Web3();
    web3.setProvider(config.provider);

    async.waterfall([
      function (callback) {
        web3.version.getNode(function (err, result) {
          callback(err, result);
        });
      },
      function (version, callback) {
        self.version = version;
        web3.net.getPeerCount(function (err, result) {
          callback(err, result);
        });
      }
    ], function (err, nbrPeers) {
      if (err) {
        console.log("Error updating node status:", err);
      }
      self.nbrPeers = nbrPeers;

      setTimeout(self.updateStatus, 1000 * 60);
    });
  };

  this.updateStatus();
};
module.exports = nodeStatus;