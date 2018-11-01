var express = require('express');
var router = express.Router();
var BigNumber = require('bignumber.js');
var jayson = require('jayson');

function initRet() {
  var ret = {};
  ret.jsonrpc = '2.0';
  ret.result = null;
  ret.success = false;
  ret.error = null;
  return ret;
}

function returnRet(error, result) {
  var ret = initRet();
  if (error) {
    ret.error = error;
    return ret;
  } else if (result) {
    if (result.error) {
      result.success = false;
      result.result = null;
    } else {
      result.success = true;
    }
    return result;
  } else {
    return ret;
  }
}

/*
명령은 성공 success: true, result: 데이터
명령은 성공했으나 데이터가 비어있는 경우 success: true, result: null
명령에 실패한 경우 success: false, result: null, error: 오류메시지
*/

/*
https://wiki.parity.io/JSONRPC-eth-module#the-default-block-parameter
The following options are possible for the defaultBlock parameter:
Quantity/Integer - an integer block number;
String "earliest" - for the earliest/genesis block;
String "latest" - for the latest mined block;
String "pending" - for the pending state/transactions.
*/
function trlBlockParam(tag) {
  if (!tag) return 'latest';
  else if (tag == 'earliest' || tag == 'latest' || tag == 'pending') return tag;
  else return '0x'.concat(parseInt(tag, 10).toString(16));
}

//http://explorer.ethersocial.info/api_parity/eth_balance/0x5811590907050746b897efe65fea7b65710e1a2c/1522934
router.get('/eth_getBalance/:address/:tag?', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_getBalance', [req.params.address, trlBlockParam(req.params.tag)], function (error, result) {
    if (result && !result.error) {
      result.result = (new BigNumber(result.result)).toString(10);
    }
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_blockNumber
router.get('/eth_blockNumber', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_blockNumber', [], function (error, result) {
    if (result && !result.error) {
      result.result = (new BigNumber(result.result)).toNumber();
    }
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_getBlockByNumber/1522660/false
router.get('/eth_getBlockByNumber/:tag/:bool?', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_getBlockByNumber', [trlBlockParam(req.params.tag), (req.params.bool && req.params.bool == 'true' ? true : false)], function (error, result) {
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_getBlockByHash/0xdc19939dc468c85538f40acc5da4c5f806d93b8e5106b3619da19c78ddbf62b5/false
router.get('/eth_getBlockByHash/:tag/:bool?', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_getBlockByHash', [req.params.tag, (req.params.bool && req.params.bool == 'true' ? true : false)], function (error, result) {
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_getUncleByBlockNumberAndIndex/1522579/0
router.get('/eth_getUncleByBlockNumberAndIndex/:tag/:index', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_getUncleByBlockNumberAndIndex', [trlBlockParam(req.params.tag), req.params.index], function (error, result) {
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_getBlockTransactionCountByNumber/1522660
router.get('/eth_getBlockTransactionCountByNumber/:tag', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_getBlockTransactionCountByNumber', [trlBlockParam(req.params.tag)], function (error, result) {
    if (result && !result.error) {
      result.result = (new BigNumber(result.result)).toNumber();
    }
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_getTransactionByHash/0x6fd1bb5a71d16ad342ac9f8d86c299ce768eec0bafede55d7b7a9e82d816942a
router.get('/eth_getTransactionByHash/:txhash', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_getTransactionByHash', [req.params.txhash], function (error, result) {
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_getTransactionByBlockNumberAndIndex/1522660/0
router.get('/eth_getTransactionByBlockNumberAndIndex/:tag/:index', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_getTransactionByBlockNumberAndIndex', [trlBlockParam(req.params.tag), req.params.index], function (error, result) {
    res.json(returnRet(error, result));
  });
});


//http://explorer.ethersocial.info/api_parity/eth_getTransactionCount/0xe3ec5ebd3e822c972d802a0ee4e0ec080b8237ba/1522934
router.get('/eth_getTransactionCount/:address/:tag?', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_getTransactionCount', [req.params.address, trlBlockParam(req.params.tag)], function (error, result) {
    res.json(returnRet(error, result));
  });
});

//hex: signed_tx.serialize().toString('hex') 280byte
//http://explorer.ethersocial.info/api_parity/eth_sendRawTransaction/f889808609184e72a00082271094000000000000000000000000000000000000000080a47f74657374320000000000000000000000000000000000000000000000000000006000571ca08a8bbf888cfa37bbf0bb965423625641fc956967b81d12e23709cead01446075a01ce999b56a8a88504be365442ea61239198e23d1fce7d00fcfc5cd3b44b7215f
router.get('/eth_sendRawTransaction/:hex', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_sendRawTransaction', [req.params.hex], function (error, result) {
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_getTransactionReceipt/0xb3663023a01cc2862845d72bae657b5ef2f559c9982b3fcdfdbe840950fb6914
router.get('/eth_getTransactionReceipt/:txhash', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_getTransactionReceipt', [req.params.txhash], function (error, result) {
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_call/0x5811590907050746b897efe65fea7b65710e1a2c/0xc6888fa10000000000000000000000000000000000000000000000000000000000000003
router.get('/eth_call/:to/:data/:tag?', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_call', [{
    to: req.params.to,
    data: req.params.data
  }, trlBlockParam(req.params.tag)], function (error, result) {
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_getCode/0x0146b9dcd9fb2abc1b5b136c28d20d0037526961
router.get('/eth_getCode/:address/:tag?', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_getCode', [req.params.address, trlBlockParam(req.params.tag)], function (error, result) {
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_getStorageAt/0x5811590907050746b897efe65fea7b65710e1a2c/0/1522934
router.get('/eth_getStorageAt/:address/:position/:tag?', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_getStorageAt', [req.params.address, '0x'.concat(parseInt(req.params.position, 10).toString(16)), trlBlockParam(req.params.tag)], function (error, result) {
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_gasPrice
router.get('/eth_gasPrice', function (req, res, next) {
  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_gasPrice', [], function (error, result) {
    if (result && !result.error) {
      result.result = (new BigNumber(result.result)).toNumber();
    }
    res.json(returnRet(error, result));
  });
});

//http://explorer.ethersocial.info/api_parity/eth_estimateGas/0x5811590907050746b897efe65fea7b65710e1a2c/100/0x051da038cc/0xffffff
router.get('/eth_estimateGas/:to/:value/:gasPrice/:gas', function (req, res, next) {
  var tx = {};
  tx.to = req.params.to;
  tx.value = '0x'.concat(parseInt(req.params.value, 10).toString(16));
  tx.gasPrice = req.params.gasPrice;
  tx.gas = req.params.gas;

  var config = req.app.get('config');
  var jaysonclient = jayson.client.http(config.localRPCaddress);
  jaysonclient.request('eth_estimateGas', [tx, trlBlockParam(req.params.tag)], function (error, result) {
    res.json(returnRet(error, result));
  });
});

module.exports = router;