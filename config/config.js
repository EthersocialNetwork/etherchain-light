var web3 = require('web3');
var net = require('net');

var config = function () {
  this.logFormat = ":remote-addr [:date[clf]] :status :url :referrer :user-agent";

  this.dbPath = '/home/username/.local/share/io.parity.ethersocial/chains/ethersocial/db/dc73f323b4681272/archive';

  this.ipcPath = "/home/username/.local/share/io.parity.ethersocial/jsonrpc.ipc";
  this.providerIpc = new web3.providers.IpcProvider(this.ipcPath, net);

  this.providerSub = new web3.providers.HttpProvider("http://127.0.0.1:8545");
  this.providerSubGESN = new web3.providers.HttpProvider("http://127.0.0.1:7545");
  this.provider = new web3.providers.HttpProvider("http://127.0.0.1:8545");
  this.providerLocal = new web3.providers.HttpProvider("http://localhost:8545");

  this.networkPortString = "50505";
  this.networkPortNumber = parseInt(this.networkPortString, 10);

  this.serverPortCheck = true;
  this.serverPortCheckDelay = 60000; // ms
  this.serverPortCheckList = ['127.0.0.1:80', '127.0.0.1:8545', '127.0.0.1:7545'];

  this.tokenLoadDelay = 10;

  this.jsload_defer = true;
  this.jsload_async = true;

  this.cronIP = "127.0.0.1";
  this.bootstrapUrl = "https://maxcdn.bootstrapcdn.com/bootswatch/3.3.7/yeti/bootstrap.min.css";
};

module.exports = config;