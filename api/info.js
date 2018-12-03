var express = require('express');
var router = express.Router();
var async = require('async');
var Web3 = require('web3');
var web3 = new Web3();

const configConstant = require('../config/configConstant');
const configNames = require('../config/configNames.js');

var Redis = require('ioredis');
var redis = new Redis(configConstant.redisConnectString);
const pre_fix = 'explorerBlocks:';
const divide = 10000;

function resultToJson(err, param) {
  var result = {};
  result.jsonrpc = 'esn';
  result.success = false;

  if (err) {
    result.result = err;
  } else if (param) {
    result.result = param;
    result.success = true;
  } else {
    result.result = NaN;
  }
  return result;
}

Object.size = function (obj) {
  var size = 0,
    key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) size++;
  }
  return size;
};

//http://explorer.ethersocial.info/api_info/summary/200
router.get('/summary/:count?', function (req, res, next) {
  var data = {};
  if (!web3.currentProvider)
    web3.setProvider(new web3.providers.HttpProvider(configConstant.localRPCaddress));

  async.waterfall([
    function (callback) {
      var rds_key3 = pre_fix.concat("lastblock");
      redis.hget(rds_key3, "lastblock", function (err, result) {
        return callback(err, result);
      });
    },
    function (dbLastBlock, callback) {
      data.dbLastBlock = Number(dbLastBlock);
      web3.eth.getBlock("latest", false, function (err, result) {
        return callback(err, result);
      });
    },
    function (lastBlock, callback) {
      data.blockCount = req.params.count ? parseInt(req.params.count, 10) : 200;
      data.lastBlock = new Intl.NumberFormat().format(lastBlock.number);
      data.lastBlockNumber = lastBlock.number;
      data.difficulty = hashFormat(lastBlock.difficulty) + "H";
      if (lastBlock.number - data.blockCount < 0) {
        data.blockCount = lastBlock.number + 1;
      }

      async.times(data.blockCount, function (n, next) {
        if (data.dbLastBlock > 0 && data.dbLastBlock > lastBlock.number - n) {
          var field = lastBlock.number - n;
          redis.hgetall(pre_fix.concat((field - (field % divide)) + ":").concat(field), function (err, block_info) {
            block_info.isDB = true;
            next(err, block_info);
          });
        } else {
          web3.eth.getBlock(lastBlock.number - n, false, function (err, block) {
            block.isDB = false;
            next(err, block);
          });
        }
      }, function (err, blocks) {
        return callback(err, blocks);
      });
    }
  ], function (err, blocks) {
    if (err) {
      console.log("Error ", err);
      res.json(resultToJson(err, null));
    }

    var totalBlockTimes = 0;
    var lastBlockTimes = -1;
    var countBlockTimes = 0;
    var totaDifficulty = 0;
    var miners = [];

    Array.prototype.max = function () {
      return Math.max.apply(null, this);
    };

    Array.prototype.min = function () {
      return Math.min.apply(null, this);
    };
    var minersDiff = [];
    var minersTime = [];
    var minersHash = [];

    blocks.forEach(function (block) {
      if (lastBlockTimes > 0) {
        totalBlockTimes += lastBlockTimes - block.timestamp;
        var currentBlockTime = lastBlockTimes - block.timestamp;
        //console.log(currentBlockTime, lastBlockTimes, block.timestamp);
        var currentDifficulty = Number(block.difficulty);
        totaDifficulty += Number(block.difficulty);
        miners.push(block.miner);
        if (minersTime[block.miner]) {
          minersTime[block.miner] += currentBlockTime;
        } else {
          minersTime[block.miner] = currentBlockTime;
        }
        if (minersDiff[block.miner]) {
          minersDiff[block.miner] += currentDifficulty;
        } else {
          minersDiff[block.miner] = currentDifficulty;
        }
        countBlockTimes++;
      }
      lastBlockTimes = block.timestamp;
    });
    for (var keyminer in minersTime) {
      minersHash[keyminer] = hashFormat((minersDiff[keyminer] / totaDifficulty) * minersDiff[keyminer] / minersTime[keyminer]) + "H/s";
    }

    data.miners = makeReturnSeries(miners, minersHash);
    data.blockTime = new Intl.NumberFormat().format((totalBlockTimes / countBlockTimes).toFixed(4)) + "s";
    data.hashrate = hashFormat(totaDifficulty / totalBlockTimes) + "H/s";

    res.json(resultToJson(err, data));
  });

});

function hashFormat(number) {
  if (number > 1000000000000000) {
    return new Intl.NumberFormat().format((number / 1000000000000000).toFixed(4)) + "P";
  } else if (number > 1000000000000) {
    return new Intl.NumberFormat().format((number / 1000000000000).toFixed(4)) + "T";
  } else if (number > 1000000000) {
    return new Intl.NumberFormat().format((number / 1000000000).toFixed(4)) + "G";
  } else if (number > 1000000) {
    return new Intl.NumberFormat().format((number / 1000000).toFixed(4)) + "M";
  } else if (number > 1000) {
    return new Intl.NumberFormat().format((number / 1000).toFixed(4)) + "K";
  } else {
    return new Intl.NumberFormat().format((number).toFixed(4));
  }
}

function makeReturnSeries(arr, hasharr) {
  prcArray = [];
  prcArray = arr.reduce(function (acc, curr) {
    if (acc[curr]) {
      acc[curr] += 1;
    } else {
      acc[curr] = 1;
    }
    return acc;
  }, {});
  resArray = [];
  for (var kcmd in prcArray) {
    resArray.push({
      name: configNames.names[kcmd] ? ((configNames.names[kcmd]).split("/"))[0] : configNames.holdnames[kcmd] ? (('Long-term holding: '.concat(configNames.holdnames[kcmd])).split("/"))[0] : (kcmd.substr(0, 8) + "..."),
      value: prcArray[kcmd],
      colorValue: 0,
      address: kcmd,
      hashrate: hasharr[kcmd]
    });
  }
  resArray.push({
    name: '0',
    value: 0,
    colorValue: 0,
    address: '',
    hashrate: "0 H/s"
  });
  resArray = resSortedReturn(resArray);
  var idxColorValue = 1;
  for (var kResArray in resArray) {
    if (resArray.hasOwnProperty(kResArray)) {
      resArray[kResArray].colorValue = idxColorValue++;
    }
  }

  return resArray;
}

function resSortedReturn(arr) {
  arr.sort(function (a, b) {
    if (a.value > b.value) {
      return -1;
    }
    if (a.value < b.value) {
      return 1;
    }
    return 0;
  });
  return arr;
}
module.exports = router;