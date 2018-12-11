const async = require('async');
const Web3 = require('web3');
const tcpPortUsed = require('tcp-port-used');
const configConstant = require('../config/configConstant');

var nodeStatus = function (config) {
  var self = this;
  self.VersionAndPeers = [];
  self.idx = 0;
  self.port = '';
  self.ip = '';
  self.arrParity = [];
  self.arrParity.push(configConstant.localRPCaddress);
  self.web3 = new Web3();

  if (config.getArrParity() && config.getArrParity().length > 0) {
    config.getArrParity().forEach(function (address) {
      self.arrParity.push(address);
    });
  }
  if (config.getArrDisconnectParity() && config.getArrDisconnectParity().length > 0) {
    config.getArrDisconnectParity().forEach(function (address) {
      self.arrParity.push(address);
    });
  }
  if (self.arrParity.indexOf(configConstant.localRPCaddress) === -1) {
    self.arrParity.splice(0, 0, configConstant.localRPCaddress);
  }

  self.updateStatus = function () {
    if (self.idx > self.arrParity.length - 1) {
      self.idx = 0;
      self.arrParity = uniqIP(self.arrParity);
    }

    var parity = self.arrParity[self.idx];
    if (!parity) {
      console.log('!self.arrParity[self.idx] :', self.idx, '[self.arrParity]', self.arrParity);
    } else {
      var sres = parity.split("/");
      if (sres[2]) {
        var sreses = sres[2].split(":");
        if (sreses.length == 2) {
          self.ip = sreses[0];
          self.port = sreses[1];
        }
      }

      async.waterfall([
        function (callback) {
          if (self.ip != '' && self.port != '') {
            self.prevTime = new Date();
            var inUse = true; // wait until the port is in use
            tcpPortUsed.waitForStatus(parseInt(self.port, 10), self.ip, inUse, 400, 1200)
              .then(function () {
                var now = new Date();
                var diffms = now - self.prevTime;
                callback(null, diffms);
              }, function (err) {
                callback(null, 'Off');
              });
          } else {
            callback(null, 'Off');
          }
        },
        function (diffms, callback) {
          if (diffms == 'Off') {
            callback(null, diffms, null);
          } else {
            self.web3.setProvider(new self.web3.providers.HttpProvider(parity));
            self.web3.version.getNode(function (err, result) {
              callback(err, diffms, result);
            });
          }
        },
        function (diffms, version, callback) {
          if (diffms == 'Off') {
            callback(null, diffms, version, null);
          } else {
            self.web3.net.getPeerCount(function (err, result) {
              callback(err, diffms, version, result);
            });
          }
        }
      ], function (err, diffms, version, nbrPeers) {
        var sIP = self.ip.split(".");
        sIP[1] = "***";
        sIP[2] = "***";
        var displayIP = sIP.join(".");

        if (err) {
          console.log("Error updating node status:", err);
          if (parity != configConstant.localRPCaddress) {
            config.changeToArrParityDisconnect(parity);
          }
          if (self.VersionAndPeers[self.idx]) {
            self.VersionAndPeers[self.idx] = '['.concat(self.idx).concat('] [').concat(displayIP).concat('] [').concat('[[ Disconnected ]]]');
          }
        } else {
          if (diffms == 'Off' || diffms === undefined || version === undefined || nbrPeers === undefined) {
            if (parity != configConstant.localRPCaddress) {
              config.changeToArrParityDisconnect(parity);
            }
            if (self.VersionAndPeers[self.idx]) {
              self.VersionAndPeers[self.idx] = '['.concat(self.idx).concat('] [').concat(displayIP).concat('] [').concat('[[ Disconnected ]]]');
            }
          } else {
            var descriptionNode = '['.concat(self.idx).concat('] [').concat(version).concat('] [').concat(displayIP).concat('] [').concat((diffms == 'Off' ? ('Off] ') : (diffms + 'ms] ['))).concat(nbrPeers).concat('peers ]');
            if (self.VersionAndPeers[self.idx]) {
              self.VersionAndPeers[self.idx] = descriptionNode;
            } else {
              self.VersionAndPeers.push(descriptionNode);
            }
            if (parity != configConstant.localRPCaddress) {
              config.changeToArrParity(parity);
            }
          }
        }

        self.idx = self.idx + 1;
      });
    }
    setTimeout(self.updateStatus, 1000 * Math.floor(30 / self.arrParity.length));
  };
  self.updateStatus();
};

function uniqIP(ips) {
  return ips.reduce(function (a, b) {
    if (a.indexOf(b) < 0) a.push(b);
    return a;
  }, []);
}
module.exports = nodeStatus;