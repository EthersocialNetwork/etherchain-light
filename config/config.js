var web3 = require('web3');
var net = require('net');

var config = function () {
  this.logFormat = ":remote-addr [:date[clf]] :status :url :referrer :user-agent";

  //this.dbPath = level('/home/sejun/.local/share/io.parity.ethereum/chains/ethersocial/db/dc73f323b4681272/archive');
  //this.dbPath = levelup(leveldown('/home/sejun/.local/share/io.parity.ethereum/chains/ethersocial/db/dc73f323b4681272/snapshot'));
  this.dbPath = '/home/barahime/.local/share/io.parity.ethersocial/chains/ethersocial/db/dc73f323b4681272/archive';

  this.ipcPath = "/home/barahime/.local/share/io.parity.ethersocial/jsonrpc.ipc";
  this.providerIpc = new web3.providers.IpcProvider(this.ipcPath, net);

  this.providerSub = new web3.providers.HttpProvider("http://218.149.67.46:8545");
  this.providerSubGESN = new web3.providers.HttpProvider("http://218.149.67.46:7545");
  this.provider = new web3.providers.HttpProvider("http://127.0.0.1:8545");
  this.providerLocal = new web3.providers.HttpProvider("http://localhost:8545");

  this.networkPortString = "50505";
  this.networkPortNumber = parseInt(this.networkPortString, 10);

  this.serverPortCheck = true;
  this.serverPortCheckDelay = 60000; // ms
  this.serverPortCheckList = ['esn.today:80', '1.214.152.195:80', '218.149.67.46:8545', '218.149.67.46:7545'];

  this.tokenLoadDelay = 10;

  this.cronIP = "115.68.110.213";
  this.bootstrapUrl = "https://maxcdn.bootstrapcdn.com/bootswatch/3.3.7/yeti/bootstrap.min.css";
};

module.exports = config;