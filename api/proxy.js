var express = require('express');
var router = express.Router();
var Web3 = require('web3');
var web3 = new Web3();
const configConstant = require('../config/configConstant');

function getWeb3(config) {
  if (!web3.currentProvider)
    web3.setProvider(new web3.providers.HttpProvider(configConstant.localRPCaddress));
  return web3;
}

function resultToJson(err, param) {
  var ret = {};
  ret.jsonrpc = 'esn';
  ret.success = false;
  ret.result = null;

  if (err) {
    ret.result = err;
  } else if (param) {
    ret.result = param;
    ret.success = true;
  }
  return ret;
}

/*
명령은 성공 success: true, result: 데이터
명령은 성공했으나 데이터가 비어있는 경우 success: true, result: null
명령에 실패한 경우 success: false, result: null, error: 오류메시지
*/

//http://explorer.ethersocial.info/api_proxy/eth_balance/0x5811590907050746b897efe65fea7b65710e1a2c/1522934
router.get('/eth_balance/:address/:tag?', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getBalance(req.params.address, req.params.tag, function (err, result) {
    res.json(resultToJson(err, result ? result.toString(10) : null));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_blockNumber
router.get('/eth_blockNumber', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getBlockNumber(function (err, result) {
    res.json(resultToJson(err, result));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_getBlockByNumber/1522660/false
router.get('/eth_getBlockByNumber/:tag/:bool?', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getBlock(req.params.tag, (req.params.bool && req.params.bool == 'true'), function (err, result) {
    res.json(resultToJson(err, result));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_getUncleByBlockNumberAndIndex/1522579/0/false
router.get('/eth_getUncleByBlockNumberAndIndex/:tag/:index/:bool?', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getUncle(req.params.tag, req.params.index, (req.params.bool && req.params.bool == 'true'), function (err, result) {
    res.json(resultToJson(err, result));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_getBlockTransactionCountByNumber/1522660
router.get('/eth_getBlockTransactionCountByNumber/:tag', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getBlockTransactionCount(req.params.tag, function (err, result) {
    res.json(resultToJson(err, result));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_getTransactionByHash/0x6fd1bb5a71d16ad342ac9f8d86c299ce768eec0bafede55d7b7a9e82d816942a
router.get('/eth_getTransactionByHash/:txhash', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getTransaction(req.params.txhash, function (err, result) {
    res.json(resultToJson(err, result));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_getTransactionByBlockNumberAndIndex/1522660/0
router.get('/eth_getTransactionByBlockNumberAndIndex/:tag/:index', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getTransactionFromBlock(req.params.tag, req.params.index, function (err, result) {
    res.json(resultToJson(err, result));
  });
});


//http://explorer.ethersocial.info/api_proxy/eth_getTransactionCount/0xe3ec5ebd3e822c972d802a0ee4e0ec080b8237ba/1522934
router.get('/eth_getTransactionCount/:address/:tag?', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getTransactionCount(req.params.address, req.params.tag, function (err, result) {
    res.json(resultToJson(err, result));
  });
});

//hex: signed_tx.serialize().toString('hex') 280byte
//http://explorer.ethersocial.info/api_proxy/eth_sendRawTransaction/f889808609184e72a00082271094000000000000000000000000000000000000000080a47f74657374320000000000000000000000000000000000000000000000000000006000571ca08a8bbf888cfa37bbf0bb965423625641fc956967b81d12e23709cead01446075a01ce999b56a8a88504be365442ea61239198e23d1fce7d00fcfc5cd3b44b7215f
router.get('/eth_sendRawTransaction/:hex', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.sendRawTransaction('0x' + req.params.hex, function (err, result) {
    res.json(resultToJson(err, result));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_getTransactionReceipt/0xb3663023a01cc2862845d72bae657b5ef2f559c9982b3fcdfdbe840950fb6914
router.get('/eth_getTransactionReceipt/:txhash', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getTransactionReceipt(req.params.txhash, function (err, result) {
    res.json(resultToJson(err, result));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_call/0x5811590907050746b897efe65fea7b65710e1a2c/0xc6888fa10000000000000000000000000000000000000000000000000000000000000003
router.get('/eth_call/:to/:data/:tag?', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.call({
    to: req.params.to,
    data: req.params.data
  }, req.params.tag, function (err, result) {
    res.json(resultToJson(err, result));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_getCode/0x0146b9dcd9fb2abc1b5b136c28d20d0037526961
router.get('/eth_getCode/:address/:tag?', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getCode(req.params.address, req.params.tag, function (err, result) {
    res.json(resultToJson(err, result));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_getStorageAt/0x5811590907050746b897efe65fea7b65710e1a2c/0/1522934
router.get('/eth_getStorageAt/:address/:position/:tag?', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getStorageAt(req.params.address, req.params.position, req.params.tag, function (err, result) {
    res.json(resultToJson(err, result));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_gasPrice
router.get('/eth_gasPrice', function (req, res, next) {
  getWeb3(req.app.get('config')).eth.getGasPrice(function (err, result) {
    res.json(resultToJson(err, result.toString(10)));
  });
});

//http://explorer.ethersocial.info/api_proxy/eth_estimateGas/0x5811590907050746b897efe65fea7b65710e1a2c/100/0x051da038cc/0xffffff
router.get('/eth_estimateGas/:to/:value/:gasPrice/:gas', function (req, res, next) {
  var tx = {};
  tx.to = req.params.to;
  tx.value = req.params.value;
  tx.gasPrice = req.params.gasPrice;
  tx.gas = req.params.gas;

  getWeb3(req.app.get('config')).eth.estimateGas(tx, function (err, result) {
    res.json(resultToJson(err, result));
  });
});

module.exports = router;