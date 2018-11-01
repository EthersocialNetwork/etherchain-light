var web3 = require('web3');
var net = require('net');

var config = function () {
  var self = this;

  this.logFormat = "[:status][:date[clf]][:remote-addr] :url :referrer :user-agent";

  this.dbPath = '/home/barahime/.local/share/io.parity.ethersocial/chains/ethersocial/db/dc73f323b4681272/archive';

  this.ipcPath = "/home/barahime/.local/share/io.parity.ethersocial/jsonrpc.ipc";
  this.providerIpc = new web3.providers.IpcProvider(this.ipcPath, net); // localhost uses only ipc. However, the API uses localhost RPC. 'http://127.0.0.1:8545'

  this.arrParity = ['http://112.187.62.204:17545' /*office*/ , 'http://218.149.67.46:17545' /*home*/ , 'http://1.214.152.195:50509'];
  this.arrParityDisconnect = [];

  this.localRPCaddress = 'http://127.0.0.1:17545';

  this.networkPortString = "50505";
  this.networkPortNumber = parseInt(this.networkPortString, 10);

  this.accountBalanceServiceInterval = 2 * 60 * 1000; // ms
  this.blockStoreServiceInterval = 1 * 60 * 1000; // ms
  this.peerCollectorServiceInterval = 5 * 60 * 1000; // ms
  this.hashrateCollectorServiceInterval = 2 * 60 * 60 * 1000; // ms

  this.serverPortCheck = true;
  this.serverPortCheckDelay = 60 * 1000; // ms

  this.tokenLoadDelay = 10;

  this.jsload_defer = false;
  this.jsload_async = false;

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
    } else if (disidx >= -1) {
      return false;
    } else {
      self.arrParityDisconnect.push(address);
      var removed = self.arrParity.splice(idx, 1);
      console.log("[NodeInfo][DisConnect]", address, "\t", removed, "\n", "[arrParity]", self.arrParity, "\n", "[Disconnect]", self.arrParityDisconnect);
      return removed == address;
    }
  };

  this.changeToArrParity = function (address) {
    var idx = self.arrParity.indexOf(address);
    var disidx = self.arrParityDisconnect.indexOf(address);
    if (disidx === -1) {
      return false;
    } else if (idx >= -1) {
      return false;
    } else {
      self.arrParity.splice(0, 0, address);
      var removed = self.arrParityDisconnect.splice(disidx, 1);
      console.log("[NodeInfo][ReConnect]", address, "\t", removed, "\n", "[arrParity]", self.arrParity, "\n", "[Disconnect]", self.arrParityDisconnect);
      return removed == address;
    }
  };

  this.selectParity = function () {
    return new web3.providers.HttpProvider(self.arrParity[Math.floor(Math.random() * self.arrParity.length)]);
  };

};

module.exports = config;