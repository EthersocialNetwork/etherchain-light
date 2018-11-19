const web3 = require('web3');
const net = require('net');
const configConstant = require('./configConstant');

var config = function () {
  var self = this;

  this.providerIpc = new web3.providers.IpcProvider(configConstant.ipcPath, net); // localhost uses only ipc. However, the API uses localhost RPC. 'http://127.0.0.1:8545'

  this.arrParity = configConstant.arrParity;
  this.arrParityDisconnect = [];

  this.networkPortNumber = parseInt(configConstant.gethNetworkPortString, 10);

  this.getArrParity = function () {
    return self.arrParity;
  };

  this.getArrDisconnectParity = function () {
    return self.arrParityDisconnect;
  };

  this.changeToArrParityDisconnect = function (address) {
    var idx = self.arrParity.indexOf(address);
    var disidx = self.arrParityDisconnect.indexOf(address);
    if (idx === -1) {
      return false;
    } else if (disidx > -1) {
      return false;
    } else {
      self.arrParityDisconnect.push(address);
      var removed = self.arrParity.splice(idx, 1);
      console.log("[NodeInfo][DisConnect]", address, "\t", removed, "\n", "[arrParity]", self.arrParity, "\n", "[Disconnect]", self.arrParityDisconnect);
      return removed === address;
    }
  };

  this.changeToArrParity = function (address) {
    var idx = self.arrParity.indexOf(address);
    var disidx = self.arrParityDisconnect.indexOf(address);
    if (disidx === -1) {
      return false;
    } else if (idx > -1) {
      return false;
    } else {
      self.arrParity.splice(0, 0, address);
      var removed = self.arrParityDisconnect.splice(disidx, 1);
      console.log("[NodeInfo][ReConnect]", address, "\t", removed, "\n", "[arrParity]", self.arrParity, "\n", "[Disconnect]", self.arrParityDisconnect);
      return removed === address;
    }
  };

  this.selectParity = function () {
    return new web3.providers.HttpProvider(self.arrParity[Math.floor(Math.random() * self.arrParity.length)]);
  };

};

module.exports = config;