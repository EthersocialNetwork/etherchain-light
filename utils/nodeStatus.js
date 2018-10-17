const async = require('async');
const Web3 = require('web3');
const tcpPortUsed = require('tcp-port-used');

var nodeStatus = function (config) {
  var self = this;
  this.conf = config;
  this.VersionAndPeers = [];
  this.arrParity = config.getArrParity();
  this.idx = 0;
  this.port = '';
  this.ip = '';

  this.updateStatus = function () {
    if (self.idx > self.arrParity.length - 1) {
      self.idx = 0;
    }

    var web3 = new Web3();
    web3.setProvider(new web3.providers.HttpProvider(self.arrParity[self.idx]));
    if (!self.arrParity[self.idx]) {
      console.log(self.idx, '\n[self.arrParity]', self.arrParity);
    }
    var sres = self.arrParity[self.idx].split("/");
    if (sres[2]) {
      var sreses = sres[2].split(":");
      if (sreses.length == 2) {
        self.ip = sreses[0];
        self.port = sreses[1];
      }
    }

    async.waterfall([
      function (callback) {
        web3.version.getNode(function (err, result) {
          callback(err, result);
        });
      },
      function (version, callback) {
        web3.net.getPeerCount(function (err, result) {
          callback(err, version, result);
        });
      },
      function (version, nbrPeers, callback) {
        self.prevTime = new Date();
        if (self.ip != '' && self.port != '') {
          tcpPortUsed.check(parseInt(self.port, 10), self.ip)
            .then(function (inUse) {
              var now = new Date();
              var diffms = now - self.prevTime;
              if (!inUse) {
                callback(null, version, nbrPeers, 'Off');
              } else {
                callback(null, version, nbrPeers, diffms);
              }
            }, function (err) {
              callback(err, version, nbrPeers, 'Off');
            });
        } else {
          callback(null, version, nbrPeers, 'Off');
        }
      }
    ], function (err, version, nbrPeers, diffms) {
      if (err) {
        console.log("Error updating node status:", err);
      }

      var sIP = self.ip.split(".");
      sIP[1] = "?";
      sIP[2] = "?";
      var displayIP = sIP.join(".");

      var descriptionNode = '['.concat(self.idx).concat('] [').concat(version).concat('] [').concat(displayIP).concat('] [').concat((diffms == 'Off' ? ('Off] ') : (diffms + 'ms] ['))).concat(nbrPeers).concat('peers ]');
      if (self.VersionAndPeers[self.idx]) {
        self.VersionAndPeers[self.idx] = descriptionNode;
      } else {
        self.VersionAndPeers.push(descriptionNode);
      }

      self.idx = self.idx + 1;
      setTimeout(self.updateStatus, 1000 * 60);
    });
  };
  this.updateStatus();
};
module.exports = nodeStatus;