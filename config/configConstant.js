const configConstant = {
  //basic
  logFormat: "[:status][:date[clf]][:remote-addr] :url :referrer :user-agent",

  //path
  dbPath: '/home/username/.local/share/io.parity.ethersocial/chains/ethersocial/db/dc73f323b4681272/archive',
  ipcPath: "/home/username/.local/share/io.parity.ethersocial/jsonrpc.ipc",

  //network
  arrParity: ['http://127.0.0.1:9545'],
  localRPCaddress: 'http://127.0.0.1:8545',
  gethNetworkPortString: "50505",

  //service
  accountBalanceServiceInterval: 1 * 30 * 1000, // ms
  blockStoreServiceInterval: 1 * 5 * 1000, // ms
  peerCollectorServiceInterval: 5 * 60 * 1000, // ms
  hashrateCollectorServiceInterval: 2 * 60 * 60 * 1000, // ms

  //view
  jsload_defer: false,
  jsload_async: false,

};

module.exports = configConstant;