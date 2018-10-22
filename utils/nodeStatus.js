const async = require('async');
const Web3 = require('web3');
const tcpPortUsed = require('tcp-port-used');

var nodeStatus = function (config) {
  var self = this;
  this.conf = config;
  this.VersionAndPeers = [];
  this.idx = 0;
  this.port = '';
  this.ip = '';
  var org_arrParity = self.conf.getArrParity();
  var arrDisconnectParity = self.conf.getArrDisconnectParity();
  this.arrParity = org_arrParity.slice(0, org_arrParity.length).concat(arrDisconnectParity);
  if (this.arrParity.indexOf(self.conf.localRPCaddress) === -1) {
    this.arrParity.splice(0, 0, self.conf.localRPCaddress);
  }
  this.web3 = new Web3();

  this.updateStatus = function () {
    if (self.idx > self.arrParity.length - 1) {
      self.idx = 0;
    }

    if (!self.arrParity[self.idx]) {
      console.log('!self.arrParity[self.idx] :', self.idx, '[self.arrParity]', self.arrParity);
    } else {
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
          if (self.ip != '' && self.port != '') {
            self.prevTime = new Date();
            var inUse = true; // wait until the port is in use
            tcpPortUsed.waitForStatus(parseInt(self.port, 10), self.ip, inUse, 200, 400)
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
            self.web3.setProvider(new self.web3.providers.HttpProvider(self.arrParity[self.idx]));
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
          if (self.arrParity[self.idx] != config.localRPCaddress) {
            config.changeToArrParityDisconnect(self.arrParity[self.idx]);
          }
          if (self.VersionAndPeers[self.idx]) {
            self.VersionAndPeers[self.idx] = '['.concat(self.idx).concat('] [').concat(displayIP).concat('] [').concat('[[ Disconnected ]]]');
          }
        } else {
          if (diffms == 'Off' || diffms === undefined || version === undefined || nbrPeers === undefined) {
            if (self.arrParity[self.idx] != config.localRPCaddress) {
              config.changeToArrParityDisconnect(self.arrParity[self.idx]);
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
            if (self.arrParity[self.idx] != config.localRPCaddress) {
              config.changeToArrParity(self.arrParity[self.idx]);
            }
          }
        }
        self.idx = self.idx + 1;
      });
    }
    setTimeout(self.updateStatus, 1000 * Math.floor(30 / self.arrParity.length));
  };
  this.updateStatus();
};
module.exports = nodeStatus;