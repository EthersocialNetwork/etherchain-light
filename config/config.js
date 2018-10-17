var web3 = require('web3');
var net = require('net');

var config = function () {
  var self = this;
  this.logFormat = ":remote-addr [:date[clf]] :status :url :referrer :user-agent";

  this.dbPath = '/home/username/.local/share/io.parity.ethersocial/chains/ethersocial/db/dc73f323b4681272/archive';

  this.ipcPath = "/home/username/.local/share/io.parity.ethersocial/jsonrpc.ipc";
  this.providerIpc = new web3.providers.IpcProvider(this.ipcPath, net);

  this.arrParity = ['http://127.0.0.1:8545'];

  this.getArrParity = function () {
    return self.arrParity;
  };

  this.selectParity = function () {
    return new web3.providers.HttpProvider(self.arrParity[Math.floor(Math.random() * self.arrParity.length)]);
  };

  this.networkPortString = "50505";
  this.networkPortNumber = parseInt(this.networkPortString, 10);

  this.accountBalanceServiceInterval = 2 * 60 * 1000; // ms
  this.blockStoreServiceInterval = 1 * 60 * 1000; // ms
  this.peerCollectorServiceInterval = 5 * 60 * 1000; // ms
  this.hashrateCollectorServiceInterval = 2 * 60 * 60 * 1000; // ms

  this.serverPortCheck = true;
  this.serverPortCheckDelay = 60000; // ms
  this.serverPortCheckList = ['127.0.0.1:80', '127.0.0.1:8545', '127.0.0.1:7545'];

  this.tokenLoadDelay = 10;

  this.jsload_defer = false;
  this.jsload_async = false;

  this.bootstrapUrl = "https://maxcdn.bootstrapcdn.com/bootswatch/3.3.7/yeti/bootstrap.min.css";
};

module.exports = config;